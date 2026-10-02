import { describe, it, expect } from 'vitest';
import {
  annualCtcOf, entrySettings, grossPercent, monthlyPackageFrom, packageFromAnnualCtc, parseSplit, splitInput,
  splitOf, splitText, templateFor, withSplit,
} from '../payroll/structureCalc';
import { coversPeriod, recurringAmount, recurringLater, recurringLines, recurringProblem } from '../payroll/recurringCalc';
import { firstFree, formatNumber, seriesInput } from '../payroll/numberSeriesCalc';
import { journalVoucher, journalVoucherBy, NO_GROUP } from '../payroll/payoutCalc';
import { salaryStructure, withRecurring } from '../payroll/salaryStructure';
import { arrearFor } from '../payroll/arrearCalc';
import { fullMonthEsiWage } from '../payroll/checks';
import { computeEntry } from '../payrollCalc';
import { computeFullEntry, StatutoryContext } from '../payroll/entryCompute';
import { DEFAULT_TAX_CONFIGS } from '../payroll/taxCalc';

const SETTINGS = {
  basicPercentOfPackage: 50, daPercentOfBasic: 45, hraPercentOfBasic: 25,
  transportPercentOfBasic: 20, foodPercentOfBasic: 10,
  esiEmployeePercent: 0.75, esiEmployerPercent: 3.25, esiWageCeiling: 21000,
  pfEmployeePercent: 12, pfEmployerPercent: 12, pfWageCap: 15000, pfWageFactor: 60,
  pfEmployerMatchesEmployee: true,
};
// Basic 50,000 and HRA 25,000, transport 15,000, food 10,000 on a 1,00,000 package
const MANAGER = { basicPercentOfPackage: 50, daPercentOfBasic: 0, hraPercentOfBasic: 50, transportPercentOfBasic: 30, foodPercentOfBasic: 20 };
const template = (id: string, over: any = {}) => ({ id, name: `Template ${id}`, isActive: true, ...MANAGER, ...over });

describe('a salary split of its own', () => {
  it('says what share of the package it pays as gross', () => {
    expect(grossPercent(splitOf(SETTINGS))).toBe(100);
    expect(grossPercent(MANAGER)).toBe(100);
    expect(grossPercent({ ...MANAGER, hraPercentOfBasic: 40 })).toBe(95);
  });

  it('is checked as typed', () => {
    expect(splitInput(MANAGER)).toEqual(MANAGER);
    expect(splitInput({ ...MANAGER, daPercentOfBasic: '' })).toMatch(/DA/);
    expect(splitInput({ ...MANAGER, basicPercentOfPackage: 0 })).toMatch(/Basic must be/);
    expect(splitInput({ ...MANAGER, basicPercentOfPackage: 60 })).toMatch(/add up to 120%/);
    expect(splitInput({ ...MANAGER, foodPercentOfBasic: -1 })).toMatch(/Food/);
  });

  it('changes the components and nothing else', () => {
    const company = computeEntry({ monthlyPackage: 100000, totalWorkingDays: 30 }, SETTINGS);
    const own = computeEntry({ monthlyPackage: 100000, totalWorkingDays: 30 }, withSplit(SETTINGS, MANAGER));
    expect(company).toMatchObject({ basic: 50000, da: 22500, hra: 12500, transportAllowance: 10000, foodAllowance: 5000, grossSalary: 100000 });
    expect(own).toMatchObject({ basic: 50000, da: 0, hra: 25000, transportAllowance: 15000, foodAllowance: 10000, grossSalary: 100000 });
    expect(withSplit(SETTINGS, null)).toBe(SETTINGS);
  });

  it('is kept on a payslip as text and read back', () => {
    expect(parseSplit(splitText(MANAGER))).toEqual(MANAGER);
    expect(parseSplit('')).toBeNull();
    expect(parseSplit('not json')).toBeNull();
    expect(parseSplit('{"basicPercentOfPackage":0}')).toBeNull();
    expect(entrySettings(SETTINGS, { structureSplit: '' })).toBe(SETTINGS);
    expect(entrySettings(SETTINGS, { structureSplit: splitText(MANAGER) }).daPercentOfBasic).toBe(0);
  });
});

