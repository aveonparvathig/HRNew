import { describe, it, expect } from 'vitest';
import { computeEntry } from '../payrollCalc';
import {
  halfYearOf, slabAmount, professionalTaxForMonth, lwfForMonth, policyInForce,
  esiCovered, pfBreakup, pfAdminCharge, parseMonths, ptPolicyInForce, ptAreaLabel,
} from '../payroll/statutoryCalc';
import { computeFullEntry, esiFlagFor, locationOptions, StatutoryContext } from '../payroll/entryCompute';
import { esiCeilingChecks, locationChecks } from '../payroll/checks';

const SETTINGS = {
  basicPercentOfPackage: 50,
  daPercentOfBasic: 45,
  hraPercentOfBasic: 25,
  transportPercentOfBasic: 20,
  foodPercentOfBasic: 10,
  esiEmployeePercent: 0.75,
  esiEmployerPercent: 3.25,
  esiWageCeiling: 21000,
  esiAutoCoverage: false,
  pfEmployeePercent: 12,
  pfEmployerPercent: 12,
  pfWageCap: 15000,
  pfWageFactor: 60,
  pfEmployerMatchesEmployee: true,
  pfRoundToRupee: false,
  epsPercent: 8.33,
  epsWageCap: 15000,
  edliPercent: 0.5,
  edliWageCap: 15000,
  pfAdminPercent: 0.5,
  pfAdminMinimum: 500,
};

// Illustrative slabs only — real amounts are set per state in Settings.
const SLABS = [
  { incomeFrom: 0, incomeTo: 21000, amount: 0 },
  { incomeFrom: 21001, incomeTo: 30000, amount: 120 },
  { incomeFrom: 30001, incomeTo: 60000, amount: 600 },
  { incomeFrom: 60001, incomeTo: null, amount: 1200 },
];
const HALF_SPREAD = { state: 'Tamil Nadu', effectiveFrom: '2026-04', frequency: 'HALF_YEARLY', deductionMode: 'SPREAD', deductionMonths: '', slabs: SLABS };
const HALF_LUMP = { ...HALF_SPREAD, deductionMode: 'LUMP_SUM', deductionMonths: '9,3' };
const MONTHLY = { ...HALF_SPREAD, frequency: 'MONTHLY' };

describe('half-years', () => {
  it('splits the year into April–September and October–March', () => {
    expect(halfYearOf('2026-04').periods).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(halfYearOf('2026-09').label).toBe('Apr–Sep 2026');
    expect(halfYearOf('2026-10').periods).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(halfYearOf('2027-02').label).toBe('Oct 2026–Mar 2027');
    expect(halfYearOf('2027-02').periods[0]).toBe('2026-10');
  });
});

