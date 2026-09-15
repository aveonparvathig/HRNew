import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export const EMPLOYMENT_TYPES = [
  { value: 'FULL_TIME', label: 'Full-time' },
  { value: 'PART_TIME', label: 'Part-time' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'INTERNSHIP', label: 'Internship' },
];

export const POSTING_STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'OPEN', label: 'Open' },
  { value: 'ON_HOLD', label: 'On Hold' },
  { value: 'CLOSED', label: 'Closed' },
];

export const APPLICATION_STAGES = [
  { value: 'APPLIED', label: 'Applied' },
  { value: 'SCREENING', label: 'Screening' },
  { value: 'INTERVIEW', label: 'Interview' },
  { value: 'OFFERED', label: 'Offered' },
  { value: 'HIRED', label: 'Hired' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
];

const STAGE_VALUES = APPLICATION_STAGES.map(s => s.value);
const STATUS_VALUES = POSTING_STATUSES.map(s => s.value);
const TYPE_VALUES = EMPLOYMENT_TYPES.map(t => t.value);
// Columns always shown on the pipeline board, even when empty
const CORE_STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW'];

function validatePostingBody(b: any, partial = false) {
  if (!partial || b.title !== undefined) {
    if (!String(b.title || '').trim()) throw new AppError(400, 'Job title is required');
  }
  if (b.status !== undefined && !STATUS_VALUES.includes(b.status)) {
    throw new AppError(400, 'Invalid status');
  }
  if (b.employmentType !== undefined && !TYPE_VALUES.includes(b.employmentType)) {
    throw new AppError(400, 'Invalid employment type');
  }
  if (b.postedDate && b.closingDate && b.closingDate < b.postedDate) {
    throw new AppError(400, 'Closing date cannot be before the posted date');
  }
}

function validateRating(rating: any) {
  if (rating == null || rating === '') return null;
  const n = Number(rating);
  if (!Number.isInteger(n) || n < 1 || n > 5) {
    throw new AppError(400, 'Rating must be between 1 and 5');
  }
  return n;
}

async function fetchOrgPosting(id: string, organizationId: string) {
  const posting = await prisma.jobPosting.findFirst({ where: { id, organizationId } });
  if (!posting) throw new AppError(404, 'Job posting not found');
  return posting;
}

const postingData = (b: any) => ({
  title: String(b.title || '').trim(),
  department: String(b.department || ''),
  location: String(b.location || ''),
  description: String(b.description || ''),
  requirements: String(b.requirements || ''),
  employmentType: b.employmentType || 'FULL_TIME',
  experienceRange: String(b.experienceRange || ''),
  salaryRange: String(b.salaryRange || ''),
  status: b.status || 'DRAFT',
  postedDate: b.postedDate || null,
  closingDate: b.closingDate || null,
  positionsCount: Math.max(1, parseInt(b.positionsCount) || 1),
});

export const recruitmentController = {
  async getMeta(req: any, res: Response) {
    res.json({
      employmentTypes: EMPLOYMENT_TYPES,
      postingStatuses: POSTING_STATUSES,
      applicationStages: APPLICATION_STAGES,
    });
  },

  // ---- Postings ----------------------------------------------------------
  async getPostings(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const postings = await prisma.jobPosting.findMany({
      where: { organizationId: orgId },
      include: { applications: { select: { stage: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const rows = postings.map(p => ({
      ...p,
      applications: undefined,
      appCount: p.applications.length,
      hiredCount: p.applications.filter(a => a.stage === 'HIRED').length,
      activeCount: p.applications.filter(a =>
        ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFERED'].includes(a.stage)).length,
    }));

    const byStatus = (s: string) => rows.filter(r => r.status === s);
    const openPostings = byStatus('OPEN');

    res.json({
      openPostings,
      onHoldPostings: byStatus('ON_HOLD'),
      draftPostings: byStatus('DRAFT'),
      closedPostings: byStatus('CLOSED'),
      totalCount: rows.length,
      openPositions: openPostings.reduce((s, p) => s + p.positionsCount, 0),
      totalApplications: rows.reduce((s, p) => s + p.appCount, 0),
    });
  },

  async createPosting(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    validatePostingBody(req.body);
    const posting = await prisma.jobPosting.create({
      data: { ...postingData(req.body), organizationId: orgId },
    });
    res.status(201).json(posting);
  },

  async getPostingDetail(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const posting = await prisma.jobPosting.findFirst({
      where: { id: req.params.postingId, organizationId: orgId },
      include: {
        applications: {
          orderBy: [{ appliedDate: 'desc' }, { createdAt: 'desc' }],
        },
      },
    });
    if (!posting) throw new AppError(404, 'Job posting not found');

    // Pipeline: core stages always present; other stages only when non-empty
    const pipeline = APPLICATION_STAGES
      .map(s => ({
        value: s.value,
        label: s.label,
        apps: posting.applications.filter(a => a.stage === s.value),
      }))
      .filter(col => col.apps.length > 0 || CORE_STAGES.includes(col.value))
      .map(col => ({ ...col, count: col.apps.length }));

    const stageCounts: Record<string, number> = {};
    for (const a of posting.applications) {
      stageCounts[a.stage] = (stageCounts[a.stage] || 0) + 1;
    }

    res.json({
      ...posting,
      applications: undefined,
      pipeline,
      stageCounts,
      totalApps: posting.applications.length,
      hiredCount: stageCounts['HIRED'] || 0,
    });
  },

  async updatePosting(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const posting = await fetchOrgPosting(req.params.postingId, orgId);
    const b = req.body;
    validatePostingBody({ ...posting, ...b }, true);
    const data: any = {};
    if (b.title !== undefined) data.title = String(b.title).trim();
    if (b.department !== undefined) data.department = String(b.department);
    if (b.location !== undefined) data.location = String(b.location);
    if (b.description !== undefined) data.description = String(b.description);
    if (b.requirements !== undefined) data.requirements = String(b.requirements);
    if (b.employmentType !== undefined) data.employmentType = b.employmentType;
    if (b.experienceRange !== undefined) data.experienceRange = String(b.experienceRange);
    if (b.salaryRange !== undefined) data.salaryRange = String(b.salaryRange);
    if (b.status !== undefined) data.status = b.status;
    if (b.postedDate !== undefined) data.postedDate = b.postedDate || null;
    if (b.closingDate !== undefined) data.closingDate = b.closingDate || null;
    if (b.positionsCount !== undefined) data.positionsCount = Math.max(1, parseInt(b.positionsCount) || 1);
    const updated = await prisma.jobPosting.update({ where: { id: posting.id }, data });
    res.json(updated);
  },

  async deletePosting(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const posting = await fetchOrgPosting(req.params.postingId, orgId);
    await prisma.jobPosting.delete({ where: { id: posting.id } });
    res.json({ message: `Deleted posting "${posting.title}" and all its applications` });
  },

  // ---- Applications ------------------------------------------------------
  async createApplication(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const posting = await fetchOrgPosting(req.params.postingId, orgId);
    const b = req.body;
    const name = String(b.applicantName || '').trim();
    if (!name) throw new AppError(400, 'Applicant name is required');
    if (b.stage && !STAGE_VALUES.includes(b.stage)) throw new AppError(400, 'Invalid stage');
    const application = await prisma.jobApplication.create({
      data: {
        organizationId: orgId,
        jobPostingId: posting.id,
        applicantName: name,
        applicantEmail: String(b.applicantEmail || ''),
        applicantPhone: String(b.applicantPhone || ''),
        resumeNotes: String(b.resumeNotes || ''),
        coverLetter: String(b.coverLetter || ''),
        stage: b.stage || 'APPLIED',
        appliedDate: b.appliedDate || new Date().toISOString().split('T')[0],
        rating: validateRating(b.rating),
        notes: String(b.notes || ''),
      },
    });
    res.status(201).json(application);
  },

  async getApplicationDetail(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const application = await prisma.jobApplication.findFirst({
      where: { id: req.params.applicationId, organizationId: orgId },
      include: { posting: { select: { id: true, title: true, department: true } } },
    });
    if (!application) throw new AppError(404, 'Application not found');
    res.json(application);
  },

  async updateApplication(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const application = await prisma.jobApplication.findFirst({
      where: { id: req.params.applicationId, organizationId: orgId },
    });
    if (!application) throw new AppError(404, 'Application not found');
    const b = req.body;
    const data: any = {};
    if (b.applicantName !== undefined) {
      const name = String(b.applicantName).trim();
      if (!name) throw new AppError(400, 'Applicant name is required');
      data.applicantName = name;
    }
    if (b.applicantEmail !== undefined) data.applicantEmail = String(b.applicantEmail);
    if (b.applicantPhone !== undefined) data.applicantPhone = String(b.applicantPhone);
    if (b.resumeNotes !== undefined) data.resumeNotes = String(b.resumeNotes);
    if (b.coverLetter !== undefined) data.coverLetter = String(b.coverLetter);
    if (b.appliedDate !== undefined) data.appliedDate = b.appliedDate;
    if (b.rating !== undefined) data.rating = validateRating(b.rating);
    if (b.notes !== undefined) data.notes = String(b.notes);
    if (b.stage !== undefined) {
      if (!STAGE_VALUES.includes(b.stage)) throw new AppError(400, 'Invalid stage');
      if (b.stage !== application.stage) data.stageUpdatedAt = new Date();
      data.stage = b.stage;
    }
    const updated = await prisma.jobApplication.update({
      where: { id: application.id },
      data,
    });
    res.json(updated);
  },

  // A hired applicant becomes a People record (an employee, stage JOINED).
  async addApplicationToPeople(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const application = await prisma.jobApplication.findFirst({
      where: { id: req.params.applicationId, organizationId: orgId },
      include: { posting: { select: { title: true } } },
    });
    if (!application) throw new AppError(404, 'Application not found');
    if (application.stage !== 'HIRED') {
      throw new AppError(400, 'Only hired applicants can be added to People');
    }
    if (application.personId) {
      const linked = await prisma.person.findUnique({ where: { id: application.personId } });
      if (linked) return res.json({ personId: linked.id, alreadyLinked: true });
    }

    // Reuse an existing person with the same name, else create one.
    let person = await prisma.person.findFirst({
      where: {
        organizationId: orgId, kind: 'CANDIDATE',
        name: { equals: application.applicantName, mode: 'insensitive' },
      },
    });
    let created = false;
    if (!person) {
      person = await prisma.person.create({
        data: {
          organizationId: orgId,
          kind: 'CANDIDATE',
          name: application.applicantName,
          email: application.applicantEmail,
          phone: application.applicantPhone,
          designation: application.posting.title,
          stage: 'JOINED',
          stageUpdatedAt: new Date(),
          isEmployee: true,
          joinDate: new Date().toISOString().split('T')[0],
          notes: [application.resumeNotes, application.notes].filter(Boolean).join('\n'),
        },
      });
      created = true;
    }
    await prisma.jobApplication.update({
      where: { id: application.id },
      data: { personId: person.id },
    });
    res.status(created ? 201 : 200).json({
      personId: person.id,
      created,
      message: created
        ? `${person.name} added to People as an employee 🎉`
        : `Linked to the existing People record for ${person.name}`,
    });
  },

  async deleteApplication(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const application = await prisma.jobApplication.findFirst({
      where: { id: req.params.applicationId, organizationId: orgId },
    });
    if (!application) throw new AppError(404, 'Application not found');
    await prisma.jobApplication.delete({ where: { id: application.id } });
    res.json({ message: `Deleted application from ${application.applicantName}` });
  },
};