describe('who a template applies to', () => {
  const templates = [template('emp'), template('des'), template('dep'), template('off', { isActive: false })];
  const person = { id: 'p1', designation: 'Manager', department: 'Sales' };

  it('is the employee’s own, then the designation’s, then the department’s', () => {
    const all = [
      { scope: 'DEPARTMENT', target: 'Sales', templateId: 'dep' },
      { scope: 'DESIGNATION', target: 'Manager', templateId: 'des' },
      { scope: 'EMPLOYEE', target: 'p1', templateId: 'emp' },
    ];
    expect(templateFor(person, all, templates)).toMatchObject({ scope: 'EMPLOYEE', template: { id: 'emp' } });
    expect(templateFor(person, all.slice(0, 2), templates)).toMatchObject({ scope: 'DESIGNATION', template: { id: 'des' } });
    expect(templateFor(person, all.slice(0, 1), templates)).toMatchObject({ scope: 'DEPARTMENT', template: { id: 'dep' } });
  });

  it('matches a label however it was typed', () => {
    expect(templateFor(person, [{ scope: 'DESIGNATION', target: ' manager ', templateId: 'des' }], templates)?.scope).toBe('DESIGNATION');
  });

  it('is nobody’s when switched off, missing, or unmatched', () => {
    expect(templateFor(person, [{ scope: 'EMPLOYEE', target: 'p1', templateId: 'off' }, { scope: 'DEPARTMENT', target: 'Sales', templateId: 'dep' }], templates))
      .toMatchObject({ scope: 'DEPARTMENT' });
    expect(templateFor(person, [{ scope: 'EMPLOYEE', target: 'p2', templateId: 'emp' }], templates)).toBeNull();
    expect(templateFor({ id: 'p3', designation: '', department: '' }, [{ scope: 'DESIGNATION', target: '', templateId: 'des' }], templates)).toBeNull();
    expect(templateFor(person, [], templates)).toBeNull();
  });
});

describe('a package typed as a yearly figure', () => {
  it('is a twelfth of an annual package', () => {
    expect(monthlyPackageFrom('ANNUAL', 1200000, {}, SETTINGS)).toBe(100000);
    expect(monthlyPackageFrom('MONTHLY', 45000.5, {}, SETTINGS)).toBe(45000.5);
    expect(monthlyPackageFrom('ANNUAL', 0, {}, SETTINGS)).toBe(0);
  });

  it('is worked back from an annual CTC, employer PF and ESI included', () => {
    const flags = { isPfApplicable: true };
    const ctc = annualCtcOf(30000, flags, SETTINGS);
    expect(ctc).toBeGreaterThan(360000); // the employer's PF is on top of the package
    expect(packageFromAnnualCtc(ctc, flags, SETTINGS)).toBe(30000);
    const found = packageFromAnnualCtc(500000, flags, SETTINGS);
    expect(annualCtcOf(found, flags, SETTINGS)).toBeLessThanOrEqual(500000);
    expect(annualCtcOf(found + 1, flags, SETTINGS)).toBeGreaterThan(500000);
  });

  it('equals the annual package when the employer contributes nothing', () => {
    expect(packageFromAnnualCtc(1200000, {}, SETTINGS)).toBe(100000);
    expect(monthlyPackageFrom('ANNUAL_CTC', 1200000, {}, SETTINGS)).toBe(100000);
    expect(packageFromAnnualCtc(0, {}, SETTINGS)).toBe(0);
  });
});

