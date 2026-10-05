import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { approvalChainOf } from '../orgChart';
import { approvalSteps } from '../expenseApproval';
import { splitByPeriod, leaveYearOf } from '../leaveCalc';
import { recomputeEntry, addRetroLop, reverseLop } from '../payroll/arrears';
import { actorName } from '../payroll/audit';

const r2 = (n: number) => Math.round(n * 100) / 100;

// Default leave-type catalogue, seeded once per org (count-then-createMany).
const DEFAULT_LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', paid: true, sortOrder: 0, annualQuota: 12, halfDayAllowed: true },
  { code: 'SL', name: 'Sick Leave', paid: true, sortOrder: 1, annualQuota: 12, halfDayAllowed: true, requiresAttachment: false },
  { code: 'PL', name: 'Privilege Leave', paid: true, sortOrder: 2, annualQuota: 15, halfDayAllowed: true, encashable: true, eligibleAfterProbation: true },
  { code: 'COF', name: 'Comp Off', paid: true, sortOrder: 3, annualQuota: 0, halfDayAllowed: true },
  { code: 'FL', name: 'Floating / Festival Leave', paid: true, sortOrder: 4, annualQuota: 2, halfDayAllowed: false },
  { code: 'LOP', name: 'Loss of Pay', paid: false, sortOrder: 9, annualQuota: 0, halfDayAllowed: true },
];

const DEFAULT_WEEK_OFF = [0]; // Sunday off by default; HR configures the rest

export async function ensureDefaultLeaveTypes(organizationId: string) {
  const count = await prisma.leaveType.count({ where: { organizationId } });
  if (count > 0) return;
  await prisma.leaveType.createMany({
    data: DEFAULT_LEAVE_TYPES.map(t => ({ organizationId, ...t })),
    skipDuplicates: true,
  });
}

export async function settingsFor(organizationId: string) {
  return prisma.leaveSettings.upsert({
    where: { organizationId },
    create: { organizationId, weekOffDays: DEFAULT_WEEK_OFF },
    update: {},
  });
}

// Holiday dates ("YYYY-MM-DD") in force for a person's work location
// (location-specific + org-wide). Returned as a Set for the day counter.
export async function holidaySetFor(organizationId: string, workLocationId?: string | null): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({
    where: { organizationId, OR: [{ workLocationId: null }, ...(workLocationId ? [{ workLocationId }] : [])] },
    select: { date: true },
  });
  return new Set(rows.map(h => h.date));
}

// Rebuild a LeaveBalance's aggregates from its transaction ledger.
export async function recomputeBalance(organizationId: string, personId: string, leaveTypeId: string, year: number) {
  const txns = await prisma.leaveTransaction.findMany({
    where: { organizationId, personId, leaveTypeId, year },
  });
  const sum = (k: string) => txns.filter(t => t.kind === k).reduce((s, t) => s + t.days, 0);
  const granted = r2(sum('GRANT') + sum('ADJUST'));
  // AVAIL/REVERSAL days are stored signed (avail negative, reversal positive)
  const taken = r2(-(sum('AVAIL') + sum('REVERSAL')));
  const lapsed = r2(-sum('LAPSE'));
  const encashed = r2(-sum('ENCASH'));
  await prisma.leaveBalance.upsert({
    where: { organizationId_personId_leaveTypeId_year: { organizationId, personId, leaveTypeId, year } },
    create: { organizationId, personId, leaveTypeId, year, granted, taken, lapsed, encashed },
    update: { granted, taken, lapsed, encashed },
  });
}

// HR grants (credits) leave: a GRANT transaction + balance refresh.
export async function grantLeave(
  req: any, organizationId: string, personId: string, leaveTypeId: string, days: number, note: string, effectiveDate: string,
) {
  const year = leaveYearOf(effectiveDate, (await settingsFor(organizationId)).leaveYearStartMonth);
  await prisma.leaveTransaction.create({
    data: {
      organizationId, personId, leaveTypeId, year, kind: 'GRANT', days: r2(days),
      effectiveDate, note, createdBy: await actorName(req.user?.userId),
    },
  });
  await recomputeBalance(organizationId, personId, leaveTypeId, year);
}

