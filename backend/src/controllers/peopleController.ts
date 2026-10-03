import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { loadActor } from '../middleware/roles';
import { actorName } from '../services/payroll/audit';
import { currentPeriodIST } from '../services/payroll/salaryStructure';
import { syncDraftEntries } from '../services/payroll/draftSync';
import { cleanIfsc, isValidIfsc } from '../services/masters';
import { ensureListValues, listValuesFor } from '../services/listValues';
import { nextEmployeeCode, noteEmployeeCodeUsed } from '../services/numberSeries';
import { CONSULTANT_SECTIONS, TAX_TREATMENTS, isConsultantSection, npsPercentInput, taxTreatmentInput } from '../services/payroll/consultantCalc';
import { approvalChainOf, confirmationState, jobDetailsInput } from '../services/orgChart';
import { assertManager } from './orgChartController';
import { todayIST } from '../services/payroll/loanLedger';
import { POSITION_REASONS } from '../services/positionCalc';
import { ensureStartingPosition, followProfileEdit } from '../services/positions';
import { letterTypesFor } from '../services/letters';
import { removeStored } from '../services/fileStore';
import { canSeeFullAadhaar, maskAadhaar, personalInput, profileData } from '../services/profileCalc';

// EMPLOYEE role sees the people directory without money, bank, statutory
// or government-ID fields — stripped server-side, never sent at all.
const SENSITIVE_PERSON_FIELDS = [
  'currentMonthlyPackage', 'expectedCtc',
  'bankName', 'bankAccountNumber', 'ifscCode',
  'panNumber', 'pfNumber', 'pfUan', 'esiNumber', 'aadharNo',
  'isEsiEligible', 'isPfApplicable', 'agreementSigned', 'agreementSignDate',
  'reasonForLeaving', 'notes',
  'confirmationDate', 'probationMonths', 'noticePeriodDays', 'referredBy', 'firstHireDate', 'grade',
] as const;

const stripForEmployee = (actor: any) => ['EMPLOYEE', 'MARKETING'].includes(actor.role);

function stripPersonFields(p: any) {
  const out: any = { ...p };
  for (const f of SENSITIVE_PERSON_FIELDS) out[f] = undefined;
  return out;
}

export const PERSON_KINDS = [
  { value: 'CANDIDATE', label: 'Employee' },
  { value: 'INTERN', label: 'Internship Student' },
];

// Reaching one of these pipeline stages automatically makes the person an employee
const EMPLOYEE_STAGES = ['SELECTED', 'JOINED'];

// Pipeline stage drives employee status: Selected/Joined -> employee,
// any other active stage -> candidate, no stage -> keep as-is.
const employeeFromStage = (stage: string, current: boolean) =>
  EMPLOYEE_STAGES.includes(stage) ? true : stage ? false : current;

export const PERSON_SOURCES = [
  { value: 'CAMPUS', label: 'Campus Drive' },
  { value: 'REFERRAL', label: 'Referral' },
  { value: 'PORTAL', label: 'Job Portal' },
  { value: 'WALKIN', label: 'Walk-in' },
  { value: 'OTHER', label: 'Other' },
];

export const PERSON_STAGES = [
  { value: 'NEW', label: 'New' },
  { value: 'SCREENING', label: 'Screening' },
  { value: 'SHORTLISTED', label: 'Shortlisted' },
  { value: 'INTERVIEW', label: 'Interview' },
  { value: 'SELECTED', label: 'Selected' },
  { value: 'OFFERED', label: 'Offered' },
  { value: 'JOINED', label: 'Joined' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ON_HOLD', label: 'On Hold' },
];

export const INTERVIEW_RESULTS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'PASSED', label: 'Passed' },
  { value: 'FAILED', label: 'Failed' },
];

export const EMPLOYMENT_STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PROBATION', label: 'Probation' },
  { value: 'NOTICE_PERIOD', label: 'Notice Period' },
  { value: 'RESIGNED', label: 'Resigned' },
  { value: 'TERMINATED', label: 'Terminated' },
];

// An IFSC that is being set or changed must be well formed. One already
// on record is left alone, so an old typo does not block other edits.
function checkIfsc(b: any, before?: { ifscCode: string }) {
  if (b.ifscCode === undefined) return;
  const ifsc = cleanIfsc(b.ifscCode);
  if (ifsc && ifsc !== cleanIfsc(before?.ifscCode) && !isValidIfsc(ifsc)) {
    throw new AppError(400, 'IFSC must look like HDFC0001234: four letters, a zero, six characters');
  }
}

