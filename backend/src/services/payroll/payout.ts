// Run workflow and payout pieces that need the database: pre-payroll
// checks for a run, and expense claims paid with a month's salary.
import { prisma } from '../../config/database';
import { hasValidPan } from './taxCalc';
import { prePayrollChecks, PayrollCheck } from './payoutCalc';

const r2 = (n: number) => Math.round(n * 100) / 100;

// Checks to look at before a draft run is locked: bank details, PAN,
// negative pay, joiners and leavers, and who is left out.
export async function prePayrollChecksFor(organizationId: string, run: any, tdsComputed: boolean): Promise<PayrollCheck[]> {
  const [entries, people] = await Promise.all([
    prisma.payslipEntry.findMany({
      where: { runId: run.id },
      include: { person: { select: {
        name: true, paymentMode: true, bankAccountNumber: true, ifscCode: true, panNumber: true,
        joinDate: true, leavingDate: true,
      } } },
    }),
    prisma.person.findMany({
      where: {
        organizationId, kind: 'CANDIDATE', isEmployee: true,
        employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] },
      },
      select: { id: true, name: true, salaryStopped: true, salaryStopReason: true },
      orderBy: { name: 'asc' },
    }),
  ]);
  const inRun = new Set(entries.map(e => e.personId));
  return prePayrollChecks({
    period: run.period,
    entries: [...entries].sort((a, b) => a.person.name.localeCompare(b.person.name)),
    missing: people.filter(p => !p.salaryStopped && !inRun.has(p.id)),
    stopped: people.filter(p => p.salaryStopped && !inRun.has(p.id)),
    tdsComputed,
    validPan: hasValidPan,
  });
}

// ---- Expense claims paid with salary -----------------------------------------
export const claimTotal = (report: { lines: { amount: number }[] }) =>
  r2(report.lines.reduce((s, l) => s + Number(l.amount || 0), 0));

// Re-total an entry's reimbursement from the claims attached to it.
export async function syncReimbursement(entryId: string): Promise<number> {
  const reports = await prisma.expenseReport.findMany({
    where: { payrollEntryId: entryId },
    include: { lines: { select: { amount: true } } },
  });
  const reimbursement = r2(reports.reduce((s, r) => s + claimTotal(r), 0));
  await prisma.payslipEntry.update({ where: { id: entryId }, data: { reimbursement } });
  return reimbursement;
}

// Finalizing a run settles the claims attached to it; reopening the run
// puts them back to approved.
export async function setRunClaimStatus(runId: string, status: 'REIMBURSED' | 'APPROVED') {
  await prisma.expenseReport.updateMany({
    where: { payrollEntry: { runId } },
    data: { status },
  });
}

// Claims on an entry, for the payslip.
export async function claimsOfEntry(entryId: string) {
  const reports = await prisma.expenseReport.findMany({
    where: { payrollEntryId: entryId },
    include: { lines: { select: { amount: true } } },
    orderBy: { reportNumber: 'asc' },
  });
  return reports.map(r => ({ reportNumber: r.reportNumber, title: r.title, amount: claimTotal(r) }));
}
