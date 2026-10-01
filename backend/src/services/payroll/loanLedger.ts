// The loan ledger's link to payroll: which instalments a run should
// deduct, posting them when the run is finalized, and undoing that when it
// is reopened.
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { buildSchedule, outstandingPrincipal } from './loanCalc';
import { RunCheck } from './checks';
import { currentPeriodIST } from './salaryStructure';

const r2 = (n: number) => Math.round(n * 100) / 100;

export const todayIST = () =>
  new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

// Instalments (principal + interest) falling due in a period, per employee.
export async function loanDueByPerson(organizationId: string, period: string): Promise<Map<string, number>> {
  const lines = await prisma.loanScheduleLine.findMany({
    where: { period, status: 'DUE', loan: { organizationId, status: 'ACTIVE' } },
    select: { principal: true, interest: true, loan: { select: { personId: true } } },
  });
  const due = new Map<string, number>();
  for (const l of lines) {
    due.set(l.loan.personId, r2((due.get(l.loan.personId) || 0) + l.principal + l.interest));
  }
  return due;
}

export async function outstandingOf(loanId: string): Promise<number> {
  const transactions = await prisma.loanTransaction.findMany({ where: { loanId }, select: { principal: true } });
  return outstandingPrincipal(transactions);
}

// Replaces the unpaid part of a loan's schedule with a fresh plan for the
// amount still owed. Paid lines are history and stay as they are.
export async function regenerateSchedule(
  loan: { id: string; type: string },
  terms: { outstanding: number; annualRate: number; instalments: number; startPeriod: string },
) {
  const last = await prisma.loanScheduleLine.findFirst({
    where: { loanId: loan.id, status: 'PAID' }, orderBy: { seq: 'desc' },
  });
  const lines = buildSchedule({
    type: loan.type, principal: terms.outstanding, annualRate: terms.annualRate,
    instalments: terms.instalments, startPeriod: terms.startPeriod, firstSeq: (last?.seq ?? 0) + 1,
  });
  await prisma.$transaction([
    prisma.loanScheduleLine.deleteMany({ where: { loanId: loan.id, status: 'DUE' } }),
    prisma.loanScheduleLine.createMany({ data: lines.map(l => ({ loanId: loan.id, ...l })) }),
  ]);
  return lines;
}

// A month whose payroll is finalized can take no new deductions.
export async function assertPeriodOpen(organizationId: string, period: string) {
  const run = await prisma.payrollRun.findUnique({
    where: { organizationId_period: { organizationId, period } },
    select: { status: true },
  });
  if (run?.status === 'FINALIZED') {
    throw new AppError(400, `Payroll for ${period} is already finalized. Pick a later month.`);
  }
}

// On finalizing a run: every instalment the run deducted becomes a
// repayment in the ledger, and a loan with nothing left to pay closes.
// Throws before changing anything if the run's figures are stale.
export async function postRunInstalments(run: { id: string; organizationId: string; period: string }, userName: string) {
  const entries = await prisma.payslipEntry.findMany({
    where: { runId: run.id }, select: { id: true, personId: true, loanDeduction: true },
  });
  const entryByPerson = new Map(entries.map(e => [e.personId, e]));
  const lines = await prisma.loanScheduleLine.findMany({
    where: {
      period: run.period, status: 'DUE',
      loan: { organizationId: run.organizationId, status: 'ACTIVE', personId: { in: entries.map(e => e.personId) } },
    },
    include: { loan: { select: { id: true, personId: true } } },
    orderBy: [{ loanId: 'asc' }, { seq: 'asc' }],
  });

  const expected = new Map<string, number>();
  for (const l of lines) expected.set(l.loan.personId, r2((expected.get(l.loan.personId) || 0) + l.principal + l.interest));
  for (const e of entries) {
    if (Math.abs((expected.get(e.personId) || 0) - e.loanDeduction) > 0.005) {
      throw new AppError(400, 'Loan instalments have changed since this run was calculated. Recalculate the run, then finalize.');
    }
  }

  const date = todayIST();
  const balances = new Map<string, number>();
  for (const l of lines) {
    const entry = entryByPerson.get(l.loan.personId)!;
    const before = balances.has(l.loanId) ? balances.get(l.loanId)! : await outstandingOf(l.loanId);
    const after = r2(before - l.principal);
    balances.set(l.loanId, after);
    await prisma.loanTransaction.create({
      data: {
        organizationId: run.organizationId, loanId: l.loanId, date, period: run.period,
        type: 'INSTALMENT', principal: -l.principal, interest: l.interest, balanceAfter: after,
        entryId: entry.id, createdByName: userName, remarks: 'Deducted through payroll',
      },
    });
    await prisma.loanScheduleLine.update({ where: { id: l.id }, data: { status: 'PAID', entryId: entry.id } });
  }
  for (const [loanId, balance] of balances) {
    const remaining = await prisma.loanScheduleLine.count({ where: { loanId, status: 'DUE' } });
    if (remaining === 0 && balance <= 0.5) {
      await prisma.loan.update({ where: { id: loanId }, data: { status: 'CLOSED', closedOn: date } });
    }
  }
  return lines.length;
}

