import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TAX_CONFIGS, EMPTY_TAX_PROFILE, MonthFigures, TaxProfileLike, computeTds, yearEndTax,
} from '../payroll/taxCalc';
import {
  DEFAULT_DECLARATION_ITEMS, ITEMS_ADDED_LATER, cleanLandlords, cleanRentByMonth, declarationTotals,
  effectiveTaxProfile, exemptionRulesFor, landlordProblem, rentByMonthFor, selfEditState,
} from '../payroll/declarationCalc';
import { LOAN_HEAD, PERQUISITE_HEADS, perquisiteInput, perquisiteRows, typedPerquisites } from '../payroll/perquisiteCalc';
import { form16PartB, previousQuarter, quarterIssues, returnAddress } from '../payroll/tdsReturnCalc';
import { periodsOfFinancialYear } from '../payroll/financialYear';

const NEW = DEFAULT_TAX_CONFIGS.find(c => c.regime === 'NEW')!;
const OLD = DEFAULT_TAX_CONFIGS.find(c => c.regime === 'OLD')!;
const SETTINGS = {
  basicPercentOfPackage: 50, daPercentOfBasic: 45, hraPercentOfBasic: 25,
  transportPercentOfBasic: 20, foodPercentOfBasic: 10,
  esiEmployeePercent: 0.75, esiEmployerPercent: 3.25, esiWageCeiling: 21000,
  pfEmployeePercent: 12, pfEmployerPercent: 12, pfWageCap: 15000, pfWageFactor: 60,
  pfEmployerMatchesEmployee: true,
};
const PERIODS = periodsOfFinancialYear(2026);

// A 1,00,000 package: basic 50,000, DA 22,500, HRA 12,500, transport 10,000, food 5,000
const month = (period: string): MonthFigures => ({
  period, taxableGross: 100000, basic: 50000, da: 22500, hra: 12500, pfEmployee: 1800, professionalTax: 0, tds: 0,
  components: { foodAllowance: 5000, transportAllowance: 10000 },
});
const YEAR = PERIODS.map(month);
const endOfYear = (config: typeof OLD, profile: Partial<TaxProfileLike>, months = YEAR) => yearEndTax({
  config, fyLabel: '2026-27', months, settings: SETTINGS,
  profile: { ...EMPTY_TAX_PROFILE, ...profile }, perquisites: 0, age: 30, hasValidPan: true,
});
const rule = (over: any = {}) => ({ name: 'Meal allowance', key: 'foodAllowance', limit: 2200, period: 'MONTH', regime: 'OLD', claimed: null, ...over });

describe('exempt allowances', () => {
  const plain = endOfYear(OLD, {});

  it('change nothing until a rule exists', () => {
    expect(plain.exemptions).toEqual({ hra: 0, allowances: [], total: 0 });
  });

  it('exempt a monthly limit of each month paid', () => {
    const w = endOfYear(OLD, { exemptions: [rule()] });
    expect(w.exemptions.allowances).toEqual([{ name: 'Meal allowance', amount: 26400 }]);
    expect(w.incomeFromSalary).toBe(plain.incomeFromSalary - 26400);
  });

  it('never exempt more than was paid in a month', () => {
    const w = endOfYear(OLD, { exemptions: [rule({ limit: 8000 })] });
    expect(w.exemptions.total).toBe(60000); // 5,000 paid a month
  });

  it('apply a yearly limit to the year’s total', () => {
    const w = endOfYear(OLD, { exemptions: [rule({ key: 'transportAllowance', name: 'Conveyance', limit: 30000, period: 'YEAR' })] });
    expect(w.exemptions.allowances).toEqual([{ name: 'Conveyance', amount: 30000 }]);
  });

  it('stop at what the employee claimed where the rule needs a proof', () => {
    expect(endOfYear(OLD, { exemptions: [rule({ limit: 30000, period: 'YEAR', claimed: 18000 })] }).exemptions.total).toBe(18000);
    expect(endOfYear(OLD, { exemptions: [rule({ limit: null, period: 'YEAR', claimed: 45000 })] }).exemptions.total).toBe(45000);
    expect(endOfYear(OLD, { exemptions: [rule({ claimed: 0 })] }).exemptions.total).toBe(0);
  });

  it('are for the old regime unless the rule says both', () => {
    expect(endOfYear(NEW, { exemptions: [rule()] }).exemptions.total).toBe(0);
    expect(endOfYear(NEW, { exemptions: [rule({ regime: 'BOTH' })] }).exemptions.total).toBe(26400);
  });

  it('are projected over the months to come from the salary structure', () => {
    const { working } = computeTds({
      config: OLD, fyLabel: '2026-27', period: '2026-06', monthsAfter: 9,
      earlier: YEAR.slice(0, 2), current: { ...YEAR[2], oneTime: 0 },
      projection: { settings: SETTINGS, monthlyPackage: 100000, isEsiEligible: false, isPfApplicable: true },
      profile: { ...EMPTY_TAX_PROFILE, exemptions: [rule()] }, perquisites: 0, age: 30, hasValidPan: true,
    });
    expect(working.exemptions.allowances).toEqual([{ name: 'Meal allowance', amount: 26400 }]);
  });

  it('do not project a component the structure does not pay every month', () => {
    const { working } = computeTds({
      config: OLD, fyLabel: '2026-27', period: '2026-04', monthsAfter: 11,
      earlier: [], current: { ...YEAR[0], components: { 'c:uniform': 3000 }, oneTime: 0 },
      projection: { settings: SETTINGS, monthlyPackage: 100000, isEsiEligible: false, isPfApplicable: true },
      profile: { ...EMPTY_TAX_PROFILE, exemptions: [rule({ key: 'c:uniform', name: 'Uniform', limit: null, period: 'YEAR' })] },
      perquisites: 0, age: 30, hasValidPan: true,
    });
    expect(working.exemptions.total).toBe(3000);
  });
});

