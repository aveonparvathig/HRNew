// Income tax on salary (TDS). Pure, DB-independent: every rate, limit and
// slab arrives in a regime config, so a Budget changes data, not code.
import { computeEntry } from '../payrollCalc';

const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface TaxSlabLike {
  incomeFrom: number;
  incomeTo: number | null;
  ratePercent: number;
  surchargePercent: number;
}

export interface TaxConfigLike {
  regime: string;
  standardDeduction: number;
  rebateIncomeLimit: number;
  rebateMaxAmount: number;
  rebateMarginalRelief: boolean;
  cessPercent: number;
  seniorExemption: number;
  superSeniorExemption: number;
  allowsExemptions: boolean;
  section80CLimit: number;
  housingInterestLimit: number;
  professionalTaxLimit: number; // 0 = no limit
  slabs: TaxSlabLike[];
}

// Built-in starting point for a financial year with nothing configured.
// Figures as in force for FY 2025-26; review them each Budget.
export const DEFAULT_TAX_CONFIGS: TaxConfigLike[] = [
  {
    regime: 'NEW', standardDeduction: 75000,
    rebateIncomeLimit: 1200000, rebateMaxAmount: 60000, rebateMarginalRelief: true,
    cessPercent: 4, seniorExemption: 0, superSeniorExemption: 0,
    allowsExemptions: false, section80CLimit: 150000, housingInterestLimit: 200000, professionalTaxLimit: 2500,
    slabs: [
      { incomeFrom: 0, incomeTo: 400000, ratePercent: 0, surchargePercent: 0 },
      { incomeFrom: 400001, incomeTo: 800000, ratePercent: 5, surchargePercent: 0 },
      { incomeFrom: 800001, incomeTo: 1200000, ratePercent: 10, surchargePercent: 0 },
      { incomeFrom: 1200001, incomeTo: 1600000, ratePercent: 15, surchargePercent: 0 },
      { incomeFrom: 1600001, incomeTo: 2000000, ratePercent: 20, surchargePercent: 0 },
      { incomeFrom: 2000001, incomeTo: 2400000, ratePercent: 25, surchargePercent: 0 },
      { incomeFrom: 2400001, incomeTo: 5000000, ratePercent: 30, surchargePercent: 0 },
      { incomeFrom: 5000001, incomeTo: 10000000, ratePercent: 30, surchargePercent: 10 },
      { incomeFrom: 10000001, incomeTo: 20000000, ratePercent: 30, surchargePercent: 15 },
      { incomeFrom: 20000001, incomeTo: null, ratePercent: 30, surchargePercent: 25 },
    ],
  },
  {
    regime: 'OLD', standardDeduction: 50000,
    rebateIncomeLimit: 500000, rebateMaxAmount: 12500, rebateMarginalRelief: false,
    cessPercent: 4, seniorExemption: 300000, superSeniorExemption: 500000,
    allowsExemptions: true, section80CLimit: 150000, housingInterestLimit: 200000, professionalTaxLimit: 2500,
    slabs: [
      { incomeFrom: 0, incomeTo: 250000, ratePercent: 0, surchargePercent: 0 },
      { incomeFrom: 250001, incomeTo: 500000, ratePercent: 5, surchargePercent: 0 },
      { incomeFrom: 500001, incomeTo: 1000000, ratePercent: 20, surchargePercent: 0 },
      { incomeFrom: 1000001, incomeTo: 5000000, ratePercent: 30, surchargePercent: 0 },
      { incomeFrom: 5000001, incomeTo: 10000000, ratePercent: 30, surchargePercent: 10 },
      { incomeFrom: 10000001, incomeTo: 20000000, ratePercent: 30, surchargePercent: 15 },
      { incomeFrom: 20000001, incomeTo: 50000000, ratePercent: 30, surchargePercent: 25 },
      { incomeFrom: 50000001, incomeTo: null, ratePercent: 30, surchargePercent: 37 },
    ],
  },
];

// Completed years of age on the last day of the financial year.
export function ageAtYearEnd(dateOfBirth: string | null | undefined, fyStart: number): number {
  if (!dateOfBirth) return 0;
  const [y, m, d] = dateOfBirth.split('-').map(Number);
  if (!y) return 0;
  const endYear = fyStart + 1; // 31 March
  return endYear - y - (m > 3 || (m === 3 && d > 31) ? 1 : 0);
}

