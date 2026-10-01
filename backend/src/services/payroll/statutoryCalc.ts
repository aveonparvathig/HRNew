// State-wise statutory rules — Professional Tax, Labour Welfare Fund, ESI
// contribution periods and the employer-side PF split. Pure, DB-independent.

const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, '0');

// ---------------------------------------------------------------------------
// Half-years: April–September and October–March. Professional Tax in
// half-yearly states and ESI contribution periods both run on them.
// ---------------------------------------------------------------------------
export interface HalfYear {
  label: string;     // "Apr–Sep 2026" | "Oct 2026–Mar 2027"
  periods: string[]; // six "YYYY-MM" values in order
}

export function halfYearOf(period: string): HalfYear {
  const [y, m] = period.split('-').map(Number);
  if (m >= 4 && m <= 9) {
    return { label: `Apr–Sep ${y}`, periods: [4, 5, 6, 7, 8, 9].map(mm => `${y}-${pad(mm)}`) };
  }
  const startYear = m >= 10 ? y : y - 1;
  return {
    label: `Oct ${startYear}–Mar ${startYear + 1}`,
    periods: [`${startYear}-10`, `${startYear}-11`, `${startYear}-12`,
      `${startYear + 1}-01`, `${startYear + 1}-02`, `${startYear + 1}-03`],
  };
}

const monthOf = (period: string) => Number(period.split('-')[1]);

export const parseMonths = (csv: string): number[] =>
  String(csv || '').split(',').map(v => Number(v.trim())).filter(v => v >= 1 && v <= 12);

// ---------------------------------------------------------------------------
// Professional Tax
// ---------------------------------------------------------------------------
export interface PtSlabLike {
  incomeFrom: number;
  incomeTo: number | null;
  amount: number;
}

export interface PtPolicyLike {
  frequency: string;       // MONTHLY | HALF_YEARLY
  deductionMode: string;   // SPREAD | LUMP_SUM
  deductionMonths: string; // LUMP_SUM month numbers
  slabs: PtSlabLike[];
}

export function slabAmount(slabs: PtSlabLike[], income: number): number {
  const slab = slabs.find(s => income >= s.incomeFrom && (s.incomeTo == null || income <= s.incomeTo));
  return slab ? slab.amount : 0;
}

export interface PriorMonth {
  period: string;
  grossSalary: number;
  professionalTax: number;
}

// Professional Tax to deduct this month.
//
// MONTHLY: the slab for this month's gross.
//
// HALF_YEARLY: the half-year's income is what has been paid so far in the
// half plus this month's gross projected over the months that remain. The
// slab for that income, less what earlier months already deducted, is then
// either spread evenly over the remaining months or taken whole in a
// listed lump-sum month. Projecting forward means a mid-half raise or a
// one-off bonus corrects itself in the months that follow.
export function professionalTaxForMonth(
  policy: PtPolicyLike, period: string, grossSalary: number, prior: PriorMonth[],
): number {
  if (grossSalary <= 0) return 0;
  if (policy.frequency === 'MONTHLY') return slabAmount(policy.slabs, grossSalary);

  const half = halfYearOf(period);
  const index = half.periods.indexOf(period);
  const remaining = 6 - index; // months left in the half, this one included
  const earlier = prior.filter(p => half.periods.indexOf(p.period) >= 0 && p.period < period);
  const projected = earlier.reduce((s, p) => s + p.grossSalary, 0) + grossSalary * remaining;
  const balance = slabAmount(policy.slabs, projected) - earlier.reduce((s, p) => s + p.professionalTax, 0);
  if (balance <= 0) return 0;

  if (policy.deductionMode === 'LUMP_SUM') {
    const months = parseMonths(policy.deductionMonths);
    // No month configured falls back to the last month of the half
    const due = months.length ? months.includes(monthOf(period)) : remaining === 1;
    return due ? r2(balance) : 0;
  }
  return r0(balance / remaining);
}

// ---------------------------------------------------------------------------
// Labour Welfare Fund
// ---------------------------------------------------------------------------
export interface LwfPolicyLike {
  employeeAmount: number;
  employerAmount: number;
  deductionMonths: string;
}

export function lwfForMonth(policy: LwfPolicyLike, period: string) {
  const due = parseMonths(policy.deductionMonths).includes(monthOf(period));
  return {
    lwfEmployee: due ? policy.employeeAmount : 0,
    lwfEmployer: due ? policy.employerAmount : 0,
  };
}

// The policy in force for a period: the latest one effective on or before it.
export function policyInForce<T extends { state: string; effectiveFrom: string }>(
  policies: T[], state: string, period: string,
): T | undefined {
  return policies
    .filter(p => p.state === state && p.effectiveFrom <= period)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

// ---------------------------------------------------------------------------
// ESI coverage
// ---------------------------------------------------------------------------
// Covered when the full-month wage is within the ceiling, or when already
// covered earlier in the same contribution period: coverage, once begun,
// runs to the end of the period even if a raise crosses the ceiling.
export function esiCovered(fullMonthWage: number, ceiling: number, coveredEarlierThisPeriod: boolean): boolean {
  if (fullMonthWage <= 0) return false;
  return fullMonthWage <= ceiling || coveredEarlierThisPeriod;
}

// ---------------------------------------------------------------------------
// Provident Fund — employer-side split and charges for the monthly return
// ---------------------------------------------------------------------------
export interface PfBreakup {
  epfWage: number;
  epsWage: number;
  edliWage: number;
  epfEmployee: number;  // employee share, account 1
  epsEmployer: number;  // pension, account 10
  epfEmployer: number;  // employer share less pension, account 1
  edli: number;         // insurance, account 21
}

// The PF return works in whole rupees. An entry from before pfWage was
// stored derives it from the employee contribution.
export function pfBreakup(entry: { pfWage?: number; pfEmployee: number; pfEmployer: number }, settings: any): PfBreakup {
  const epfEmployee = r0(entry.pfEmployee);
  if (epfEmployee <= 0) {
    return { epfWage: 0, epsWage: 0, edliWage: 0, epfEmployee: 0, epsEmployer: 0, epfEmployer: 0, edli: 0 };
  }
  const epfWage = r0(entry.pfWage || (entry.pfEmployee * 100) / (settings.pfEmployeePercent || 12));
  const epsWage = Math.min(epfWage, settings.epsWageCap ?? 15000);
  const edliWage = Math.min(epfWage, settings.edliWageCap ?? 15000);
  const employerTotal = r0(entry.pfEmployer);
  const epsEmployer = Math.min(r0(epsWage * (settings.epsPercent ?? 8.33) / 100), employerTotal);
  return {
    epfWage, epsWage, edliWage, epfEmployee,
    epsEmployer,
    epfEmployer: employerTotal - epsEmployer,
    edli: r0(edliWage * (settings.edliPercent ?? 0.5) / 100),
  };
}

// Administration charge on the establishment's total PF wages, subject to
// the monthly minimum.
export function pfAdminCharge(totalEpfWage: number, settings: any): number {
  if (totalEpfWage <= 0) return 0;
  return Math.max(r0(totalEpfWage * (settings.pfAdminPercent ?? 0.5) / 100), settings.pfAdminMinimum ?? 500);
}