describe('rent month by month', () => {
  const halfYear = Object.fromEntries(PERIODS.slice(0, 6).map(p => [p, 20000]));

  it('works the HRA exemption out for each month on its own', () => {
    // A rented month: least of HRA 12,500, rent 20,000 − 7,250, and 40% of 72,500
    expect(endOfYear(OLD, { annualRentPaid: 120000, rentByMonth: halfYear }).exemptions.hra).toBe(75000);
  });

  it('keeps the yearly working when only the year’s rent is known', () => {
    // 1,20,000 − 10% of 8,70,000
    expect(endOfYear(OLD, { annualRentPaid: 120000 }).exemptions.hra).toBe(33000);
  });

  it('gives nothing under the new regime', () => {
    expect(endOfYear(NEW, { annualRentPaid: 120000, rentByMonth: halfYear }).exemptions.hra).toBe(0);
  });

  it('is kept to the months of the year, and blank when there is no rent', () => {
    expect(cleanRentByMonth({ '2026-04': 15000, '2025-12': 9000, '2026-05': '' }, PERIODS)).toEqual({ '2026-04': 15000 });
    expect(cleanRentByMonth({ '2026-04': 0 }, PERIODS)).toBeNull();
    expect(cleanRentByMonth({ '2026-04': -5 }, PERIODS)).toBe('Rent cannot be negative');
  });

  it('is scaled to the rent approved once proofs are considered', () => {
    const profile = {
      prevEmployerIncome: 0, prevEmployerTds: 0, otherIncome: 0, annualRentPaid: 120000, isMetro: false,
      housingLoanInterest: 0, poiConsidered: true, rentApproved: 60000, housingInterestApproved: null, rentByMonth: halfYear,
    };
    expect(rentByMonthFor(profile)!['2026-04']).toBe(10000);
    expect(rentByMonthFor({ ...profile, poiConsidered: false })!['2026-04']).toBe(20000);
    expect(rentByMonthFor({ ...profile, rentByMonth: null })).toBeNull();
  });
});

describe('house property', () => {
  it('keeps self-occupied interest as it was', () => {
    const w = endOfYear(OLD, { housingLoanInterest: 150000 });
    expect(w.houseProperty).toBe(-150000);
    expect(w.grossTotalIncome).toBe(w.incomeFromSalary - 150000);
  });

  it('adds income from a let-out property', () => {
    const w = endOfYear(OLD, { letOutIncome: 120000, housingLoanInterest: 50000 });
    expect(w.houseProperty).toBe(70000);
    expect(w.grossTotalIncome).toBe(w.incomeFromSalary + 70000);
  });

  it('sets a loss off only up to the limit', () => {
    expect(endOfYear(OLD, { letOutLoss: 300000 }).houseProperty).toBe(-OLD.housingInterestLimit);
    expect(endOfYear(OLD, { letOutLoss: 120000, housingLoanInterest: 150000 }).houseProperty).toBe(-OLD.housingInterestLimit);
  });

  it('sets no loss off under the new regime', () => {
    expect(endOfYear(NEW, { letOutLoss: 300000, letOutIncome: 100000 }).houseProperty).toBe(0);
    expect(endOfYear(NEW, { letOutIncome: 100000, housingLoanInterest: 150000 }).houseProperty).toBe(100000);
  });
});

