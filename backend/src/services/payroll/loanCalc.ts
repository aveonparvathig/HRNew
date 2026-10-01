// Loan arithmetic: repayment schedules, outstanding principal and the
// taxable perquisite on concessional loans. Pure, DB-independent.
// Instalments are whole rupees; the last one absorbs the rounding.

export type LoanType = 'FLAT' | 'REDUCING' | 'REDUCING_EMI';
export const LOAN_TYPES: { value: LoanType; label: string; hint: string }[] = [
  { value: 'FLAT', label: 'Flat interest', hint: 'Interest on the full amount for the whole term. Equal instalments.' },
  { value: 'REDUCING', label: 'Reducing balance', hint: 'Equal principal each month; interest on what is still owed, so instalments fall.' },
  { value: 'REDUCING_EMI', label: 'Reducing balance — equal instalments (EMI)', hint: 'Interest on what is still owed, with the same instalment every month.' },
];

const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

// "2026-11" + 3 → "2027-02"
export function addMonths(period: string, count: number): string {
  const [y, m] = period.split('-').map(Number);
  const index = y * 12 + (m - 1) + count;
  return `${Math.floor(index / 12)}-${pad((index % 12) + 1)}`;
}

export interface ScheduleLine {
  seq: number;
  period: string;
  principal: number;
  interest: number;
}

export interface ScheduleTerms {
  type: string;
  principal: number;    // amount to recover
  annualRate: number;   // % a year; 0 for an interest-free advance
  instalments: number;
  startPeriod: string;  // month of the first instalment
  firstSeq?: number;
}

// The month-by-month repayment plan. Whatever the type, the principal
// portions add up to exactly the amount to recover.
export function buildSchedule(terms: ScheduleTerms): ScheduleLine[] {
  const { type, principal, annualRate, instalments, startPeriod } = terms;
  const firstSeq = terms.firstSeq ?? 1;
  if (!(principal > 0) || !(instalments >= 1)) return [];
  const monthly = annualRate / 1200;
  const lines: ScheduleLine[] = [];
  let outstanding = principal;

  // Equated instalment for the EMI type (with no interest it is just P / n)
  const factor = monthly > 0 ? Math.pow(1 + monthly, instalments) : 0;
  const emi = monthly > 0 ? r0((principal * monthly * factor) / (factor - 1)) : 0;
  const equalPrincipal = r0(principal / instalments);
  const flatInterest = r0(principal * monthly);

  for (let i = 0; i < instalments; i++) {
    const last = i === instalments - 1;
    let interest: number;
    let portion: number;
    if (type === 'REDUCING_EMI' && monthly > 0) {
      interest = r0(outstanding * monthly);
      portion = last ? outstanding : Math.min(outstanding, emi - interest);
    } else {
      interest = type === 'FLAT' ? flatInterest : r0(outstanding * monthly);
      portion = last ? outstanding : Math.min(outstanding, equalPrincipal);
    }
    portion = r2(portion);
    lines.push({ seq: firstSeq + i, period: addMonths(startPeriod, i), principal: portion, interest });
    outstanding = r2(outstanding - portion);
  }
  return lines;
}

export const instalmentOf = (line: { principal: number; interest: number }) => r2(line.principal + line.interest);

// Principal still owed: transactions carry signed principal movements
// (+ lent, − repaid).
export function outstandingPrincipal(transactions: { principal: number }[]): number {
  return r2(transactions.reduce((s, t) => s + t.principal, 0));
}

// Taxable value, for one month, of a loan charged below the benchmark rate.
export function loanPerquisiteForMonth(outstanding: number, loanRate: number, benchmarkRate: number): number {
  if (outstanding <= 0 || benchmarkRate <= loanRate) return 0;
  return r0((outstanding * (benchmarkRate - loanRate)) / 1200);
}

// The perquisite applies only when everything lent to the employee
// exceeds the exemption limit.
export const perquisiteApplies = (totalLent: number, exemptLimit: number) => totalLent > exemptLimit;
