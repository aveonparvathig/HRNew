// Components paid or deducted every month for an employee: which months
// they cover, what goes on a payslip, and what the months to come will
// carry. Pure, DB-independent.

const r2 = (n: number) => Math.round(n * 100) / 100;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface RecurringLike {
  id?: string;
  componentId: string;
  name: string;
  type: string;       // EARNING | DEDUCTION
  amount: number;     // for a full month
  fromPeriod: string; // "YYYY-MM"
  toPeriod: string;   // "" = until changed
  prorate: boolean;   // reduce for loss-of-pay days
}

export const coversPeriod = (item: { fromPeriod: string; toPeriod: string }, period: string) =>
  item.fromPeriod <= period && (!item.toPeriod || period <= item.toPeriod);

// What one item pays in a month with these days.
export function recurringAmount(item: RecurringLike, days: { totalWorkingDays?: number; lopDays?: number }): number {
  if (!item.prorate) return r2(item.amount);
  const total = Number(days.totalWorkingDays || 0);
  if (!total) return 0;
  const paid = Math.max(0, total - Number(days.lopDays || 0));
  return r2(item.amount * paid / total);
}

export interface RecurringLine {
  componentId: string;
  name: string;
  type: string;
  amount: number;
  source: 'RECURRING';
}

// The recurring lines of a payslip. A component typed on the payslip by
// hand, or written by arrears or a settlement, keeps its line: the
// recurring amount is then left off that payslip.
export function recurringLines(
  items: RecurringLike[], period: string, days: { totalWorkingDays?: number; lopDays?: number }, taken: Set<string> = new Set(),
): RecurringLine[] {
  const lines: RecurringLine[] = [];
  for (const item of items) {
    if (!coversPeriod(item, period) || taken.has(item.componentId)) continue;
    const amount = recurringAmount(item, days);
    if (amount <= 0) continue;
    const existing = lines.find(l => l.componentId === item.componentId);
    if (existing) existing.amount = r2(existing.amount + amount);
    else lines.push({ componentId: item.componentId, name: item.name, type: item.type, amount, source: 'RECURRING' });
  }
  return lines;
}

// What each of the months to come will carry, for the tax projection:
// taxable earnings in all, and every earning by its component key.
export function recurringLater(items: RecurringLike[], periods: string[], nonTaxable: Set<string> = new Set()) {
  return periods.map(period => {
    const components: Record<string, number> = {};
    let taxable = 0;
    for (const item of items) {
      if (item.type === 'DEDUCTION' || !coversPeriod(item, period)) continue;
      const key = `c:${item.componentId}`;
      components[key] = r2((components[key] || 0) + item.amount);
      if (!nonTaxable.has(item.componentId)) taxable = r2(taxable + item.amount);
    }
    return { period, taxable, components };
  });
}

// A recurring item as typed, checked against the employee's other items.
// Returns what is wrong, or null.
export function recurringProblem(
  item: { componentId: string; amount: number; fromPeriod: string; toPeriod: string; id?: string },
  others: { id?: string; componentId: string; fromPeriod: string; toPeriod: string }[],
): string | null {
  if (!item.componentId) return 'Pick a pay component';
  if (!isFinite(item.amount) || item.amount <= 0) return 'Enter the monthly amount';
  if (!PERIOD.test(item.fromPeriod)) return 'Pick the month it starts from';
  if (item.toPeriod && !PERIOD.test(item.toPeriod)) return 'Pick a valid last month, or leave it blank';
  if (item.toPeriod && item.toPeriod < item.fromPeriod) return 'The last month cannot be before the first';
  const end = (x: { toPeriod: string }) => x.toPeriod || '9999-12';
  const clash = others.find(o => o.id !== item.id && o.componentId === item.componentId
    && o.fromPeriod <= end(item) && item.fromPeriod <= end(o));
  if (clash) return 'This component is already set for some of those months. End the earlier one first, or change it.';
  return null;
}
