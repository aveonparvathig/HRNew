import { describe, it, expect } from 'vitest';
import {
  CONSULTANT_SPLIT, consultantTds, employerNps, employerNpsDeduction, npsPercentInput, taxTreatmentInput,
} from '../payroll/consultantCalc';
import { arrearFor, recurringOfMonth } from '../payroll/arrearCalc';
import { computeFullEntry, computesTds, StatutoryContext } from '../payroll/entryCompute';
import { DEFAULT_TAX_CONFIGS, EMPTY_TAX_PROFILE, MonthFigures, computeTds, yearEndTax } from '../payroll/taxCalc';
import { form16PartB } from '../payroll/tdsReturnCalc';
import { journalVoucher } from '../payroll/payoutCalc';
import { salaryStructure, withEmployerNps } from '../payroll/salaryStructure';
import { annualCtcOf, packageFromAnnualCtc, parseSplit } from '../payroll/structureCalc';
import { isReleaseMail, releaseNoticeEmail, welcomeEmail } from '../payroll/payslipFiles';
import { computeEntry } from '../payrollCalc';
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
const context = (over: Partial<StatutoryContext> = {}): StatutoryContext => ({
  period: '2026-04', settings: SETTINGS, ptPolicies: [], lwfPolicies: [],
  priorByPerson: new Map(), loanDue: new Map(), tax: null, recurringLines: new Map(), ...over,
});
const taxContext = () => ({
  fyStart: 2026, fyLabel: '2026-27', period: '2026-04', defaultRegime: 'NEW',
  later: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'],
  configs: new Map([['NEW', NEW], ['OLD', OLD]]), profiles: new Map(), earlier: new Map(),
  people: new Map([['p1', { dateOfBirth: '1990-01-01', leavingDate: null, panNumber: 'ABCPK1234F' }]]),
  perquisites: new Map(), nonTaxable: new Set<string>(), exemptKeys: [], workings: new Map(),
});

describe('a consultant paid through payroll', () => {
  const consultants = new Map([['p1', { section: '194J', percent: 10, hasValidPan: true }]]);
  const inputs = { monthlyPackage: 80000, totalWorkingDays: 30, isPfApplicable: true, isEsiEligible: true };

  it('has tax deducted at the flat rate on the whole fee, rounded up', () => {
    expect(consultantTds(80000, 10, true)).toEqual({ rate: 10, tds: 8000 });
    expect(consultantTds(33333, 10, true).tds).toBe(3334);
    expect(consultantTds(80000, 1, true).tds).toBe(800);
    expect(consultantTds(0, 10, true).tds).toBe(0);
  });

  it('is taxed at 20% without a valid PAN, when that is higher', () => {
    expect(consultantTds(80000, 10, false)).toEqual({ rate: 20, tds: 16000 });
    expect(consultantTds(80000, 30, false).rate).toBe(30);
  });

  it('is paid one fee, with no PF, ESI, Professional Tax or LWF', () => {
    const ptPolicies = [{ state: 'Tamil Nadu', locality: '', effectiveFrom: '2020-01', frequency: 'MONTHLY', slabs: [{ incomeFrom: 0, incomeTo: null, amount: 200 }] }];
    const r = computeFullEntry(context({ consultants, ptPolicies }), inputs, [], { personId: 'p1', state: 'Tamil Nadu' });
    expect(r).toMatchObject({
      basic: 80000, da: 0, hra: 0, transportAllowance: 0, foodAllowance: 0, grossSalary: 80000,
      pfEmployee: 0, pfEmployer: 0, esiEmployee: 0, esiEmployer: 0, professionalTax: 0, lwfEmployee: 0,
      tds: 8000, totalDeductions: 8000, netPayable: 72000, ctc: 80000, npsEmployer: 0,
      isPfApplicable: false, isEsiEligible: false, consultantSection: '194J', consultantTdsPercent: 10,
    });
    expect(parseSplit(r.structureSplit)).toEqual(CONSULTANT_SPLIT);
  });

  it('pays for the days worked, and is taxed on typed and recurring earnings too', () => {
    const recurring = new Map([['p1', [{ componentId: 'r', name: 'Retainer', type: 'EARNING', amount: 5000, fromPeriod: '2026-04', toPeriod: '', prorate: false }]]]);
    const r = computeFullEntry(context({ consultants, recurring }), { ...inputs, lopDays: 3 },
      [{ componentId: 'b', type: 'EARNING', amount: 1000, source: '' }], { personId: 'p1' });
    expect(r.basic).toBe(72000);
    expect(r.grossSalary).toBe(78000);
    expect(r.tds).toBe(7800);
  });

  it('is taxed whether or not salary TDS is being computed, and keeps no salary tax working', () => {
    const manual = context({ consultants });
    expect(computesTds(manual, 'p1')).toBe(true);
    expect(computesTds(manual, 'p2')).toBe(false);
    const ctx = context({ consultants, tax: taxContext() });
    expect(computeFullEntry(ctx, inputs, [], { personId: 'p1' }).tds).toBe(8000);
    expect(ctx.tax!.workings.has('p1')).toBe(false);
    // An employee in the same run still gets the salary working
    computeFullEntry(ctx, { monthlyPackage: 150000, totalWorkingDays: 30 }, [], { personId: 'p2' });
    expect(ctx.tax!.workings.has('p2')).toBe(true);
  });

  it('takes an amount typed over the flat rate', () => {
    expect(computeFullEntry(context({ consultants }), inputs, [], { personId: 'p1', tdsOverride: 5000 })).toMatchObject({ tds: 5000, netPayable: 75000 });
  });

  it('is checked as typed', () => {
    expect(taxTreatmentInput({ taxTreatment: 'CONSULTANT', consultantSection: '194C', consultantTdsPercent: '' }))
      .toEqual({ taxTreatment: 'CONSULTANT', consultantSection: '194C', consultantTdsPercent: 1 });
    expect(taxTreatmentInput({})).toEqual({ taxTreatment: 'SALARY', consultantSection: '194J', consultantTdsPercent: 10 });
    expect(taxTreatmentInput({ taxTreatment: 'FREELANCE' })).toMatch(/how the person is paid/);
    expect(taxTreatmentInput({ taxTreatment: 'CONSULTANT', consultantSection: '195' })).toMatch(/section/);
    expect(taxTreatmentInput({ taxTreatment: 'CONSULTANT', consultantTdsPercent: 55 })).toMatch(/between/);
  });
});

