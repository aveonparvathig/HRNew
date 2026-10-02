// Letters: the templates HR words them from, writing one or many,
// sharing a letter with the employee, its PDF and mailing it.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { orgBrand } from '../services/orgBrand';
import { actorName, logPayrollAudit } from '../services/payroll/audit';
import { sendFile } from '../services/payroll/payslipDocs';
import { sendMail } from '../services/mailer';
import {
  LETTER_FIELDS, SAMPLE_DATA, builtInTemplate, cleanFormData, formFields, renderLetter, templateCode, templateInput,
} from '../services/letterEngine';
import {
  issueLetter, letterPdf, letterPrefill, personForLetter, templateByCode, templateJSON, templatesFor,
} from '../services/letters';

const str = (v: any) => String(v ?? '').trim();
const MAX_BULK = 200;
const PDF = 'application/pdf';
const isEmail = (v: any) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || ''));

async function fetchTemplate(id: string, organizationId: string) {
  const template = await prisma.letterTemplate.findFirst({ where: { id, organizationId } });
  if (!template) throw new AppError(404, 'Letter template not found');
  return template;
}

async function fetchPerson(personId: any, organizationId: string) {
  const person = await personForLetter(organizationId, str(personId));
  if (!person) throw new AppError(404, 'Person not found');
  return person;
}

async function fetchLetter(docId: string, organizationId: string) {
  const doc = await prisma.personDocument.findFirst({
    where: { id: docId, organizationId },
    include: { person: { select: { id: true, name: true, email: true, officialEmail: true } } },
  });
  if (!doc) throw new AppError(404, 'Document not found');
  return doc;
}

// Where a letter is mailed: the personal address (a candidate has no
// other), else the official one.
const letterAddress = (person: { email?: string | null; officialEmail?: string | null }) =>
  [person.email, person.officialEmail].find(isEmail) || '';

