// Mails the system sends by itself: a welcome to a new login, and a
// notice (or the payslip) when a month's payslips are released. Each is
// off until switched on, and every attempt lands in the mail log.
import { prisma } from '../config/database';
import { getEnv } from '../config/env';
import { orgBrand } from './orgBrand';
import { mailSettingsFor, mailProblem, sendMail } from './mailer';
import {
  isReleaseMail, payslipAddress, payslipEmail, releaseNoticeEmail, welcomeEmail,
} from './payroll/payslipFiles';
import { PAYSLIP_INCLUDE, payslipFile, settingsFor } from './payroll/payslipDocs';

// Where people sign in: the address set with the mail settings, else the
// one the server is configured for.
export const appUrlFor = (mail: { appUrl?: string }) =>
  String(mail.appUrl || '').trim() || String(getEnv().CORS_ORIGIN || '').split(',')[0].trim();

// Mail a new login its sign-in address and temporary password. Returns
// 'SENT', 'FAILED', or '' when welcome mails are off.
export async function sendWelcomeMail(
  organizationId: string, login: { name: string; email: string; password: string; personId?: string | null }, sentBy: string,
): Promise<'SENT' | 'FAILED' | ''> {
  try {
    const mail = await mailSettingsFor(organizationId);
    if (!mail.enabled || !mail.welcomeMail || mailProblem(mail)) return '';
    const brand = await orgBrand(organizationId);
    const result = await sendMail(organizationId, {
      kind: 'WELCOME', to: login.email, ...welcomeEmail(brand, login.name, login.email, login.password, appUrlFor(mail)),
      personId: login.personId || undefined, personName: login.name, sentBy,
    });
    return result.ok ? 'SENT' : 'FAILED';
  } catch {
    return 'FAILED';
  }
}

const NO_ADDRESS = 'No email address on record';

const logFailure = (organizationId: string, kind: string, entry: any, subject: string, error: string, sentBy: string) =>
  prisma.mailLog.create({
    data: {
      organizationId, kind, toEmail: '', subject, status: 'FAILED', error,
      runId: entry.runId, entryId: entry.id, personId: entry.personId, personName: entry.person.name, sentBy,
    },
  });

// One employee after another, so the mail server is never flooded.
async function sendReleaseMails(organizationId: string, runId: string, mode: string, sentBy: string) {
  const [settings, mail, brand, entries, already] = await Promise.all([
    settingsFor(organizationId),
    mailSettingsFor(organizationId),
    orgBrand(organizationId),
    prisma.payslipEntry.findMany({
      where: { organizationId, runId, payStatus: 'PAY', run: { status: 'FINALIZED', releasedAt: { not: null } } },
      include: PAYSLIP_INCLUDE,
    }),
    prisma.mailLog.findMany({
      where: { organizationId, runId, kind: mode === 'PAYSLIP' ? 'PAYSLIP' : 'NOTICE', OR: [{ status: 'SENT' }, { error: NO_ADDRESS }] },
      select: { entryId: true, status: true },
    }),
  ]);
  const done = new Set(already.filter(l => l.status === 'SENT').map(l => l.entryId));
  // Someone with no address is noted once, not on every release
  const noted = new Set(already.filter(l => l.status !== 'SENT').map(l => l.entryId));
  const url = appUrlFor(mail);
  const kind = mode === 'PAYSLIP' ? 'PAYSLIP' : 'NOTICE';
  for (const entry of entries.sort((a, b) => a.person.name.localeCompare(b.person.name))) {
    // Released, held and released again: nobody gets the same mail twice
    if (done.has(entry.id)) continue;
    const text = mode === 'PAYSLIP'
      ? payslipEmail(brand, entry.person, entry.run.period, settings.payslipPdfPassword)
      : releaseNoticeEmail(brand, entry.person, entry.run.period, url);
    try {
      const { address } = payslipAddress(settings.payslipEmailTo, entry.person);
      if (!address) {
        if (!noted.has(entry.id)) await logFailure(organizationId, kind, entry, text.subject, NO_ADDRESS, sentBy);
        continue;
      }
      const attachments = mode === 'PAYSLIP'
        ? [await payslipFile(organizationId, entry, settings, brand)].map(f => ({ filename: f.filename, content: f.pdf, contentType: 'application/pdf' }))
        : undefined;
      await sendMail(organizationId, {
        kind, to: address, ...text, attachments,
        runId: entry.runId, entryId: entry.id, personId: entry.personId, personName: entry.person.name, sentBy,
      });
    } catch (err: any) {
      // A payslip that cannot be made (no PAN for its password, say) is logged and the rest go on
      await logFailure(organizationId, kind, entry, text.subject, String(err?.message || 'Could not send').slice(0, 300), sentBy).catch(() => {});
    }
  }
}

// Called when a run's payslips are released. Starts the mails in the
// background and says what was started: NONE, NOTICE or PAYSLIP.
export async function startReleaseMails(organizationId: string, runId: string, sentBy: string): Promise<string> {
  try {
    const [settings, mail] = await Promise.all([settingsFor(organizationId), mailSettingsFor(organizationId)]);
    const mode = isReleaseMail(settings.releaseMail) ? settings.releaseMail : 'NONE';
    if (mode === 'NONE' || !mail.enabled || mailProblem(mail)) return 'NONE';
    void sendReleaseMails(organizationId, runId, mode, sentBy).catch(() => { /* each failure is already in the mail log */ });
    return mode;
  } catch {
    return 'NONE';
  }
}
