// Letter templates in the database and the letters written from them.
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { orgBrand, OrgBrand } from './orgBrand';
import { htmlToPdf } from './pdf';
import { peekNumber, takeNumber } from './numberSeries';
import { todayIST } from './payroll/loanLedger';
import {
  BUILT_IN_TEMPLATES, builtInTemplate, cleanFormData, formFields, renderLetter,
} from './letterEngine';

// A company's templates: the built-in ones are made the first time they
// are asked for, each as the program words it. One added to the program
// later appears the same way.
export async function ensureTemplates(organizationId: string) {
  const existing = await prisma.letterTemplate.findMany({ where: { organizationId }, select: { code: true } });
  const have = new Set(existing.map(t => t.code));
  const missing = BUILT_IN_TEMPLATES.filter(t => !have.has(t.code));
  if (missing.length === 0) return;
  await prisma.letterTemplate.createMany({
    data: missing.map(t => ({
      organizationId, code: t.code, name: t.name, audience: t.audience, subject: t.subject, salutation: t.salutation,
      body: t.body, sortOrder: BUILT_IN_TEMPLATES.indexOf(t),
    })),
    skipDuplicates: true,
  });
}

export async function templatesFor(organizationId: string, activeOnly = false) {
  await ensureTemplates(organizationId);
  return prisma.letterTemplate.findMany({
    where: { organizationId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export async function templateByCode(organizationId: string, code: any) {
  await ensureTemplates(organizationId);
  const template = await prisma.letterTemplate.findFirst({ where: { organizationId, code: String(code || '') } });
  if (!template) throw new AppError(400, 'Pick a letter');
  return template;
}

export const templateJSON = (t: any) => {
  const builtIn = builtInTemplate(t.code);
  return {
    id: t.id, code: t.code, name: t.name, audience: t.audience, subject: t.subject, salutation: t.salutation, body: t.body,
    isActive: t.isActive, builtIn: Boolean(builtIn),
    // A built-in letter reworded by HR can be put back as the program words it
    reworded: Boolean(builtIn) && (builtIn!.subject !== t.subject || builtIn!.salutation !== t.salutation || builtIn!.body !== t.body || builtIn!.name !== t.name),
    fields: formFields(t), updatedByName: t.updatedByName, updatedAt: t.updatedAt,
  };
};

// The letters one can issue to a kind of person, for the buttons on their page.
export async function letterTypesFor(organizationId: string) {
  return (await templatesFor(organizationId, true)).map(t => ({ value: t.code, label: t.name, kinds: [t.audience] }));
}

const PERSON_FOR_LETTER = { manager: { select: { name: true } }, workLocation: { select: { name: true } } };

export const personForLetter = (organizationId: string, personId: string) =>
  prisma.person.findFirst({ where: { id: personId, organizationId }, omit: { photoData: true }, include: PERSON_FOR_LETTER });

// What the record says, for the fields a letter may use.
function fromRecord(person: any, brand: OrgBrand) {
  return {
    recipientName: person.name,
    recipientAddress: person.address,
    employeeNo: person.employeeNo,
    designation: person.designation,
    department: person.department,
    grade: person.grade,
    workLocation: person.workLocation?.name || '',
    joiningDate: person.joinDate,
    joinDate: person.joinDate,
    leavingDate: person.leavingDate,
    confirmationDate: person.confirmationDate,
    monthlyPackage: person.currentMonthlyPackage || '',
    reportingTo: person.manager?.name || '',
    probationMonths: person.probationMonths || '',
    noticeDays: person.noticePeriodDays ?? '',
    internshipRole: person.internshipRole,
    startDate: person.startDate,
    endDate: person.endDate,
    collegeName: person.collegeName,
    course: person.course,
    rollNumber: person.rollNumber,
    signatoryName: brand.signatoryName,
    signatoryTitle: brand.signatoryDesignation,
  };
}

const hasValue = (v: any) => v !== null && v !== undefined && String(v).trim() !== '';

// A letter form filled before anyone types: what was typed on the last
// letter of the same kind, then what the employee's record says today
// (the record wins where it has a value), today's date and the next
// reference of the letter series.
export async function letterPrefill(organizationId: string, person: any, template: { code: string }, brand: OrgBrand) {
  const last = await prisma.personDocument.findFirst({
    where: { personId: person.id, docType: template.code }, orderBy: { createdAt: 'desc' },
  });
  const record = fromRecord(person, brand);
  const typed = (last?.formData || {}) as Record<string, any>;
  const { signatoryName, signatoryTitle, ...onRecord } = record;
  const nextRef = await peekNumber(organizationId, 'LETTER');
  return {
    signatoryName, signatoryTitle,
    ...typed,
    ...Object.fromEntries(Object.entries(onRecord).filter(([, v]) => hasValue(v))),
    recipientName: person.name,
    letterDate: todayIST(),
    ...(nextRef ? { refNo: nextRef } : {}),
  };
}

// Write a letter and keep it on the person. A letter issued with the
// series' next reference, or with none typed, takes that reference.
export async function issueLetter(
  organizationId: string, person: any, template: any, formData: any,
  opts: { brand?: OrgBrand; visibleToEmployee?: boolean; createdByName?: string } = {},
) {
  if (template.audience !== person.kind) throw new AppError(400, `${template.name} cannot be issued to ${person.name}`);
  const brand = opts.brand || await orgBrand(organizationId);
  const data = cleanFormData(formData);
  data.recipientName = String(data.recipientName || '').trim() || person.name;
  const nextRef = await peekNumber(organizationId, 'LETTER');
  if (nextRef && (!String(data.refNo || '').trim() || String(data.refNo).trim() === nextRef)) {
    data.refNo = await takeNumber(organizationId, 'LETTER');
  }
  return prisma.personDocument.create({
    data: {
      organizationId, personId: person.id, docType: template.code, title: `${template.name} — ${person.name}`,
      formData: data, html: renderLetter(template, brand, data), templateId: template.id,
      visibleToEmployee: Boolean(opts.visibleToEmployee), createdByName: opts.createdByName || '',
    },
  });
}

// The letter as a PDF file, named after its title.
export async function letterPdf(doc: { title: string; html: string }) {
  const filename = `${doc.title.replace(/[^\w .()—-]+/g, '').replace(/\s+/g, ' ').trim() || 'Letter'}.pdf`;
  return { filename, pdf: await htmlToPdf(doc.html) };
}
