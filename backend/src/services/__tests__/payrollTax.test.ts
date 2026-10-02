import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TAX_CONFIGS, taxOnIncome, slabTax, computeTds, ageAtYearEnd, hasValidPan,
  EMPTY_TAX_PROFILE, MonthFigures, TdsInputs,
} from '../payroll/taxCalc';
import { computeFullEntry, StatutoryContext } from '../payroll/entryCompute';
import { TaxContext } from '../payroll/taxContext';

const NEW = DEFAULT_TAX_CONFIGS.find(c => c.regime === 'NEW')!;
const OLD = DEFAULT_TAX_CONFIGS.find(c => c.regime === 'OLD')!;

const SETTINGS = {
  basicPercentOfPackage: 50, daPercentOfBasic: 45, hraPercentOfBasic: 25,
  transportPercentOfBasic: 20, foodPercentOfBasic: 10,
  esiEmployeePercent: 0.75, esiEmployerPercent: 3.25, esiWageCeiling: 21000,
  pfEmployeePercent: 12, pfEmployerPercent: 12, pfWageCap: 15000, pfWageFactor: 60,
  pfEmployerMatchesEmployee: true,
};

describe('tax on income — new regime', () => {
  it('charges nothing up to the rebate limit', () => {
    expect(taxOnIncome(NEW, 400000).total).toBe(0);
    expect(taxOnIncome(NEW, 700000)).toMatchObject({ taxOnIncome: 15000, rebate: 15000, total: 0 });
    expect(taxOnIncome(NEW, 1200000)).toMatchObject({ taxOnIncome: 60000, rebate: 60000, total: 0 });
  });

  it('gives marginal relief just above the rebate limit', () => {
    // Slab tax is 61,500 but only 10,000 was earned over the limit
    const t = taxOnIncome(NEW, 1210000);
    expect(t.taxOnIncome).toBe(61500);
    expect(t.total).toBe(Math.round(10000 * 1.04));
    // Far enough above, the slab tax applies in full
    expect(taxOnIncome(NEW, 1500000)).toMatchObject({ taxOnIncome: 105000, rebate: 0, cess: 4200, total: 109200 });
  });

  it('adds surcharge above 50 lakh, with marginal relief at the threshold', () => {
    expect(slabTax(NEW, 5000000)).toBe(1080000);
    const high = taxOnIncome(NEW, 6000000);
    expect(high.taxOnIncome).toBe(1380000);
    expect(high.surcharge).toBe(138000);
    expect(high.total).toBe(1578720);
    // 10,000 over the threshold: surcharge is capped so the extra tax does not exceed the extra income
    const edge = taxOnIncome(NEW, 5010000);
    expect(edge.taxOnIncome).toBe(1083000);
    expect(edge.surcharge).toBe(7000);
    expect(edge.total).toBe(1133600);
  });

  it('never goes negative', () => {
    expect(taxOnIncome(NEW, -5000).total).toBe(0);
  });
});

describe('tax on income — old regime', () => {
  it('applies the rebate up to 5 lakh and the slabs beyond', () => {
    expect(taxOnIncome(OLD, 500000)).toMatchObject({ taxOnIncome: 12500, rebate: 12500, total: 0 });
    expect(taxOnIncome(OLD, 800000)).toMatchObject({ taxOnIncome: 72500, rebate: 0, cess: 2900, total: 75400 });
    // No marginal relief on the old-regime rebate
    expect(taxOnIncome(OLD, 500100).total).toBe(Math.round(12520 * 1.04));
  });

  it('raises the tax-free limit for senior and very senior citizens', () => {
    expect(taxOnIncome(OLD, 400000, 65).taxOnIncome).toBe(5000);  // 3L–4L at 5%
    expect(taxOnIncome(OLD, 800000, 65)).toMatchObject({ taxOnIncome: 70000, total: 72800 });
    expect(taxOnIncome(OLD, 800000, 82).taxOnIncome).toBe(60000); // nothing below 5L
    expect(taxOnIncome(OLD, 800000, 59).taxOnIncome).toBe(72500);
  });
});

describe('age and PAN', () => {
  it('takes age on the last day of the financial year', () => {
    expect(ageAtYearEnd('1966-03-31', 2026)).toBe(61);
    expect(ageAtYearEnd('1967-03-31', 2026)).toBe(60); // turns 60 on the last day
    expect(ageAtYearEnd('1967-04-01', 2026)).toBe(59);
    expect(ageAtYearEnd(null, 2026)).toBe(0);
  });

  it('checks the PAN format', () => {
    expect(hasValidPan('ABCPK1234F')).toBe(true);
    expect(hasValidPan(' abcpk1234f ')).toBe(true);
    expect(hasValidPan('ABCPK1234')).toBe(false);
    expect(hasValidPan('')).toBe(false);
  });
});