describe('recurring components', () => {
  const special = { componentId: 'special', name: 'Special Allowance', type: 'EARNING', amount: 6000, fromPeriod: '2026-04', toPeriod: '', prorate: true };
  const club = { componentId: 'club', name: 'Club Fee', type: 'DEDUCTION', amount: 500, fromPeriod: '2026-06', toPeriod: '2026-08', prorate: false };

  it('cover the months from their first to their last', () => {
    expect(coversPeriod(special, '2026-03')).toBe(false);
    expect(coversPeriod(special, '2027-03')).toBe(true);
    expect(['2026-05', '2026-06', '2026-08', '2026-09'].map(p => coversPeriod(club, p))).toEqual([false, true, true, false]);
  });

  it('are reduced for loss of pay only when asked to be', () => {
    expect(recurringAmount(special, { totalWorkingDays: 30, lopDays: 3 })).toBe(5400);
    expect(recurringAmount(special, { totalWorkingDays: 30 })).toBe(6000);
    expect(recurringAmount(club, { totalWorkingDays: 30, lopDays: 15 })).toBe(500);
    expect(recurringAmount(special, { totalWorkingDays: 0 })).toBe(0);
  });

  it('go on the payslip of a month they cover, unless the component is already on it', () => {
    const days = { totalWorkingDays: 30, lopDays: 0 };
    expect(recurringLines([special, club], '2026-07', days)).toEqual([
      { componentId: 'special', name: 'Special Allowance', type: 'EARNING', amount: 6000, source: 'RECURRING' },
      { componentId: 'club', name: 'Club Fee', type: 'DEDUCTION', amount: 500, source: 'RECURRING' },
    ]);
    expect(recurringLines([special, club], '2026-04', days).map(l => l.componentId)).toEqual(['special']);
    expect(recurringLines([special, club], '2026-07', days, new Set(['special'])).map(l => l.componentId)).toEqual(['club']);
  });

  it('are checked as typed, and may not overlap for one component', () => {
    const item = { componentId: 'special', amount: 4000, fromPeriod: '2027-01', toPeriod: '' };
    expect(recurringProblem(item, [])).toBeNull();
    expect(recurringProblem(item, [{ id: 'a', ...special }])).toMatch(/already set/);
    expect(recurringProblem(item, [{ id: 'a', ...special, toPeriod: '2026-12' }])).toBeNull();
    expect(recurringProblem({ ...item, id: 'a' }, [{ id: 'a', ...special }])).toBeNull(); // itself
    expect(recurringProblem({ ...item, amount: 0 }, [])).toMatch(/amount/);
    expect(recurringProblem({ ...item, fromPeriod: '2027-13' }, [])).toMatch(/starts/);
    expect(recurringProblem({ ...item, toPeriod: '2026-12' }, [])).toMatch(/before the first/);
  });

  it('tell the tax projection what each month to come carries', () => {
    const later = recurringLater([special, club], ['2026-07', '2026-08', '2026-09'], new Set());
    expect(later.map(m => m.taxable)).toEqual([6000, 6000, 6000]); // the deduction is not income
    expect(later[0].components).toEqual({ 'c:special': 6000 });
    expect(recurringLater([special], ['2026-07'], new Set(['special']))[0]).toMatchObject({ taxable: 0, components: { 'c:special': 6000 } });
  });

  it('sit on top of the fixed structure in a full-month view', () => {
    const s = withRecurring(salaryStructure(100000, {}, SETTINGS), [special, club]);
    expect(s.monthly).toMatchObject({ grossSalary: 106000, netPayable: 105500, ctc: 106000, basic: 50000 });
    expect(s.annual.ctc).toBe(1272000);
    expect(s).toMatchObject({ recurringEarnings: 6000, recurringDeductions: 500 });
    const plain = salaryStructure(100000, {}, SETTINGS);
    expect(withRecurring(plain, []).monthly).toBe(plain.monthly);
  });
});