// Values picked or typed on a person join their lists
const personListValues = (p: any) => ({
  DEPARTMENT: p.department, DESIGNATION: p.designation, GRADE: p.grade, BANK: p.bankName, EMPLOYMENT_TYPE: p.employmentType,
  BLOOD_GROUP: p.bloodGroup, MARITAL_STATUS: p.maritalStatus, LEAVING_REASON: p.reasonForLeaving,
});


const OPENING_STATUSES = [
  { value: 'OPEN', label: 'Open' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'CLOSED', label: 'Closed' },
];

const KIND_VALUES = PERSON_KINDS.map(k => k.value);
const STAGE_VALUES = PERSON_STAGES.map(s => s.value);
const SOURCE_VALUES = PERSON_SOURCES.map(s => s.value);
const SELECTED_STAGES = ['SELECTED', 'OFFERED', 'JOINED'];

const str = (v: any) => String(v ?? '');
const numOrNull = (v: any) => (v == null || v === '' ? null : Number(v));
const dateOrNull = (v: any) => (v ? String(v) : null);

function validateRating(rating: any) {
  if (rating == null || rating === '') return null;
  const n = Number(rating);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new AppError(400, 'Rating must be between 1 and 5');
  }
  return n;
}

async function fetchOrgPerson(id: string, organizationId: string) {
  const person = await prisma.person.findFirst({ where: { id, organizationId } });
  if (!person) throw new AppError(404, 'Person not found');
  return person;
}

