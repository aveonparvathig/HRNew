// Files kept against an employee: identity proofs, certificates, signed
// letters. HR uploads them and decides which the employee can see.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { actorName, logPayrollAudit } from '../services/payroll/audit';
import { ensureListValues } from '../services/listValues';
import { DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, documentDetails, documentInput, sizeLabel } from '../services/documentCalc';
import { loadFile, removeStored, saveFile } from '../services/fileStore';

// Everything about a file but the file
export const FILE_CARD = {
  id: true, personId: true, category: true, title: true, documentDate: true, fileName: true, mimeType: true,
  sizeBytes: true, visibleToEmployee: true, uploadedByName: true, createdAt: true,
} as const;
// What it takes to fetch the file itself, from wherever it is kept
export const FILE_BODY = { fileName: true, mimeType: true, fileData: true, storage: true, storageKey: true } as const;

async function fetchPerson(personId: string, organizationId: string) {
  const person = await prisma.person.findFirst({ where: { id: personId, organizationId }, select: { id: true, name: true } });
  if (!person) throw new AppError(404, 'Person not found');
  return person;
}

async function fetchFile(fileId: string, organizationId: string) {
  const file = await prisma.employeeDocument.findFirst({
    where: { id: fileId, organizationId }, select: { ...FILE_CARD, storage: true, storageKey: true, person: { select: { id: true, name: true } } },
  });
  if (!file) throw new AppError(404, 'Document not found');
  return file;
}

export const employeeFilesController = {
  async getFiles(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const person = await fetchPerson(req.params.personId, organizationId);
    const files = await prisma.employeeDocument.findMany({
      where: { organizationId, personId: person.id }, select: FILE_CARD, orderBy: [{ category: 'asc' }, { createdAt: 'desc' }],
    });
    res.json({
      files,
      limits: { maxBytes: MAX_DOCUMENT_BYTES, maxLabel: sizeLabel(MAX_DOCUMENT_BYTES), accept: DOCUMENT_TYPES.flatMap(t => t.extensions.map(e => `.${e}`)).join(',') },
    });
  },

  async uploadFile(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const person = await fetchPerson(req.params.personId, organizationId);
    const input = documentInput(req.body);
    if (typeof input === 'string') throw new AppError(400, input);
    // The file goes where the company keeps its files; the row says where
    const stored = await saveFile(organizationId, person.id, input.mimeType, input.fileData);
    let file;
    try {
      file = await prisma.employeeDocument.create({
        data: { organizationId, personId: person.id, ...input, ...stored, uploadedByName: await actorName(req.user?.userId) },
        select: FILE_CARD,
      });
    } catch (err) {
      await removeStored(organizationId, [stored]);
      throw err;
    }
    await ensureListValues(organizationId, { DOCUMENT_CATEGORY: input.category });
    await logPayrollAudit(req, [{
      action: 'DOCUMENT_UPLOADED', personId: person.id, personName: person.name, field: `${input.category} · ${input.title}`,
      newValue: `${input.fileName} (${sizeLabel(input.sizeBytes)})${input.visibleToEmployee ? ', shown to the employee' : ''}`,
    }]);
    res.status(201).json(file);
  },

  // Title, category, date and whether the employee sees it. The file
  // itself is replaced by uploading another and removing this one.
  async updateFile(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const file = await fetchFile(req.params.fileId, organizationId);
    const details = documentDetails({ ...file, ...req.body });
    if (typeof details === 'string') throw new AppError(400, details);
    const updated = await prisma.employeeDocument.update({ where: { id: file.id }, data: details, select: FILE_CARD });
    await ensureListValues(organizationId, { DOCUMENT_CATEGORY: details.category });
    if (updated.visibleToEmployee !== file.visibleToEmployee) {
      await logPayrollAudit(req, [{
        action: 'DOCUMENT_VISIBILITY', personId: file.person.id, personName: file.person.name, field: `${updated.category} · ${updated.title}`,
        newValue: updated.visibleToEmployee ? 'Shown to the employee' : 'Hidden from the employee',
      }]);
    }
    res.json(updated);
  },

  // The file itself, as a data URI the browser opens.
  async getFile(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const file = await prisma.employeeDocument.findFirst({ where: { id: req.params.fileId, organizationId }, select: FILE_BODY });
    if (!file) throw new AppError(404, 'Document not found');
    res.json({ fileName: file.fileName, mimeType: file.mimeType, fileData: await loadFile(organizationId, file) });
  },

  async deleteFile(req: any, res: Response) {
    const file = await fetchFile(req.params.fileId, req.user?.organizationId);
    await prisma.employeeDocument.delete({ where: { id: file.id } });
    await removeStored(req.user?.organizationId, [file]);
    await logPayrollAudit(req, [{
      action: 'DOCUMENT_DELETED', personId: file.person.id, personName: file.person.name,
      field: `${file.category} · ${file.title}`, oldValue: file.fileName,
    }]);
    res.json({ message: `Removed ${file.title}` });
  },
};
