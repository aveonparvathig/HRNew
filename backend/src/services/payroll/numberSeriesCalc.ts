// Running numbers: how employee codes, letter references, settlement and
// payment-batch numbers are written. Pure, DB-independent.

export interface SeriesLike {
  prefix: string;
  suffix: string;
  padding: number;
  nextNumber: number;
}

export const SERIES = [
  { key: 'EMPLOYEE_CODE', label: 'Employee codes', hint: 'Offered on the form when a new employee is added.' },
  { key: 'LETTER', label: 'Letter references', hint: 'Fills the reference number of offer, appointment and experience letters.' },
  { key: 'SETTLEMENT', label: 'Final settlements', hint: 'Printed on the settlement statement.' },
  { key: 'PAYOUT_BATCH', label: 'Payment batches', hint: 'Printed on the bank advice and the payout screen.' },
] as const;
export const isSeriesKey = (key: any) => SERIES.some(s => s.key === key);

// Employee codes have always been EMP-0001, EMP-0002…; until a series is
// saved, that stays.
export const DEFAULT_EMPLOYEE_SERIES = { prefix: 'EMP-', suffix: '', padding: 4 };

const pad = (n: number) => String(n).padStart(2, '0');

// {YYYY} is the calendar year and {FY} the financial year ("2026-27") of
// the day the number is taken.
function fill(text: string, today: string): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const fyStart = month >= 4 ? year : year - 1;
  return text.replace(/\{YYYY\}/g, String(year)).replace(/\{FY\}/g, `${fyStart}-${pad((fyStart + 1) % 100)}`);
}

export function formatNumber(series: Pick<SeriesLike, 'prefix' | 'suffix' | 'padding'>, n: number, today: string): string {
  return `${fill(series.prefix || '', today)}${String(n).padStart(Math.max(1, series.padding || 1), '0')}${fill(series.suffix || '', today)}`;
}

// A series as typed, checked. Returns what is wrong, or the series.
export function seriesInput(raw: any): string | SeriesLike {
  const prefix = String(raw?.prefix ?? '').trim();
  const suffix = String(raw?.suffix ?? '').trim();
  const padding = Number(raw?.padding);
  const nextNumber = Number(raw?.nextNumber);
  if (prefix.length > 30 || suffix.length > 30) return 'Keep the text before and after the number under 30 characters';
  if (/[<>"'\\]/.test(prefix + suffix)) return 'The text around the number cannot contain quotes, angle brackets or backslashes';
  if (!Number.isInteger(padding) || padding < 1 || padding > 10) return 'The number of digits must be between 1 and 10';
  if (!Number.isInteger(nextNumber) || nextNumber < 1 || nextNumber > 999999999) return 'The next number must be 1 or more';
  return { prefix, suffix, padding, nextNumber };
}

// The first number from `from` whose formatted form is not already used.
export function firstFree(series: Pick<SeriesLike, 'prefix' | 'suffix' | 'padding'>, from: number, today: string, used: Set<string>) {
  let n = Math.max(1, from);
  while (used.has(formatNumber(series, n, today).toLowerCase())) n++;
  return { number: n, text: formatNumber(series, n, today) };
}
