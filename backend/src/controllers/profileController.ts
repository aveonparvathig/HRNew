// Fuller employee profile (phase 24): family members, education, previous
// employment and identity documents. All HR-facing (SUPER_ADMIN / HR).
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { actorName, logPayrollAudit } from '../services/payroll/audit';
import { ensureListValues } from '../services/listValues';
import { todayIST } from '../services/payroll/loanLedger';
import { loadFile, removeStored, saveFile } from '../services/fileStore';
import { MAX_DOCUMENT_BYTES, base64Bytes, cleanFileName, sizeLabel, sniffMime } from '../services/documentCalc';
import {
  IDENTITY_DOC_TYPES, educationInput, expiringWithin, familyMemberInput, identityDocInput, isExpired,
  nomineeShareProblem, previousEmploymentInput, profileIdentityRows, totalExperience,
} from '../services/profileCalc';

const str = (v: any) => String(v ?? '');

async function fetchPerson(personId: string, organizationId: string) {
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: { id: true, name: true, panNumber: true, aadharNo: true },
  });
  if (!person) throw new AppError(404, 'Person not found');
  return person;
}

const nextSort = (rows: { sortOrder: number }[]) => (rows.length ? Math.max(...rows.map(r => r.sortOrder)) + 1 : 0);

// An optional file on an identity document, checked like an employee file:
// a real PDF or image under the size limit, its true type sniffed.
function identityFile(b: any): { fileName: string; mimeType: string; sizeBytes: number; fileData: string } | null {
  const dataUri = str(b.fileData);
  if (!dataUri) return null;
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!m) throw new AppError(400, 'The file could not be read');
  const claimed = m[1];
  const sizeBytes = base64Bytes(m[2]);
  if (sizeBytes > MAX_DOCUMENT_BYTES) throw new AppError(400, `The file is too large. Keep it under ${sizeLabel(MAX_DOCUMENT_BYTES)}.`);
  const real = sniffMime(Buffer.from(m[2].slice(0, 32), 'base64'));
  if (!real) throw new AppError(400, 'Attach a PDF or an image (JPG, PNG).');
  return { fileName: cleanFileName(b.fileName) || 'document', mimeType: real, sizeBytes, fileData: dataUri };
}