async function checkDuplicateName(orgId: string, kind: string, name: string, excludeId?: string) {
  const dup = await prisma.person.findFirst({
    where: {
      organizationId: orgId,
      kind,
      name: { equals: name, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (dup) {
    const label = kind === 'INTERN' ? 'intern' : 'candidate';
    throw new AppError(400, `A ${label} named "${name}" already exists`);
  }
}

function personData(b: any) {
  return {
    title: str(b.title),
    gender: str(b.gender),
    email: str(b.email),
    phone: str(b.phone),
    address: str(b.address),
    notes: str(b.notes),
    employeeNo: str(b.employeeNo).trim(),
    designation: str(b.designation),
    department: str(b.department),
    joinDate: dateOrNull(b.joinDate),
    leavingDate: dateOrNull(b.leavingDate),
    // HR profile: personal
    photoData: str(b.photoData),
    dateOfBirth: dateOrNull(b.dateOfBirth),
    bloodGroup: str(b.bloodGroup),
    maritalStatus: str(b.maritalStatus),
    parentSpouseName: str(b.parentSpouseName),
    aadharNo: str(b.aadharNo),
    // HR profile: contact
    officialEmail: str(b.officialEmail),
    officialNo: str(b.officialNo),
    emergencyNo: str(b.emergencyNo),
    // HR profile: employment
    employmentStatus: EMPLOYMENT_STATUSES.some(s => s.value === b.employmentStatus)
      ? b.employmentStatus : 'ACTIVE',
    biometricId: str(b.biometricId),
    agreementSigned: Boolean(b.agreementSigned),
    agreementSignDate: dateOrNull(b.agreementSignDate),
    currentMonthlyPackage: Number(b.currentMonthlyPackage) || 0,
    reasonForLeaving: str(b.reasonForLeaving),
    workLocationId: b.workLocationId || null,
    // Bank & statutory
    bankName: str(b.bankName),
    bankAccountNumber: str(b.bankAccountNumber),
    ifscCode: cleanIfsc(b.ifscCode),
    panNumber: str(b.panNumber),
    pfNumber: str(b.pfNumber),
    pfUan: str(b.pfUan),
    esiNumber: str(b.esiNumber),
    isEsiEligible: Boolean(b.isEsiEligible),
    isPfApplicable: Boolean(b.isPfApplicable),
    // Job details
    employmentType: str(b.employmentType).replace(/\s+/g, ' '),
    grade: str(b.grade).trim().replace(/\s+/g, ' '),
    probationMonths: Number(b.probationMonths) || 0,
    confirmationDate: dateOrNull(b.confirmationDate),
    noticePeriodDays: numOrNull(b.noticePeriodDays),
    firstHireDate: dateOrNull(b.firstHireDate),
    referredBy: str(b.referredBy),
    managerId: b.managerId || null,
    npsEmployerPercent: Number(b.npsEmployerPercent) || 0,
    npsPran: str(b.npsPran).replace(/\s+/g, ''),
    taxTreatment: b.taxTreatment === 'CONSULTANT' ? 'CONSULTANT' : 'SALARY',
    consultantSection: isConsultantSection(b.consultantSection) ? b.consultantSection : '194J',
    consultantTdsPercent: b.consultantTdsPercent === '' || b.consultantTdsPercent == null || !isFinite(Number(b.consultantTdsPercent))
      ? 10 : Number(b.consultantTdsPercent),
    // Pipeline
    source: str(b.source),
    stage: str(b.stage),
    appliedForId: b.appliedForId || null,
    expectedCtc: numOrNull(b.expectedCtc),
    // Intern
    rollNumber: str(b.rollNumber),
    course: str(b.course),
    collegeName: str(b.collegeName),
    collegeAddress: str(b.collegeAddress),
    internshipRole: str(b.internshipRole),
    startDate: dateOrNull(b.startDate),
    endDate: dateOrNull(b.endDate),
  };
}

// Probation, confirmation, notice period and the manager, checked as
// typed. `record` is the person as they would be after the change.
const JOB_FIELDS = ['probationMonths', 'confirmationDate', 'noticePeriodDays', 'firstHireDate', 'referredBy', 'employmentType', 'joinDate'];
async function checkJobDetails(orgId: string, b: any, record: any, personId = '') {
  if (JOB_FIELDS.some(f => b[f] !== undefined)) {
    const details = jobDetailsInput(record);
    if (typeof details === 'string') throw new AppError(400, details);
  }
  if (b.managerId !== undefined && b.managerId) {
    const manager = await assertManager(orgId, personId, String(b.managerId));
    if (!manager) throw new AppError(400, 'Pick the manager from the employees of the company');
  }
}

// How the person is paid and taxed, checked as typed.
function checkPayTreatment(b: any) {
  if (b.taxTreatment !== undefined || b.consultantSection !== undefined || b.consultantTdsPercent !== undefined) {
    const treatment = taxTreatmentInput(b);
    if (typeof treatment === 'string') throw new AppError(400, treatment);
  }
  if (b.npsEmployerPercent !== undefined) {
    const percent = npsPercentInput(b.npsEmployerPercent);
    if (typeof percent === 'string') throw new AppError(400, percent);
  }
  if (b.npsPran !== undefined && str(b.npsPran) && !/^\d{12}$/.test(str(b.npsPran).replace(/\s+/g, ''))) {
    throw new AppError(400, 'A PRAN has 12 digits');
  }
}

async function checkDuplicateEmployeeCode(orgId: string, code: string, excludeId?: string) {
  if (!code) return;
  const dup = await prisma.person.findFirst({
    where: {
      organizationId: orgId,
      employeeNo: { equals: code, mode: 'insensitive' },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (dup) throw new AppError(400, `Employee code "${code}" is already in use`);
}

async function validatePipelineFields(orgId: string, b: any) {
  if (b.stage && !STAGE_VALUES.includes(b.stage)) throw new AppError(400, 'Invalid stage');
  if (b.source && !SOURCE_VALUES.includes(b.source)) throw new AppError(400, 'Invalid source');
  if (b.appliedForId) {
    const opening = await prisma.jobOpening.findFirst({
      where: { id: b.appliedForId, organizationId: orgId },
    });
    if (!opening) throw new AppError(400, 'Job opening not found');
  }
}

async function validateWorkLocation(orgId: string, b: any) {
  if (!b.workLocationId) return;
  const location = await prisma.workLocation.findFirst({
    where: { id: b.workLocationId, organizationId: orgId },
  });
  if (!location) throw new AppError(400, 'Work location not found');
}

export const peopleController = {
  async getMeta(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const openings = await prisma.jobOpening.findMany({
      where: { organizationId: orgId, status: 'OPEN' },
      select: { id: true, title: true, department: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      kinds: PERSON_KINDS,
      sources: PERSON_SOURCES,
      stages: PERSON_STAGES,
      interviewResults: INTERVIEW_RESULTS,
      openingStatuses: OPENING_STATUSES,
      openOpenings: openings,
      // The letters that can be issued: the company's templates that are switched on
      docTypes: await letterTypesFor(orgId),
      employmentStatuses: EMPLOYMENT_STATUSES,
      taxTreatments: TAX_TREATMENTS, consultantSections: CONSULTANT_SECTIONS,
      // The editable lists a person's form picks from, active values only
      lists: Object.fromEntries(Object.entries(
        await listValuesFor(orgId, ['DEPARTMENT', 'DESIGNATION', 'GRADE', 'BANK', 'BLOOD_GROUP', 'MARITAL_STATUS', 'LEAVING_REASON', 'EMPLOYMENT_TYPE']),
      ).map(([type, values]) => [type, values.filter(v => v.isActive).map(v => v.label)])),
      workLocations: await prisma.workLocation.findMany({
        where: { organizationId: orgId, isActive: true },
        select: { id: true, name: true, state: true },
        orderBy: { name: 'asc' },
      }),
      nextEmployeeCode: await nextEmployeeCode(orgId),
      // Who an employee can report to
      managers: await prisma.person.findMany({
        where: { organizationId: orgId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } },
        select: { id: true, name: true, employeeNo: true, designation: true },
        orderBy: { name: 'asc' },
      }),
      companyNoticeDays: (await prisma.payrollSettings.findUnique({ where: { organizationId: orgId }, select: { noticePeriodDays: true } }))?.noticePeriodDays ?? 30,
      // Offered when someone is put on probation with no period typed
      usualProbationMonths: 6,
      positionReasons: POSITION_REASONS,
    });
  },

  // ---- People list / CRUD ------------------------------------------------
  async getPeople(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const q = String(req.query.q || '').trim();
    const people = await prisma.person.findMany({
      where: {
        organizationId: orgId,
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
      },
      omit: { photoData: true },
      include: {
        appliedFor: { select: { title: true } },
        interviews: { select: { id: true } },
      },
      orderBy: { name: 'asc' },
    });
    let rows: any[] = people.map(p => ({
      ...p,
      interviews: undefined,
      interviewCount: p.interviews.length,
      appliedForTitle: p.appliedFor?.title || '',
      appliedFor: undefined,
    }));
    const employees = rows.filter(p => p.kind === 'CANDIDATE' && p.isEmployee);
    const activeEmployees = employees.filter(p =>
      !['RESIGNED', 'TERMINATED'].includes(p.employmentStatus));
    const stats = {
      active: activeEmployees.length,
      monthlyCost: activeEmployees.reduce((s, p) => s + (p.currentMonthlyPackage || 0), 0),
      esiCount: activeEmployees.filter(p => p.isEsiEligible).length,
      pfCount: activeEmployees.filter(p => p.isPfApplicable).length,
    };
    // Employees get a plain directory: no salary, bank, statutory or ID data
    const listActor = await loadActor(req);
    const strip = stripForEmployee(listActor);
    if (strip) rows = rows.map(stripPersonFields);
    else if (!canSeeFullAadhaar(listActor.role)) rows = rows.map(r => ({ ...r, aadharNo: maskAadhaar(r.aadharNo) }));
    res.json({
      employees: rows.filter(p => p.kind === 'CANDIDATE' && p.isEmployee),
      candidates: rows.filter(p => p.kind === 'CANDIDATE' && !p.isEmployee),
      interns: rows.filter(p => p.kind === 'INTERN'),
      employeeStats: strip ? { ...stats, monthlyCost: null } : stats,
    });
  },

  // Excel-compatible CSV export of the employee register
  // XLSX in the "employees-all" format — round-trips with
  // scripts/import-employees-xlsx.ts, so an export can be re-imported.
  async exportEmployeesXlsx(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const employees = await prisma.person.findMany({
      where: { organizationId: orgId, kind: 'CANDIDATE', isEmployee: true },
      omit: { photoData: true },
      orderBy: { name: 'asc' },
    });
    const inactive = new Set(['RESIGNED', 'TERMINATED']);
    const cols: [string, (p: any) => any][] = [
      ['Employee Code', p => p.employeeNo], ['Name', p => p.name],
      ['Designation', p => p.designation], ['Department', p => p.department],
      ['Date of Joining', p => p.joinDate], ['Relieving Date', p => p.leavingDate],
      ['Active', p => (inactive.has(p.employmentStatus) ? 'No' : 'Yes')],
      ['Employment Status', p => p.employmentStatus],
      ['Monthly Package (₹)', p => p.currentMonthlyPackage],
      ['ESI Eligible', p => (p.isEsiEligible ? 'Yes' : 'No')],
      ['PF Applicable', p => (p.isPfApplicable ? 'Yes' : 'No')],
      ['PAN Number', p => p.panNumber], ['PF Number', p => p.pfNumber],
      ['PF UAN', p => p.pfUan], ['ESI Number', p => p.esiNumber],
      ['Date of Birth', p => p.dateOfBirth], ['Blood Group', p => p.bloodGroup],
      ['Marital Status', p => p.maritalStatus], ['Aadhaar Number', p => p.aadharNo],
      ['Address', p => p.address], ['Personal Email', p => p.email],
      ['Official Email', p => p.officialEmail], ['Contact Number', p => p.phone],
      ['Official Number', p => p.officialNo], ['Emergency Number', p => p.emergencyNo],
      ['Agreement Signed', p => (p.agreementSigned ? 'Yes' : 'No')],
      ['Agreement Sign Date', p => p.agreementSignDate],
      ['Biometric ID', p => p.biometricId],
      ['Reason for Leaving', p => p.reasonForLeaving],
      ['Bank Name', p => p.bankName], ['Account Number', p => p.bankAccountNumber],
      ['IFSC Code', p => p.ifscCode],
    ];
    const Excel = await import('exceljs');
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('Employees');
    ws.addRow(cols.map(c => c[0]));
    ws.getRow(1).font = { bold: true };
    for (const p of employees) ws.addRow(cols.map(([, fn]) => fn(p) ?? ''));
    ws.columns.forEach((c: any, i: number) => { c.width = Math.max(14, cols[i][0].length + 2); });
    const today = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="employees-all-${today}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  },

  async exportEmployeesCsv(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const employees = await prisma.person.findMany({
      where: { organizationId: orgId, kind: 'CANDIDATE', isEmployee: true },
      omit: { photoData: true },
      include: { manager: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    const esc = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cols: [string, (p: any) => any][] = [
      ['Employee Code', p => p.employeeNo], ['Name', p => p.name],
      ['Designation', p => p.designation], ['Department', p => p.department], ['Grade', p => p.grade],
      ['DOJ', p => p.joinDate], ['Relieving Date', p => p.leavingDate],
      ['Status', p => p.employmentStatus], ['Monthly Package', p => p.currentMonthlyPackage],
      ['DOB', p => p.dateOfBirth], ['Blood Group', p => p.bloodGroup],
      ['Marital Status', p => p.maritalStatus], ['Parent/Spouse', p => p.parentSpouseName],
      ['Aadhaar', p => p.aadharNo], ['Personal Email', p => p.email],
      ['Official Email', p => p.officialEmail], ['Contact No', p => p.phone],
      ['Official No', p => p.officialNo], ['Emergency No', p => p.emergencyNo],
      ['Address', p => p.address], ['Biometric ID', p => p.biometricId],
      ['Agreement Signed', p => (p.agreementSigned ? 'Yes' : 'No')],
      ['Agreement Date', p => p.agreementSignDate],
      ['Employment Type', p => p.employmentType], ['Probation (months)', p => p.probationMonths || ''],
      ['Confirmation Date', p => p.confirmationDate], ['Notice Period (days)', p => p.noticePeriodDays ?? ''],
      ['Reporting Manager', p => p.manager?.name || ''],
      ['Bank Name', p => p.bankName], ['Account Number', p => p.bankAccountNumber],
      ['IFSC', p => p.ifscCode], ['PAN', p => p.panNumber],
      ['PF Number', p => p.pfNumber], ['PF UAN', p => p.pfUan],
      ['ESI Number', p => p.esiNumber],
      ['ESI Eligible', p => (p.isEsiEligible ? 'Yes' : 'No')],
      ['PF Applicable', p => (p.isPfApplicable ? 'Yes' : 'No')],
      ['Notes', p => p.notes],
    ];
    const lines = [cols.map(c => c[0]).join(',')];
    for (const p of employees) {
      lines.push(cols.map(([, fn]) => esc(fn(p) ?? '')).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
    res.send('﻿' + lines.join('\n'));
  },

  async createPerson(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const name = str(b.name).trim();
    if (!name) throw new AppError(400, 'Name is required');
    if (!KIND_VALUES.includes(b.kind)) throw new AppError(400, 'Pick candidate or intern');
    await checkDuplicateName(orgId, b.kind, name);
    await checkDuplicateEmployeeCode(orgId, str(b.employeeNo).trim());
    checkPayTreatment(b);
    const personal = personalInput(b);
    if (typeof personal === 'string') throw new AppError(400, personal);
    await checkJobDetails(orgId, b, b);
    await validatePipelineFields(orgId, b);
    await validateWorkLocation(orgId, b);
    checkIfsc(b);
    // Added without a pipeline stage = direct employee; with an active
    // stage = candidate in hiring (auto-promotes on Selected/Joined).
    const stage = str(b.stage);
    const person = await prisma.person.create({
      data: {
        ...personData(b),
        ...profileData(b),
        organizationId: orgId,
        kind: b.kind,
        name,
        stageUpdatedAt: stage ? new Date() : null,
        isEmployee: b.kind === 'CANDIDATE' ? employeeFromStage(stage, true) : false,
      },
    });
    await ensureListValues(orgId, personListValues(person));
    await noteEmployeeCodeUsed(orgId, person.employeeNo);
    await ensureStartingPosition(person);
    res.status(201).json(person);
  },

  async getPersonDetail(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await prisma.person.findFirst({
      where: { id: req.params.personId, organizationId: orgId },
      include: {
        appliedFor: { select: { id: true, title: true, department: true } },
        interviews: { orderBy: { createdAt: 'asc' } },
        documents: {
          select: { id: true, docType: true, title: true, createdAt: true, visibleToEmployee: true },
          orderBy: { createdAt: 'desc' },
        },
        manager: { select: { id: true, name: true, employeeNo: true, designation: true } },
        workLocation: { select: { id: true, name: true, state: true } },
        reports: {
          where: { isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } },
          select: { id: true, name: true, employeeNo: true, designation: true },
          orderBy: { name: 'asc' },
        },
      },
    });
    if (!person) throw new AppError(404, 'Person not found');
    const actor = await loadActor(req);
    if (stripForEmployee(actor) && actor.personId !== person.id) {
      // Someone else's record: contact-card view only
      res.json({ ...stripPersonFields(person), documents: [], interviews: [] });
      return;
    }
    const settings = await prisma.payrollSettings.findUnique({ where: { organizationId: orgId }, select: { noticePeriodDays: true } });
    const staff = ['SUPER_ADMIN', 'HR'].includes(actor.role);
    // The approval chain up the reporting line (manager → … → top). A
    // top-level person has an empty chain; their requests fall to HR.
    let approvalChain: any[] = [];
    if (person.isEmployee) {
      const employees = await prisma.person.findMany({
        where: { organizationId: orgId, kind: 'CANDIDATE', isEmployee: true },
        select: { id: true, managerId: true, name: true, designation: true, employeeNo: true },
      });
      approvalChain = approvalChainOf(person.id, employees);
    }
    res.json({
      ...person,
      aadharNo: canSeeFullAadhaar(actor.role) ? person.aadharNo : maskAadhaar(person.aadharNo),
      // Letters not shared with the employee are HR's alone
      documents: staff ? person.documents : person.documents.filter(d => d.visibleToEmployee),
      // Where the employee stands on confirmation, and the notice the company asks for by default
      confirmation: person.isEmployee ? confirmationState(person, todayIST()) : null,
      companyNoticeDays: settings?.noticePeriodDays ?? 30,
      approvalChain,
    });
  },

  async updatePerson(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchOrgPerson(req.params.personId, orgId);
    const b = req.body;
    const data: any = {};

    if (b.name !== undefined) {
      const name = str(b.name).trim();
      if (!name) throw new AppError(400, 'Name is required');
      await checkDuplicateName(orgId, person.kind, name, person.id);
      data.name = name;
    }
    if (b.kind !== undefined && b.kind !== person.kind) {
      if (!KIND_VALUES.includes(b.kind)) throw new AppError(400, 'Invalid kind');
      await checkDuplicateName(orgId, b.kind, data.name || person.name, person.id);
      data.kind = b.kind;
    }
    if (b.employeeNo !== undefined && str(b.employeeNo).trim() !== person.employeeNo) {
      await checkDuplicateEmployeeCode(orgId, str(b.employeeNo).trim(), person.id);
    }
    checkPayTreatment(b);
    const personal = personalInput(b);
    if (typeof personal === 'string') throw new AppError(400, personal);
    await checkJobDetails(orgId, b, { ...person, ...b }, person.id);
    await validatePipelineFields(orgId, b);
    await validateWorkLocation(orgId, b);
    checkIfsc(b, person);

    const fields = personData({ ...person, ...b });
    Object.assign(data, fields, profileData({ ...person, ...b }));
    if (b.stage !== undefined && b.stage !== person.stage) {
      data.stageUpdatedAt = new Date();
      data.isEmployee = employeeFromStage(str(b.stage), person.isEmployee);
    }
    const updated = await prisma.person.update({ where: { id: person.id }, data });
    await ensureListValues(orgId, personListValues(updated));
    if (updated.employeeNo !== person.employeeNo) await noteEmployeeCodeUsed(orgId, updated.employeeNo);
    // Designation, department, location or grade edited here corrects the
    // position record in force; a dated change goes through Change Position
    await followProfileEdit(person, updated);
    // Draft payslips follow a change in how the person is paid or in the employer's NPS share
    if (updated.npsEmployerPercent !== person.npsEmployerPercent || updated.taxTreatment !== person.taxTreatment
      || updated.consultantSection !== person.consultantSection || updated.consultantTdsPercent !== person.consultantTdsPercent) {
      await syncDraftEntries(req, person.id, '0000-00', true);
    }
    // A package edited on the profile is a salary revision from this month;
    // the first package ever set is not.
    if (person.currentMonthlyPackage > 0 && updated.currentMonthlyPackage !== person.currentMonthlyPackage) {
      await prisma.salaryRevision.create({
        data: {
          organizationId: orgId, personId: person.id,
          effectiveFrom: `${currentPeriodIST()}-01`,
          oldMonthlyPackage: person.currentMonthlyPackage,
          newMonthlyPackage: updated.currentMonthlyPackage,
          reason: 'Edited on employee profile',
          createdByName: await actorName(req.user?.userId),
        },
      });
      await syncDraftEntries(req, person.id, currentPeriodIST());
    }
    res.json(updated);
  },

  async updatePersonStage(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchOrgPerson(req.params.personId, orgId);
    const stage = str(req.body.stage).trim();
    if (!STAGE_VALUES.includes(stage)) throw new AppError(400, 'Invalid stage');
    const becameEmployee = !person.isEmployee && EMPLOYEE_STAGES.includes(stage);
    const updated = await prisma.person.update({
      where: { id: person.id },
      data: {
        stage,
        stageUpdatedAt: new Date(),
        isEmployee: employeeFromStage(stage, person.isEmployee),
        // First promotion stamps the join date if it was never set
        ...(becameEmployee && !person.joinDate
          ? { joinDate: new Date().toISOString().split('T')[0] }
          : {}),
      },
    });
    await ensureStartingPosition(updated);
    res.json({
      ok: true,
      stage: updated.stage,
      isEmployee: updated.isEmployee,
      becameEmployee,
      message: becameEmployee ? `${person.name} is now an employee 🎉` : undefined,
    });
  },

  async deletePerson(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchOrgPerson(req.params.personId, orgId);
    const stored = await prisma.employeeDocument.findMany({
      where: { personId: person.id, storage: 'S3' }, select: { storage: true, storageKey: true },
    });
    try {
      await prisma.person.delete({ where: { id: person.id } });
    } catch (err: any) {
      if (err?.code === 'P2003') {
        throw new AppError(400,
          `${person.name} has payroll or expense history and cannot be deleted. Mark them Resigned/Terminated instead.`);
      }
      throw err;
    }
    await removeStored(orgId, stored);
    res.json({ message: `Deleted ${person.name}` });
  },

  // ---- Recruitment pipeline ----------------------------------------------
  async getPipeline(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const stage = String(req.query.stage || '').trim();
    const source = String(req.query.source || '').trim();
    const job = String(req.query.job || '').trim();
    const q = String(req.query.q || '').trim();

    const allInPipeline = await prisma.person.findMany({
      where: { organizationId: orgId, kind: 'CANDIDATE', stage: { not: '' } },
      include: { appliedFor: { select: { id: true, title: true } } },
      orderBy: { name: 'asc' },
    });

    const stageCards = PERSON_STAGES.map(s => ({
      value: s.value,
      label: s.label,
      count: allInPipeline.filter(p => p.stage === s.value).length,
    }));

    let candidates = allInPipeline;
    if (stage) candidates = candidates.filter(p => p.stage === stage);
    if (source) candidates = candidates.filter(p => p.source === source);
    if (job) candidates = candidates.filter(p => p.appliedForId === job);
    if (q) candidates = candidates.filter(p => p.name.toLowerCase().includes(q.toLowerCase()));

    const jobs = await prisma.jobOpening.findMany({
      where: { organizationId: orgId, status: 'OPEN' },
      select: { id: true, title: true },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      candidates: candidates.map(p => ({
        ...p,
        appliedForTitle: p.appliedFor?.title || '',
        appliedFor: undefined,
      })),
      stageCards,
      totalPipeline: allInPipeline.length,
      jobs,
    });
  },

  // ---- Job openings ------------------------------------------------------
  async getOpenings(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const show = String(req.query.show || 'open');
    const openings = await prisma.jobOpening.findMany({
      where: {
        organizationId: orgId,
        ...(show === 'open' ? { status: 'OPEN' }
          : show === 'closed' ? { status: 'CLOSED' }
          : {}),
      },
      include: { applicants: { select: { stage: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      openings: openings.map(o => ({
        ...o,
        applicants: undefined,
        applicantCount: o.applicants.length,
        selectedCount: o.applicants.filter(a => SELECTED_STAGES.includes(a.stage)).length,
      })),
      show,
    });
  },

  async createOpening(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const title = str(b.title).trim();
    if (!title) throw new AppError(400, 'Title is required');
    const opening = await prisma.jobOpening.create({
      data: {
        organizationId: orgId,
        title,
        department: str(b.department),
        positions: Math.max(1, parseInt(b.positions) || 1),
        location: str(b.location),
        description: str(b.description),
        status: OPENING_STATUSES.some(s => s.value === b.status) ? b.status : 'OPEN',
      },
    });
    await ensureListValues(orgId, { DEPARTMENT: opening.department });
    res.status(201).json(opening);
  },

  async updateOpening(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const opening = await prisma.jobOpening.findFirst({
      where: { id: req.params.openingId, organizationId: orgId },
    });
    if (!opening) throw new AppError(404, 'Job opening not found');
    const b = req.body;
    const data: any = {};
    if (b.title !== undefined) {
      const title = str(b.title).trim();
      if (!title) throw new AppError(400, 'Title is required');
      data.title = title;
    }
    if (b.department !== undefined) data.department = str(b.department);
    if (b.positions !== undefined) data.positions = Math.max(1, parseInt(b.positions) || 1);
    if (b.location !== undefined) data.location = str(b.location);
    if (b.description !== undefined) data.description = str(b.description);
    if (b.status !== undefined) {
      if (!OPENING_STATUSES.some(s => s.value === b.status)) throw new AppError(400, 'Invalid status');
      data.status = b.status;
    }
    const updated = await prisma.jobOpening.update({ where: { id: opening.id }, data });
    res.json(updated);
  },

  // ---- Documents (generated letters) -------------------------------------
  async deleteDocument(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const doc = await prisma.personDocument.findFirst({
      where: { id: req.params.docId, organizationId: orgId },
    });
    if (!doc) throw new AppError(404, 'Document not found');
    await prisma.personDocument.delete({ where: { id: doc.id } });
    res.json({ message: 'Letter removed from the record' });
  },

  // ---- Interview rounds --------------------------------------------------
  async addInterview(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchOrgPerson(req.params.personId, orgId);
    const b = req.body;
    const roundName = str(b.roundName).trim();
    if (!roundName) throw new AppError(400, 'Round name is required');
    if (b.result && !INTERVIEW_RESULTS.some(r => r.value === b.result)) {
      throw new AppError(400, 'Invalid result');
    }
    const interview = await prisma.interviewRound.create({
      data: {
        organizationId: orgId,
        personId: person.id,
        roundName,
        scheduledAt: b.scheduledAt || null,
        interviewer: str(b.interviewer),
        feedback: str(b.feedback),
        rating: validateRating(b.rating),
        result: b.result || 'PENDING',
      },
    });
    res.status(201).json(interview);
  },

  async updateInterview(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const interview = await prisma.interviewRound.findFirst({
      where: { id: req.params.interviewId, organizationId: orgId },
    });
    if (!interview) throw new AppError(404, 'Interview round not found');
    const b = req.body;
    const data: any = {};
    if (b.roundName !== undefined) {
      const roundName = str(b.roundName).trim();
      if (!roundName) throw new AppError(400, 'Round name is required');
      data.roundName = roundName;
    }
    if (b.scheduledAt !== undefined) data.scheduledAt = b.scheduledAt || null;
    if (b.interviewer !== undefined) data.interviewer = str(b.interviewer);
    if (b.feedback !== undefined) data.feedback = str(b.feedback);
    if (b.rating !== undefined) data.rating = validateRating(b.rating);
    if (b.result !== undefined) {
      if (!INTERVIEW_RESULTS.some(r => r.value === b.result)) throw new AppError(400, 'Invalid result');
      data.result = b.result;
    }
    const updated = await prisma.interviewRound.update({ where: { id: interview.id }, data });
    res.json(updated);
  },

  async deleteInterview(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const interview = await prisma.interviewRound.findFirst({
      where: { id: req.params.interviewId, organizationId: orgId },
    });
    if (!interview) throw new AppError(404, 'Interview round not found');
    await prisma.interviewRound.delete({ where: { id: interview.id } });
    res.json({ message: 'Interview round removed' });
  },
};