describe('tax paid elsewhere', () => {
  it('counts as tax already paid', () => {
    const plain = endOfYear(NEW, {});
    const w = endOfYear(NEW, { taxCredit: 10000 });
    expect(w.paid).toEqual({ payroll: 0, previousEmployer: 0, elsewhere: 10000, total: 10000 });
    expect(w.balance).toBe(plain.balance - 10000);
    expect(w.tax.total).toBe(plain.tax.total);
  });

  it('lowers the tax still to be deducted this month', () => {
    const inputs = (profile: TaxProfileLike) => ({
      config: NEW, fyLabel: '2026-27', period: '2026-04', monthsAfter: 11,
      earlier: [], current: { ...month('2026-04'), taxableGross: 200000, oneTime: 0 },
      projection: { settings: SETTINGS, monthlyPackage: 200000, isEsiEligible: false, isPfApplicable: true },
      profile, perquisites: 0, age: 30, hasValidPan: true,
    });
    const plain = computeTds(inputs(EMPTY_TAX_PROFILE));
    const credited = computeTds(inputs({ ...EMPTY_TAX_PROFILE, taxCredit: 12000 }));
    expect(credited.tds).toBe(plain.tds - 1000);
  });
});

describe('declaration items of every kind', () => {
  const ITEMS = [
    { id: 'lic', name: 'Life insurance', section: '80C', group: 'SECTION_80C', maxAmount: 150000, deductPercent: 100 },
    { id: 'fd', name: 'Interest income', section: 'Other sources', group: 'OTHER_INCOME', maxAmount: null, deductPercent: 100 },
    { id: 'rent', name: 'Let-out income', section: 'House property', group: 'LET_OUT_INCOME', maxAmount: null, deductPercent: 100 },
    { id: 'loss', name: 'Let-out loss', section: 'House property', group: 'LET_OUT_LOSS', maxAmount: null, deductPercent: 100 },
    { id: 'tds', name: 'TDS elsewhere', section: 'TDS', group: 'TAX_CREDIT', maxAmount: null, deductPercent: 100 },
    {
      id: 'meal', name: 'Meal allowance', section: '10(14)', group: 'EXEMPTION', maxAmount: 2200, deductPercent: 100,
      componentKey: 'foodAllowance', limitPeriod: 'MONTH', regime: 'BOTH', proofRequired: false,
    },
    {
      id: 'lta', name: 'Leave travel', section: '10(5)', group: 'EXEMPTION', maxAmount: null, deductPercent: 100,
      componentKey: 'c:lta', limitPeriod: 'YEAR', regime: 'OLD', proofRequired: true,
    },
    {
      id: 'old', name: 'Retired rule', section: '10(14)', group: 'EXEMPTION', maxAmount: 100, deductPercent: 100,
      componentKey: 'transportAllowance', limitPeriod: 'MONTH', regime: 'OLD', isActive: false,
    },
  ];
  const line = (itemId: string, declaredAmount: number, approvedAmount: number | null = null) => ({ itemId, declaredAmount, approvedAmount });
  const lines = [line('lic', 60000), line('fd', 18000), line('rent', 90000), line('loss', 40000), line('tds', 1800), line('lta', 30000, 25000)];

  it('feed their own totals, and only deductions show by section', () => {
    const t = declarationTotals(lines, ITEMS, false);
    expect(t).toMatchObject({ section80C: 60000, otherDeductions: 0, otherIncome: 18000, letOutIncome: 90000, letOutLoss: 40000, taxCredit: 1800 });
    expect(t.bySection.map(s => s.section)).toEqual(['80C']);
  });

  it('give every rule in force, with the claim where a proof is needed', () => {
    expect(exemptionRulesFor(lines, ITEMS, false)).toEqual([
      { name: 'Meal allowance', key: 'foodAllowance', limit: 2200, period: 'MONTH', regime: 'BOTH', claimed: null },
      { name: 'Leave travel', key: 'c:lta', limit: null, period: 'YEAR', regime: 'OLD', claimed: 30000 },
    ]);
    expect(exemptionRulesFor(lines, ITEMS, true)[1].claimed).toBe(25000);
    expect(exemptionRulesFor([], ITEMS, false)[1].claimed).toBe(0);
  });

  it('reach the tax engine through the employee’s profile', () => {
    const p = effectiveTaxProfile({
      prevEmployerIncome: 0, prevEmployerTds: 0, otherIncome: 5000, annualRentPaid: 0, isMetro: false,
      housingLoanInterest: 0, poiConsidered: false, rentApproved: null, housingInterestApproved: null,
    }, lines, ITEMS);
    expect(p).toMatchObject({ otherIncome: 23000, letOutIncome: 90000, letOutLoss: 40000, taxCredit: 1800, section80C: 60000 });
    expect(p.exemptions).toHaveLength(2);
  });

  it('are all in the starter catalogue, the later ones included', () => {
    const codes = DEFAULT_DECLARATION_ITEMS.map(i => i[0]);
    expect(ITEMS_ADDED_LATER.every(code => codes.includes(code))).toBe(true);
    // No exemption rule ships switched on: which allowances are exempt is the company's call
    expect(DEFAULT_DECLARATION_ITEMS.some(i => i[4] === 'EXEMPTION')).toBe(false);
  });
});