describe('Professional Tax', () => {
  it('picks the slab containing the income, open-ended at the top', () => {
    expect(slabAmount(SLABS, 0)).toBe(0);
    expect(slabAmount(SLABS, 21000)).toBe(0);
    expect(slabAmount(SLABS, 21001)).toBe(120);
    expect(slabAmount(SLABS, 60000)).toBe(600);
    expect(slabAmount(SLABS, 500000)).toBe(1200);
    expect(slabAmount([], 500000)).toBe(0);
  });

  it('monthly states use the month\'s gross', () => {
    expect(professionalTaxForMonth(MONTHLY, '2026-05', 25000, [])).toBe(120);
    expect(professionalTaxForMonth(MONTHLY, '2026-05', 15000, [])).toBe(0);
  });

  it('half-yearly spread: projects the half and divides over the months left', () => {
    // 45,000 a month → 2,70,000 for the half → 1,200 → 200 a month
    expect(professionalTaxForMonth(HALF_SPREAD, '2026-04', 45000, [])).toBe(200);
    const prior = [
      { period: '2026-04', grossSalary: 45000, professionalTax: 200 },
      { period: '2026-05', grossSalary: 45000, professionalTax: 200 },
    ];
    expect(professionalTaxForMonth(HALF_SPREAD, '2026-06', 45000, prior)).toBe(200);
  });

  it('half-yearly spread: a full half adds up to exactly the slab amount', () => {
    const prior: { period: string; grossSalary: number; professionalTax: number }[] = [];
    for (const period of halfYearOf('2026-04').periods) {
      const pt = professionalTaxForMonth(HALF_SPREAD, period, 9000, prior); // 54,000 → 600
      prior.push({ period, grossSalary: 9000, professionalTax: pt });
    }
    expect(prior.reduce((s, p) => s + p.professionalTax, 0)).toBe(600);
  });

  it('half-yearly spread: catches up after a raise moves the employee to a higher slab', () => {
    // Three months at 9,000 (on course for 600 → 100 a month), then 20,000
    const prior = ['2026-04', '2026-05', '2026-06'].map(period => ({ period, grossSalary: 9000, professionalTax: 100 }));
    // Projected: 27,000 + 20,000 × 3 = 87,000 → 1,200; 900 left over 3 months
    expect(professionalTaxForMonth(HALF_SPREAD, '2026-07', 20000, prior)).toBe(300);
  });

  it('half-yearly spread: a mid-half joiner is taxed on what they will earn in the half', () => {
    // Joins in August: 10,000 × 2 = 20,000 → nil
    expect(professionalTaxForMonth(HALF_SPREAD, '2026-08', 10000, [])).toBe(0);
    // 30,000 × 2 = 60,000 → 600 over 2 months
    expect(professionalTaxForMonth(HALF_SPREAD, '2026-08', 30000, [])).toBe(300);
  });

  it('half-yearly lump sum: nothing until a listed month, then the whole balance', () => {
    const prior = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
      .map(period => ({ period, grossSalary: 45000, professionalTax: 0 }));
    expect(professionalTaxForMonth(HALF_LUMP, '2026-06', 45000, prior.slice(0, 2))).toBe(0);
    expect(professionalTaxForMonth(HALF_LUMP, '2026-09', 45000, prior)).toBe(1200);
    // Second half is due in March
    expect(professionalTaxForMonth(HALF_LUMP, '2027-03', 45000, [])).toBe(600); // only this month counts: 45,000
  });

  it('ignores earlier months from another half, and never goes negative', () => {
    const other = [{ period: '2026-03', grossSalary: 900000, professionalTax: 0 }];
    expect(professionalTaxForMonth(HALF_SPREAD, '2026-04', 9000, other)).toBe(100);
    const overpaid = [{ period: '2026-04', grossSalary: 9000, professionalTax: 5000 }];
    expect(professionalTaxForMonth(HALF_SPREAD, '2026-05', 9000, overpaid)).toBe(0);
    expect(professionalTaxForMonth(HALF_SPREAD, '2026-05', 0, [])).toBe(0);
  });
});

describe('Labour Welfare Fund and policy lookup', () => {
  const lwf = { state: 'Tamil Nadu', effectiveFrom: '2026-01', employeeAmount: 10, employerAmount: 20, deductionMonths: '12' };

  it('falls due only in the listed months', () => {
    expect(lwfForMonth(lwf, '2026-12')).toEqual({ lwfEmployee: 10, lwfEmployer: 20 });
    expect(lwfForMonth(lwf, '2026-11')).toEqual({ lwfEmployee: 0, lwfEmployer: 0 });
    expect(parseMonths('6, 12,13,x')).toEqual([6, 12]);
  });

  it('uses the latest policy effective on or before the month', () => {
    const policies = [
      { state: 'Tamil Nadu', effectiveFrom: '2025-04', tag: 'old' },
      { state: 'Tamil Nadu', effectiveFrom: '2026-10', tag: 'new' },
      { state: 'Kerala', effectiveFrom: '2025-04', tag: 'kl' },
    ];
    expect(policyInForce(policies, 'Tamil Nadu', '2026-09')?.tag).toBe('old');
    expect(policyInForce(policies, 'Tamil Nadu', '2026-10')?.tag).toBe('new');
    expect(policyInForce(policies, 'Tamil Nadu', '2025-03')).toBeUndefined();
    expect(policyInForce(policies, 'Karnataka', '2026-10')).toBeUndefined();
  });
});

