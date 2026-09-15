import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { DOC_TYPES, renderLetter } from '../services/letterTemplates';
import { orgBrand } from '../services/orgBrand';

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

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const MARITAL_STATUSES = ['Single', 'Married', 'Other'];

async function nextEmployeeCode(organizationId: string): Promise<string> {
  const count = await prisma.person.count({
    where: { organizationId, kind: 'CANDIDATE', isEmployee: true },
  });
  let n = count + 1;
  // Skip codes already in use
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const code = `EMP-${String(n).padStart(4, '0')}`;
    const exists = await prisma.person.findFirst({
      where: { organizationId, employeeNo: code },
    });
    if (!exists) return code;
    n++;
  }
}

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
    // Bank & statutory
    bankName: str(b.bankName),
    bankAccountNumber: str(b.bankAccountNumber),
    ifscCode: str(b.ifscCode),
    panNumber: str(b.panNumber),
    pfNumber: str(b.pfNumber),
    pfUan: str(b.pfUan),
    esiNumber: str(b.esiNumber),
    isEsiEligible: Boolean(b.isEsiEligible),
    isPfApplicable: Boolean(b.isPfApplicable),
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
      docTypes: Object.entries(DOC_TYPES).map(([value, t]) => ({
        value, label: t.label, kinds: t.kinds,
      })),
      employmentStatuses: EMPLOYMENT_STATUSES,
      bloodGroups: BLOOD_GROUPS,
      maritalStatuses: MARITAL_STATUSES,
      nextEmployeeCode: await nextEmployeeCode(orgId),
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
    const rows = people.map(p => ({
      ...p,
      interviews: undefined,
      interviewCount: p.interviews.length,
      appliedForTitle: p.appliedFor?.title || '',
      appliedFor: undefined,
    }));
    const employees = rows.filter(p => p.kind === 'CANDIDATE' && p.isEmployee);
    const activeEmployees = employees.filter(p =>
      !['RESIGNED', 'TERMINATED'].includes(p.employmentStatus));
    res.json({
      employees,
      candidates: rows.filter(p => p.kind === 'CANDIDATE' && !p.isEmployee),
      interns: rows.filter(p => p.kind === 'INTERN'),
      employeeStats: {
        active: activeEmployees.length,
        monthlyCost: activeEmployees.reduce((s, p) => s + (p.currentMonthlyPackage || 0), 0),
        esiCount: activeEmployees.filter(p => p.isEsiEligible).length,
        pfCount: activeEmployees.filter(p => p.isPfApplicable).length,
      },
    });
  },

  // Excel-compatible CSV export of the employee register
  async exportEmployeesCsv(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const employees = await prisma.person.findMany({
      where: { organizationId: orgId, kind: 'CANDIDATE', isEmployee: true },
      omit: { photoData: true },
      orderBy: { name: 'asc' },
    });
    const esc = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const cols: [string, (p: any) => any][] = [
      ['Employee Code', p => p.employeeNo], ['Name', p => p.name],
      ['Designation', p => p.designation], ['Department', p => p.department],
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
    await validatePipelineFields(orgId, b);
    // Added without a pipeline stage = direct employee; with an active
    // stage = candidate in hiring (auto-promotes on Selected/Joined).
    const stage = str(b.stage);
    const person = await prisma.person.create({
      data: {
        ...personData(b),
        organizationId: orgId,
        kind: b.kind,
        name,
        stageUpdatedAt: stage ? new Date() : null,
        isEmployee: b.kind === 'CANDIDATE' ? employeeFromStage(stage, true) : false,
      },
    });
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
          select: { id: true, docType: true, title: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!person) throw new AppError(404, 'Person not found');
    res.json(person);
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
    await validatePipelineFields(orgId, b);

    const fields = personData({ ...person, ...b });
    Object.assign(data, fields);
    if (b.stage !== undefined && b.stage !== person.stage) {
      data.stageUpdatedAt = new Date();
      data.isEmployee = employeeFromStage(str(b.stage), person.isEmployee);
    }
    const updated = await prisma.person.update({ where: { id: person.id }, data });
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
    try {
      await prisma.person.delete({ where: { id: person.id } });
    } catch (err: any) {
      if (err?.code === 'P2003') {
        throw new AppError(400,
          `${person.name} has payroll or expense history and cannot be deleted. Mark them Resigned/Terminated instead.`);
      }
      throw err;
    }
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
  async getDocumentPrefill(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchOrgPerson(req.params.personId, orgId);
    const docType = String(req.query.docType || '');
    if (!DOC_TYPES[docType]) throw new AppError(400, 'Invalid document type');

    // Last letter of the same type wins (its formData is the richest source)
    const last = await prisma.personDocument.findFirst({
      where: { personId: person.id, docType },
      orderBy: { createdAt: 'desc' },
    });

    const brand = await orgBrand(orgId);
    const personDefaults: any = {
      recipientName: person.name,
      recipientAddress: person.address,
      signatoryName: brand.signatoryName,
      signatoryTitle: brand.signatoryDesignation,
      designation: person.designation,
      joiningDate: person.joinDate,
      joinDate: person.joinDate,
      leavingDate: person.leavingDate,
      internshipRole: person.internshipRole,
      startDate: person.startDate,
      endDate: person.endDate,
      collegeName: person.collegeName,
      course: person.course,
      letterDate: new Date().toISOString().split('T')[0],
    };
    res.json({
      prefill: {
        ...personDefaults,
        ...(last ? { ...(last.formData as any), letterDate: personDefaults.letterDate, recipientName: person.name } : {}),
      },
    });
  },

  async createDocument(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchOrgPerson(req.params.personId, orgId);
    const { docType, formData = {} } = req.body;
    const type = DOC_TYPES[docType];
    if (!type) throw new AppError(400, 'Invalid document type');
    if (!type.kinds.includes(person.kind)) {
      throw new AppError(400, `${type.label} cannot be issued to this person`);
    }
    const brand = await orgBrand(orgId);
    const data = { ...formData, recipientName: formData.recipientName || person.name };
    const html = renderLetter(docType, brand, data);
    const doc = await prisma.personDocument.create({
      data: {
        organizationId: orgId,
        personId: person.id,
        docType,
        title: `${type.label} — ${person.name}`,
        formData: data,
        html,
      },
    });
    res.status(201).json({ id: doc.id, docType: doc.docType, title: doc.title, createdAt: doc.createdAt });
  },

  async getDocument(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const doc = await prisma.personDocument.findFirst({
      where: { id: req.params.docId, organizationId: orgId },
      include: { person: { select: { id: true, name: true } } },
    });
    if (!doc) throw new AppError(404, 'Document not found');
    res.json(doc);
  },

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