// On reopening a run: undo what postRunInstalments did. Refuses if a loan
// has moved on since (a prepayment, revision, ...), because the schedule
// in force was built on the balance this run left behind.
export async function reverseRunInstalments(run: { id: string; organizationId: string }) {
  const entryIds = (await prisma.payslipEntry.findMany({ where: { runId: run.id }, select: { id: true } })).map(e => e.id);
  const posted = await prisma.loanTransaction.findMany({
    where: { organizationId: run.organizationId, type: 'INSTALMENT', entryId: { in: entryIds } },
    include: { loan: { select: { loanNo: true } } },
  });
  if (posted.length === 0) return 0;
  for (const t of posted) {
    const later = await prisma.loanTransaction.findFirst({
      where: {
        loanId: t.loanId, createdAt: { gt: t.createdAt },
        OR: [{ entryId: null }, { entryId: { notIn: entryIds } }],
      },
    });
    if (later) {
      throw new AppError(400, `This run cannot be reopened: loan ${t.loan.loanNo} has had a payment or revision since the run was finalized, and its plan now depends on this month's instalment. Make the correction in the next month's payroll instead.`);
    }
  }
  const loanIds = [...new Set(posted.map(t => t.loanId))];
  await prisma.$transaction([
    prisma.loanTransaction.deleteMany({ where: { id: { in: posted.map(t => t.id) } } }),
    prisma.loanScheduleLine.updateMany({ where: { entryId: { in: entryIds }, status: 'PAID' }, data: { status: 'DUE', entryId: null } }),
    prisma.loan.updateMany({ where: { id: { in: loanIds } }, data: { status: 'ACTIVE', closedOn: null } }),
  ]);
  return posted.length;
}

// Principal the employee still owes once this payslip's instalments are
// taken: from the ledger for a finalized run, projected for a draft.
export async function loanBalanceAfter(
  organizationId: string, entry: { id: string; personId: string; loanDeduction: number }, period: string,
): Promise<number | null> {
  if (!entry.loanDeduction) return null;
  const posted = await prisma.loanTransaction.findMany({
    where: { organizationId, entryId: entry.id, type: 'INSTALMENT' }, orderBy: { createdAt: 'asc' },
  });
  if (posted.length) {
    const last = new Map<string, number>();
    for (const t of posted) last.set(t.loanId, t.balanceAfter);
    return r2([...last.values()].reduce((s, v) => s + v, 0));
  }
  const loans = await prisma.loan.findMany({
    where: { organizationId, personId: entry.personId, status: 'ACTIVE', schedule: { some: { period, status: 'DUE' } } },
    include: { transactions: { select: { principal: true } }, schedule: { where: { period, status: 'DUE' } } },
  });
  return r2(loans.reduce((s, l) =>
    s + outstandingPrincipal(l.transactions) - l.schedule.reduce((t, line) => t + line.principal, 0), 0));
}

// Instalments from earlier months that no payroll run picked up.
export async function overdueLoans(organizationId: string, personIds: string[], period: string) {
  const lines = await prisma.loanScheduleLine.findMany({
    where: {
      status: 'DUE', period: { lt: period },
      loan: { organizationId, status: 'ACTIVE', personId: { in: personIds } },
    },
    select: { period: true, loan: { select: { id: true, loanNo: true, personId: true } } },
    orderBy: { period: 'asc' },
  });
  const byLoan = new Map<string, { loanNo: string; personId: string; periods: string[] }>();
  for (const l of lines) {
    const row = byLoan.get(l.loan.id) || { loanNo: l.loan.loanNo, personId: l.loan.personId, periods: [] };
    row.periods.push(l.period);
    byLoan.set(l.loan.id, row);
  }
  return [...byLoan.values()];
}

const monthName = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

// Run-page warnings for instalments that earlier months missed.
export async function overdueLoanChecks(organizationId: string, entries: any[], period: string): Promise<RunCheck[]> {
  const entryByPerson = new Map(entries.map(e => [e.personId, e]));
  const overdue = await overdueLoans(organizationId, [...entryByPerson.keys()], period);
  return overdue.map(o => {
    const entry = entryByPerson.get(o.personId);
    return {
      entryId: entry.id, personName: entry.person?.name || '', code: 'LOAN_OVERDUE' as const,
      message: `Loan ${o.loanNo} has ${o.periods.length === 1 ? 'an instalment' : `${o.periods.length} instalments`} from ${o.periods.map(monthName).join(', ')} that no payroll deducted. Revise the loan to reschedule ${o.periods.length === 1 ? 'it' : 'them'}.`,
    };
  });
}

// Earliest month a change to a loan can affect in open payroll.
export const earliestOpenPeriod = (...periods: (string | undefined | null)[]) =>
  [...periods.filter(Boolean) as string[], currentPeriodIST()].sort()[0];
