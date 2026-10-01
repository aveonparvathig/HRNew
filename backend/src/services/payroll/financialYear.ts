// Indian financial year helpers (April → March). Periods are "YYYY-MM"
// strings, the same format PayrollRun.period uses. Pure, DB-independent.

export interface FinancialYear {
  startYear: number; // 2026 for FY 2026-27
  label: string;     // "2026-27"
  start: string;     // "2026-04"
  end: string;       // "2027-03"
}

const pad = (n: number) => String(n).padStart(2, '0');

function parsePeriod(period: string): [number, number] {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!m) throw new Error(`Invalid period "${period}" — expected YYYY-MM`);
  return [Number(m[1]), Number(m[2])];
}

export function financialYearFor(startYear: number): FinancialYear {
  return {
    startYear,
    label: `${startYear}-${pad((startYear + 1) % 100)}`,
    start: `${startYear}-04`,
    end: `${startYear + 1}-03`,
  };
}

export function financialYearOf(period: string): FinancialYear {
  const [y, m] = parsePeriod(period);
  return financialYearFor(m >= 4 ? y : y - 1);
}

// The 12 periods of a financial year, April first.
export function periodsOfFinancialYear(startYear: number): string[] {
  return Array.from({ length: 12 }, (_, i) => {
    const month = ((i + 3) % 12) + 1;
    return `${month >= 4 ? startYear : startYear + 1}-${pad(month)}`;
  });
}

// 1 for April … 12 for March.
export function monthIndexInFinancialYear(period: string): number {
  const [, m] = parsePeriod(period);
  return m >= 4 ? m - 3 : m + 9;
}

// Months left in the financial year, counting `period` itself
// (April → 12, March → 1).
export function monthsRemainingInFinancialYear(period: string): number {
  return 13 - monthIndexInFinancialYear(period);
}