describe('a payslip computed with a template and recurring components', () => {
  const NEW = DEFAULT_TAX_CONFIGS.find(c => c.regime === 'NEW')!;
  const special = { componentId: 'special', name: 'Special Allowance', type: 'EARNING', amount: 6000, fromPeriod: '2026-04', toPeriod: '', prorate: true };
  const context = (over: Partial<StatutoryContext> = {}): StatutoryContext => ({
    period: '2026-04', settings: SETTINGS, ptPolicies: [], lwfPolicies: [],
    priorByPerson: new Map(), loanDue: new Map(), tax: null, recurringLines: new Map(), ...over,
  });
  const taxed = (over: Partial<StatutoryContext> = {}) => context({
    tax: {
      fyStart: 2026, fyLabel: '2026-27', period: '2026-04', defaultRegime: 'NEW',
      later: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03'],
      configs: new Map([['NEW', NEW]]), profiles: new Map(), earlier: new Map(),
      people: new Map([['p1', { dateOfBirth: '1990-01-01', leavingDate: null, panNumber: 'ABCPK1234F' }]]),
      perquisites: new Map(), nonTaxable: new Set(), exemptKeys: [], workings: new Map(),
    },
    ...over,
  });
  const inputs = { monthlyPackage: 100000, totalWorkingDays: 30 };

  it('is unchanged, with a blank snapshot, when neither exists', () => {
    const r = computeFullEntry(context(), inputs, [], { personId: 'p1' });
    expect(r).toMatchObject({ ...computeEntry(inputs, SETTINGS), structureName: '', structureSplit: '' });
  });

  it('is split by the employee’s template and remembers the split', () => {
    const ctx = context({ structures: new Map([['p1', { templateId: 't', name: 'Managers', scope: 'DESIGNATION', split: MANAGER }]]) });
    const r = computeFullEntry(ctx, inputs, [], { personId: 'p1' });
    expect(r).toMatchObject({ basic: 50000, da: 0, hra: 25000, transportAllowance: 15000, foodAllowance: 10000, grossSalary: 100000 });
    expect(r.structureName).toBe('Managers');
    expect(parseSplit(r.structureSplit)).toEqual(MANAGER);
    // Someone else in the same run stays on the company's split
    expect(computeFullEntry(ctx, inputs, [], { personId: 'p2' })).toMatchObject({ da: 22500, structureName: '' });
  });

  it('carries the recurring lines, reduced for loss of pay, and hands them over for saving', () => {
    const ctx = context({ recurring: new Map([['p1', [special]]]) });
    const r = computeFullEntry(ctx, { ...inputs, lopDays: 3 }, [], { personId: 'p1' });
    expect(r.grossSalary).toBe(90000 + 5400);
    expect(ctx.recurringLines!.get('p1')).toEqual([{ componentId: 'special', name: 'Special Allowance', type: 'EARNING', amount: 5400, source: 'RECURRING' }]);
  });

  it('replaces last time’s recurring lines instead of adding to them', () => {
    const ctx = context({ recurring: new Map([['p1', [special]]]) });
    const old = [{ componentId: 'special', type: 'EARNING', amount: 5400, source: 'RECURRING' }, { componentId: 'bonus', type: 'EARNING', amount: 1000, source: '' }];
    expect(computeFullEntry(ctx, inputs, old, { personId: 'p1' }).grossSalary).toBe(100000 + 6000 + 1000);
    // A recurring component that has ended drops off the payslip
    const ended = context({ recurring: new Map() });
    expect(computeFullEntry(ended, inputs, old, { personId: 'p1' }).grossSalary).toBe(101000);
    expect(ended.recurringLines!.get('p1')).toEqual([]);
  });

  it('leaves a component typed on the payslip by hand alone', () => {
    const ctx = context({ recurring: new Map([['p1', [special]]]) });
    const typed = [{ componentId: 'special', type: 'EARNING', amount: 2500, source: '' }];
    expect(computeFullEntry(ctx, inputs, typed, { personId: 'p1' }).grossSalary).toBe(102500);
    expect(ctx.recurringLines!.get('p1')).toEqual([]);
  });

  it('taxes a recurring earning as part of every month, not as a one-off', () => {
    const recurring = taxed({ recurring: new Map([['p1', [{ ...special, amount: 20000 }]]]) });
    const r = computeFullEntry(recurring, { ...inputs, monthlyPackage: 150000 }, [], { personId: 'p1' });
    const working = recurring.tax!.workings.get('p1');
    expect(working.income.thisMonth).toBe(170000);
    expect(working.income.projected).toBe(170000 * 11);
    expect(working.oneTimeTax).toBe(0);

    // The same amount typed once is taxed in full this month
    const once = taxed();
    computeFullEntry(once, { ...inputs, monthlyPackage: 150000 }, [{ componentId: 'bonus', type: 'EARNING', amount: 20000, source: '' }], { personId: 'p1' });
    expect(once.tax!.workings.get('p1').income.projected).toBe(150000 * 11);
    expect(once.tax!.workings.get('p1').oneTimeTax).toBeGreaterThan(0);
    expect(r.grossSalary).toBe(170000);
  });

  it('projects a recurring earning only for the months it still covers', () => {
    const ctx = taxed({ recurring: new Map([['p1', [{ ...special, amount: 20000, toPeriod: '2026-06' }]]]) });
    computeFullEntry(ctx, { ...inputs, monthlyPackage: 150000 }, [], { personId: 'p1' });
    expect(ctx.tax!.workings.get('p1').income.projected).toBe(150000 * 11 + 20000 * 2);
  });

  it('projects the months to come with the template’s split', () => {
    const ctx = taxed({ structures: new Map([['p1', { templateId: 't', name: 'Lean', scope: 'EMPLOYEE', split: { ...MANAGER, hraPercentOfBasic: 40 } }]]) });
    const r = computeFullEntry(ctx, inputs, [], { personId: 'p1' });
    expect(r.grossSalary).toBe(95000);
    expect(ctx.tax!.workings.get('p1').income.projected).toBe(95000 * 11);
  });
});