describe('monthly TDS', () => {
  const month = (period: string, pkg: number, over: Partial<MonthFigures> = {}): MonthFigures => ({
    period, taxableGross: pkg, basic: pkg * 0.5, da: pkg * 0.225, hra: pkg * 0.125,
    pfEmployee: 0, professionalTax: 0, tds: 0, ...over,
  });
  const inputs = (pkg: number, over: Partial<TdsInputs> = {}): TdsInputs => ({
    config: NEW, fyLabel: '2026-27', period: '2026-04', monthsAfter: 11, earlier: [],
    current: { ...month('2026-04', pkg), oneTime: 0 },
    projection: { settings: SETTINGS, monthlyPackage: pkg, isEsiEligible: false, isPfApplicable: false },
    profile: EMPTY_TAX_PROFILE, perquisites: 0, age: 30, hasValidPan: true, ...over,
  });

  it('is nil when the year’s income stays within the rebate', () => {
    const r = computeTds(inputs(100000));
    expect(r.working.grossSalary).toBe(1200000);
    expect(r.working.deductions.standard).toBe(75000);
    expect(r.working.taxableIncome).toBe(1125000);
    expect(r.tds).toBe(0);
  });

  it('spreads the year’s tax over the months left', () => {
    const r = computeTds(inputs(150000));
    expect(r.working.taxableIncome).toBe(1725000);
    expect(r.working.tax.total).toBe(150800);
    expect(r.working.monthsLeft).toBe(12);
    expect(r.tds).toBe(12567);
  });

  it('counts what earlier months already deducted', () => {
    const earlier = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
      .map(p => month(p, 150000, { tds: 12567 }));
    const r = computeTds(inputs(150000, {
      period: '2026-10', monthsAfter: 5, earlier, current: { ...month('2026-10', 150000), oneTime: 0 },
    }));
    expect(r.working.paid.payroll).toBe(75402);
    expect(r.working.balance).toBe(75398);
    expect(r.tds).toBe(12566);
  });

  it('takes the whole balance in the last month, and nothing once the year is covered', () => {
    const eleven = Array.from({ length: 11 }, (_, i) => month(`2026-${String(i + 4).padStart(2, '0')}`, 150000, { tds: 12567 }));
    const march = computeTds(inputs(150000, {
      period: '2027-03', monthsAfter: 0, earlier: eleven, current: { ...month('2027-03', 150000), oneTime: 0 },
    }));
    expect(march.tds).toBe(150800 - 11 * 12567);
    const overpaid = eleven.map(m => ({ ...m, tds: 20000 }));
    expect(computeTds(inputs(150000, {
      period: '2027-03', monthsAfter: 0, earlier: overpaid, current: { ...month('2027-03', 150000), oneTime: 0 },
    })).tds).toBe(0);
  });

  it('recovers the tax on a one-off payment in the month it is paid', () => {
    const r = computeTds(inputs(150000, { current: { ...month('2026-04', 150000), taxableGross: 250000, oneTime: 100000 } }));
    expect(r.working.tax.total).toBe(171600);
    expect(r.working.oneTimeTax).toBe(20800);
    expect(r.tds).toBe(12567 + 20800);
  });

  it('includes income and tax from a previous employer', () => {
    const r = computeTds(inputs(150000, {
      period: '2026-10', monthsAfter: 5, current: { ...month('2026-10', 150000), oneTime: 0 },
      profile: { ...EMPTY_TAX_PROFILE, prevEmployerIncome: 900000, prevEmployerTds: 60000 },
    }));
    expect(r.working.grossSalary).toBe(1800000); // 9L before + 6 months here
    expect(r.working.paid.total).toBe(60000);
    expect(r.tds).toBe(Math.round((150800 - 60000) / 6));
  });

  it('old regime: HRA exemption, 80C with PF, and Professional Tax', () => {
    const r = computeTds(inputs(100000, {
      config: OLD,
      profile: { ...EMPTY_TAX_PROFILE, annualRentPaid: 240000, section80C: 150000 },
    }));
    // HRA received 1,50,000; rent less 10% of salary 1,53,000; 40% of salary 3,48,000
    expect(r.working.exemptions.hra).toBe(150000);
    expect(r.working.deductions.standard).toBe(50000);
    expect(r.working.chapter6.section80C).toBe(150000);
    expect(r.working.taxableIncome).toBe(850000);
    expect(r.working.tax.total).toBe(85800);
    expect(r.tds).toBe(7150);
  });

  it('old regime: PF counts toward 80C up to the limit', () => {
    const r = computeTds(inputs(100000, {
      config: OLD,
      current: { ...month('2026-04', 100000, { pfEmployee: 1800 }), oneTime: 0 },
      projection: { settings: SETTINGS, monthlyPackage: 100000, isEsiEligible: false, isPfApplicable: true },
      profile: { ...EMPTY_TAX_PROFILE, section80C: 140000 },
    }));
    expect(r.working.chapter6.pf).toBe(21600);
    expect(r.working.chapter6.section80C).toBe(150000); // 1,61,600 capped
  });

  it('new regime ignores rent, 80C and housing-loan interest', () => {
    const r = computeTds(inputs(150000, {
      profile: { ...EMPTY_TAX_PROFILE, annualRentPaid: 240000, section80C: 150000, otherDeductions: 25000, housingLoanInterest: 200000 },
    }));
    expect(r.working.exemptions.hra).toBe(0);
    expect(r.working.chapter6.total).toBe(0);
    expect(r.working.taxableIncome).toBe(1725000);
  });

  it('adds perquisites and other income to what is taxed', () => {
    const r = computeTds(inputs(150000, { perquisites: 10800, profile: { ...EMPTY_TAX_PROFILE, otherIncome: 50000 } }));
    expect(r.working.grossSalary).toBe(1810800);
    expect(r.working.taxableIncome).toBe(1725000 + 10800 + 50000);
  });

  it('deducts at the higher rate when there is no valid PAN, but not when no tax is due', () => {
    const noPan = computeTds(inputs(150000, { hasValidPan: false }));
    expect(noPan.working.tax.total).toBe(345000); // 20% of 17,25,000
    expect(noPan.working.tax.higherRateForPan).toBe(true);
    expect(computeTds(inputs(100000, { hasValidPan: false })).tds).toBe(0);
  });

  it('stops projecting when no months are left to pay', () => {
    const r = computeTds(inputs(150000, { period: '2026-06', monthsAfter: 0 }));
    expect(r.working.income.projected).toBe(0);
    expect(r.working.grossSalary).toBe(150000);
    expect(r.tds).toBe(0);
  });
});

