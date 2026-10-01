import { describe, it, expect } from 'vitest';
import {
  quarterPeriods, quarterOf, monthEnd, depositDueDate, challanTotal, challanTax, allocateChallan,
  quarterIssues, chapter6Rows, form16PartB,
} from '../payroll/tdsReturnCalc';
import { yearEndTax, computeTds, DEFAULT_TAX_CONFIGS, MonthFigures, EMPTY_TAX_PROFILE } from '../payroll/taxCalc';
import { computeEntry } from '../payrollCalc';

const SETTINGS = {
  basicPercentOfPackage: 50, daPercentOfBasic: 45, hraPercentOfBasic: 25,
  transportPercentOfBasic: 20, foodPercentOfBasic: 10, esiEmployeePercent: 0.75, esiEmployerPercent: 3.25,
  pfEmployeePercent: 12, pfEmployerPercent: 12, pfWageCap: 15000, pfWageFactor: 60, pfEmployerMatchesEmployee: true,
};
const NEW = DEFAULT_TAX_CONFIGS.find(c => c.regime === 'NEW')!;
const OLD = DEFAULT_TAX_CONFIGS.find(c => c.regime === 'OLD')!;
const PERIODS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'];

// Twelve full months of a package, with PF, and a TDS amount each month
function year(pkg: number, tds = 0, count = 12): MonthFigures[] {
  const e = computeEntry({ monthlyPackage: pkg, totalWorkingDays: 30, isPfApplicable: true }, SETTINGS);
  return PERIODS.slice(0, count).map(period => ({
    period, taxableGross: e.grossSalary, basic: e.basic, da: e.da, hra: e.hra,
    pfEmployee: e.pfEmployee, professionalTax: 0, tds,
  }));
}
const base = { fyLabel: '2026-27', settings: SETTINGS, perquisites: 0, age: 30, hasValidPan: true };

describe('quarters and dates', () => {
  it('maps periods to quarters of the financial year', () => {
    expect(quarterPeriods(2026, 1)).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(quarterPeriods(2026, 3)).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(quarterPeriods(2026, 4)).toEqual(['2027-01', '2027-02', '2027-03']);
    expect(quarterOf('2026-04')).toEqual({ fyStart: 2026, quarter: 1 });
    expect(quarterOf('2026-09')).toEqual({ fyStart: 2026, quarter: 2 });
    expect(quarterOf('2026-12')).toEqual({ fyStart: 2026, quarter: 3 });
    expect(quarterOf('2027-02')).toEqual({ fyStart: 2026, quarter: 4 });
  });

  it('knows month ends and deposit due dates', () => {
    expect(monthEnd('2027-02')).toBe('2027-02-28');
    expect(monthEnd('2028-02')).toBe('2028-02-29');
    expect(depositDueDate('2026-10')).toBe('2026-11-07');
    expect(depositDueDate('2026-12')).toBe('2027-01-07');
    expect(depositDueDate('2027-03')).toBe('2027-04-30'); // March has until the end of April
  });
});

describe('challans', () => {
  const challan = { tds: 9000, surcharge: 0, cess: 360, interest: 150, fee: 0, others: 0 };

  it('separates the tax of employees from the employer’s own charges', () => {
    expect(challanTotal(challan)).toBe(9510);
    expect(challanTax(challan)).toBe(9360);
  });

  it('allocates in name order, up to what each employee still has uncovered', () => {
    const dues = [
      { entryId: 'e2', personId: 'p2', name: 'Bala', tds: 5000, deposited: 0 },
      { entryId: 'e1', personId: 'p1', name: 'Asha', tds: 4000, deposited: 1000 },
      { entryId: 'e3', personId: 'p3', name: 'Chitra', tds: 2000, deposited: 0 },
    ];
    const r = allocateChallan(9360, dues);
    expect(r.allocations).toEqual([
      { entryId: 'e1', personId: 'p1', amount: 3000 },
      { entryId: 'e2', personId: 'p2', amount: 5000 },
      { entryId: 'e3', personId: 'p3', amount: 1360 },
    ]);
    expect(r.unallocated).toBe(0);
  });

  it('leaves over what no employee needs', () => {
    const r = allocateChallan(5000, [{ entryId: 'e1', personId: 'p1', name: 'Asha', tds: 3000, deposited: 0 }]);
    expect(r.allocations).toEqual([{ entryId: 'e1', personId: 'p1', amount: 3000 }]);
    expect(r.unallocated).toBe(2000);
    expect(allocateChallan(100, [{ entryId: 'e1', personId: 'p1', name: 'Asha', tds: 3000, deposited: 3000 }]).allocations).toEqual([]);
  });
});

