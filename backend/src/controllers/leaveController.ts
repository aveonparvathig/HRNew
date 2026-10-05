import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { loadActor } from '../middleware/roles';
import { afterDecision, canApprove } from '../services/expenseApproval';
import { actorName } from '../services/payroll/audit';
import { workingDaysBetween, leaveYearOf, balanceOf, validateRequest, type LeaveTypePolicy } from '../services/leaveCalc';
import {
  ensureDefaultLeaveTypes, settingsFor, holidaySetFor, grantLeave,
  nextRequestNumber, startApprovalChain, onApproved, onCancelled, runAccrual as runAccrualJob,
  runYearEnd as runYearEndJob, recalculateBalances, encashLeave,
} from '../services/leave/leaveService';

const ACCRUAL_FREQ = ['NONE', 'MONTHLY', 'ANNUAL'];

const str = (v: any) => String(v ?? '');
const num = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const round2 = (n: number) => Math.round(n * 100) / 100;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const LEAVE_STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'CANCELLED', label: 'Cancelled' },
];

const TRANSITIONS: Record<string, Record<string, string>> = {
  DRAFT: { submit: 'SUBMITTED', cancel: 'CANCELLED' },
  SUBMITTED: { approve: 'APPROVED', reject: 'REJECTED', cancel: 'CANCELLED' },
  APPROVED: { cancel: 'CANCELLED' },
  REJECTED: { submit: 'SUBMITTED' },
  CANCELLED: {},
};
const APPROVER_ACTIONS = new Set(['approve', 'reject']);
const EDITABLE_STATUSES = new Set(['DRAFT', 'REJECTED']);

const selfScoped = (actor: any) => !['SUPER_ADMIN', 'HR'].includes(actor?.role);

async function fetchOrgRequest(id: string, organizationId: string) {
  const request = await prisma.leaveRequest.findFirst({
    where: { id, organizationId },
    include: {
      person: { select: { id: true, name: true, employeeNo: true, designation: true, department: true, gender: true, employmentStatus: true, workLocationId: true } },
      leaveType: true,
    },
  });
  if (!request) throw new AppError(404, 'Leave request not found');
  return request as any;
}

async function assertRequestAccess(req: any, personId: string) {
  const actor = await loadActor(req);
  if (selfScoped(actor) && actor.personId !== personId) throw new AppError(404, 'Leave request not found');
}

async function requireApprover(req: any) {
  const actor = await loadActor(req);
  if (!['SUPER_ADMIN', 'HR'].includes(actor.role)) throw new AppError(403, 'Only admins and HR can approve or reject');
}

const policyOf = (t: any): LeaveTypePolicy => ({
  code: t.code, paid: t.paid, genderGate: t.genderGate, halfDayAllowed: t.halfDayAllowed,
  requiresAttachment: t.requiresAttachment, eligibleAfterProbation: t.eligibleAfterProbation,
});

// Working days of a request using the person's location holidays + week-offs.
async function computeDays(orgId: string, person: any, startDate: string, endDate: string, halfStart: boolean, halfEnd: boolean) {
  const settings = await settingsFor(orgId);
  const holidays = await holidaySetFor(orgId, person?.workLocationId);
  return round2(workingDaysBetween(startDate, endDate, settings.weekOffDays, holidays, halfStart, halfEnd));
}

async function balanceFor(orgId: string, personId: string, leaveTypeId: string, year: number) {
  const row = await prisma.leaveBalance.findUnique({
    where: { organizationId_personId_leaveTypeId_year: { organizationId: orgId, personId, leaveTypeId, year } },
  });
  return row ? balanceOf(row) : 0;
}

// Pending (SUBMITTED) days a person has for a type in a year — the "Applied" column.
async function pendingDays(orgId: string, personId: string, leaveTypeId: string) {
  const rows = await prisma.leaveRequest.findMany({
    where: { organizationId: orgId, personId, leaveTypeId, status: 'SUBMITTED' }, select: { days: true },
  });
  return round2(rows.reduce((s, r) => s + r.days, 0));
}