export const lettersController = {
  // ---- Templates ----------------------------------------------------------------------
  async getTemplates(req: any, res: Response) {
    const templates = await templatesFor(req.user?.organizationId);
    res.json({
      templates: templates.map(templateJSON),
      // Every field a template may use, for the editor
      fields: LETTER_FIELDS.map(f => ({ key: f.key, label: f.label, type: f.type, auto: Boolean(f.auto) })),
      audiences: [{ value: 'CANDIDATE', label: 'Employees and candidates' }, { value: 'INTERN', label: 'Internship students' }],
    });
  },

  async createTemplate(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const input = templateInput(req.body);
    if (typeof input === 'string') throw new AppError(400, input);
    const existing = await templatesFor(organizationId);
    if (existing.some(t => t.name.toLowerCase() === input.name.toLowerCase())) {
      throw new AppError(400, `There is already a letter named "${input.name}"`);
    }
    const template = await prisma.letterTemplate.create({
      data: {
        organizationId, ...input, code: templateCode(input.name, existing.map(t => t.code)),
        sortOrder: Math.max(-1, ...existing.map(t => t.sortOrder)) + 1, updatedByName: await actorName(req.user?.userId),
      },
    });
    await logPayrollAudit(req, [{ action: 'LETTER_TEMPLATE_SAVED', field: template.name, newValue: 'Added' }]);
    res.status(201).json(templateJSON(template));
  },

  // Reword a letter, rename it, or switch it on or off.
  async updateTemplate(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const template = await fetchTemplate(req.params.templateId, organizationId);
    const b = req.body;
    const data: any = {};
    if (['name', 'subject', 'salutation', 'body', 'audience'].some(f => b[f] !== undefined)) {
      const input = templateInput({ ...template, ...b });
      if (typeof input === 'string') throw new AppError(400, input);
      const clash = await prisma.letterTemplate.findFirst({
        where: { organizationId, id: { not: template.id }, name: { equals: input.name, mode: 'insensitive' } },
      });
      if (clash) throw new AppError(400, `There is already a letter named "${input.name}"`);
      // Who a built-in letter is for is part of what it is
      if (builtInTemplate(template.code)) input.audience = template.audience as any;
      Object.assign(data, input);
    }
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);
    const updated = await prisma.letterTemplate.update({
      where: { id: template.id }, data: { ...data, updatedByName: await actorName(req.user?.userId) },
    });
    await logPayrollAudit(req, [{
      action: 'LETTER_TEMPLATE_SAVED', field: updated.name,
      newValue: b.isActive !== undefined && updated.isActive !== template.isActive ? (updated.isActive ? 'Switched on' : 'Switched off') : 'Reworded',
    }]);
    res.json(templateJSON(updated));
  },

  // A built-in letter back to the wording it came with.
  async resetTemplate(req: any, res: Response) {
    const template = await fetchTemplate(req.params.templateId, req.user?.organizationId);
    const original = builtInTemplate(template.code);
    if (!original) throw new AppError(400, 'Only the letters that came with the program can be put back');
    const updated = await prisma.letterTemplate.update({
      where: { id: template.id },
      data: {
        name: original.name, subject: original.subject, salutation: original.salutation, body: original.body,
        updatedByName: await actorName(req.user?.userId),
      },
    });
    await logPayrollAudit(req, [{ action: 'LETTER_TEMPLATE_SAVED', field: updated.name, newValue: 'Put back to the original wording' }]);
    res.json(templateJSON(updated));
  },

  async deleteTemplate(req: any, res: Response) {
    const template = await fetchTemplate(req.params.templateId, req.user?.organizationId);
    if (builtInTemplate(template.code)) {
      throw new AppError(400, 'This letter came with the program and cannot be deleted. Switch it off instead.');
    }
    await prisma.letterTemplate.delete({ where: { id: template.id } });
    await logPayrollAudit(req, [{ action: 'LETTER_TEMPLATE_DELETED', field: template.name }]);
    res.json({ message: `Deleted ${template.name}. Letters already issued from it stay on record.` });
  },

  // A letter as it would come out, without keeping it: a saved template
  // or one being typed, for a person or with sample values.
  async preview(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const b = req.body || {};
    let template: any;
    if (b.template) {
      const input = templateInput({ name: 'Preview', ...b.template });
      if (typeof input === 'string') throw new AppError(400, input);
      template = input;
    } else {
      template = await templateByCode(organizationId, b.code);
    }
    const brand = await orgBrand(organizationId);
    let data: any = { ...SAMPLE_DATA, letterDate: new Date().toISOString().slice(0, 10) };
    if (b.personId) {
      const person = await fetchPerson(b.personId, organizationId);
      data = await letterPrefill(organizationId, person, { code: template.code || '' }, brand);
    }
    Object.assign(data, Object.fromEntries(Object.entries(cleanFormData(b.formData)).filter(([, v]) => str(v) !== '')));
    res.json({ html: renderLetter(template, brand, data), fields: formFields(template) });
  },

  // ---- One letter -----------------------------------------------------------------------
  async getPrefill(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const person = await fetchPerson(req.params.personId, organizationId);
    const template = await templateByCode(organizationId, req.query.docType);
    res.json({
      prefill: await letterPrefill(organizationId, person, template, await orgBrand(organizationId)),
      fields: formFields(template),
    });
  },

  async createLetter(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const person = await fetchPerson(req.params.personId, organizationId);
    const template = await templateByCode(organizationId, req.body.docType);
    if (!template.isActive) throw new AppError(400, `${template.name} is switched off`);
    const doc = await issueLetter(organizationId, person, template, req.body.formData || {}, {
      visibleToEmployee: Boolean(req.body.visibleToEmployee), createdByName: await actorName(req.user?.userId),
    });
    res.status(201).json({ id: doc.id, docType: doc.docType, title: doc.title, createdAt: doc.createdAt });
  },

  // The same letter for several people at once. Each takes its details
  // from the person's own record; what is typed here is common to all.
  async createLetters(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const template = await templateByCode(organizationId, req.body.docType);
    if (!template.isActive) throw new AppError(400, `${template.name} is switched off`);
    const ids: string[] = [...new Set((Array.isArray(req.body.personIds) ? req.body.personIds : []).map(str).filter(Boolean))] as string[];
    if (ids.length === 0) throw new AppError(400, 'Pick at least one person');
    if (ids.length > MAX_BULK) throw new AppError(400, `Pick ${MAX_BULK} people at most in one go`);
    const common = Object.fromEntries(Object.entries(cleanFormData(req.body.formData)).filter(([k, v]) => str(v) !== '' && k !== 'recipientName' && k !== 'refNo'));
    const [brand, createdByName] = await Promise.all([orgBrand(organizationId), actorName(req.user?.userId)]);
    const issued: any[] = [];
    const skipped: any[] = [];
    for (const id of ids) {
      const person = await personForLetter(organizationId, id);
      if (!person) { skipped.push({ id, name: '', reason: 'Not found' }); continue; }
      if (person.kind !== template.audience) { skipped.push({ id, name: person.name, reason: `${template.name} is not for ${person.kind === 'INTERN' ? 'interns' : 'employees'}` }); continue; }
      const prefill = await letterPrefill(organizationId, person, template, brand);
      // The reference comes from the series for each letter, never from the last one
      const { refNo: _ref, ...own } = prefill as any;
      const doc = await issueLetter(organizationId, person, template, { ...own, ...common }, {
        brand, visibleToEmployee: Boolean(req.body.visibleToEmployee), createdByName,
      });
      issued.push({ id: doc.id, personId: person.id, name: person.name, title: doc.title, refNo: (doc.formData as any)?.refNo || '' });
    }
    res.status(201).json({
      issued, skipped,
      message: `${issued.length} ${issued.length === 1 ? 'letter' : 'letters'} written${skipped.length ? `, ${skipped.length} skipped` : ''}`,
    });
  },

  async getLetter(req: any, res: Response) {
    const doc = await fetchLetter(req.params.docId, req.user?.organizationId);
    const { email: _e, officialEmail: _o, ...person } = doc.person;
    res.json({ ...doc, person, emailTo: letterAddress(doc.person) });
  },

  // Show the letter to the employee under My Documents, or take it back.
  async updateLetter(req: any, res: Response) {
    const doc = await fetchLetter(req.params.docId, req.user?.organizationId);
    const visibleToEmployee = Boolean(req.body.visibleToEmployee);
    await prisma.personDocument.update({ where: { id: doc.id }, data: { visibleToEmployee } });
    if (visibleToEmployee !== doc.visibleToEmployee) {
      await logPayrollAudit(req, [{
        action: 'DOCUMENT_VISIBILITY', personId: doc.person.id, personName: doc.person.name, field: doc.title,
        newValue: visibleToEmployee ? 'Shown to the employee' : 'Hidden from the employee',
      }]);
    }
    res.json({ id: doc.id, visibleToEmployee });
  },

  async letterFile(req: any, res: Response) {
    const doc = await fetchLetter(req.params.docId, req.user?.organizationId);
    const file = await letterPdf(doc);
    sendFile(res, file.filename, PDF, file.pdf);
  },

  // Mail the letter as a PDF to the person.
  async emailLetter(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const doc = await fetchLetter(req.params.docId, organizationId);
    const to = letterAddress(doc.person);
    if (!to) throw new AppError(400, `${doc.person.name} has no email address on record`);
    const [brand, file] = await Promise.all([orgBrand(organizationId), letterPdf(doc)]);
    const name = doc.title.split(' — ')[0];
    const result = await sendMail(organizationId, {
      kind: 'LETTER', to, subject: `${name} — ${brand.name}`,
      text: `Dear ${doc.person.name},\n\nPlease find your ${name.toLowerCase()} attached.\n\nRegards,\n${brand.name}`,
      attachments: [{ filename: file.filename, content: file.pdf, contentType: PDF }],
      personId: doc.person.id, personName: doc.person.name, sentBy: await actorName(req.user?.userId),
    });
    res.json({ ...result, to });
  },
};