// ---- Family members ----------------------------------------------------------------------------
async function familyList(organizationId: string, personId: string) {
  const members = await prisma.familyMember.findMany({
    where: { organizationId, personId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return { members, nomineeTotal: members.reduce((s, m) => s + m.nomineeShare, 0) };
}

// ---- Identity documents ------------------------------------------------------------------------
const IDENTITY_CARD = {
  id: true, docType: true, number: true, nameOnDocument: true, expiryDate: true, fileName: true, mimeType: true,
  sizeBytes: true, storage: true, verified: true, verifiedByName: true, verifiedAt: true, sortOrder: true, createdAt: true,
} as const;

const identityView = (d: any, today: string) => ({
  id: d.id, docType: d.docType, number: d.number, nameOnDocument: d.nameOnDocument, expiryDate: d.expiryDate,
  verified: d.verified, verifiedByName: d.verifiedByName, verifiedAt: d.verifiedAt, fromProfile: false,
  hasFile: Boolean(d.fileName), fileName: d.fileName, sizeBytes: d.sizeBytes,
  expired: isExpired(d.expiryDate, today),
});

export const profileController = {
  // ---- Family --------------------------------------------------------------
  async getFamily(req: any, res: Response) {
    const person = await fetchPerson(req.params.personId, req.user?.organizationId);
    res.json(await familyList(req.user?.organizationId, person.id));
  },

  async addFamily(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchPerson(req.params.personId, orgId);
    const input = familyMemberInput(req.body);
    if (typeof input === 'string') throw new AppError(400, input);
    const { members } = await familyList(orgId, person.id);
    const problem = nomineeShareProblem([...members, input as any]);
    if (problem) throw new AppError(400, problem);
    await prisma.familyMember.create({ data: { organizationId: orgId, personId: person.id, ...(input as any), sortOrder: nextSort(members) } });
    res.status(201).json(await familyList(orgId, person.id));
  },

  async updateFamily(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.familyMember.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row) throw new AppError(404, 'Family member not found');
    const input = familyMemberInput(req.body);
    if (typeof input === 'string') throw new AppError(400, input);
    const { members } = await familyList(orgId, row.personId);
    const problem = nomineeShareProblem(members.map(m => (m.id === row.id ? { ...m, ...input } as any : m)));
    if (problem) throw new AppError(400, problem);
    await prisma.familyMember.update({ where: { id: row.id }, data: input });
    res.json(await familyList(orgId, row.personId));
  },

  async deleteFamily(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.familyMember.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row) throw new AppError(404, 'Family member not found');
    await prisma.familyMember.delete({ where: { id: row.id } });
    res.json(await familyList(orgId, row.personId));
  },

  // ---- Education -----------------------------------------------------------
  async getEducation(req: any, res: Response) {
    const person = await fetchPerson(req.params.personId, req.user?.organizationId);
    res.json({ rows: await prisma.education.findMany({ where: { organizationId: req.user?.organizationId, personId: person.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }) });
  },

  async addEducation(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchPerson(req.params.personId, orgId);
    const input = educationInput(req.body);
    if (typeof input === 'string') throw new AppError(400, input);
    const rows = await prisma.education.findMany({ where: { organizationId: orgId, personId: person.id } });
    // Only one qualification is the highest
    if ((input as any).isHighest) await prisma.education.updateMany({ where: { organizationId: orgId, personId: person.id }, data: { isHighest: false } });
    await prisma.education.create({ data: { organizationId: orgId, personId: person.id, ...(input as any), sortOrder: nextSort(rows) } });
    res.status(201).json({ rows: await prisma.education.findMany({ where: { organizationId: orgId, personId: person.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }) });
  },

  async updateEducation(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.education.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row) throw new AppError(404, 'Qualification not found');
    const input = educationInput(req.body);
    if (typeof input === 'string') throw new AppError(400, input);
    if ((input as any).isHighest) await prisma.education.updateMany({ where: { organizationId: orgId, personId: row.personId, id: { not: row.id } }, data: { isHighest: false } });
    await prisma.education.update({ where: { id: row.id }, data: input });
    res.json({ rows: await prisma.education.findMany({ where: { organizationId: orgId, personId: row.personId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }) });
  },

  async deleteEducation(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.education.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row) throw new AppError(404, 'Qualification not found');
    await prisma.education.delete({ where: { id: row.id } });
    res.json({ rows: await prisma.education.findMany({ where: { organizationId: orgId, personId: row.personId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }) });
  },

  // ---- Previous employment -------------------------------------------------
  async getPreviousEmployment(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchPerson(req.params.personId, orgId);
    const rows = await prisma.previousEmployment.findMany({ where: { organizationId: orgId, personId: person.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    res.json({ rows, totalExperience: totalExperience(rows) });
  },

  async addPreviousEmployment(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchPerson(req.params.personId, orgId);
    const input = previousEmploymentInput(req.body);
    if (typeof input === 'string') throw new AppError(400, input);
    const rows = await prisma.previousEmployment.findMany({ where: { organizationId: orgId, personId: person.id } });
    await prisma.previousEmployment.create({ data: { organizationId: orgId, personId: person.id, ...(input as any), sortOrder: nextSort(rows) } });
    const all = await prisma.previousEmployment.findMany({ where: { organizationId: orgId, personId: person.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    res.status(201).json({ rows: all, totalExperience: totalExperience(all) });
  },

  async updatePreviousEmployment(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.previousEmployment.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row) throw new AppError(404, 'Record not found');
    const input = previousEmploymentInput(req.body);
    if (typeof input === 'string') throw new AppError(400, input);
    await prisma.previousEmployment.update({ where: { id: row.id }, data: input });
    const all = await prisma.previousEmployment.findMany({ where: { organizationId: orgId, personId: row.personId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    res.json({ rows: all, totalExperience: totalExperience(all) });
  },

  async deletePreviousEmployment(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.previousEmployment.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row) throw new AppError(404, 'Record not found');
    await prisma.previousEmployment.delete({ where: { id: row.id } });
    const all = await prisma.previousEmployment.findMany({ where: { organizationId: orgId, personId: row.personId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    res.json({ rows: all, totalExperience: totalExperience(all) });
  },

  // ---- Identity documents --------------------------------------------------
  async getIdentityDocuments(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchPerson(req.params.personId, orgId);
    const today = todayIST();
    const docs = await prisma.identityDocument.findMany({ where: { organizationId: orgId, personId: person.id }, select: IDENTITY_CARD, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
    const haveTypes = new Set(docs.map(d => d.docType));
    res.json({
      docs: [...docs.map(d => identityView(d, today)), ...profileIdentityRows(person, haveTypes)],
      types: IDENTITY_DOC_TYPES, limits: { maxBytes: MAX_DOCUMENT_BYTES, maxLabel: sizeLabel(MAX_DOCUMENT_BYTES) },
    });
  },

  async addIdentityDocument(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchPerson(req.params.personId, orgId);
    const input = identityDocInput(req.body);
    if (typeof input === 'string') throw new AppError(400, input);
    const file = identityFile(req.body);
    const rows = await prisma.identityDocument.findMany({ where: { organizationId: orgId, personId: person.id }, select: { sortOrder: true } });
    const stored = file ? await saveFile(orgId, person.id, file.mimeType, file.fileData) : { storage: 'DB', storageKey: '', fileData: '' };
    try {
      await prisma.identityDocument.create({
        data: {
          organizationId: orgId, personId: person.id, ...(input as any), sortOrder: nextSort(rows),
          fileName: file?.fileName || '', mimeType: file?.mimeType || '', sizeBytes: file?.sizeBytes || 0, ...stored,
        },
      });
    } catch (err) {
      if (file) await removeStored(orgId, [stored]);
      throw err;
    }
    await logPayrollAudit(req, [{ action: 'IDENTITY_DOC_SAVED', personId: person.id, personName: person.name, field: (input as any).docType, newValue: (input as any).number }]);
    res.status(201).json({ ok: true });
  },

  async updateIdentityDocument(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.identityDocument.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row) throw new AppError(404, 'Document not found');
    const input = identityDocInput({ ...row, ...req.body });
    if (typeof input === 'string') throw new AppError(400, input);
    await prisma.identityDocument.update({ where: { id: row.id }, data: input });
    res.json({ ok: true });
  },

  // Mark a document checked, or take the tick back.
  async verifyIdentityDocument(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.identityDocument.findFirst({ where: { id: req.params.id, organizationId: orgId }, include: { person: { select: { name: true } } } });
    if (!row) throw new AppError(404, 'Document not found');
    const verified = Boolean(req.body.verified);
    await prisma.identityDocument.update({
      where: { id: row.id },
      data: { verified, verifiedByName: verified ? await actorName(req.user?.userId) : '', verifiedAt: verified ? new Date() : null },
    });
    await logPayrollAudit(req, [{ action: 'IDENTITY_DOC_VERIFIED', personId: row.personId, personName: row.person.name, field: row.docType, newValue: verified ? 'Verified' : 'Unverified' }]);
    res.json({ ok: true });
  },

  async openIdentityFile(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.identityDocument.findFirst({ where: { id: req.params.id, organizationId: orgId } });
    if (!row || !row.fileName) throw new AppError(404, 'No file on this document');
    res.json({ fileName: row.fileName, mimeType: row.mimeType, fileData: await loadFile(orgId, row) });
  },

  async deleteIdentityDocument(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const row = await prisma.identityDocument.findFirst({ where: { id: req.params.id, organizationId: orgId }, include: { person: { select: { name: true } } } });
    if (!row) throw new AppError(404, 'Document not found');
    await prisma.identityDocument.delete({ where: { id: row.id } });
    if (row.fileName) await removeStored(orgId, [row]);
    await logPayrollAudit(req, [{ action: 'IDENTITY_DOC_DELETED', personId: row.personId, personName: row.person.name, field: row.docType, oldValue: row.number }]);
    res.json({ ok: true });
  },

  // Every employee's identity documents in one list, for HR: filter by type,
  // by whether they are verified, and those expiring in the next 60 days.
  async listIdentityDocuments(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const type = str(req.query.type).toUpperCase();
    const verified = str(req.query.verified); // 'yes' | 'no' | ''
    const expiring = str(req.query.expiring) === '1';
    const today = todayIST();
    const docs = await prisma.identityDocument.findMany({
      where: {
        organizationId: orgId,
        ...(IDENTITY_DOC_TYPES.some(t => t.value === type) ? { docType: type } : {}),
        ...(verified === 'yes' ? { verified: true } : verified === 'no' ? { verified: false } : {}),
      },
      select: { ...IDENTITY_CARD, person: { select: { id: true, name: true, employeeNo: true } } },
      orderBy: [{ docType: 'asc' }, { createdAt: 'desc' }],
    });
    let rows = docs.map(d => ({ ...identityView(d, today), person: d.person }));
    if (expiring) rows = expiringWithin(rows.filter(r => r.expiryDate), 60, today);
    res.json({ docs: rows, types: IDENTITY_DOC_TYPES });
  },
};