export async function nextRequestNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.leaveRequest.count({
    where: { organizationId, requestNumber: { startsWith: `LR-${year}-` } },
  });
  let n = count + 1;
  for (;;) {
    const num = `LR-${year}-${String(n).padStart(4, '0')}`;
    const exists = await prisma.leaveRequest.findUnique({
      where: { organizationId_requestNumber: { organizationId, requestNumber: num } },
    });
    if (!exists) return num;
    n++;
  }
}

// Snapshot the approval steps for a request. A leave type with a designated
// reviewer routes to that one reviewer; otherwise it goes up the reporting
// chain (clone of the expenses version). No chain ⇒ HR approves directly.
export async function startApprovalChain(
  organizationId: string, request: { id: string; personId: string; leaveType?: { reviewerId?: string | null } | null },
) {
  await prisma.leaveApproval.deleteMany({ where: { requestId: request.id } });

  const reviewerId = request.leaveType?.reviewerId;
  if (reviewerId && reviewerId !== request.personId) {
    const reviewer = await prisma.person.findFirst({
      where: { id: reviewerId, organizationId, isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } },
      select: { id: true, name: true },
    });
    if (reviewer) {
      await prisma.leaveApproval.create({ data: { organizationId, requestId: request.id, level: 1, approverId: reviewer.id, approverName: reviewer.name } });
      return { currentApproverId: reviewer.id, approvalLevel: 1 };
    }
  }

  const employees = await prisma.person.findMany({
    where: { organizationId, kind: 'CANDIDATE', isEmployee: true },
    select: { id: true, managerId: true, name: true },
  });
  const steps = approvalSteps(approvalChainOf(request.personId, employees));
  if (steps.length === 0) return { currentApproverId: null, approvalLevel: 0 };
  await prisma.leaveApproval.createMany({
    data: steps.map(s => ({ organizationId, requestId: request.id, level: s.level, approverId: s.approverId, approverName: s.approverName })),
  });
  return { currentApproverId: steps[0].approverId, approvalLevel: 1 };
}

// --- LOP → payroll bridge -------------------------------------------------

// Approved unpaid-leave days for one person in one payroll period ("YYYY-MM").
export async function leaveLopForPeriod(organizationId: string, personId: string, period: string): Promise<number> {
  const unpaidTypes = await prisma.leaveType.findMany({ where: { organizationId, paid: false }, select: { id: true } });
  const ids = unpaidTypes.map(t => t.id);
  if (!ids.length) return 0;
  const reqs = await prisma.leaveRequest.findMany({
    where: { organizationId, personId, status: 'APPROVED', leaveTypeId: { in: ids } },
  });
  if (!reqs.length) return 0;
  const settings = await settingsFor(organizationId);
  const person = await prisma.person.findUnique({ where: { id: personId }, select: { workLocationId: true } });
  const holidays = await holidaySetFor(organizationId, person?.workLocationId);
  let total = 0;
  for (const r of reqs) {
    const by = splitByPeriod(r.startDate, r.endDate, settings.weekOffDays, holidays, r.halfDayStart, r.halfDayEnd);
    total += by[period] || 0;
  }
  return r2(total);
}

// Idempotently reconcile a DRAFT run's entries so each employee's leaveLopDays
// equals their approved-unpaid leave that period, adjusting the effective
// lopDays by the delta (lopDays = manual + leave-derived).
export async function reconcileDraftPeriod(organizationId: string, period: string) {
  const run = await prisma.payrollRun.findFirst({ where: { organizationId, period, status: 'DRAFT' } });
  if (!run) return;
  const entries = await prisma.payslipEntry.findMany({
    where: { organizationId, runId: run.id },
    select: { id: true, personId: true, lopDays: true, leaveLopDays: true },
  });
  for (const e of entries) {
    const want = await leaveLopForPeriod(organizationId, e.personId, period);
    if (want === e.leaveLopDays) continue;
    const newLop = r2(Math.max(0, e.lopDays - e.leaveLopDays + want));
    await recomputeEntry(organizationId, e.id, { lopDays: newLop, leaveLopDays: want });
  }
}