describe('TDS inside a payslip computation', () => {
  const later = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];
  const context = (over: Partial<TaxContext> = {}): StatutoryContext => ({
    period: '2026-04', settings: SETTINGS, ptPolicies: [], lwfPolicies: [],
    priorByPerson: new Map(), loanDue: new Map(),
    tax: {
      fyStart: 2026, fyLabel: '2026-27', period: '2026-04', later, defaultRegime: 'NEW',
      configs: new Map([['NEW', NEW], ['OLD', OLD]]), profiles: new Map(), earlier: new Map(),
      people: new Map([['p1', { dateOfBirth: '1990-01-01', leavingDate: null, panNumber: 'ABCPK1234F' }]]),
      perquisites: new Map(), nonTaxable: new Set(), workings: new Map(), ...over,
    },
  });
  const inputs = { monthlyPackage: 150000, totalWorkingDays: 26 };

  it('computes TDS, deducts it and keeps the working', () => {
    const ctx = context();
    const r = computeFullEntry(ctx, inputs, [], { personId: 'p1' });
    expect(r.tds).toBe(12567);
    expect(r.totalDeductions).toBe(12567);
    expect(r.netPayable).toBe(150000 - 12567);
    const working = ctx.tax!.workings.get('p1');
    expect(working.taxableIncome).toBe(1725000);
    expect(working.tdsThisMonth).toBe(12567);
    expect(working.overridden).toBe(false);
  });

  it('honours an amount typed over the calculation, and records both', () => {
    const ctx = context();
    const r = computeFullEntry(ctx, inputs, [], { personId: 'p1', tdsOverride: 5000 });
    expect(r.tds).toBe(5000);
    expect(r.netPayable).toBe(145000);
    expect(ctx.tax!.workings.get('p1')).toMatchObject({ computedTds: 12567, tdsThisMonth: 5000, overridden: true });
  });

  it('uses the employee\u2019s chosen regime, else the default', () => {
    const ctx = context({ profiles: new Map([['p1', { ...EMPTY_TAX_PROFILE, regime: 'OLD' }]]) });
    computeFullEntry(ctx, inputs, [], { personId: 'p1' });
    expect(ctx.tax!.workings.get('p1').regime).toBe('OLD');
    const fallback = context({ defaultRegime: 'OLD' });
    computeFullEntry(fallback, inputs, [], { personId: 'p1' });
    expect(fallback.tax!.workings.get('p1').regime).toBe('OLD');
  });

  it('stops projecting at the leaving month', () => {
    const ctx = context({ people: new Map([['p1', { dateOfBirth: null, leavingDate: '2026-06-30', panNumber: 'ABCPK1234F' }]]) });
    const r = computeFullEntry(ctx, inputs, [], { personId: 'p1' });
    expect(ctx.tax!.workings.get('p1').grossSalary).toBe(450000); // April to June
    expect(r.tds).toBe(0);
  });

  it('leaves earnings marked non-taxable out of taxable income', () => {
    const ctx = context({ nonTaxable: new Set(['c1']) });
    const r = computeFullEntry(ctx, inputs, [{ type: 'EARNING', amount: 50000, componentId: 'c1' } as any], { personId: 'p1' });
    expect(r.grossSalary).toBe(200000);
    expect(ctx.tax!.workings.get('p1').taxableIncome).toBe(1725000);
    expect(r.tds).toBe(12567);
  });

  it('treats a taxable catalogue earning as a one-off: its tax is taken this month', () => {
    const ctx = context();
    const r = computeFullEntry(ctx, inputs, [{ type: 'EARNING', amount: 100000, componentId: 'bonus' } as any], { personId: 'p1' });
    expect(ctx.tax!.workings.get('p1').oneTimeTax).toBe(20800);
    expect(r.tds).toBe(12567 + 20800);
  });

  it('leaves TDS as typed when the month is before computed TDS starts', () => {
    const manual: StatutoryContext = { ...context(), tax: null };
    const r = computeFullEntry(manual, { ...inputs, tds: 777 }, [], { personId: 'p1' });
    expect((r as any).tds).toBeUndefined(); // the caller keeps its own figure
    expect(r.totalDeductions).toBe(777);
  });
});