describe('checks before filing a quarter', () => {
  const ok = {
    deductor: { tanNumber: 'CHEA12345B', responsibleName: 'R. Kumar' },
    months: [{ period: '2026-10', label: 'October 2026', status: 'FINALIZED', deducted: 9000, deposited: 9000 }],
    challans: [{ tds: 9000, surcharge: 0, cess: 0, interest: 0, fee: 0, others: 0, period: '2026-10', bsrCode: '0510308', challanSerial: '00042', depositedOn: '2026-11-05', allocated: 9000 }],
    noPan: [],
  };

  it('passes a clean quarter', () => {
    expect(quarterIssues(ok)).toEqual([]);
  });

  it('stops on a missing TAN, a draft month and tax without a challan', () => {
    const issues = quarterIssues({
      ...ok, deductor: { tanNumber: '' },
      months: [
        { period: '2026-10', label: 'October 2026', status: 'DRAFT', deducted: 9000, deposited: 4000 },
        { period: '2026-11', label: 'November 2026', status: null, deducted: 0, deposited: 0 },
      ],
    });
    const errors = issues.filter(i => i.level === 'ERROR').map(i => i.message);
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('TAN');
    expect(errors[1]).toContain('October 2026 is still a draft');
    expect(errors[2]).toContain('₹5,000 has no challan');
  });

  it('flags bad challan numbers, late deposits, loose amounts and missing PANs', () => {
    const issues = quarterIssues({
      ...ok,
      challans: [{ ...ok.challans[0], bsrCode: '12345', challanSerial: 'A1', depositedOn: '2026-11-09', allocated: 8000 }],
      noPan: ['Asha', 'Bala'],
    });
    const text = issues.map(i => `${i.level}: ${i.message}`).join('\n');
    expect(text).toContain('ERROR: Challan A1 of 2026-11-09: the BSR code must be 7 digits.');
    expect(text).toContain('ERROR: Challan A1 of 2026-11-09: the challan serial number must be up to 5 digits.');
    expect(text).toContain('₹1,000 is not matched to any employee');
    expect(text).toContain('deposited after the due date (2026-11-07)');
    expect(text).toContain('2 employees with no valid PAN: Asha, Bala');
  });
});

describe('year-end tax', () => {
  it('matches the last month’s projected working when the year went as projected', () => {
    const months = year(150000, 10000);
    const end = yearEndTax({ ...base, config: NEW, months, profile: EMPTY_TAX_PROFILE });
    const march = computeTds({
      config: NEW, fyLabel: '2026-27', period: '2027-03', monthsAfter: 0,
      earlier: months.slice(0, 11), current: { ...months[11], oneTime: 0 },
      projection: { settings: SETTINGS, monthlyPackage: 150000, isEsiEligible: false, isPfApplicable: true },
      profile: EMPTY_TAX_PROFILE, perquisites: 0, age: 30, hasValidPan: true,
    });
    expect(end.taxableIncome).toBe(march.working.taxableIncome);
    expect(end.tax.total).toBe(march.working.tax.total);
    expect(end.salaryPaid).toBe(150000 * 12);
    expect(end.paid.payroll).toBe(120000);          // all twelve months, the last included
    expect(end.balance).toBe(end.tax.total - 120000);
    expect(end.monthsPaid).toBe(12);
  });

  it('projects nothing for someone who left mid-year', () => {
    const end = yearEndTax({ ...base, config: NEW, months: year(150000, 0, 5), profile: EMPTY_TAX_PROFILE });
    expect(end.salaryPaid).toBe(750000);
    expect(end.income.projected).toBe(0);
    expect(end.taxableIncome).toBe(750000 - 75000);
    expect(end.tax.total).toBe(0); // within the rebate limit
  });

  it('counts the previous employer’s salary and tax', () => {
    const profile = { ...EMPTY_TAX_PROFILE, prevEmployerIncome: 600000, prevEmployerTds: 20000 };
    const end = yearEndTax({ ...base, config: NEW, months: year(150000, 5000, 6), profile });
    expect(end.grossSalary).toBe(900000 + 600000);
    expect(end.paid).toEqual({ payroll: 30000, previousEmployer: 20000, total: 50000 });
  });

  it('is empty-safe', () => {
    const end = yearEndTax({ ...base, config: NEW, months: [], profile: EMPTY_TAX_PROFILE });
    expect(end.grossSalary).toBe(0);
    expect(end.tax.total).toBe(0);
  });
});

