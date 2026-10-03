// Employee communication, HR side (phase 26): approving the changes
// employees propose, mail to a group, the bulletin board and company
// policies. SUPER_ADMIN / HR only.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { actorName, logPayrollAudit } from '../services/payroll/audit';
import { mailProblem, mailSettingsFor } from '../services/mailer';
import { loadFile, removeStored, saveFile } from '../services/fileStore';
import { MAX_DOCUMENT_BYTES, base64Bytes, cleanFileName, sizeLabel, sniffMime } from '../services/documentCalc';
import { recipientsFor, runCampaign } from '../services/mailCampaign';
import { familyMemberInput } from '../services/profileCalc';
import {
  AUDIENCE_SCOPES, CHANGE_SECTIONS, GROUP_SCOPES, audienceInput, changeApplyData, scopeLabel,
} from '../services/communicationCalc';

const str = (v: any) => String(v ?? '');

// An optional attachment (bulletin, policy, change-request proof), checked
// like an employee file and stored where the company keeps its files.
function fileFromBody(b: any) {
  const dataUri = str(b.fileData);
  if (!dataUri) return null;
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!m) throw new AppError(400, 'The file could not be read');
  const sizeBytes = base64Bytes(m[2]);
  if (sizeBytes > MAX_DOCUMENT_BYTES) throw new AppError(400, `The file is too large. Keep it under ${sizeLabel(MAX_DOCUMENT_BYTES)}.`);
  const real = sniffMime(Buffer.from(m[2].slice(0, 32), 'base64'));
  if (!real) throw new AppError(400, 'Attach a PDF or an image (JPG, PNG).');
  return { fileName: cleanFileName(b.fileName) || 'document', mimeType: real, sizeBytes, fileData: dataUri };
}
const FILE_META = { fileName: true, mimeType: true, sizeBytes: true, storage: true, storageKey: true } as const;
const withFile = (row: any) => ({ ...row, hasFile: Boolean(row.fileName), storage: undefined, storageKey: undefined });

async function locationNames(organizationId: string) {
  const locs = await prisma.workLocation.findMany({ where: { organizationId }, select: { id: true, name: true } });
  return new Map(locs.map(l => [l.id, l.name]));
}