describe('past months keep the split they were paid with', () => {
  const paid = { monthlyPackage: 100000, totalWorkingDays: 30, empLeaveDays: 0, lopDays: 0, isEsiEligible: false, isPfApplicable: false };

  it('when a back-dated revision raises arrears', () => {
    const company = arrearFor(paid, { monthlyPackage: 120000, lopDays: 0 }, entrySettings(SETTINGS, { structureSplit: '' }));
    const own = arrearFor(paid, { monthlyPackage: 120000, lopDays: 0 }, entrySettings(SETTINGS, { structureSplit: splitText(MANAGER) }));
    expect(company.gross).toBe(20000);
    expect(own.gross).toBe(20000);
    expect(company.da).toBe(4500);
    expect(own.da).toBe(0);
    expect(own.hra).toBe(5000);
  });

  it('when the ESI wage of an entry is checked', () => {
    const lean = { ...MANAGER, hraPercentOfBasic: 0, transportPercentOfBasic: 0, foodPercentOfBasic: 0 };
    expect(fullMonthEsiWage({ monthlyPackage: 30000, totalWorkingDays: 30 }, SETTINGS)).toBe(30000);
    expect(fullMonthEsiWage({ monthlyPackage: 30000, totalWorkingDays: 30, structureSplit: splitText(lean) }, SETTINGS)).toBe(15000);
  });
});