const sortedSlabs = (config: TaxConfigLike) => [...config.slabs].sort((a, b) => a.incomeFrom - b.incomeFrom);

// Slab bands start one rupee above the previous band's top ("4,00,001"),
// so a band's taxable floor is its incomeFrom minus that rupee.
const floorOf = (slab: TaxSlabLike) => (slab.incomeFrom > 0 ? slab.incomeFrom - 1 : 0);

// Tax from the slabs alone. `exemption` lifts the tax-free limit for
// senior citizens: income below it is never taxed.
export function slabTax(config: TaxConfigLike, income: number, exemption = 0): number {
  let tax = 0;
  for (const slab of sortedSlabs(config)) {
    const from = Math.max(floorOf(slab), exemption);
    const to = slab.incomeTo == null ? income : Math.min(slab.incomeTo, income);
    if (to > from) tax += ((to - from) * slab.ratePercent) / 100;
  }
  return r2(tax);
}

function surchargeBand(config: TaxConfigLike, income: number) {
  const slabs = sortedSlabs(config);
  const index = slabs.findIndex(s => income >= s.incomeFrom && (s.incomeTo == null || income <= s.incomeTo));
  return { slabs, index };
}

export interface TaxAmounts {
  taxOnIncome: number;
  rebate: number;
  surcharge: number;
  cess: number;
  total: number;
}

// Annual tax on a taxable income: slab tax, rebate (with marginal relief
// where the regime has it), surcharge (with marginal relief) and cess.
export function taxOnIncome(config: TaxConfigLike, taxableIncome: number, age = 0): TaxAmounts {
  const income = Math.max(0, taxableIncome);
  const exemption = age >= 80 ? config.superSeniorExemption : age >= 60 ? config.seniorExemption : 0;
  const taxOnIncome = slabTax(config, income, exemption);

  let afterRebate = taxOnIncome;
  if (income <= config.rebateIncomeLimit) {
    afterRebate = Math.max(0, taxOnIncome - config.rebateMaxAmount);
  } else if (config.rebateMarginalRelief) {
    // Just above the limit, tax cannot exceed the income over the limit
    afterRebate = Math.min(taxOnIncome, income - config.rebateIncomeLimit);
  }
  const rebate = r2(taxOnIncome - afterRebate);

  // Surcharge by the band total income falls in; relief caps the extra
  // tax at the extra income over the band's threshold.
  let surcharge = 0;
  const { slabs, index } = surchargeBand(config, income);
  const band = index >= 0 ? slabs[index] : undefined;
  if (band && band.surchargePercent > 0) {
    surcharge = (afterRebate * band.surchargePercent) / 100;
    const threshold = floorOf(band);
    const below = index > 0 ? slabs[index - 1].surchargePercent : 0;
    if (below < band.surchargePercent) {
      const taxAtThreshold = slabTax(config, threshold, exemption);
      const capped = taxAtThreshold * (1 + below / 100) + (income - threshold);
      surcharge = Math.max(0, Math.min(surcharge, capped - afterRebate));
    }
  }
  surcharge = r2(surcharge);
  const cess = r2(((afterRebate + surcharge) * config.cessPercent) / 100);
  return { taxOnIncome, rebate, surcharge, cess, total: r0(afterRebate + surcharge + cess) };
}

// ---------------------------------------------------------------------------
// The year's income and the month's TDS
// ---------------------------------------------------------------------------
export interface MonthFigures {
  period: string;
  taxableGross: number; // gross less non-taxable catalogue earnings
  basic: number;
  da: number;
  hra: number;
  pfEmployee: number;
  professionalTax: number;
  tds: number;
  // Amounts of the pay components that carry an exemption rule, by
  // component key ("foodAllowance", "c:<componentId>")
  components?: Record<string, number>;
}

// An allowance that is exempt up to a limit. `claimed` is what the
// employee has shown they spent, where the rule needs a proof (null = the
// rule needs none).
export interface ExemptionRuleLike {
  name: string;
  key: string;
  limit: number | null;
  period: string;  // MONTH | YEAR: what the limit is for
  regime: string;  // OLD | BOTH: the regimes it applies under
  claimed: number | null;
}