export const communicationController = {
  async getMeta(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const [departments, locations] = await Promise.all([
      prisma.listValue.findMany({ where: { organizationId: orgId, listType: 'DEPARTMENT', isActive: true }, select: { label: true }, orderBy: { label: 'asc' } }),
      prisma.workLocation.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    res.json({
      departments: departments.map(d => d.label), locations,
      audienceScopes: AUDIENCE_SCOPES, groupScopes: GROUP_SCOPES, changeSections: CHANGE_SECTIONS,
    });
  },

  // ---- Change requests -----------------------------------------------------
  async listChangeRequests(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const status = str(req.query.status).toUpperCase();
    const rows = await prisma.changeRequest.findMany({
      where: { organizationId: orgId, ...(status ? { status } : {}) },
      select: { id: true, section: true, changes: true, status: true, reviewNote: true, reviewedByName: true, reviewedAt: true, createdAt: true, ...FILE_META, person: { select: { id: true, name: true, employeeNo: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 200,
    });
    res.json({ requests: rows.map(withFile), pending: await prisma.changeRequest.count({ where: { organizationId: orgId, status: 'PENDING' } }) });
  },

  async getChangeRequestFile(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.changeRequest.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row || !row.fileName) throw new AppError(404, 'No proof on this request');
    res.json({ fileName: row.fileName, mimeType: row.mimeType, fileData: await loadFile(orgId, row) });
  },

  async reviewChangeRequest(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.changeRequest.findFirst({ where: { id: req.params.id, organizationId: orgId }, include: { person: { select: { id: true, name: true } } } });
    if (!row) throw new AppError(404, 'Request not found');
    if (row.status !== 'PENDING') throw new AppError(400, 'This request has already been reviewed');
    const approve = Boolean(req.body.approve);
    const note = str(req.body.note).slice(0, 300);
    if (approve) {
      const changes = row.changes as any;
      if (row.section === 'FAMILY') {
        const member = familyMemberInput(changes);
        if (typeof member === 'string') throw new AppError(400, `The proposed family member is not valid: ${member}`);
        const count = await prisma.familyMember.count({ where: { organizationId: orgId, personId: row.personId } });
        await prisma.familyMember.create({ data: { organizationId: orgId, personId: row.personId, ...(member as any), sortOrder: count } });
      } else {
        await prisma.person.update({ where: { id: row.personId }, data: changeApplyData(changes) });
      }
    }
    await prisma.changeRequest.update({
      where: { id: row.id },
      data: { status: approve ? 'APPROVED' : 'REJECTED', reviewNote: note, reviewedByName: await actorName(req.user?.userId), reviewedAt: new Date() },
    });
    await logPayrollAudit(req, [{ action: 'CHANGE_REQUEST_REVIEWED', personId: row.personId, personName: row.person.name, field: row.section, newValue: approve ? 'Approved' : 'Rejected' }]);
    res.json({ ok: true });
  },

  // ---- Data drive: who has confirmed their details ----------------------------
  async detailsConfirmation(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const employees = await prisma.person.findMany({
      where: { organizationId: orgId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } },
      select: { id: true, name: true, employeeNo: true, department: true, detailsConfirmedAt: true }, orderBy: { name: 'asc' },
    });
    res.json({
      confirmed: employees.filter(e => e.detailsConfirmedAt).length,
      total: employees.length,
      notConfirmed: employees.filter(e => !e.detailsConfirmedAt),
    });
  },

  // ---- Bulletins -----------------------------------------------------------
  async listBulletins(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const rows = await prisma.bulletin.findMany({ where: { organizationId: orgId }, select: { id: true, title: true, body: true, scope: true, scopeValue: true, expiresOn: true, isActive: true, createdByName: true, createdAt: true, ...FILE_META }, orderBy: { createdAt: 'desc' } });
    const names = await locationNames(orgId);
    res.json({ bulletins: rows.map(b => ({ ...withFile(b), scopeLabel: scopeLabel(b.scope, b.scopeValue, names.get(b.scopeValue)) })) });
  },

  async saveBulletin(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const title = str(b.title).trim();
    if (!title) throw new AppError(400, 'Enter a title');
    const aud = audienceInput(b, false);
    if (typeof aud === 'string') throw new AppError(400, aud);
    const common = {
      title: title.slice(0, 200), body: str(b.body).slice(0, 5000), scope: aud.scope, scopeValue: aud.scopeValue,
      expiresOn: /^\d{4}-\d{2}-\d{2}$/.test(str(b.expiresOn)) ? str(b.expiresOn) : null, isActive: b.isActive !== false,
    };
    if (req.params.id) {
      const existing = await prisma.bulletin.findFirst({ where: { id: req.params.id, organizationId: orgId } });
      if (!existing) throw new AppError(404, 'Bulletin not found');
      await prisma.bulletin.update({ where: { id: existing.id }, data: common });
    } else {
      const file = fileFromBody(b);
      const stored = file ? await saveFile(orgId, 'bulletins', file.mimeType, file.fileData) : { storage: 'DB', storageKey: '', fileData: '' };
      await prisma.bulletin.create({ data: { organizationId: orgId, ...common, fileName: file?.fileName || '', mimeType: file?.mimeType || '', sizeBytes: file?.sizeBytes || 0, ...stored, createdByName: await actorName(req.user?.userId) } });
    }
    res.status(201).json({ ok: true });
  },

  async deleteBulletin(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.bulletin.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row) throw new AppError(404, 'Bulletin not found');
    await prisma.bulletin.delete({ where: { id: row.id } });
    if (row.fileName) await removeStored(orgId, [row]);
    res.json({ ok: true });
  },

  async getBulletinFile(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.bulletin.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row || !row.fileName) throw new AppError(404, 'No attachment');
    res.json({ fileName: row.fileName, mimeType: row.mimeType, fileData: await loadFile(orgId, row) });
  },

  // ---- Policies ------------------------------------------------------------
  async listPolicies(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const rows = await prisma.policy.findMany({
      where: { organizationId: orgId },
      select: { id: true, title: true, body: true, scope: true, scopeValue: true, isActive: true, createdByName: true, createdAt: true, ...FILE_META, _count: { select: { acknowledgements: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const names = await locationNames(orgId);
    res.json({ policies: rows.map(p => ({ ...withFile(p), acknowledged: p._count.acknowledgements, _count: undefined, scopeLabel: scopeLabel(p.scope, p.scopeValue, names.get(p.scopeValue)) })) });
  },

  async savePolicy(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const title = str(b.title).trim();
    if (!title) throw new AppError(400, 'Enter a title');
    const aud = audienceInput(b, false);
    if (typeof aud === 'string') throw new AppError(400, aud);
    const common = { title: title.slice(0, 200), body: str(b.body).slice(0, 20000), scope: aud.scope, scopeValue: aud.scopeValue, isActive: b.isActive !== false };
    if (req.params.id) {
      const existing = await prisma.policy.findFirst({ where: { id: req.params.id, organizationId: orgId } });
      if (!existing) throw new AppError(404, 'Policy not found');
      await prisma.policy.update({ where: { id: existing.id }, data: common });
    } else {
      const file = fileFromBody(b);
      const stored = file ? await saveFile(orgId, 'policies', file.mimeType, file.fileData) : { storage: 'DB', storageKey: '', fileData: '' };
      await prisma.policy.create({ data: { organizationId: orgId, ...common, fileName: file?.fileName || '', mimeType: file?.mimeType || '', sizeBytes: file?.sizeBytes || 0, ...stored, createdByName: await actorName(req.user?.userId) } });
    }
    res.status(201).json({ ok: true });
  },

  async deletePolicy(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.policy.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row) throw new AppError(404, 'Policy not found');
    await prisma.policy.delete({ where: { id: row.id } });
    if (row.fileName) await removeStored(orgId, [row]);
    res.json({ ok: true });
  },

  async getPolicyFile(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.policy.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row || !row.fileName) throw new AppError(404, 'No file');
    res.json({ fileName: row.fileName, mimeType: row.mimeType, fileData: await loadFile(orgId, row) });
  },

  // Who has read a policy and who has not.
  async policyCoverage(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const policy = await prisma.policy.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!policy) throw new AppError(404, 'Policy not found');
    const [employees, acks] = await Promise.all([
      prisma.person.findMany({ where: { organizationId: orgId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } }, select: { id: true, name: true, employeeNo: true } }),
      prisma.policyAcknowledgement.findMany({ where: { policyId: policy.id }, select: { personId: true, acknowledgedAt: true } }),
    ]);
    const ackMap = new Map(acks.map(a => [a.personId, a.acknowledgedAt]));
    res.json({
      title: policy.title,
      read: employees.filter(e => ackMap.has(e.id)).map(e => ({ ...e, acknowledgedAt: ackMap.get(e.id) })),
      notRead: employees.filter(e => !ackMap.has(e.id)),
    });
  },

  // ---- Mail campaigns ------------------------------------------------------
  async audienceCount(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const aud = audienceInput(req.body);
    if (typeof aud === 'string') throw new AppError(400, aud);
    const recipients = await recipientsFor(orgId, aud);
    const total = await prisma.person.count({ where: { organizationId: orgId, ...(aud.scope === 'DEPARTMENT' ? { department: aud.scopeValue } : aud.scope === 'LOCATION' ? { workLocationId: aud.scopeValue } : aud.scope === 'CHOSEN' ? { id: { in: aud.personIds } } : {}), kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } } });
    res.json({ recipients: recipients.length, withoutEmail: total - recipients.length });
  },

  async createCampaign(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const subject = str(req.body.subject).trim();
    if (!subject) throw new AppError(400, 'Enter a subject');
    const body = str(req.body.body).trim();
    if (!body) throw new AppError(400, 'Enter the message');
    const aud = audienceInput(req.body);
    if (typeof aud === 'string') throw new AppError(400, aud);
    const settings = await mailSettingsFor(orgId);
    if (!settings.enabled) throw new AppError(400, 'Email is switched off. Switch it on in Company Settings → Email.');
    const problem = mailProblem(settings);
    if (problem) throw new AppError(400, problem);
    const recipients = await recipientsFor(orgId, aud);
    if (recipients.length === 0) throw new AppError(400, 'No one in this audience has an email address');
    const campaign = await prisma.mailCampaign.create({
      data: { organizationId: orgId, subject: subject.slice(0, 200), body: body.slice(0, 10000), scope: aud.scope, scopeValue: aud.scopeValue, personIds: aud.personIds, total: recipients.length, createdByName: await actorName(req.user?.userId) },
    });
    await logPayrollAudit(req, [{ action: 'MAIL_CAMPAIGN_SENT', field: subject, newValue: `${recipients.length} recipients` }]);
    // Send in the background; the screen polls the campaign for progress
    void runCampaign(orgId, campaign.id, await actorName(req.user?.userId));
    res.status(201).json({ id: campaign.id, total: campaign.total });
  },

  async listCampaigns(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const names = await locationNames(orgId);
    const rows = await prisma.mailCampaign.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: 'desc' }, take: 50 });
    res.json({ campaigns: rows.map(c => ({ ...c, scopeLabel: scopeLabel(c.scope, c.scopeValue, names.get(c.scopeValue)) })) });
  },

  async getCampaign(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const c = await prisma.mailCampaign.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!c) throw new AppError(404, 'Campaign not found');
    res.json(c);
  },
};
