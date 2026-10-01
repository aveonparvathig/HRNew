// Run-level sanity checks and the manual-override listing. Pure,
// DB-independent: callers pass the entries, settings and employee records.
import { computeEntry } from '../payrollCalc';

export interface RunCheck {
  entryId: string;
  personName: string;
  code: 'ESI_ABOVE_CEILING' | 'ESI_NOT_APPLIED' | 'NO_WORK_LOCATION';
  message: string;
}

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// ESI coverage is decided on the full month's wage, not the LOP-reduced one.
export function fullMonthEsiWage(entry: any, settings: any): number {
  const full = computeEntry({
    monthlyPackage: entry.monthlyPackage,
    totalWorkingDays: entry.totalWorkingDays || 1,
  }, settings);
  return full.basic + full.da + full.hra + full.transportAllowance + full.foodAllowance;
}

// Compares each entry's ESI flag with the wage ceiling. The flag stays the
// source of truth for the calculation: an employee covered at the start of a
// contribution period (Apr–Sep / Oct–Mar) remains covered until it ends even
// after crossing the ceiling, so these are warnings, never auto-corrections.
// `orgUsesEsi` suppresses the "not applied" warning for organisations that
// are not registered for ESI at all.
// `stillCovered` holds employees already covered earlier in this
// contribution period: for them a wage above the ceiling is correct.
export function esiCeilingChecks(
  entries: any[], settings: any, orgUsesEsi: boolean, stillCovered: Set<string> = new Set(),
): RunCheck[] {
  const ceiling = Number(settings.esiWageCeiling || 0);
  if (!ceiling) return [];
  const checks: RunCheck[] = [];
  for (const e of entries) {
    const wage = fullMonthEsiWage(e, settings);
    const personName = e.person?.name || '';
    if (e.isEsiEligible && wage > ceiling && stillCovered.has(e.personId)) continue;
    if (e.isEsiEligible && wage > ceiling) {
      checks.push({
        entryId: e.id, personName, code: 'ESI_ABOVE_CEILING',
        message: `ESI is deducted but the monthly wage ${inr(wage)} is above the ${inr(ceiling)} ceiling. `
          + 'Keep it only if they were covered when the contribution period (Apr–Sep / Oct–Mar) began.',
      });
    } else if (!e.isEsiEligible && orgUsesEsi && wage > 0 && wage <= ceiling) {
      checks.push({
        entryId: e.id, personName, code: 'ESI_NOT_APPLIED',
        message: `Monthly wage ${inr(wage)} is within the ${inr(ceiling)} ESI ceiling but ESI is not applied.`,
      });
    }
  }
  return checks;
}

// Professional Tax and Labour Welfare Fund follow the state of the
// employee's work location; without one they cannot be applied.
export function locationChecks(entries: any[], orgHasStatePolicies: boolean): RunCheck[] {
  if (!orgHasStatePolicies) return [];
  return entries
    .filter(e => !e.person?.workLocation)
    .map(e => ({
      entryId: e.id, personName: e.person?.name || '', code: 'NO_WORK_LOCATION' as const,
      message: 'No work location is set, so Professional Tax and Labour Welfare Fund are not applied.',
    }));
}

export interface OverrideItem {
  label: string;
  value: string;
  note?: string;
}

// Everything on an entry that was typed by hand or differs from the
// defaults: one-off amounts, non-standard working days, and a package or
// statutory flag that differs from the employee record as it stands today.
export function entryOverrides(entry: any, person: any, standardWorkingDays: number): OverrideItem[] {
  const items: OverrideItem[] = [];
  if (entry.totalWorkingDays !== standardWorkingDays) {
    items.push({ label: 'Working days', value: String(entry.totalWorkingDays), note: `run standard is ${standardWorkingDays}` });
  }
  const amounts: [string, string][] = [
    ['internetAllowance', 'Internet allowance'],
    ['salaryArrearAllowance', 'Salary arrear'],
    ['salaryAdvance', 'Salary advance'],
    ['tds', 'TDS'],
  ];
  for (const [field, label] of amounts) {
    if (Number(entry[field] || 0) !== 0) items.push({ label, value: inr(entry[field]) });
  }
  if (entry.ptOverridden) {
    items.push({ label: 'Professional Tax', value: inr(entry.professionalTax), note: 'entered by hand' });
  }
  for (const line of entry.lines || []) {
    items.push({ label: line.name, value: inr(line.amount), note: line.remarks || undefined });
  }
  if (person) {
    if (Number(entry.monthlyPackage) !== Number(person.currentMonthlyPackage || 0)) {
      items.push({
        label: 'Monthly package', value: inr(entry.monthlyPackage),
        note: `employee record now shows ${inr(person.currentMonthlyPackage || 0)}`,
      });
    }
    if (Boolean(entry.isPfApplicable) !== Boolean(person.isPfApplicable)) {
      items.push({
        label: 'PF applicable', value: entry.isPfApplicable ? 'Yes' : 'No',
        note: `employee record now shows ${person.isPfApplicable ? 'Yes' : 'No'}`,
      });
    }
    if (Boolean(entry.isEsiEligible) !== Boolean(person.isEsiEligible)) {
      items.push({
        label: 'ESI eligible', value: entry.isEsiEligible ? 'Yes' : 'No',
        note: `employee record now shows ${person.isEsiEligible ? 'Yes' : 'No'}`,
      });
    }
  }
  return items;
}

// Most common working-days value across a run's entries.
export function standardWorkingDays(entries: any[]): number {
  const counts = new Map<number, number>();
  for (const e of entries) counts.set(e.totalWorkingDays, (counts.get(e.totalWorkingDays) || 0) + 1);
  let best = 0, bestCount = 0;
  for (const [days, count] of counts) {
    if (count > bestCount || (count === bestCount && days > best)) { best = days; bestCount = count; }
  }
  return best;
}