describe('ESI coverage', () => {
  it('covers wages within the ceiling, and keeps covering to the end of the period', () => {
    expect(esiCovered(21000, 21000, false)).toBe(true);
    expect(esiCovered(21001, 21000, false)).toBe(false);
    expect(esiCovered(25000, 21000, true)).toBe(true);
    expect(esiCovered(0, 21000, true)).toBe(false);
  });

  const ctx = (over: any = {}): StatutoryContext => ({
    period: '2026-07', settings: SETTINGS, ptPolicies: [], lwfPolicies: [], priorByPerson: new Map(), loanDue: new Map(), tax: null, ...over,
  });
  const inputs = (monthlyPackage: number) => ({ monthlyPackage, totalWorkingDays: 26 });

  it('follows the employee flag unless automatic coverage is on', () => {
    expect(esiFlagFor(ctx(), { id: 'p1', isEsiEligible: false }, inputs(18000))).toBe(false);
    expect(esiFlagFor(ctx(), { id: 'p1', isEsiEligible: true }, inputs(40000))).toBe(true);
    const auto = ctx({ settings: { ...SETTINGS, esiAutoCoverage: true } });
    expect(esiFlagFor(auto, { id: 'p1', isEsiEligible: false }, inputs(18000))).toBe(true);
    expect(esiFlagFor(auto, { id: 'p1', isEsiEligible: true }, inputs(40000))).toBe(false);
  });

  it('automatic coverage carries through the contribution period after a raise', () => {
    const auto = ctx({
      settings: { ...SETTINGS, esiAutoCoverage: true },
      priorByPerson: new Map([['p1', [{ period: '2026-04', grossSalary: 20000, professionalTax: 0, esiCovered: true }]]]),
    });
    expect(esiFlagFor(auto, { id: 'p1', isEsiEligible: false }, inputs(25000))).toBe(true);
    expect(esiFlagFor(auto, { id: 'p2', isEsiEligible: false }, inputs(25000))).toBe(false);
  });

  it('does not warn about a wage above the ceiling for someone still in a covered period', () => {
    const entry = { id: 'e1', personId: 'p1', monthlyPackage: 25000, totalWorkingDays: 26, isEsiEligible: true, person: { name: 'Asha' } };
    expect(esiCeilingChecks([entry], SETTINGS, true)).toHaveLength(1);
    expect(esiCeilingChecks([entry], SETTINGS, true, new Set(['p1']))).toEqual([]);
  });

  it('flags employees with no work location only when state policies exist', () => {
    const entries = [
      { id: 'e1', person: { name: 'Asha', workLocation: null } },
      { id: 'e2', person: { name: 'Bala', workLocation: { state: 'Tamil Nadu' } } },
    ];
    expect(locationChecks(entries, false)).toEqual([]);
    expect(locationChecks(entries, true).map(c => c.entryId)).toEqual(['e1']);
  });
});

describe('PF split for the monthly return', () => {
  it('caps pension wages and sends the rest of the employer share to EPF', () => {
    const b = pfBreakup({ pfWage: 15000, pfEmployee: 1800, pfEmployer: 1800 }, SETTINGS);
    expect(b).toEqual({
      epfWage: 15000, epsWage: 15000, edliWage: 15000,
      epfEmployee: 1800, epsEmployer: 1250, epfEmployer: 550, edli: 75,
    });
  });

  it('handles wages below the cap', () => {
    const b = pfBreakup({ pfWage: 7830, pfEmployee: 939.6, pfEmployer: 939.6 }, SETTINGS);
    expect(b.epfEmployee).toBe(940);
    expect(b.epsEmployer).toBe(652);           // 7,830 × 8.33%
    expect(b.epfEmployer).toBe(940 - 652);
    expect(b.edli).toBe(39);                   // 7,830 × 0.5%
  });

  it('derives the wage for entries stored before pfWage existed', () => {
    expect(pfBreakup({ pfEmployee: 1800, pfEmployer: 1800 }, SETTINGS).epfWage).toBe(15000);
    expect(pfBreakup({ pfWage: 0, pfEmployee: 0, pfEmployer: 0 }, SETTINGS).epfWage).toBe(0);
  });

  it('applies the minimum administration charge', () => {
    expect(pfAdminCharge(60000, SETTINGS)).toBe(500);   // 0.5% = 300 → minimum
    expect(pfAdminCharge(200000, SETTINGS)).toBe(1000);
    expect(pfAdminCharge(0, SETTINGS)).toBe(0);
  });
});