describe('landlords', () => {
  const two = [{ name: 'A Landlord', pan: 'ABCDE1234F', address: '', rent: 90000 }, { name: 'B Landlord', pan: 'ABCDE1234G', address: '', rent: 60000 }];

  it('drops blank rows and tidies the PAN', () => {
    expect(cleanLandlords([{ name: ' A ', pan: 'abcde1234f', rent: '5000' }, { name: '', pan: '', rent: 0 }, null]))
      .toEqual([{ name: 'A', pan: 'ABCDE1234F', address: '', rent: 5000 }]);
    expect(cleanLandlords('x')).toEqual([]);
  });

  it('needs a name for each, a PAN above one lakh of rent, and rents that add up', () => {
    expect(landlordProblem(two, 150000)).toBeNull();
    expect(landlordProblem([{ ...two[0], name: '' }], 90000)).toMatch(/name/);
    expect(landlordProblem([{ ...two[0], pan: '' }], 150000)).toMatch(/PAN is required/);
    expect(landlordProblem([{ ...two[0], pan: '' }], 90000)).toBeNull();
    expect(landlordProblem([{ ...two[0], pan: 'WRONG' }], 90000)).toMatch(/ABCDE1234F/);
    expect(landlordProblem(two, 200000)).toMatch(/adds up/);
    expect(landlordProblem([...two, ...two, two[0]], 150000)).toMatch(/Up to 4/);
  });
});

describe('who can change a declaration', () => {
  const open = { declarationOpen: true };
  const closed = { declarationOpen: false };

  it('the employee, while it is a draft and the window is open', () => {
    expect(selfEditState({ status: 'DRAFT', editGranted: false }, open).canEdit).toBe(true);
    expect(selfEditState({ status: 'DRAFT', editGranted: false }, closed)).toMatchObject({ canEdit: false, why: expect.stringMatching(/window is closed/) });
  });

  it('nobody but HR once it is submitted', () => {
    expect(selfEditState({ status: 'SUBMITTED', editGranted: false }, open)).toMatchObject({ canEdit: false, why: expect.stringMatching(/submitted/) });
    expect(selfEditState({ status: 'REVIEWED', editGranted: true }, open).canEdit).toBe(false);
  });

  it('the employee again when HR reopens it, even with the window closed', () => {
    expect(selfEditState({ status: 'DRAFT', editGranted: true }, closed).canEdit).toBe(true);
  });
});