describe('Professional Tax deduction limit', () => {
  const month = (period: string, pkg: number, professionalTax: number): MonthFigures => ({
    period, taxableGross: pkg, basic: pkg * 0.5, da: pkg * 0.225, hra: pkg * 0.125,
    pfEmployee: 0, professionalTax, tds: 0,
  });
  const inputs = (config: TdsInputs['config'], period: string, monthsAfter: number, professionalTax: number): TdsInputs => ({
    config, fyLabel: '2026-27', period, monthsAfter, earlier: [],
    current: { ...month(period, 100000, professionalTax), oneTime: 0 },
    projection: { settings: SETTINGS, monthlyPackage: 100000, isEsiEligible: false, isPfApplicable: false },
    profile: EMPTY_TAX_PROFILE, perquisites: 0, age: 30, hasValidPan: true,
  });

  it('stops a half-yearly deduction from being projected over every month left', () => {
    // 1,250 deducted in September with six months to come: 8,750 uncapped
    const r = computeTds(inputs(OLD, '2026-09', 6, 1250));
    expect(r.working.deductions.professionalTax).toBe(2500);
  });

  it('leaves a year’s deduction below the limit as it is', () => {
    const r = computeTds(inputs(OLD, '2026-04', 11, 200));
    expect(r.working.deductions.professionalTax).toBe(2400);
  });

  it('is not applied when the limit is set to zero', () => {
    const r = computeTds(inputs({ ...OLD, professionalTaxLimit: 0 }, '2026-09', 6, 1250));
    expect(r.working.deductions.professionalTax).toBe(8750);
  });

  it('reduces taxable income by no more than the limit', () => {
    const capped = computeTds(inputs(OLD, '2026-09', 6, 1250));
    const uncapped = computeTds(inputs({ ...OLD, professionalTaxLimit: 0 }, '2026-09', 6, 1250));
    expect(capped.working.taxableIncome - uncapped.working.taxableIncome).toBe(8750 - 2500);
  });

  it('gives nothing under the new regime', () => {
    expect(computeTds(inputs(NEW, '2026-09', 6, 1250)).working.deductions.professionalTax).toBe(0);
  });
});
