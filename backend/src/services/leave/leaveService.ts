import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { approvalChainOf } from '../orgChart';
import { approvalSteps } from '../expenseApproval';
import { splitByPeriod, leaveYearOf, accrualForMonth, balanceOf } from '../leaveCalc';
import { sanitizeWeekOffRules } from '../weekOff';
import { recomputeEntry, addRetroLop, reverseLop } from '../payroll/arrears';
import { actorName } from '../payroll/audit';

const r2 = (n: number) => Math.round(n * 100) / 100;

// Default leave-type catalogue, seeded once per org (count-then-createMany).
const DEFAULT_LEAVE_TYPES = [
  { code: 'CL', name: 'Casual Leave', paid: true, sortOrder: 0, annualQuota: 12, halfDayAllowed: true, accrualFrequency: 'MONTHLY', accrualRate: 1 },
  { code: 'SL', name: 'Sick Leave', paid: true, sortOrder: 1, annualQuota: 12, halfDayAllowed: true, accrualFrequency: 'MONTHLY', accrualRate: 1 },
  { code: 'PL', name: 'Privilege Leave', paid: true, sortOrder: 2, annualQuota: 15, halfDayAllowed: true, encashable: true, eligibleAfterProbation: true, accrualFrequency: 'MONTHLY', accrualRate: 1.25, carryForward: true, carryForwardCap: 45 },
  { code: 'COF', name: 'Comp Off', paid: true, sortOrder: 3, annualQuota: 0, halfDayAllowed: true },
  { code: 'FL', name: 'Floating / Festival Leave', paid: true, sortOrder: 4, annualQuota: 2, halfDayAllowed: false, accrualFrequency: 'ANNUAL' },
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
  // Opening balance = what carried in from the prior year (year-end CARRY rows).
  const opening = r2(sum('CARRY'));
  const granted = r2(sum('GRANT') + sum('ADJUST') + sum('ACCRUAL'));
  // AVAIL/REVERSAL days are stored signed (avail negative, reversal positive)
  const taken = r2(-(sum('AVAIL') + sum('REVERSAL')));
  const lapsed = r2(-sum('LAPSE'));
  const encashed = r2(-sum('ENCASH'));
  await prisma.leaveBalance.upsert({
    where: { organizationId_personId_leaveTypeId_year: { organizationId, personId, leaveTypeId, year } },
    create: { organizationId, personId, leaveTypeId, year, opening, granted, taken, lapsed, encashed },
    update: { opening, granted, taken, lapsed, encashed },
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

// Credit automatic accrual for one month ("YYYY-MM"). Idempotent — an employee
// already credited for that month/type is skipped, so re-running is safe.
// Pass dryRun to preview without writing.
export async function runAccrual(req: any, organizationId: string, period: string, dryRun = false) {
  const settings = await settingsFor(organizationId);
  const year = leaveYearOf(`${period}-01`, settings.leaveYearStartMonth);
  const first = `${period}-01`;
  const types = await prisma.leaveType.findMany({
    where: { organizationId, active: true, accrualFrequency: { not: 'NONE' } },
  });
  if (!types.length) return { period, credited: [], totalDays: 0, dryRun };

  const employees = await prisma.person.findMany({
    where: { organizationId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { not: 'TERMINATED' } },
    select: { id: true, name: true, joinDate: true, firstHireDate: true, leavingDate: true, confirmationDate: true, employmentStatus: true },
  });
  const [py, pm] = period.split('-').map(Number);
  const monthEnd = `${period}-${String(new Date(Date.UTC(py, pm, 0)).getUTCDate()).padStart(2, '0')}`;
  // Confirmed as of this month = not on probation and any confirmation date already reached.
  const confirmedAsOf = (e: any) => e.employmentStatus !== 'PROBATION' && (!e.confirmationDate || e.confirmationDate <= monthEnd);
  const already = new Set((await prisma.leaveTransaction.findMany({
    where: { organizationId, kind: 'ACCRUAL', effectiveDate: first }, select: { personId: true, leaveTypeId: true },
  })).map(t => `${t.personId}|${t.leaveTypeId}`));

  const credited: { personId: string; leaveTypeId: string; name: string; code: string; days: number }[] = [];
  let total = 0;
  for (const t of types) {
    for (const e of employees) {
      if (already.has(`${e.id}|${t.id}`)) continue;
      const join = e.firstHireDate || e.joinDate || null;
      const days = accrualForMonth(t, period, join, e.leavingDate, confirmedAsOf(e), settings.leaveYearStartMonth);
      if (days <= 0) continue;
      credited.push({ personId: e.id, leaveTypeId: t.id, name: e.name, code: t.code, days });
      total = r2(total + days);
    }
  }

  if (!dryRun && credited.length) {
    const createdBy = await actorName(req.user?.userId);
    await prisma.leaveTransaction.createMany({
      data: credited.map(c => ({
        organizationId, personId: c.personId, leaveTypeId: c.leaveTypeId, year,
        kind: 'ACCRUAL', days: c.days, effectiveDate: first, note: `Accrual ${period}`, createdBy,
      })),
    });
    const pairs = new Set(credited.map(c => `${c.personId}|${c.leaveTypeId}`));
    for (const pair of pairs) {
      const [personId, leaveTypeId] = pair.split('|');
      await recomputeBalance(organizationId, personId, leaveTypeId, year);
    }
  }
  return { period, credited, totalDays: total, dryRun };
}

// Close a leave year: carry each balance into the next year up to its cap and
// lapse the rest. Idempotent — a (person, type) already closed for the year is
// skipped. Opening balances for year+1 come from the CARRY ledger rows.
export async function runYearEnd(req: any, organizationId: string, year: number, dryRun = false) {
  const yearEnd = `${year}-12-31`;
  const nextStart = `${year + 1}-01-01`;
  const types = new Map((await prisma.leaveType.findMany({
    where: { organizationId }, select: { id: true, code: true, carryForward: true, carryForwardCap: true },
  })).map(t => [t.id, t]));
  const balances = await prisma.leaveBalance.findMany({ where: { organizationId, year } });
  const markers = await prisma.leaveTransaction.findMany({
    where: { organizationId, OR: [{ kind: 'LAPSE', effectiveDate: yearEnd }, { kind: 'CARRY', effectiveDate: nextStart }] },
    select: { personId: true, leaveTypeId: true },
  });
  const done = new Set(markers.map(m => `${m.personId}|${m.leaveTypeId}`));

  const results: { personId: string; code: string; balance: number; carried: number; lapsed: number }[] = [];
  const txns: any[] = [];
  const recompute = new Set<string>();
  const createdBy = await actorName(req.user?.userId);
  for (const b of balances) {
    const key = `${b.personId}|${b.leaveTypeId}`;
    if (done.has(key)) continue;
    const t = types.get(b.leaveTypeId);
    if (!t) continue;
    const bal = r2(balanceOf(b));
    if (bal <= 0) continue;
    const carried = t.carryForward ? (t.carryForwardCap > 0 ? Math.min(bal, t.carryForwardCap) : bal) : 0;
    const lapsed = r2(bal - carried);
    results.push({ personId: b.personId, code: t.code, balance: bal, carried: r2(carried), lapsed });
    if (!dryRun) {
      if (lapsed > 0) txns.push({ organizationId, personId: b.personId, leaveTypeId: b.leaveTypeId, year, kind: 'LAPSE', days: -lapsed, effectiveDate: yearEnd, note: `Year-end ${year}`, createdBy });
      if (carried > 0) txns.push({ organizationId, personId: b.personId, leaveTypeId: b.leaveTypeId, year: year + 1, kind: 'CARRY', days: r2(carried), effectiveDate: nextStart, note: `Carried from ${year}`, createdBy });
      recompute.add(`${key}|${year}`);
      recompute.add(`${key}|${year + 1}`);
    }
  }
  if (!dryRun && txns.length) {
    await prisma.leaveTransaction.createMany({ data: txns });
    for (const r of recompute) { const [pid, tid, y] = r.split('|'); await recomputeBalance(organizationId, pid, tid, Number(y)); }
  }
  return {
    year, processed: results.length, dryRun,
    carriedTotal: r2(results.reduce((s, r) => s + r.carried, 0)),
    lapsedTotal: r2(results.reduce((s, r) => s + r.lapsed, 0)),
    results,
  };
}

// Rebuild balance aggregates from the ledger (after manual edits / corrections).
export async function recalculateBalances(organizationId: string, personId?: string) {
  const groups = await prisma.leaveTransaction.groupBy({
    by: ['personId', 'leaveTypeId', 'year'],
    where: { organizationId, ...(personId ? { personId } : {}) },
  });
  for (const g of groups) await recomputeBalance(organizationId, g.personId, g.leaveTypeId, g.year);
  return { recomputed: groups.length };
}

// Encash leave: reduce the balance of an encashable type (ledger side). The
// payout is made through payroll / final settlement separately.
export async function encashLeave(req: any, organizationId: string, personId: string, leaveTypeId: string, days: number, note: string, effectiveDate: string) {
  const type = await prisma.leaveType.findFirst({ where: { id: leaveTypeId, organizationId } });
  if (!type) throw new AppError(400, 'Pick a valid leave type');
  if (!type.encashable) throw new AppError(400, `${type.code} is not encashable`);
  const year = leaveYearOf(effectiveDate, (await settingsFor(organizationId)).leaveYearStartMonth);
  const bal = balanceOf(await prisma.leaveBalance.findUnique({
    where: { organizationId_personId_leaveTypeId_year: { organizationId, personId, leaveTypeId, year } },
  }) || {});
  if (days > bal + 1e-9) throw new AppError(400, `Only ${r2(bal)} day(s) of ${type.code} available to encash`);
  await prisma.leaveTransaction.create({
    data: { organizationId, personId, leaveTypeId, year, kind: 'ENCASH', days: -r2(days), effectiveDate, note: note || 'Encashment', createdBy: await actorName(req.user?.userId) },
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
  const rules = sanitizeWeekOffRules(settings.weekOffRules);
  let total = 0;
  for (const r of reqs) {
    const by = splitByPeriod(r.startDate, r.endDate, settings.weekOffDays, holidays, r.halfDayStart, r.halfDayEnd, rules);
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
  return splitByPeriod(request.startDate, request.endDate, settings.weekOffDays, holidays, request.halfDayStart, request.halfDayEnd, sanitizeWeekOffRules(settings.weekOffRules));
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
