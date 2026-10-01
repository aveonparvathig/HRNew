// Salary structure and revision rules. Pure, DB-independent.
import { computeEntry } from '../payrollCalc';

export interface RevisionLike {
  effectiveFrom: string; // "YYYY-MM-DD"
  oldMonthlyPackage: number;
  newMonthlyPackage: number;
  createdAt?: Date | string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function sortRevisions<T extends RevisionLike>(revisions: T[]): T[] {
  return [...revisions].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom)
    || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
}

// Monthly package that applies to a payroll period ("YYYY-MM"). A revision
// applies from its effective month onward. Without recorded revisions the
// employee's current package applies; before the first recorded revision,
// that revision's old package does.
export function packageForPeriod(currentPackage: number, revisions: RevisionLike[], period: string): number {
  if (revisions.length === 0) return currentPackage;
  const sorted = sortRevisions(revisions);
  const effective = sorted.filter(r => r.effectiveFrom.slice(0, 7) <= period);
  return effective.length
    ? effective[effective.length - 1].newMonthlyPackage
    : sorted[0].oldMonthlyPackage;
}

// Current payroll month in India time, as "YYYY-MM".
export function currentPeriodIST(now: Date = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 7);
}

export interface PackageChange {
  period: string;
  oldMonthlyPackage: number;
  newMonthlyPackage: number;
}

// Package changes visible in one employee's payslip history: every run
// whose package snapshot differs from the previous run's.
export function packageChangesFromEntries(entries: { period: string; monthlyPackage: number }[]): PackageChange[] {
  const sorted = [...entries].sort((a, b) => a.period.localeCompare(b.period));
  const changes: PackageChange[] = [];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].monthlyPackage !== sorted[i - 1].monthlyPackage) {
      changes.push({
        period: sorted[i].period,
        oldMonthlyPackage: sorted[i - 1].monthlyPackage,
        newMonthlyPackage: sorted[i].monthlyPackage,
      });
    }
  }
  return changes;
}

// Full-month salary structure for a package: every fixed component with no
// loss of pay, monthly and annual.
export function salaryStructure(
  monthlyPackage: number,
  flags: { isEsiEligible?: boolean; isPfApplicable?: boolean },
  settings: any,
) {
  // One working day, fully paid: the split is independent of month length.
  const monthly = computeEntry({
    monthlyPackage, totalWorkingDays: 1,
    isEsiEligible: flags.isEsiEligible, isPfApplicable: flags.isPfApplicable,
  }, settings);
  const keys = ['basic', 'da', 'hra', 'transportAllowance', 'foodAllowance', 'grossSalary',
    'esiEmployee', 'pfEmployee', 'totalDeductions', 'netPayable',
    'esiEmployer', 'pfEmployer', 'employerContributions', 'ctc'] as const;
  const annual: Record<string, number> = {};
  for (const k of keys) annual[k] = r2(monthly[k] * 12);
  return { monthly, annual };
}