describe('the employer’s NPS contribution', () => {
  const inputs = { monthlyPackage: 100000, totalWorkingDays: 30 };
  const PERIODS = periodsOfFinancialYear(2026);
  const month = (period: string, npsEmployer: number): MonthFigures => ({
    period, taxableGross: 100000, basic: 50000, da: 22500, hra: 12500, pfEmployee: 0, professionalTax: 0, tds: 0, npsEmployer,
  });
  const endOfYear = (config: typeof NEW, nps: number) => yearEndTax({
    config, fyLabel: '2026-27', months: PERIODS.map(p => month(p, nps)), settings: SETTINGS,
    profile: EMPTY_TAX_PROFILE, perquisites: 0, age: 30, hasValidPan: true,
  });

  it('is a share of Basic + DA, to the rupee', () => {
    expect(employerNps(50000, 22500, 10)).toBe(7250);
    expect(employerNps(50000, 22500, 0)).toBe(0);
    expect(employerNps(33333, 0, 14)).toBe(4667);
  });

  it('adds to the cost to company and leaves the pay as it was', () => {
    const plain = computeEntry(inputs, SETTINGS);
    const r = computeFullEntry(context({ nps: new Map([['p1', 10]]) }), inputs, [], { personId: 'p1' });
    expect(r).toMatchObject({ npsEmployer: 7250, grossSalary: plain.grossSalary, netPayable: plain.netPayable });
    expect(r.ctc).toBe(plain.ctc + 7250);
    expect(r.employerContributions).toBe(plain.employerContributions + 7250);
    // Nobody else in the run is touched
    expect(computeFullEntry(context({ nps: new Map([['p1', 10]]) }), inputs, [], { personId: 'p2' })).toMatchObject({ npsEmployer: 0, ctc: plain.ctc });
  });

  it('is salary for tax, and comes off again within the limit, under either regime', () => {
    const plain = endOfYear(NEW, 0);
    const w = endOfYear(NEW, 7250);
    expect(w.income.employerNps).toBe(87000);
    expect(w.grossSalary).toBe(plain.grossSalary + 87000);
    expect(w.chapter6.employerNps).toBe(87000); // 10% contribution, 14% limit
    expect(w.taxableIncome).toBe(plain.taxableIncome);
    expect(endOfYear(OLD, 7250).taxableIncome).toBe(endOfYear(OLD, 0).taxableIncome);
  });

  it('is taxed on what goes over the limit', () => {
    // 20% contributed (14,500 a month); the old regime allows 10% of Basic + DA
    const w = endOfYear(OLD, 14500);
    expect(w.chapter6.employerNps).toBe(87000);
    expect(w.taxableIncome).toBe(endOfYear(OLD, 0).taxableIncome + 87000);
    expect(employerNpsDeduction(174000, 870000, 14)).toBe(121800);
    expect(employerNpsDeduction(50000, 870000, 14)).toBe(50000);
  });

  it('is projected over the months to come', () => {
    const { working } = computeTds({
      config: NEW, fyLabel: '2026-27', period: '2026-04', monthsAfter: 11, earlier: [],
      current: { ...month('2026-04', 7250), oneTime: 0 },
      projection: { settings: SETTINGS, monthlyPackage: 100000, isEsiEligible: false, isPfApplicable: false, npsEmployerPercent: 10 },
      profile: EMPTY_TAX_PROFILE, perquisites: 0, age: 30, hasValidPan: true,
    });
    expect(working.income.employerNps).toBe(87000);
    expect(working.chapter6.employerNps).toBe(87000);
  });

  it('reaches the tax working from the payslip computation', () => {
    const ctx = context({ nps: new Map([['p1', 10]]), tax: taxContext() });
    computeFullEntry(ctx, inputs, [], { personId: 'p1' });
    expect(ctx.tax!.workings.get('p1').income.employerNps).toBe(87000);
  });

  it('shows on Form 16 as salary and under section 80CCD(2)', () => {
    const f = form16PartB({ working: endOfYear(NEW, 7250), bySection: [], usePoi: false, allowsDeductions: false });
    expect(f.gross.salary171).toBe(1200000 + 87000);
    expect(f.chapter6.rows.find(r => r.key === 'f')).toMatchObject({ gross: 87000, deductible: 87000 });
    expect(f.chapter6.total).toBe(87000);
    // A year with none reads as before
    expect(form16PartB({ working: endOfYear(NEW, 0), bySection: [], usePoi: false, allowsDeductions: false }).gross.salary171).toBe(1200000);
  });

  it('is part of the full-month structure and of a package worked back from CTC', () => {
    const s = withEmployerNps(salaryStructure(100000, {}, SETTINGS), 10);
    expect(s.monthly).toMatchObject({ npsEmployer: 7250, ctc: 107250, grossSalary: 100000 });
    expect(s.annual.npsEmployer).toBe(87000);
    expect(withEmployerNps(salaryStructure(100000, {}, SETTINGS), 0).monthly.npsEmployer).toBeUndefined();
    expect(annualCtcOf(100000, { npsEmployerPercent: 10 }, SETTINGS)).toBe(1287000);
    expect(packageFromAnnualCtc(1287000, { npsEmployerPercent: 10 }, SETTINGS)).toBe(100000);
  });

  it('posts to the journal voucher on both sides', () => {
    const entry = {
      id: 'a', personId: 'a', lines: [], professionalTax: 0, lwfEmployee: 0, lwfEmployer: 0, loanDeduction: 0, reimbursement: 0,
      ...computeEntry(inputs, SETTINGS), npsEmployer: 7250, person: { id: 'a', name: 'A' },
    };
    const jv = journalVoucher([entry]);
    expect(jv.lines.find(l => l.ledger === 'NPS Employer Contribution')).toMatchObject({ debit: 7250 });
    expect(jv.lines.find(l => l.ledger === 'NPS Payable')).toMatchObject({ credit: 7250 });
    expect(jv.totalDebit).toBe(jv.totalCredit);
  });

  it('is checked as typed', () => {
    expect(npsPercentInput('')).toBe(0);
    expect(npsPercentInput('10')).toBe(10);
    expect(npsPercentInput(25)).toMatch(/between 0% and 20%/);
  });
});