export interface TaxProfileLike {
  prevEmployerIncome: number;
  prevEmployerTds: number;
  otherIncome: number;
  annualRentPaid: number;
  isMetro: boolean;
  section80C: number;
  otherDeductions: number;
  housingLoanInterest: number;
  // Rent month by month ("YYYY-MM" → rent); when given, the HRA exemption
  // is worked out for each month on its own
  rentByMonth?: Record<string, number> | null;
  letOutIncome?: number; // income from let-out house property
  letOutLoss?: number;   // loss from let-out house property (a positive figure)
  taxCredit?: number;    // tax deducted or collected elsewhere, counted as paid
  exemptions?: ExemptionRuleLike[];
}

export const EMPTY_TAX_PROFILE: TaxProfileLike = {
  prevEmployerIncome: 0, prevEmployerTds: 0, otherIncome: 0, annualRentPaid: 0,
  isMetro: false, section80C: 0, otherDeductions: 0, housingLoanInterest: 0,
};

export interface TdsInputs {
  config: TaxConfigLike;
  fyLabel: string;
  period: string;
  monthsAfter: number;        // payroll months still to come after this one
  earlier: MonthFigures[];    // months already paid this financial year
  current: MonthFigures & { oneTime: number }; // this payslip; oneTime = taxable one-off earnings in it
  // A normal full month from here on, from the salary structure, and
  // what recurring components add in each month to come (first = next month)
  projection: {
    settings: any; monthlyPackage: number; isEsiEligible: boolean; isPfApplicable: boolean;
    recurring?: { taxable: number; components: Record<string, number> }[];
  };
  profile: TaxProfileLike;
  perquisites: number;        // taxable perquisites for the year (e.g. concessional loans)
  age: number;
  hasValidPan: boolean;
}

const sumOf = (months: MonthFigures[], key: keyof Omit<MonthFigures, 'period' | 'components'>) =>
  r2(months.reduce((s, m) => s + m[key], 0));

const nextPeriod = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};

// HRA exempt in one month: the least of the HRA received, rent over a
// tenth of salary, and half (metro) or two-fifths of salary.
const monthHra = (hra: number, salary: number, rent: number, share: number) =>
  (rent > 0 ? Math.max(0, Math.min(hra, rent - 0.1 * salary, share * salary)) : 0);

// Allowances exempt for the year under the employee's rules. A monthly
// limit is applied to each month; a yearly one to the year's total. Where
// the rule needs a proof, the exemption stops at what was claimed.
function allowanceExemptions(
  rules: ExemptionRuleLike[], allowsExemptions: boolean,
  months: MonthFigures[], projected: (key: string, monthIndex: number) => number, monthsAfter: number,
) {
  const list: { name: string; amount: number }[] = [];
  for (const rule of rules) {
    if (rule.regime !== 'BOTH' && !allowsExemptions) continue;
    const paid = months.map(m => Number(m.components?.[rule.key] || 0));
    const later = Array.from({ length: monthsAfter }, (_, i) => Math.max(0, projected(rule.key, i)));
    let amount: number;
    if (rule.period === 'MONTH' && rule.limit != null) {
      amount = [...paid, ...later].reduce((s, p) => s + Math.min(Math.max(0, p), rule.limit!), 0);
    } else {
      const total = [...paid, ...later].reduce((s, p) => s + Math.max(0, p), 0);
      amount = rule.limit == null ? total : Math.min(total, rule.limit);
    }
    if (rule.claimed != null) amount = Math.min(amount, Math.max(0, rule.claimed));
    if (amount > 0) list.push({ name: rule.name, amount: r2(amount) });
  }
  return { list, total: r2(list.reduce((s, a) => s + a.amount, 0)) };
}

