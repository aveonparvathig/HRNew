// Employee communication, employee side (phase 26): their updates
// (bulletins, policies to read, a nudge to review their details),
// proposing changes to their own details, and confirming them. Every
// query is scoped to the Person linked to the login.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { actorPerson } from '../middleware/roles';
import { loadFile, saveFile } from '../services/fileStore';
import { MAX_DOCUMENT_BYTES, base64Bytes, cleanFileName, sizeLabel, sniffMime } from '../services/documentCalc';
import { familyMemberInput } from '../services/profileCalc';
import { audienceMatches, bulletinLive, changeDiff, requiresProof, sectionDef, CHANGE_SECTIONS } from '../services/communicationCalc';
import { todayIST } from '../services/payroll/loanLedger';

const str = (v: any) => String(v ?? '');

function proofFile(b: any) {
  const dataUri = str(b.fileData);
  if (!dataUri) return null;
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!m) throw new AppError(400, 'The proof file could not be read');
  const sizeBytes = base64Bytes(m[2]);
  if (sizeBytes > MAX_DOCUMENT_BYTES) throw new AppError(400, `The file is too large. Keep it under ${sizeLabel(MAX_DOCUMENT_BYTES)}.`);
  const real = sniffMime(Buffer.from(m[2].slice(0, 32), 'base64'));
  if (!real) throw new AppError(400, 'Attach a PDF or an image (JPG, PNG).');
  return { fileName: cleanFileName(b.fileName) || 'proof', mimeType: real, sizeBytes, fileData: dataUri };
}

const inScope = (person: any, row: { scope: string; scopeValue: string }) => audienceMatches(person, row.scope, row.scopeValue);

export const selfCommunicationController = {
  async getUpdates(req: any, res: Response) {
    const me = await actorPerson(req);
    const today = todayIST();
    const [bulletins, policies, acks, requests] = await Promise.all([
      prisma.bulletin.findMany({ where: { organizationId: me.organizationId, isActive: true }, orderBy: { createdAt: 'desc' } }),
      prisma.policy.findMany({ where: { organizationId: me.organizationId, isActive: true }, orderBy: { createdAt: 'desc' } }),
      prisma.policyAcknowledgement.findMany({ where: { personId: me.id }, select: { policyId: true } }),
      prisma.changeRequest.findMany({ where: { personId: me.id }, select: { id: true, section: true, changes: true, status: true, reviewNote: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);
    const ackIds = new Set(acks.map(a => a.policyId));
    res.json({
      bulletins: bulletins.filter(b => bulletinLive(b, today) && inScope(me, b)).map(b => ({ id: b.id, title: b.title, body: b.body, createdAt: b.createdAt, expiresOn: b.expiresOn, hasFile: Boolean(b.fileName), fileName: b.fileName })),
      policies: policies.filter(p => inScope(me, p)).map(p => ({ id: p.id, title: p.title, body: p.body, hasFile: Boolean(p.fileName), fileName: p.fileName, acknowledged: ackIds.has(p.id) })),
      detailsConfirmedAt: me.detailsConfirmedAt,
      myRequests: requests,
      sections: CHANGE_SECTIONS,
    });
  },

  async getBulletinFile(req: any, res: Response) {
    const me = await actorPerson(req);
    const b = await prisma.bulletin.findFirst({ where: { id: req.params.id, organizationId: me.organizationId, isActive: true } });
    if (!b || !b.fileName || !inScope(me, b)) throw new AppError(404, 'Not found');
    res.json({ fileName: b.fileName, mimeType: b.mimeType, fileData: await loadFile(me.organizationId, b) });
  },

  async getPolicyFile(req: any, res: Response) {
    const me = await actorPerson(req);
    const p = await prisma.policy.findFirst({ where: { id: req.params.id, organizationId: me.organizationId, isActive: true } });
    if (!p || !p.fileName || !inScope(me, p)) throw new AppError(404, 'Not found');
    res.json({ fileName: p.fileName, mimeType: p.mimeType, fileData: await loadFile(me.organizationId, p) });
  },

  async acknowledgePolicy(req: any, res: Response) {
    const me = await actorPerson(req);
    const p = await prisma.policy.findFirst({ where: { id: req.params.id, organizationId: me.organizationId, isActive: true } });
    if (!p || !inScope(me, p)) throw new AppError(404, 'Policy not found');
    await prisma.policyAcknowledgement.upsert({
      where: { policyId_personId: { policyId: p.id, personId: me.id } },
      create: { organizationId: me.organizationId, policyId: p.id, personId: me.id },
      update: {},
    });
    res.json({ ok: true });
  },

  async confirmDetails(req: any, res: Response) {
    const me = await actorPerson(req);
    await prisma.person.update({ where: { id: me.id }, data: { detailsConfirmedAt: new Date() } });
    res.json({ ok: true });
  },

  async myChangeRequests(req: any, res: Response) {
    const me = await actorPerson(req);
    const rows = await prisma.changeRequest.findMany({ where: { personId: me.id }, select: { id: true, section: true, changes: true, status: true, reviewNote: true, reviewedByName: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
    res.json({ requests: rows });
  },

  // Propose a change to one's own details. Nothing on the record changes
  // until HR approves. A bank change must carry a proof.
  async proposeChange(req: any, res: Response) {
    const me = await actorPerson(req);
    const person = await prisma.person.findFirst({ where: { id: me.id } });
    const section = str(req.body.section).toUpperCase();
    const def = sectionDef(section);
    if (!def) throw new AppError(400, 'Pick what you want to change');
    if (await prisma.changeRequest.findFirst({ where: { personId: me.id, section, status: 'PENDING' } })) {
      throw new AppError(400, 'You already have a pending request for this. Wait for it to be reviewed.');
    }

    let changes: any;
    if (section === 'FAMILY') {
      const member = familyMemberInput(req.body);
      if (typeof member === 'string') throw new AppError(400, member);
      changes = member;
    } else {
      const diff = changeDiff(section, req.body, person);
      if (typeof diff === 'string') throw new AppError(400, diff);
      if (Object.keys(diff).length === 0) throw new AppError(400, 'Nothing has changed');
      changes = diff;
    }

    const file = requiresProof(section) ? proofFile(req.body) : null;
    if (requiresProof(section) && !file) throw new AppError(400, 'Attach a proof for the bank change (a cancelled cheque or a bank statement)');
    const stored = file ? await saveFile(me.organizationId, me.id, file.mimeType, file.fileData) : { storage: 'DB', storageKey: '', fileData: '' };
    await prisma.changeRequest.create({
      data: { organizationId: me.organizationId, personId: me.id, section, changes, fileName: file?.fileName || '', mimeType: file?.mimeType || '', sizeBytes: file?.sizeBytes || 0, ...stored },
    });
    res.status(201).json({ ok: true });
  },
};