describe('loss of pay changed on a past month with recurring components', () => {
  const paid = { monthlyPackage: 60000, totalWorkingDays: 30, lopDays: 3, isEsiEligible: false, isPfApplicable: false };
  const special = { componentId: 'special', name: 'Special Allowance', type: 'EARNING', amount: 6000, fromPeriod: '2026-04', toPeriod: '', prorate: true };

  it('pays back the recurring earnings of the days reversed', () => {
    const a = arrearFor(paid, { monthlyPackage: 60000, lopDays: 0 }, SETTINGS, [], [special]);
    expect(a.recurring).toBe(600);        // 3 of 30 days of 6,000
    expect(a.gross).toBe(6000 + 600);     // 3 of 30 days of 60,000, and the allowance
  });

  it('takes them back when days are added', () => {
    const a = arrearFor({ ...paid, lopDays: 0 }, { monthlyPackage: 60000, lopDays: 2 }, SETTINGS, [], [special]);
    expect(a.recurring).toBe(-400);
    expect(a.gross).toBe(-4400);
  });

  it('counts what was already raised for the month', () => {
    const first = arrearFor(paid, { monthlyPackage: 60000, lopDays: 1 }, SETTINGS, [], [special]);
    const second = arrearFor(paid, { monthlyPackage: 60000, lopDays: 0 }, SETTINGS, [first], [special]);
    expect(first.recurring).toBe(400);
    expect(second.recurring).toBe(200);
    expect(arrearFor(paid, { monthlyPackage: 60000, lopDays: 0 }, SETTINGS, [first, second], [special])).toMatchObject({ recurring: 0, gross: 0 });
  });

  it('is unchanged when the days are not (a revision), and with no recurring component', () => {
    expect(arrearFor(paid, { monthlyPackage: 66000, lopDays: 3 }, SETTINGS, [], [special]).recurring).toBe(0);
    expect(arrearFor(paid, { monthlyPackage: 60000, lopDays: 0 }, SETTINGS)).toMatchObject({ recurring: 0, gross: 6000 });
  });

  it('follows only earnings that are reduced for loss of pay and were paid as recurring that month', () => {
    const items = [
      special,
      { ...special, componentId: 'fixed', prorate: false },
      { ...special, componentId: 'club', type: 'DEDUCTION' },
      { ...special, componentId: 'later', fromPeriod: '2026-09' },
      { ...special, componentId: 'typed' },
    ];
    const lines = [{ componentId: 'special', source: 'RECURRING' }, { componentId: 'typed', source: '' }];
    expect(recurringOfMonth(items, '2026-06', lines).map(i => i.componentId)).toEqual(['special']);
  });
});