describe('Form 16 Part B', () => {
  const sections = [
    { section: '80C', declared: 100000, approved: 90000, allowed: 100000 },
    { section: '80CCD(1B)', declared: 50000, approved: 50000, allowed: 50000 },
    { section: '80D', declared: 30000, approved: 25000, allowed: 25000 },
    { section: '80DD', declared: 75000, approved: 0, allowed: 75000 },
    { section: '80U', declared: 10000, approved: 0, allowed: 10000 },
  ];

  it('lays Chapter VI-A out as on the form', () => {
    const rows = chapter6Rows(sections, false, 21600, 121600, true);
    const get = (k: string) => rows.find(r => r.key === k)!;
    expect(rows.map(r => r.key).join('')).toBe('abcdefghijk');
    expect(get('a')).toMatchObject({ gross: 121600, deductible: 121600 }); // PF + 80C investments
    expect(get('d')).toMatchObject({ gross: 121600, deductible: 121600 });
    expect(get('e')).toMatchObject({ gross: 50000, deductible: 50000 });
    expect(get('g')).toMatchObject({ gross: 30000, deductible: 25000 });
    expect(get('k')).toMatchObject({ gross: 85000, deductible: 85000 });
    expect(get('k').label).toBe('Other sections (80DD, 80U)');
  });

  it('caps the 80C pool at the limit and uses approved amounts once proofs count', () => {
    const big = chapter6Rows([{ section: '80C', declared: 200000, approved: 140000, allowed: 150000 }], false, 21600, 150000, true);
    expect(big.find(r => r.key === 'a')).toMatchObject({ gross: 221600, deductible: 150000 });
    expect(big.find(r => r.key === 'd')!.deductible).toBe(150000);
    const poi = chapter6Rows([{ section: '80C', declared: 200000, approved: 140000, allowed: 140000 }], true, 21600, 150000, true);
    expect(poi.find(r => r.key === 'a')!.gross).toBe(161600);
  });

  it('allows nothing under the new regime', () => {
    const rows = chapter6Rows(sections, false, 21600, 0, false);
    expect(rows.every(r => r.deductible === 0)).toBe(true);
    expect(rows.find(r => r.key === 'a')!.gross).toBe(121600); // still shown as claimed
  });

  it('adds up line by line, old regime', () => {
    const profile = {
      ...EMPTY_TAX_PROFILE, annualRentPaid: 240000, section80C: 100000, otherDeductions: 25000,
      otherIncome: 12000, housingLoanInterest: 90000, prevEmployerIncome: 0,
    };
    const months = year(100000, 3000).map(m => ({ ...m, professionalTax: 200 }));
    const w = yearEndTax({ ...base, config: OLD, months, profile, perquisites: 4000 });
    const f = form16PartB({
      working: w, usePoi: false, allowsDeductions: true,
      bySection: [{ section: '80C', declared: 100000, approved: 0, allowed: 100000 }, { section: '80D', declared: 25000, approved: 0, allowed: 25000 }],
    });
    expect(f.newRegime).toBe(false);
    expect(f.gross.salary171).toBe(1200000);
    expect(f.gross.total).toBe(1204000);
    expect(f.fromCurrent).toBe(f.gross.total - f.exempt.total);
    expect(f.section16).toMatchObject({ standard: 50000, professionalTax: 2400, total: 52400 });
    expect(f.chargeable).toBe(f.fromCurrent + f.gross.otherEmployers - f.section16.total);
    expect(f.other).toEqual({ houseProperty: -90000, otherSources: 12000, total: -78000 });
    expect(f.grossTotalIncome).toBe(f.chargeable + f.other.total);
    expect(f.taxableIncome).toBe(f.grossTotalIncome - f.chapter6.total);
    const d = f.chapter6.rows.find(r => r.key === 'd')!.deductible;
    const g = f.chapter6.rows.find(r => r.key === 'g')!.deductible;
    expect(d + g).toBe(f.chapter6.total);
    expect(f.tax.payable).toBe(f.tax.onIncome - f.tax.rebate + f.tax.surcharge + f.tax.cess);
    expect(Math.round(f.tax.payable)).toBe(f.tax.net);
    expect(f.deducted).toEqual({ current: 36000, otherEmployers: 0, total: 36000 });
    expect(f.balance).toBe(f.tax.net - 36000);
  });

  it('marks the new regime and shows the higher rate without a PAN', () => {
    const w = yearEndTax({ ...base, config: NEW, months: year(150000, 0), profile: EMPTY_TAX_PROFILE, hasValidPan: false });
    const f = form16PartB({ working: w, bySection: [], usePoi: false, allowsDeductions: false });
    expect(f.newRegime).toBe(true);
    expect(f.tax.higherRateForPan).toBe(true);
    expect(f.tax.net).toBe(Math.round(f.taxableIncome * 0.2));
    expect(f.tax.net).toBeGreaterThan(f.tax.payable);
  });
});