describe('number series', () => {
  it('writes a number with its digits, text around it, and the year', () => {
    expect(formatNumber({ prefix: 'EMP-', suffix: '', padding: 4 }, 31, '2026-10-02')).toBe('EMP-0031');
    expect(formatNumber({ prefix: 'AVN/{FY}/', suffix: '', padding: 3 }, 7, '2026-10-02')).toBe('AVN/2026-27/007');
    expect(formatNumber({ prefix: 'AVN/{FY}/', suffix: '', padding: 3 }, 7, '2027-02-10')).toBe('AVN/2026-27/007');
    expect(formatNumber({ prefix: 'FS-', suffix: '/{YYYY}', padding: 2 }, 123, '2027-02-10')).toBe('FS-123/2027');
  });

  it('is checked as typed', () => {
    expect(seriesInput({ prefix: ' PB- ', suffix: '', padding: 4, nextNumber: 12 })).toEqual({ prefix: 'PB-', suffix: '', padding: 4, nextNumber: 12 });
    expect(seriesInput({ prefix: 'A', padding: 0, nextNumber: 1 })).toMatch(/digits/);
    expect(seriesInput({ prefix: 'A', padding: 4, nextNumber: 0 })).toMatch(/next number/);
    expect(seriesInput({ prefix: '<b>', padding: 4, nextNumber: 1 })).toMatch(/cannot contain/);
    expect(seriesInput({ prefix: 'x'.repeat(31), padding: 4, nextNumber: 1 })).toMatch(/under 30/);
  });

  it('skips numbers already in use', () => {
    const series = { prefix: 'EMP-', suffix: '', padding: 4 };
    expect(firstFree(series, 3, '2026-10-02', new Set(['emp-0003', 'emp-0004']))).toEqual({ number: 5, text: 'EMP-0005' });
    expect(firstFree(series, 0, '2026-10-02', new Set())).toEqual({ number: 1, text: 'EMP-0001' });
  });
});

describe('journal voucher by department or work location', () => {
  const entry = (id: string, pkg: number, person: any) => ({
    id, personId: id, lines: [], professionalTax: 0, lwfEmployee: 0, lwfEmployer: 0, loanDeduction: 0, reimbursement: 0,
    ...computeEntry({ monthlyPackage: pkg, totalWorkingDays: 30, isPfApplicable: true }, SETTINGS),
    person: { id, name: id, ...person },
  });
  const entries = [
    entry('a', 40000, { department: 'Sales', workLocation: { name: 'Coimbatore' } }),
    entry('b', 30000, { department: 'Sales', workLocation: { name: 'Chennai' } }),
    entry('c', 50000, { department: 'Engineering', workLocation: { name: 'Coimbatore' } }),
    entry('d', 20000, { department: '', workLocation: null }),
  ];

  it('gives each group a balanced voucher that adds up to the company’s', () => {
    const whole = journalVoucher(entries, {});
    const split = journalVoucherBy(entries, {}, 'DEPARTMENT');
    expect(split.vouchers.map(v => [v.name, v.employees])).toEqual([['Engineering', 1], ['Sales', 2], [NO_GROUP, 1]]);
    for (const v of split.vouchers) expect(v.totalDebit).toBe(v.totalCredit);
    expect(split.totalDebit).toBe(whole.totalDebit);
    expect(journalVoucherBy(entries, {}, 'LOCATION').vouchers.map(v => v.name)).toEqual(['Chennai', 'Coimbatore', NO_GROUP]);
  });

  it('posts a group to its own ledger where it has one, else to the company’s', () => {
    const split = journalVoucherBy(entries, { basic: 'Salaries — Basic' }, 'DEPARTMENT', [
      { dimension: 'DEPARTMENT', groupName: 'sales', key: 'basic', ledgerName: 'Sales Salaries' },
      { dimension: 'LOCATION', groupName: 'Engineering', key: 'basic', ledgerName: 'Wrong dimension' },
    ]);
    const ledgers = (name: string) => split.vouchers.find(v => v.name === name)!.lines.map(l => l.ledger);
    expect(ledgers('Sales')).toContain('Sales Salaries');
    expect(ledgers('Sales')).not.toContain('Salaries — Basic');
    expect(ledgers('Engineering')).toContain('Salaries — Basic');
    expect(ledgers('Engineering')).not.toContain('Wrong dimension');
  });
});
