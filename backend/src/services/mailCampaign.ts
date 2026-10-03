// Background sender for a mail campaign (phase 26): one mail at a time
// through the company mail server, each logged, counts updated as it goes.
import { prisma } from '../config/database';
import { sendMail } from './mailer';
import { audienceWhere } from './communicationCalc';

export interface Recipient { id: string; name: string; email: string }

// The serving employees an audience covers who have an email to send to.
export async function recipientsFor(organizationId: string, aud: { scope: string; scopeValue: string; personIds: string[] }): Promise<Recipient[]> {
  const people = await prisma.person.findMany({
    where: audienceWhere(organizationId, aud),
    select: { id: true, name: true, email: true, officialEmail: true },
    orderBy: { name: 'asc' },
  });
  return people
    .map(p => ({ id: p.id, name: p.name, email: (p.officialEmail || p.email).trim() }))
    .filter(r => r.email);
}

// Work through a campaign's recipients. Not awaited by the request: a
// failure on one mail is counted, never thrown, so the rest still go.
export async function runCampaign(organizationId: string, campaignId: string, sentBy: string) {
  const campaign = await prisma.mailCampaign.findUnique({ where: { id: campaignId } });
  if (!campaign || campaign.status === 'DONE') return;
  const recipients = await recipientsFor(organizationId, { scope: campaign.scope, scopeValue: campaign.scopeValue, personIds: (campaign.personIds as string[]) || [] });
  for (const r of recipients) {
    let ok = false;
    try {
      const res = await sendMail(organizationId, { kind: 'NOTICE', to: r.email, subject: campaign.subject, text: campaign.body, personId: r.id, personName: r.name, sentBy });
      ok = res.ok;
    } catch {
      ok = false;
    }
    await prisma.mailCampaign.update({ where: { id: campaignId }, data: ok ? { sent: { increment: 1 } } : { failed: { increment: 1 } } });
  }
  await prisma.mailCampaign.update({ where: { id: campaignId }, data: { status: 'DONE', finishedAt: new Date() } });
}