// Push an approved/cancelled unpaid-leave change into payroll for each affected
// period: a draft run reconciles whole; a finalized run takes a retro arrear.
async function applyLeaveLop(req: any, organizationId: string, personId: string, perPeriod: Record<string, number>, sign: 1 | -1) {
  for (const [period, days] of Object.entries(perPeriod)) {
    if (!days) continue;
    const run = await prisma.payrollRun.findFirst({ where: { organizationId, period } });
    if (!run) continue; // no run yet — picked up by reconcile when the run is made
    if (run.status === 'DRAFT') {
      await reconcileDraftPeriod(organizationId, period);
    } else {
      const entry = await prisma.payslipEntry.findFirst({ where: { organizationId, runId: run.id, personId } });
      if (!entry) continue;
      if (sign > 0) await addRetroLop(req, entry.id, days, 'Approved leave (LOP)');
      else await reverseLop(req, entry.id, days, 'Leave cancelled (LOP reversed)');
    }
  }
}

// Unpaid-leave days of a request, split by payroll period.
async function unpaidByPeriod(organizationId: string, request: any): Promise<Record<string, number>> {
  const type = await prisma.leaveType.findUnique({ where: { id: request.leaveTypeId } });
  if (!type || type.paid) return {};
  const settings = await settingsFor(organizationId);
  const person = await prisma.person.findUnique({ where: { id: request.personId }, select: { workLocationId: true } });
  const holidays = await holidaySetFor(organizationId, person?.workLocationId);
  return splitByPeriod(request.startDate, request.endDate, settings.weekOffDays, holidays, request.halfDayStart, request.halfDayEnd);
}

// On final approval: record the AVAIL in the ledger (paid types reduce balance),
// then feed unpaid days into payroll.
export async function onApproved(req: any, request: any) {
  const type = await prisma.leaveType.findUnique({ where: { id: request.leaveTypeId } });
  if (!type) return;
  const year = leaveYearOf(request.startDate, (await settingsFor(request.organizationId)).leaveYearStartMonth);
  if (type.paid) {
    await prisma.leaveTransaction.create({
      data: {
        organizationId: request.organizationId, personId: request.personId, leaveTypeId: type.id, year,
        kind: 'AVAIL', days: -r2(request.days), effectiveDate: request.startDate, requestId: request.id,
        note: request.requestNumber, createdBy: await actorName(req.user?.userId),
      },
    });
    await recomputeBalance(request.organizationId, request.personId, type.id, year);
  } else {
    await applyLeaveLop(req, request.organizationId, request.personId, await unpaidByPeriod(request.organizationId, request), 1);
  }
}

// On cancelling an approved request: reverse the ledger and payroll effects.
export async function onCancelled(req: any, request: any) {
  const type = await prisma.leaveType.findUnique({ where: { id: request.leaveTypeId } });
  if (!type) return;
  const year = leaveYearOf(request.startDate, (await settingsFor(request.organizationId)).leaveYearStartMonth);
  if (type.paid) {
    await prisma.leaveTransaction.create({
      data: {
        organizationId: request.organizationId, personId: request.personId, leaveTypeId: type.id, year,
        kind: 'REVERSAL', days: r2(request.days), effectiveDate: request.startDate, requestId: request.id,
        note: `Cancelled ${request.requestNumber}`, createdBy: await actorName(req.user?.userId),
      },
    });
    await recomputeBalance(request.organizationId, request.personId, type.id, year);
  } else {
    await applyLeaveLop(req, request.organizationId, request.personId, await unpaidByPeriod(request.organizationId, request), -1);
  }
}