describe('engine with statutory inputs', () => {
  const inputs = { monthlyPackage: 45000, totalWorkingDays: 26, isPfApplicable: true };

  it('is unchanged when Professional Tax and LWF are absent', () => {
    const r = computeEntry(inputs, SETTINGS);
    expect(r.totalDeductions).toBe(1800);
    expect(r.netPayable).toBe(43200);
    expect(r.ctc).toBe(46800);
    expect(r.pfWage).toBe(15000);
  });

  it('adds Professional Tax and employee LWF to deductions, employer LWF to CTC', () => {
    const r = computeEntry({ ...inputs, professionalTax: 200, lwfEmployee: 10, lwfEmployer: 20 }, SETTINGS);
    expect(r.totalDeductions).toBe(2010);
    expect(r.netPayable).toBe(42990);
    expect(r.employerContributions).toBe(1820);
    expect(r.ctc).toBe(46820);
  });

  it('rounds PF to the rupee only when asked', () => {
    const odd = { monthlyPackage: 18000, totalWorkingDays: 26, isPfApplicable: true };
    expect(computeEntry(odd, SETTINGS).pfEmployee).toBe(939.6);
    expect(computeEntry(odd, { ...SETTINGS, pfRoundToRupee: true }).pfEmployee).toBe(940);
  });

  const ctx: StatutoryContext = {
    period: '2026-12', settings: SETTINGS,
    ptPolicies: [{ ...HALF_SPREAD, effectiveFrom: '2026-04' }],
    lwfPolicies: [{ state: 'Tamil Nadu', effectiveFrom: '2026-01', employeeAmount: 10, employerAmount: 20, deductionMonths: '12' }],
    priorByPerson: new Map(),
    loanDue: new Map(),
    tax: null,
  };

  it('adds the loan instalments due this month from the ledger', () => {
    const withLoan = { ...ctx, ptPolicies: [], lwfPolicies: [], loanDue: new Map([['p1', 3334]]) };
    const r = computeFullEntry(withLoan, inputs, [], { personId: 'p1', state: 'Tamil Nadu' });
    expect(r.loanDeduction).toBe(3334);
    expect(r.totalDeductions).toBe(1800 + 3334);
    expect(r.netPayable).toBe(43200 - 3334);
    expect(computeFullEntry(withLoan, inputs, [], { personId: 'p2', state: 'Tamil Nadu' }).loanDeduction).toBe(0);
  });

  it('computes a full entry with state policies', () => {
    // December is the third month of Oct–Mar with no earlier entries:
    // 45,000 × 4 = 1,80,000 → 1,200 over 4 months = 300
    const r = computeFullEntry(ctx, inputs, [], { personId: 'p1', state: 'Tamil Nadu' });
    expect(r.professionalTax).toBe(300);
    expect(r.lwfEmployee).toBe(10);
    expect(r.lwfEmployer).toBe(20);
    expect(r.totalDeductions).toBe(1800 + 300 + 10);
    expect(r.netPayable).toBe(45000 - 2110);
  });

  it('applies nothing state-wise without a work location, and honours a manual Professional Tax', () => {
    const none = computeFullEntry(ctx, inputs, [], { personId: 'p1', state: null });
    expect(none.professionalTax).toBe(0);
    expect(none.lwfEmployee).toBe(0);
    expect(none.netPayable).toBe(43200);
    const manual = computeFullEntry(ctx, inputs, [], { personId: 'p1', state: 'Tamil Nadu', ptOverride: 0 });
    expect(manual.professionalTax).toBe(0);
    expect(manual.totalDeductions).toBe(1810);
  });

  it('bases Professional Tax on gross including catalogue earnings', () => {
    const low = { monthlyPackage: 5000, totalWorkingDays: 26 };
    const base = computeFullEntry({ ...ctx, period: '2027-03', lwfPolicies: [] }, low, [], { personId: 'p1', state: 'Tamil Nadu' });
    expect(base.professionalTax).toBe(0); // 5,000 in the last month of the half
    const withBonus = computeFullEntry({ ...ctx, period: '2027-03', lwfPolicies: [] }, low,
      [{ type: 'EARNING', amount: 20000 }], { personId: 'p1', state: 'Tamil Nadu' });
    expect(withBonus.professionalTax).toBe(120); // 25,000
  });
});

