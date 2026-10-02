// TDS deposits and returns: quarters, challans and their allocation to
// employees, checks before filing, and the lines of Form 16 Part B.
// Pure, DB-independent.
import { financialYearOf } from './financialYear';
import { SectionTotal } from './declarationCalc';

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Quarters
// ---------------------------------------------------------------------------
export const QUARTERS = [
  { quarter: 1, label: 'Q1', months: 'April – June' },
  { quarter: 2, label: 'Q2', months: 'July – September' },
  { quarter: 3, label: 'Q3', months: 'October – December' },
  { quarter: 4, label: 'Q4', months: 'January – March' },
];

// The three "YYYY-MM" periods of a quarter of a financial year.
export function quarterPeriods(fyStart: number, quarter: number): string[] {
  const first = 4 + (quarter - 1) * 3; // 4, 7, 10, 13
  return [0, 1, 2].map(i => {
    const month = first + i;
    return month > 12 ? `${fyStart + 1}-${pad(month - 12)}` : `${fyStart}-${pad(month)}`;
  });
}

export function quarterOf(period: string): { fyStart: number; quarter: number } {
  const month = Number(period.slice(5, 7));
  return { fyStart: financialYearOf(period).startYear, quarter: month >= 4 ? Math.ceil((month - 3) / 3) : 4 };
}