async function hasOverlap(orgId: string, personId: string, startDate: string, endDate: string, excludeId?: string) {
  const live = await prisma.leaveRequest.findMany({
    where: {
      organizationId: orgId, personId, status: { in: ['SUBMITTED', 'APPROVED'] },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { startDate: true, endDate: true },
  });
  return live.some(r => r.startDate <= endDate && r.endDate >= startDate);
}

const approvalView = (steps: any[]) => steps
  .sort((a, b) => a.level - b.level)
  .map(s => ({ level: s.level, approverId: s.approverId, approverName: s.approverName, decision: s.decision, note: s.note, decidedAt: s.decidedAt }));

export const leaveController = {
  async getMeta(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    await ensureDefaultLeaveTypes(orgId);
    const actor = await loadActor(req);
    const [types, settings] = await Promise.all([
      prisma.leaveType.findMany({ where: { organizationId: orgId, active: true }, orderBy: { sortOrder: 'asc' } }),
      settingsFor(orgId),
    ]);
    const employees = selfScoped(actor)
      ? await prisma.person.findMany({ where: { id: actor.personId || 'none', organizationId: orgId }, select: { id: true, name: true, employeeNo: true } })
      : await prisma.person.findMany({ where: { organizationId: orgId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } }, orderBy: { name: 'asc' }, select: { id: true, name: true, employeeNo: true } });
    res.json({ types, statuses: LEAVE_STATUSES, employees, weekOffDays: settings.weekOffDays, canApplyOnBehalf: !selfScoped(actor) && settings.hrApplyOnBehalf });
  },

  async getRequests(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const actor = await loadActor(req);
    const status = str(req.query.status);
    const awaiting = str(req.query.awaiting) === '1';
    const personId = selfScoped(actor) ? (actor.personId || 'none') : str(req.query.personId);
    const q = str(req.query.q).trim();
    const requests = await prisma.leaveRequest.findMany({
      where: {
        organizationId: orgId,
        ...(awaiting
          ? { currentApproverId: actor.personId || 'none', status: 'SUBMITTED' }
          : { ...(status ? { status } : {}), ...(personId ? { personId } : {}) }),
        ...(q ? {
          OR: [
            { requestNumber: { contains: q, mode: 'insensitive' as const } },
            { reason: { contains: q, mode: 'insensitive' as const } },
            { person: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        } : {}),
      },
      include: { person: { select: { id: true, name: true, employeeNo: true } }, leaveType: { select: { code: true, name: true, paid: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      requests,
      pendingCount: requests.filter(r => r.status === 'SUBMITTED').length,
      takenDays: round2(requests.filter(r => r.status === 'APPROVED').reduce((s, r) => s + r.days, 0)),
    });
  },

  // Month view of approved leave + holidays (everyone can see the team calendar).
  async getCalendar(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const month = /^\d{4}-\d{2}$/.test(str(req.query.month)) ? str(req.query.month) : new Date().toISOString().slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const first = `${month}-01`;
    const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
    const [reqs, holidays] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: { organizationId: orgId, status: 'APPROVED', startDate: { lte: last }, endDate: { gte: first } },
        include: { person: { select: { id: true, name: true } }, leaveType: { select: { code: true, paid: true } } },
        orderBy: { startDate: 'asc' },
      }),
      prisma.holiday.findMany({ where: { organizationId: orgId, date: { gte: first, lte: last } }, orderBy: { date: 'asc' }, include: { workLocation: { select: { name: true } } } }),
    ]);
    res.json({
      month,
      leaves: reqs.map(r => ({ id: r.id, personId: r.personId, name: r.person.name, code: r.leaveType.code, paid: r.leaveType.paid, startDate: r.startDate, endDate: r.endDate, halfDayStart: r.halfDayStart, halfDayEnd: r.halfDayEnd })),
      holidays: holidays.map(h => ({ date: h.date, name: h.name, type: h.type, location: h.workLocation?.name || null })),
    });
  },

  // HR overview: who's on leave today / this week, pending, and the year's
  // leave by type.
  async getOverview(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const dow = (now.getUTCDay() + 6) % 7; // 0 = Monday
    const monday = new Date(now.getTime() - dow * 86400000).toISOString().slice(0, 10);
    const sunday = new Date(now.getTime() + (6 - dow) * 86400000).toISOString().slice(0, 10);
    const year = leaveYearOf(today, (await settingsFor(orgId)).leaveYearStartMonth);
    const [onLeaveToday, pending, weekReqs, yearReqs] = await Promise.all([
      prisma.leaveRequest.count({ where: { organizationId: orgId, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } } }),
      prisma.leaveRequest.count({ where: { organizationId: orgId, status: 'SUBMITTED' } }),
      prisma.leaveRequest.findMany({ where: { organizationId: orgId, status: 'APPROVED', startDate: { lte: sunday }, endDate: { gte: monday } }, include: { person: { select: { name: true } }, leaveType: { select: { code: true } } }, orderBy: { startDate: 'asc' } }),
      prisma.leaveRequest.findMany({ where: { organizationId: orgId, status: 'APPROVED', startDate: { gte: `${year}-01-01`, lte: `${year}-12-31` } }, include: { leaveType: { select: { code: true } } } }),
    ]);
    const byType = new Map<string, number>();
    for (const r of yearReqs) byType.set(r.leaveType.code, round2((byType.get(r.leaveType.code) || 0) + r.days));
    res.json({
      onLeaveToday, pending,
      byType: [...byType.entries()].map(([code, days]) => ({ code, days })).sort((a, b) => b.days - a.days),
      thisWeek: weekReqs.map(r => ({ name: r.person.name, code: r.leaveType.code, startDate: r.startDate, endDate: r.endDate })),
    });
  },

  async updateLeaveType(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const type = await prisma.leaveType.findFirst({ where: { id: req.params.typeId, organizationId: orgId } });
    if (!type) throw new AppError(404, 'Leave type not found');
    const b = req.body;
    const data: any = {};
    if (b.name !== undefined) { const n = str(b.name).trim(); if (!n) throw new AppError(400, 'Name is required'); data.name = n; }
    if (b.accrualFrequency !== undefined) {
      if (!ACCRUAL_FREQ.includes(str(b.accrualFrequency))) throw new AppError(400, 'Invalid accrual frequency');
      data.accrualFrequency = str(b.accrualFrequency);
    }
    for (const f of ['annualQuota', 'accrualRate', 'carryForwardCap']) if (b[f] !== undefined) data[f] = Math.max(0, num(b[f]));
    for (const f of ['paid', 'halfDayAllowed', 'requiresAttachment', 'eligibleAfterProbation', 'encashable', 'carryForward', 'active']) if (b[f] !== undefined) data[f] = Boolean(b[f]);
    if (b.genderGate !== undefined) data.genderGate = ['', 'M', 'F'].includes(str(b.genderGate)) ? str(b.genderGate) : '';
    if (b.reviewerId !== undefined) data.reviewerId = b.reviewerId || null;
    const updated = await prisma.leaveType.update({ where: { id: type.id }, data });
    res.json(updated);
  },

  async createLeaveType(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const code = str(b.code).trim().toUpperCase();
    if (!code || code.length > 10) throw new AppError(400, 'Enter a short code (up to 10 characters)');
    const name = str(b.name).trim();
    if (!name) throw new AppError(400, 'Enter the leave type name');
    const exists = await prisma.leaveType.findUnique({ where: { organizationId_code: { organizationId: orgId, code } } });
    if (exists) throw new AppError(409, 'A leave type with this code already exists');
    const created = await prisma.leaveType.create({
      data: {
        organizationId: orgId, code, name,
        paid: b.paid !== false,
        annualQuota: Math.max(0, num(b.annualQuota)),
        accrualFrequency: ACCRUAL_FREQ.includes(str(b.accrualFrequency)) ? str(b.accrualFrequency) : 'NONE',
        accrualRate: Math.max(0, num(b.accrualRate)),
        halfDayAllowed: b.halfDayAllowed !== false,
        requiresAttachment: Boolean(b.requiresAttachment),
        eligibleAfterProbation: Boolean(b.eligibleAfterProbation),
        encashable: Boolean(b.encashable),
        genderGate: ['', 'M', 'F'].includes(str(b.genderGate)) ? str(b.genderGate) : '',
        sortOrder: num(b.sortOrder) || 10,
      },
    });
    res.status(201).json(created);
  },

  // Preview or run automatic accrual for a month (HR). Idempotent.
  async runAccrual(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const period = str(req.body.period);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new AppError(400, 'Pick a valid month');
    const result = await runAccrualJob(req, orgId, period, Boolean(req.body.dryRun));
    res.json(result);
  },

  // Preview or run year-end carry-forward + lapse (HR). Idempotent.
  async runYearEnd(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const year = parseInt(str(req.body.year));
    if (!year || year < 2000 || year > 2100) throw new AppError(400, 'Pick a valid year');
    const result = await runYearEndJob(req, orgId, year, Boolean(req.body.dryRun));
    res.json(result);
  },

  async recalculate(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const personId = str(req.body.personId) || undefined;
    const result = await recalculateBalances(orgId, personId);
    res.json(result);
  },

  async encash(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const person = await prisma.person.findFirst({ where: { id: str(b.personId), organizationId: orgId, isEmployee: true } });
    if (!person) throw new AppError(400, 'Pick a valid employee');
    const days = num(b.days);
    if (days <= 0) throw new AppError(400, 'Enter the number of days to encash');
    const effectiveDate = DATE.test(str(b.effectiveDate)) ? str(b.effectiveDate) : new Date().toISOString().slice(0, 10);
    await encashLeave(req, orgId, person.id, str(b.leaveTypeId), days, str(b.note), effectiveDate);
    res.json({ message: `Encashed ${days} day(s) for ${person.name}` });
  },

  async createRequest(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const actor = await loadActor(req);
    const targetPersonId = selfScoped(actor) ? (actor.personId || '') : str(b.personId);
    const person = await prisma.person.findFirst({ where: { id: targetPersonId, organizationId: orgId, isEmployee: true } });
    if (!person) throw new AppError(400, 'Pick the employee this leave is for');
    const type = await prisma.leaveType.findFirst({ where: { id: str(b.leaveTypeId), organizationId: orgId, active: true } });
    if (!type) throw new AppError(400, 'Pick a leave type');
    const startDate = str(b.startDate), endDate = str(b.endDate);
    if (!DATE.test(startDate) || !DATE.test(endDate)) throw new AppError(400, 'Pick valid from/to dates');
    if (endDate < startDate) throw new AppError(400, 'The end date is before the start date');
    const halfDayStart = Boolean(b.halfDayStart), halfDayEnd = Boolean(b.halfDayEnd);
    const days = await computeDays(orgId, person, startDate, endDate, halfDayStart, halfDayEnd);
    const request = await prisma.leaveRequest.create({
      data: {
        organizationId: orgId, personId: person.id, requestNumber: await nextRequestNumber(orgId),
        leaveTypeId: type.id, startDate, endDate, halfDayStart, halfDayEnd, days,
        reason: str(b.reason), attachmentData: str(b.attachmentData).slice(0, 4_000_000),
        appliedOnBehalf: selfScoped(actor) ? false : person.id !== actor.personId,
      },
    });
    res.status(201).json(request);
  },

  async getRequestDetail(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const request = await fetchOrgRequest(req.params.requestId, orgId);
    const actor = await loadActor(req);
    const staff = ['SUPER_ADMIN', 'HR'].includes(actor.role);
    const isOwner = actor.personId === request.personId;
    const steps = await prisma.leaveApproval.findMany({ where: { requestId: request.id } });
    const onChain = Boolean(actor.personId) && steps.some(s => s.approverId === actor.personId);
    if (!staff && !isOwner && !onChain) throw new AppError(404, 'Leave request not found');
    const canApproveNow = request.status === 'SUBMITTED' && (request.currentApproverId ? canApprove(request, actor.role, actor.personId) : staff);
    res.json({
      ...request,
      approvals: approvalView(steps),
      canApproveNow,
      editable: EDITABLE_STATUSES.has(request.status) && (isOwner || staff),
      canCancel: ['DRAFT', 'SUBMITTED', 'APPROVED'].includes(request.status) && (isOwner || staff),
      actions: Object.keys(TRANSITIONS[request.status] || {}).filter(a => {
        if (APPROVER_ACTIONS.has(a)) return canApproveNow;
        return isOwner || staff; // submit / cancel
      }),
    });
  },

  async updateRequest(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const request = await fetchOrgRequest(req.params.requestId, orgId);
    await assertRequestAccess(req, request.personId);
    if (!EDITABLE_STATUSES.has(request.status)) throw new AppError(400, `A ${request.status.toLowerCase()} request is locked`);
    const b = req.body;
    const data: any = {};
    let recompute = false;
    if (b.leaveTypeId !== undefined) {
      const type = await prisma.leaveType.findFirst({ where: { id: str(b.leaveTypeId), organizationId: orgId } });
      if (!type) throw new AppError(400, 'Pick a valid leave type');
      data.leaveTypeId = type.id;
    }
    for (const f of ['startDate', 'endDate']) if (b[f] !== undefined) { if (!DATE.test(str(b[f]))) throw new AppError(400, 'Pick valid dates'); data[f] = str(b[f]); recompute = true; }
    for (const f of ['halfDayStart', 'halfDayEnd']) if (b[f] !== undefined) { data[f] = Boolean(b[f]); recompute = true; }
    if (b.reason !== undefined) data.reason = str(b.reason);
    if (b.attachmentData !== undefined) data.attachmentData = str(b.attachmentData).slice(0, 4_000_000);
    const startDate = data.startDate ?? request.startDate, endDate = data.endDate ?? request.endDate;
    if (endDate < startDate) throw new AppError(400, 'The end date is before the start date');
    if (recompute) data.days = await computeDays(orgId, request.person, startDate, endDate, data.halfDayStart ?? request.halfDayStart, data.halfDayEnd ?? request.halfDayEnd);
    const updated = await prisma.leaveRequest.update({ where: { id: request.id }, data });
    res.json(updated);
  },

  async deleteRequest(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const request = await fetchOrgRequest(req.params.requestId, orgId);
    await assertRequestAccess(req, request.personId);
    if (request.status !== 'DRAFT') throw new AppError(400, 'Only draft requests can be deleted');
    await prisma.leaveRequest.delete({ where: { id: request.id } });
    res.json({ message: `Deleted ${request.requestNumber}` });
  },

  async changeStatus(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const request = await fetchOrgRequest(req.params.requestId, orgId);
    const actor = await loadActor(req);
    const action = str(req.body.action);
    const next = TRANSITIONS[request.status]?.[action];
    if (!next) throw new AppError(400, `Cannot ${action} a ${request.status.toLowerCase()} request`);

    // Approve / reject — route up the reporting chain when there is one
    if (action === 'approve' || action === 'reject') {
      const steps = await prisma.leaveApproval.findMany({ where: { requestId: request.id }, orderBy: { level: 'asc' } });
      if (steps.length > 0) {
        if (!canApprove(request, actor.role, actor.personId)) throw new AppError(403, 'This request is waiting for someone else to approve it.');
        const level = request.approvalLevel || 1;
        const outcome = afterDecision(action, level, steps.length);
        await prisma.leaveApproval.updateMany({
          where: { requestId: request.id, level },
          data: { decision: action === 'approve' ? 'APPROVED' : 'REJECTED', note: str(req.body.note).slice(0, 300), decidedAt: new Date(), approverName: await actorName(req.user?.userId) },
        });
        const nextStep = outcome.nextLevel ? steps.find(s => s.level === outcome.nextLevel) : null;
        const updated = await prisma.leaveRequest.update({
          where: { id: request.id },
          data: { status: outcome.status, currentApproverId: nextStep?.approverId ?? null, approvalLevel: nextStep?.level ?? level },
        });
        if (outcome.status === 'APPROVED') await onApproved(req, { ...request, days: request.days });
        return res.json({ ...updated, message: outcome.status === 'SUBMITTED' ? `Approved — now with ${nextStep?.approverName}` : `Request ${outcome.status.toLowerCase()}` });
      }
      // No chain: HR approves directly
      await requireApprover(req);
      const updated = await prisma.leaveRequest.update({ where: { id: request.id }, data: { status: next, currentApproverId: null } });
      if (next === 'APPROVED') await onApproved(req, request);
      return res.json({ ...updated, message: `Request ${next.toLowerCase()}` });
    }

    // Owner / staff actions
    await assertRequestAccess(req, request.personId);
    if (action === 'submit') {
      const year = leaveYearOf(request.startDate, (await settingsFor(orgId)).leaveYearStartMonth);
      const problem = validateRequest({
        type: policyOf(request.leaveType),
        gender: request.person.gender || '',
        confirmed: request.person.employmentStatus !== 'PROBATION',
        days: request.days,
        balance: await balanceFor(orgId, request.personId, request.leaveTypeId, year),
        hasAttachment: Boolean(request.attachmentData),
        overlaps: await hasOverlap(orgId, request.personId, request.startDate, request.endDate, request.id),
        halfDay: request.halfDayStart || request.halfDayEnd,
      });
      if (problem) throw new AppError(400, problem);
      const chain = await startApprovalChain(orgId, request);
      const updated = await prisma.leaveRequest.update({
        where: { id: request.id },
        data: { status: next, submittedOn: new Date().toISOString().split('T')[0], ...chain },
      });
      return res.json({ ...updated, message: updated.currentApproverId ? 'Submitted — sent for approval' : 'Submitted — awaiting HR approval' });
    }
    if (action === 'cancel') {
      const wasApproved = request.status === 'APPROVED';
      const updated = await prisma.leaveRequest.update({ where: { id: request.id }, data: { status: 'CANCELLED', currentApproverId: null } });
      if (wasApproved) await onCancelled(req, request);
      return res.json({ ...updated, message: 'Request cancelled' });
    }
    throw new AppError(400, 'Unsupported action');
  },

  // --- HR: balances & grants ----------------------------------------------
  async getBalances(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const actor = await loadActor(req);
    const personId = selfScoped(actor) ? (actor.personId || 'none') : str(req.query.personId);
    if (!personId || personId === 'none') throw new AppError(400, 'Pick an employee');
    await assertRequestAccess(req, personId);
    await ensureDefaultLeaveTypes(orgId);
    const settings = await settingsFor(orgId);
    const year = req.query.year ? parseInt(str(req.query.year)) : leaveYearOf(new Date().toISOString().slice(0, 10), settings.leaveYearStartMonth);
    const types = await prisma.leaveType.findMany({ where: { organizationId: orgId, active: true }, orderBy: { sortOrder: 'asc' } });
    const rows = [];
    for (const t of types) {
      const bal = await prisma.leaveBalance.findUnique({
        where: { organizationId_personId_leaveTypeId_year: { organizationId: orgId, personId, leaveTypeId: t.id, year } },
      });
      const b = bal || { opening: 0, granted: 0, taken: 0, lapsed: 0, encashed: 0 };
      rows.push({
        leaveTypeId: t.id, code: t.code, name: t.name, paid: t.paid, encashable: t.encashable,
        opening: round2(b.opening), granted: round2(b.granted), availed: round2(b.taken),
        applied: await pendingDays(orgId, personId, t.id), lapsed: round2(b.lapsed), encashed: round2(b.encashed),
        balance: round2(balanceOf(b)),
      });
    }
    res.json({ year, rows });
  },

  async grantLeave(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const person = await prisma.person.findFirst({ where: { id: str(b.personId), organizationId: orgId, isEmployee: true } });
    if (!person) throw new AppError(400, 'Pick a valid employee');
    const type = await prisma.leaveType.findFirst({ where: { id: str(b.leaveTypeId), organizationId: orgId } });
    if (!type) throw new AppError(400, 'Pick a valid leave type');
    const days = num(b.days);
    if (!days) throw new AppError(400, 'Enter a number of days (negative to deduct)');
    const effectiveDate = DATE.test(str(b.effectiveDate)) ? str(b.effectiveDate) : new Date().toISOString().slice(0, 10);
    await grantLeave(req, orgId, person.id, type.id, days, str(b.note), effectiveDate);
    res.json({ message: `Granted ${days} day(s) of ${type.code} to ${person.name}` });
  },

  // --- HR: holidays --------------------------------------------------------
  async listHolidays(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const year = req.query.year ? str(req.query.year) : String(new Date().getFullYear());
    const [holidays, locations] = await Promise.all([
      prisma.holiday.findMany({ where: { organizationId: orgId, date: { startsWith: year } }, orderBy: { date: 'asc' }, include: { workLocation: { select: { id: true, name: true } } } }),
      prisma.workLocation.findMany({ where: { organizationId: orgId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    ]);
    res.json({ year, holidays, locations });
  },

  async saveHoliday(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const date = str(b.date);
    if (!DATE.test(date)) throw new AppError(400, 'Pick a valid date');
    const name = str(b.name).trim();
    if (!name) throw new AppError(400, 'Enter the holiday name');
    const type = ['PUBLIC', 'RESTRICTED'].includes(str(b.type)) ? str(b.type) : 'PUBLIC';
    const workLocationId = b.workLocationId || null;
    if (b.id) {
      const updated = await prisma.holiday.update({ where: { id: str(b.id) }, data: { date, name, type, workLocationId } });
      return res.json(updated);
    }
    const created = await prisma.holiday.create({ data: { organizationId: orgId, date, name, type, workLocationId } });
    res.status(201).json(created);
  },

  async deleteHoliday(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const h = await prisma.holiday.findFirst({ where: { id: req.params.holidayId, organizationId: orgId } });
    if (!h) throw new AppError(404, 'Holiday not found');
    await prisma.holiday.delete({ where: { id: h.id } });
    res.json({ message: 'Holiday removed' });
  },

  // --- HR: settings --------------------------------------------------------
  async getSettings(req: any, res: Response) {
    res.json(await settingsFor(req.user?.organizationId));
  },

  async saveSettings(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const data: any = {};
    if (b.weekOffDays !== undefined) {
      if (!Array.isArray(b.weekOffDays)) throw new AppError(400, 'weekOffDays must be a list');
      data.weekOffDays = [...new Set(b.weekOffDays.map((d: any) => parseInt(d)).filter((d: number) => d >= 0 && d <= 6))];
    }
    if (b.leaveYearStartMonth !== undefined) {
      const m = parseInt(b.leaveYearStartMonth);
      if (m < 1 || m > 12) throw new AppError(400, 'Leave year start month must be 1-12');
      data.leaveYearStartMonth = m;
    }
    if (b.hrApplyOnBehalf !== undefined) data.hrApplyOnBehalf = Boolean(b.hrApplyOnBehalf);
    await settingsFor(orgId);
    const updated = await prisma.leaveSettings.update({ where: { organizationId: orgId }, data });
    res.json(updated);
  },
};