describe('perquisites', () => {
  const values = [{ head: 1, value: 120000, recovered: 20000 }, { head: 8, value: 6000, recovered: 6000 }, { head: LOAN_HEAD, value: 99999, recovered: 0 }];

  it('are taxed on their value less what the employee paid', () => {
    expect(typedPerquisites(values)).toBe(100000); // the loan line is not typed
    const { rows, total } = perquisiteRows(values, 4500);
    expect(rows).toHaveLength(PERQUISITE_HEADS.length);
    expect(rows[0]).toMatchObject({ head: 1, value: 120000, recovered: 20000, taxable: 100000, automatic: false });
    expect(rows[LOAN_HEAD - 1]).toMatchObject({ value: 4500, taxable: 4500, automatic: true });
    expect(total).toEqual({ value: 130500, recovered: 26000, taxable: 104500 });
  });

  it('are checked as typed', () => {
    expect(perquisiteInput({ head: 2, value: 5000, recovered: 1000 })).toEqual({ head: 2, value: 5000, recovered: 1000 });
    expect(perquisiteInput({ head: 2, value: 0 })).toBeNull();
    expect(perquisiteInput({ head: 2, value: 100, recovered: 200 })).toMatch(/cannot be more/);
    expect(perquisiteInput({ head: LOAN_HEAD, value: 100 })).toMatch(/loan ledger/);
    expect(perquisiteInput({ head: 99, value: 100 })).toBe('Unknown perquisite');
    expect(perquisiteInput({ head: 2, value: -1 })).toMatch(/negative/);
  });
});

describe('return details', () => {
  it('quote the return of the quarter before', () => {
    expect(previousQuarter(2026, 3)).toEqual({ fyStart: 2026, quarter: 2 });
    expect(previousQuarter(2026, 1)).toEqual({ fyStart: 2025, quarter: 4 });
  });

  it('take an address field by field, or the old single line until it is filled', () => {
    const a = returnAddress({ deductorFlat: '12', deductorCity: 'Coimbatore', deductorState: 'Tamil Nadu', deductorPin: '641001', deductorAddressChanged: true }, 'deductor', 'Old line');
    expect(a).toMatchObject({ filled: true, changed: true, flat: '12', pin: '641001', line: '12, Coimbatore, Tamil Nadu, 641001' });
    expect(returnAddress({}, 'responsible', 'Old line')).toMatchObject({ filled: false, changed: false, line: 'Old line' });
  });

  it('warn when the employer’s address is not field by field', () => {
    const base = { deductor: { tanNumber: 'ABCD12345E', responsibleName: 'A' }, months: [], challans: [], noPan: [] };
    expect(quarterIssues({ ...base, addressFilled: false }).map(i => i.message).join(' ')).toMatch(/field by field/);
    expect(quarterIssues({ ...base, addressFilled: true })).toEqual([]);
    expect(quarterIssues(base)).toEqual([]);
  });
});

describe('Form 16 Part B with the new figures', () => {
  it('shows other exempt allowances, house property and tax paid elsewhere', () => {
    const working = endOfYear(OLD, { exemptions: [rule()], letOutIncome: 50000, taxCredit: 2000 });
    const f = form16PartB({ working, bySection: [], usePoi: false, allowsDeductions: true });
    expect(f.exempt).toEqual({ hra: 0, allowances: [{ name: 'Meal allowance', amount: 26400 }], total: 26400 });
    expect(f.fromCurrent).toBe(1200000 - 26400);
    expect(f.other.houseProperty).toBe(50000);
    expect(f.deducted).toEqual({ current: 0, otherEmployers: 0, elsewhere: 2000, total: 2000 });
    expect(f.grossTotalIncome).toBe(f.chargeable + 50000);
  });

  it('reads a working kept before these figures existed', () => {
    const old = {
      regime: 'OLD', salaryPaid: 600000, income: {}, exemptions: { hra: 10000 }, deductions: { standard: 50000, professionalTax: 0 },
      incomeFromSalary: 540000, housingLoanInterest: 30000, otherIncome: 0, grossTotalIncome: 510000,
      chapter6: { pf: 0, section80C: 0, total: 0 }, taxableIncome: 510000,
      tax: { taxOnIncome: 0, rebate: 0, surcharge: 0, cess: 0, total: 0 }, paid: { payroll: 0, previousEmployer: 0, total: 0 }, balance: 0,
    };
    const f = form16PartB({ working: old, bySection: [], usePoi: false, allowsDeductions: true });
    expect(f.exempt).toEqual({ hra: 10000, allowances: [], total: 10000 });
    expect(f.other.houseProperty).toBe(-30000);
    expect(f.deducted.elsewhere).toBe(0);
  });
});