// Last day of a "YYYY-MM" period.
export function monthEnd(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${period}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

// Tax deducted in a month is due by the 7th of the next month; tax
// deducted in March is due by 30 April.
export function depositDueDate(period: string): string {
  const [y, m] = period.split('-').map(Number);
  if (m === 3) return `${y}-04-30`;
  return m === 12 ? `${y + 1}-01-07` : `${y}-${pad(m + 1)}-07`;
}

// The return filed before a quarter's: the quarter before, or the last
// quarter of the year before.
export const previousQuarter = (fyStart: number, quarter: number) =>
  (quarter > 1 ? { fyStart, quarter: quarter - 1 } : { fyStart: fyStart - 1, quarter: 4 });

// The receipt (token) number the tax department gives a filed return
export const RECEIPT_FORMAT = /^\d{1,15}$/;

// An address as the return takes it, field by field, for the employer
// ("deductor") or the person responsible. Until the fields are filled, the
// single-line address kept before stands in.
export const ADDRESS_PARTS = ['Flat', 'Building', 'Street', 'Area', 'City', 'State', 'Pin'] as const;
export function returnAddress(profile: any, who: 'deductor' | 'responsible', fallback: string) {
  const part = (name: string) => String(profile?.[`${who}${name}`] || '').trim();
  const [flat, building, street, area, city, state, pin] = ADDRESS_PARTS.map(part);
  const filled = Boolean(flat || building || street || area || city || state || pin);
  return {
    flat, building, street, area, city, state, pin, filled,
    changed: Boolean(profile?.[`${who}AddressChanged`]),
    line: filled ? [flat, building, street, area, city, state, pin].filter(Boolean).join(', ') : String(fallback || '').trim(),
  };
}

// ---------------------------------------------------------------------------
// Challans
// ---------------------------------------------------------------------------
export interface ChallanLike {
  tds: number;
  surcharge: number;
  cess: number;
  interest: number;
  fee: number;
  others: number;
}

// What was paid to the bank in all.
export const challanTotal = (c: ChallanLike) =>
  r2(c.tds + c.surcharge + c.cess + c.interest + c.fee + c.others);
// The part that is tax of employees (interest, fee and others are the employer's own).
export const challanTax = (c: ChallanLike) => r2(c.tds + c.surcharge + c.cess);

export const BSR_FORMAT = /^\d{7}$/;
export const CHALLAN_SERIAL_FORMAT = /^\d{1,5}$/;

export interface TdsDue {
  entryId: string;
  personId: string;
  name: string;
  tds: number;        // deducted from the employee in the month
  deposited: number;  // already covered by other challans
}

// Spread a challan's tax over the month's employees, in name order, each
// up to what is still uncovered. What cannot be placed is left over.
export function allocateChallan(available: number, dues: TdsDue[]) {
  let left = r2(available);
  const allocations: { entryId: string; personId: string; amount: number }[] = [];
  for (const d of [...dues].sort((a, b) => a.name.localeCompare(b.name))) {
    if (left <= 0) break;
    const open = r2(d.tds - d.deposited);
    if (open <= 0) continue;
    const amount = Math.min(open, left);
    allocations.push({ entryId: d.entryId, personId: d.personId, amount: r2(amount) });
    left = r2(left - amount);
  }
  return { allocations, unallocated: left };
}

// ---------------------------------------------------------------------------
// Checks before a quarter is filed
// ---------------------------------------------------------------------------
export interface QuarterIssue {
  level: 'ERROR' | 'WARNING';
  message: string;
}

export interface QuarterCheckInput {
  deductor: { tanNumber?: string; panNumber?: string; responsibleName?: string; responsiblePan?: string };
  addressFilled?: boolean; // the employer's address is entered field by field
  months: { period: string; label: string; status: string | null; deducted: number; deposited: number }[]; // status null = no run
  challans: (ChallanLike & { period: string; bsrCode: string; challanSerial: string; depositedOn: string; allocated: number })[];
  noPan: string[]; // employees with tax deducted and no valid PAN
}

const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function quarterIssues(inp: QuarterCheckInput): QuarterIssue[] {
  const issues: QuarterIssue[] = [];
  const error = (message: string) => issues.push({ level: 'ERROR', message });
  const warn = (message: string) => issues.push({ level: 'WARNING', message });

  if (!/^[A-Z]{4}\d{5}[A-Z]$/.test(String(inp.deductor.tanNumber || '').trim().toUpperCase())) {
    error('The company TAN is missing or not in the form ABCD12345E. Add it in Payroll Settings → Statutory profile.');
  }
  if (!String(inp.deductor.responsibleName || '').trim()) {
    warn('The person responsible for deducting tax is not set in Payroll Settings → Statutory profile.');
  }
  if (inp.addressFilled === false) {
    warn('The employer’s address is not entered field by field (door no., street, town, state, PIN code), as the return asks for it. Add it in Company Settings → Signatories.');
  }
  for (const m of inp.months) {
    if (m.status === 'DRAFT') error(`${m.label} is still a draft run. Finalize it before filing.`);
    const gap = r2(m.deducted - m.deposited);
    if (gap > 0.5) error(`${m.label}: ${inr(m.deducted)} deducted but ${inr(m.deposited)} deposited. ${inr(gap)} has no challan.`);
  }
  for (const c of inp.challans) {
    const name = `Challan ${c.challanSerial || '?'} of ${c.depositedOn}`;
    if (!BSR_FORMAT.test(c.bsrCode)) error(`${name}: the BSR code must be 7 digits.`);
    if (!CHALLAN_SERIAL_FORMAT.test(c.challanSerial)) error(`${name}: the challan serial number must be up to 5 digits.`);
    const free = r2(challanTax(c) - c.allocated);
    if (free > 0.5) warn(`${name}: ${inr(free)} is not matched to any employee's TDS.`);
    if (c.depositedOn > depositDueDate(c.period)) {
      warn(`${name}: deposited after the due date (${depositDueDate(c.period)}). Interest may be payable.`);
    }
  }
  if (inp.noPan.length) {
    warn(`Tax was deducted from ${inp.noPan.length} employee${inp.noPan.length === 1 ? '' : 's'} with no valid PAN: ${inp.noPan.join(', ')}. They are reported as PANNOTAVBL.`);
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Form 16 Part B
// ---------------------------------------------------------------------------
export interface Chapter6Row {
  key: string;        // a…k as on the form
  label: string;
  gross: number;      // amount claimed
  deductible: number; // amount allowed
}

// Chapter VI-A as Form 16 lays it out. PF counts under section 80C; 80C,
// 80CCC and 80CCD(1) share one limit, which the tax computation applied.
export function chapter6Rows(
  bySection: SectionTotal[], usePoi: boolean, pf: number, pool: number, allowsDeductions: boolean,
): Chapter6Row[] {
  const claimed = (s?: SectionTotal) => (s ? (usePoi ? s.approved : s.declared) : 0);
  const find = (code: string) => bySection.find(s => s.section.toUpperCase() === code);
  const row = (key: string, label: string, code: string): Chapter6Row => {
    const s = find(code);
    return { key, label, gross: claimed(s), deductible: allowsDeductions ? s?.allowed || 0 : 0 };
  };
  const c80 = find('80C');
  const a: Chapter6Row = {
    key: 'a', label: 'Life insurance, provident fund and the like — section 80C',
    gross: r2(pf + claimed(c80)), deductible: 0,
  };
  const b = row('b', 'Contribution to pension funds — section 80CCC', '80CCC');
  const c = row('c', 'Employee contribution to a pension scheme — section 80CCD(1)', '80CCD(1)');
  // Inside the pool, each row shows what it could give; the total row carries the limit
  a.deductible = allowsDeductions ? Math.min(pool, a.gross) : 0;
  const d: Chapter6Row = {
    key: 'd', label: 'Total under sections 80C, 80CCC and 80CCD(1)',
    gross: r2(a.gross + b.gross + c.gross), deductible: allowsDeductions ? pool : 0,
  };
  const named = new Set(['80C', '80CCC', '80CCD(1)', '80CCD(1B)', '80CCD(2)', '80D', '80E', '80G', '80TTA']);
  const rest = bySection.filter(s => !named.has(s.section.toUpperCase()));
  const k: Chapter6Row = {
    key: 'k',
    label: `Other sections${rest.length ? ` (${rest.map(s => s.section).join(', ')})` : ''}`,
    gross: r2(rest.reduce((t, s) => t + claimed(s), 0)),
    deductible: allowsDeductions ? r2(rest.reduce((t, s) => t + s.allowed, 0)) : 0,
  };
  return [
    a, b, c, d,
    row('e', 'Notified pension scheme — section 80CCD(1B)', '80CCD(1B)'),
    row('f', 'Employer contribution to a pension scheme — section 80CCD(2)', '80CCD(2)'),
    row('g', 'Health insurance premium — section 80D', '80D'),
    row('h', 'Interest on loan for higher education — section 80E', '80E'),
    row('i', 'Donations — section 80G', '80G'),
    row('j', 'Interest on savings account — section 80TTA', '80TTA'),
    k,
  ];
}

export interface Form16Input {
  working: any;            // yearEndTax result
  bySection: SectionTotal[];
  usePoi: boolean;
  allowsDeductions: boolean;
}

// The numbered lines of Form 16 Part B (and the annual salary detail of
// the last quarter's return), from a year-end tax working.
export function form16PartB(inp: Form16Input) {
  const w = inp.working;
  const salary171 = r2(w.salaryPaid);
  const perquisites = r2(w.income.perquisites || 0);
  const grossCurrent = r2(salary171 + perquisites);
  const otherEmployers = r2(w.income.previousEmployer || 0);
  const hra = r2(w.exemptions.hra || 0);
  const allowances: { name: string; amount: number }[] = w.exemptions.allowances || [];
  const exemptTotal = r2(hra + allowances.reduce((s, a) => s + a.amount, 0));
  const fromCurrent = r2(grossCurrent - exemptTotal);
  const standard = r2(w.deductions.standard || 0);
  const professionalTax = r2(w.deductions.professionalTax || 0);
  const section16 = r2(standard + professionalTax);
  const chargeable = r2(w.incomeFromSalary);
  // A working kept before let-out property was known has only the interest
  const houseProperty = r2(w.houseProperty ?? -(w.housingLoanInterest || 0));
  const otherSources = r2(w.otherIncome || 0);
  const rows = chapter6Rows(inp.bySection, inp.usePoi, w.chapter6.pf, w.chapter6.section80C, inp.allowsDeductions);
  const taxPayable = r2(w.tax.taxOnIncome - w.tax.rebate + w.tax.surcharge + w.tax.cess);
  return {
    newRegime: w.regime === 'NEW',
    gross: { salary171, perquisites, profitsInLieu: 0, total: grossCurrent, otherEmployers },
    exempt: { hra, allowances, total: exemptTotal },
    fromCurrent,
    section16: { standard, entertainment: 0, professionalTax, total: section16 },
    chargeable,
    other: { houseProperty, otherSources, total: r2(houseProperty + otherSources) },
    grossTotalIncome: r2(w.grossTotalIncome),
    chapter6: { rows, total: r2(w.chapter6.total) },
    taxableIncome: r2(w.taxableIncome),
    tax: {
      onIncome: r2(w.tax.taxOnIncome), rebate: r2(w.tax.rebate), surcharge: r2(w.tax.surcharge), cess: r2(w.tax.cess),
      payable: taxPayable, relief89: 0,
      // With no valid PAN the higher rate applies, so the total can exceed the lines above
      net: r2(w.tax.total), higherRateForPan: Boolean(w.tax.higherRateForPan),
    },
    deducted: {
      current: r2(w.paid.payroll), otherEmployers: r2(w.paid.previousEmployer),
      elsewhere: r2(w.paid.elsewhere || 0), total: r2(w.paid.total),
    },
    balance: r2(w.balance),
  };
}