// Taxable income and tax for the year, given this month's taxable gross.
function yearTax(inp: TdsInputs, currentGross: number) {
  const { config, profile } = inp;
  const full = computeEntry({
    monthlyPackage: inp.projection.monthlyPackage, totalWorkingDays: 1,
    isEsiEligible: inp.projection.isEsiEligible, isPfApplicable: inp.projection.isPfApplicable,
  }, inp.projection.settings);
  const n = inp.monthsAfter;
  const months = [...inp.earlier, inp.current];
  // Recurring components of the months to come, taxable ones in all
  const recurring = (inp.projection.recurring || []).slice(0, n);

  const income = {
    paidEarlier: sumOf(inp.earlier, 'taxableGross'),
    thisMonth: r2(currentGross),
    projected: r2(full.grossSalary * n + recurring.reduce((s, m) => s + m.taxable, 0)),
    previousEmployer: profile.prevEmployerIncome,
    perquisites: inp.perquisites,
  };
  const grossSalary = r2(income.paidEarlier + income.thisMonth + income.projected + income.previousEmployer + income.perquisites);

  // Exemptions and deductions the old regime allows
  const salaryForHra = r2(sumOf(months, 'basic') + sumOf(months, 'da') + (full.basic + full.da) * n);
  const hraReceived = r2(sumOf(months, 'hra') + full.hra * n);
  const share = profile.isMetro ? 0.5 : 0.4;
  let hraExemption = 0;
  if (config.allowsExemptions && profile.rentByMonth) {
    // Rent known month by month: each month stands on its own
    const rentOf = (period: string) => Number(profile.rentByMonth![period] || 0);
    hraExemption = months.reduce((s, m) => s + monthHra(m.hra, m.basic + m.da, rentOf(m.period), share), 0);
    let period = inp.period;
    for (let i = 0; i < n; i++) {
      period = nextPeriod(period);
      hraExemption += monthHra(full.hra, full.basic + full.da, rentOf(period), share);
    }
    hraExemption = r2(hraExemption);
  } else if (config.allowsExemptions && profile.annualRentPaid > 0) {
    hraExemption = Math.max(0, r2(Math.min(
      hraReceived,
      profile.annualRentPaid - 0.1 * salaryForHra,
      share * salaryForHra,
    )));
  }
  // Other allowances with an exemption rule. The months to come count
  // only what is paid every month — the salary structure and recurring
  // components: an allowance typed month by month is not in the projected
  // salary either.
  const allowances = allowanceExemptions(
    profile.exemptions || [], config.allowsExemptions, months,
    (key, i) => (key in full ? Number((full as any)[key] || 0) : Number(recurring[i]?.components[key] || 0)),
    n,
  );
  const exempt = r2(hraExemption + allowances.total);
  // Professional Tax paid and expected, up to the year's limit. The limit
  // also keeps a half-yearly deduction from being projected over every
  // month still to come.
  const ptForYear = r2(sumOf(months, 'professionalTax') + inp.current.professionalTax * n);
  const professionalTax = !config.allowsExemptions ? 0
    : config.professionalTaxLimit > 0 ? Math.min(ptForYear, config.professionalTaxLimit) : ptForYear;
  const standardDeduction = Math.min(config.standardDeduction, Math.max(0, grossSalary - exempt));
  const incomeFromSalary = Math.max(0, r2(grossSalary - exempt - standardDeduction - professionalTax));

  // House property: interest on a self-occupied house (old regime), and
  // the income or loss of a let-out one. A loss is set off against other
  // income up to the limit under the old regime; under the new regime it
  // only reduces let-out income.
  const housingLoanInterest = config.allowsExemptions
    ? Math.min(profile.housingLoanInterest, config.housingInterestLimit) : 0;
  const letOutIncome = Math.max(0, Number(profile.letOutIncome || 0));
  const letOutLoss = Math.max(0, Number(profile.letOutLoss || 0));
  const houseProperty = config.allowsExemptions
    ? Math.max(-config.housingInterestLimit, r2(letOutIncome - letOutLoss - housingLoanInterest))
    : Math.max(0, r2(letOutIncome - letOutLoss));
  const grossTotalIncome = Math.max(0, r2(incomeFromSalary + profile.otherIncome + houseProperty));

  const pf = r2(sumOf(months, 'pfEmployee') + full.pfEmployee * n);
  const section80C = config.allowsExemptions ? Math.min(config.section80CLimit, r2(pf + profile.section80C)) : 0;
  const otherDeductions = config.allowsExemptions ? profile.otherDeductions : 0;
  const chapter6 = Math.min(grossTotalIncome, r2(section80C + otherDeductions));
  const taxableIncome = r2(grossTotalIncome - chapter6);

  const tax = taxOnIncome(config, taxableIncome, inp.age);
  // Without a valid PAN, tax is deducted at the higher of the normal
  // amount and 20% of taxable income.
  const panRate = !inp.hasValidPan && tax.total > 0 ? Math.max(tax.total, r0(taxableIncome * 0.2)) : tax.total;

  return {
    income, grossSalary,
    exemptions: { hra: hraExemption, allowances: allowances.list, total: exempt },
    deductions: { standard: standardDeduction, professionalTax },
    incomeFromSalary,
    otherIncome: profile.otherIncome,
    housingLoanInterest,
    letOut: { income: letOutIncome, loss: letOutLoss },
    houseProperty,
    grossTotalIncome,
    chapter6: { pf, declared80C: profile.section80C, section80C, other: otherDeductions, total: chapter6 },
    taxableIncome,
    tax: { ...tax, total: panRate, higherRateForPan: panRate !== tax.total },
  };
}