describe('Professional Tax by town', () => {
  const state = { ...HALF_SPREAD, id: 'tn', locality: '' };
  const town = {
    ...HALF_SPREAD, id: 'cbe', locality: 'Coimbatore',
    slabs: [{ incomeFrom: 0, incomeTo: 60000, amount: 0 }, { incomeFrom: 60001, incomeTo: null, amount: 1250 }],
  };
  const policies = [state, town];

  it('uses the town’s policy for a work location in that town, else the state’s', () => {
    expect(ptPolicyInForce(policies, 'Tamil Nadu', 'Coimbatore', '2026-12')?.id).toBe('cbe');
    expect(ptPolicyInForce(policies, 'Tamil Nadu', '  coimbatore ', '2026-12')?.id).toBe('cbe');
    expect(ptPolicyInForce(policies, 'Tamil Nadu', 'Chennai', '2026-12')?.id).toBe('tn');
    expect(ptPolicyInForce(policies, 'Tamil Nadu', '', '2026-12')?.id).toBe('tn');
    expect(ptPolicyInForce(policies, 'Kerala', 'Coimbatore', '2026-12')).toBeUndefined();
  });

  it('falls back to the state until the town’s policy starts', () => {
    const later = [state, { ...town, effectiveFrom: '2026-10' }];
    expect(ptPolicyInForce(later, 'Tamil Nadu', 'Coimbatore', '2026-09')?.id).toBe('tn');
    expect(ptPolicyInForce(later, 'Tamil Nadu', 'Coimbatore', '2026-10')?.id).toBe('cbe');
  });

  it('never applies a town’s policy to the rest of the state', () => {
    expect(ptPolicyInForce([town], 'Tamil Nadu', 'Chennai', '2026-12')).toBeUndefined();
    expect(ptPolicyInForce([town], 'Tamil Nadu', null, '2026-12')).toBeUndefined();
  });

  it('names what a policy covers', () => {
    expect(ptAreaLabel(town)).toBe('Coimbatore, Tamil Nadu');
    expect(ptAreaLabel(state)).toBe('Tamil Nadu');
  });

  const ctx: StatutoryContext = {
    period: '2026-12', settings: SETTINGS, ptPolicies: policies, lwfPolicies: [],
    priorByPerson: new Map(), loanDue: new Map(), tax: null,
  };
  const inputs = { monthlyPackage: 45000, totalWorkingDays: 26 };

  it('computes the payslip from the town’s slabs', () => {
    // December, four months left in the half: 1,80,000 → state 1,200, town 1,250
    expect(computeFullEntry(ctx, inputs, [], { personId: 'p1', state: 'Tamil Nadu', town: 'Chennai' }).professionalTax).toBe(300);
    expect(computeFullEntry(ctx, inputs, [], { personId: 'p1', state: 'Tamil Nadu', town: 'Coimbatore' }).professionalTax).toBe(313);
  });

  it('deducts nothing at a location excluded from Professional Tax', () => {
    const r = computeFullEntry(
      { ...ctx, lwfPolicies: [{ state: 'Tamil Nadu', effectiveFrom: '2026-01', employeeAmount: 20, employerAmount: 40, deductionMonths: '12' }] },
      inputs, [], { personId: 'p1', state: 'Tamil Nadu', town: 'Coimbatore', excludeFromPt: true },
    );
    expect(r.professionalTax).toBe(0);
    expect(r.lwfEmployee).toBe(20); // the Labour Welfare Fund is not affected
  });

  it('reads the options from a work location', () => {
    expect(locationOptions({ state: 'Tamil Nadu', city: 'Coimbatore', excludeFromPt: true }))
      .toEqual({ state: 'Tamil Nadu', town: 'Coimbatore', excludeFromPt: true });
    expect(locationOptions(null)).toEqual({ state: undefined, town: undefined, excludeFromPt: false });
  });
});