describe('mails the system sends by itself', () => {
  const company = { name: 'Aveon Infotech', email: 'hr@example.com' };

  it('tell a new login where to sign in and its temporary password', () => {
    const m = welcomeEmail(company, 'Asha', 'asha@example.com', 'kite-1234-lamp', 'https://hr.example.com');
    expect(m.subject).toBe('Your login for Aveon Infotech');
    expect(m.text).toContain('https://hr.example.com');
    expect(m.text).toContain('asha@example.com');
    expect(m.text).toContain('kite-1234-lamp');
    expect(m.text).toContain('choose a password of your own');
    expect(welcomeEmail(company, '<b>x</b>', 'a@b.co', 'p', '').html).not.toContain('<b>x</b>');
  });

  it('tell an employee their payslip is ready', () => {
    const m = releaseNoticeEmail(company, { name: 'Asha' }, '2026-10', 'https://hr.example.com');
    expect(m.subject).toBe('Payslip for October 2026 is ready — Aveon Infotech');
    expect(m.text).toContain('Sign in at https://hr.example.com and open My Pay');
    expect(releaseNoticeEmail(company, { name: 'Asha' }, '2026-10', '').text).toContain('Sign in and open My Pay');
  });

  it('are one of three choices on release', () => {
    expect(['NONE', 'NOTICE', 'PAYSLIP'].every(isReleaseMail)).toBe(true);
    expect(isReleaseMail('ALWAYS')).toBe(false);
  });
});