// The month's TDS and the working behind it. Regular tax still owed is
// spread over the months left; tax caused by a one-off payment in this
// payslip is taken in full now.
export function computeTds(inp: TdsInputs) {
  const withAll = yearTax(inp, inp.current.taxableGross);
  const regular = inp.current.oneTime > 0
    ? yearTax(inp, inp.current.taxableGross - inp.current.oneTime)
    : withAll;
  const oneTimeTax = Math.max(0, withAll.tax.total - regular.tax.total);

  const paidThroughPayroll = sumOf(inp.earlier, 'tds');
  const elsewhere = Math.max(0, Number(inp.profile.taxCredit || 0));
  const paid = r2(paidThroughPayroll + inp.profile.prevEmployerTds + elsewhere);
  const monthsLeft = inp.monthsAfter + 1;
  const regularThisMonth = Math.max(0, (regular.tax.total - paid) / monthsLeft);
  const tds = r0(regularThisMonth + oneTimeTax);

  return {
    tds,
    working: {
      financialYear: inp.fyLabel,
      regime: inp.config.regime,
      period: inp.period,
      monthsLeft,
      ...withAll,
      paid: { payroll: paidThroughPayroll, previousEmployer: inp.profile.prevEmployerTds, elsewhere, total: paid },
      balance: r2(withAll.tax.total - paid),
      oneTimeTax,
      tdsThisMonth: tds,
    },
  };
}

export interface YearEndInputs {
  config: TaxConfigLike;
  fyLabel: string;
  months: MonthFigures[];     // every month actually paid in the year
  settings: any;
  profile: TaxProfileLike;
  perquisites: number;
  age: number;
  hasValidPan: boolean;
}

// The year as it actually turned out, with nothing projected: what Form 16
// and the annual return report. `deducted` is the TDS payroll really took.
export function yearEndTax(inp: YearEndInputs) {
  const months = [...inp.months].sort((a, b) => a.period.localeCompare(b.period));
  const last = months[months.length - 1]
    || { period: '', taxableGross: 0, basic: 0, da: 0, hra: 0, pfEmployee: 0, professionalTax: 0, tds: 0 };
  const year = yearTax({
    config: inp.config, fyLabel: inp.fyLabel, period: last.period, monthsAfter: 0,
    earlier: months.slice(0, -1), current: { ...last, oneTime: 0 },
    projection: { settings: inp.settings, monthlyPackage: 0, isEsiEligible: false, isPfApplicable: false },
    profile: inp.profile, perquisites: inp.perquisites, age: inp.age, hasValidPan: inp.hasValidPan,
  }, last.taxableGross);
  const deducted = sumOf(months, 'tds');
  const elsewhere = Math.max(0, Number(inp.profile.taxCredit || 0));
  const paid = r2(deducted + inp.profile.prevEmployerTds + elsewhere);
  return {
    financialYear: inp.fyLabel,
    regime: inp.config.regime,
    monthsPaid: months.length,
    ...year,
    salaryPaid: r2(year.income.paidEarlier + year.income.thisMonth),
    paid: { payroll: deducted, previousEmployer: inp.profile.prevEmployerTds, elsewhere, total: paid },
    balance: r2(year.tax.total - paid), // positive = short deducted, negative = excess
  };
}

export const PAN_FORMAT = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const hasValidPan = (pan: string | null | undefined) => PAN_FORMAT.test(String(pan || '').trim().toUpperCase());
