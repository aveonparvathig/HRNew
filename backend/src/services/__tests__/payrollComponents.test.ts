import { describe, it, expect } from 'vitest';
import { computeEntry } from '../payrollCalc';
import {
  computeEntryWithLines, lineTotals, allColumns, usedColumns, columnValue, columnTotal, lineKey,
} from '../payroll/lines';
import {
  packageForPeriod, packageChangesFromEntries, salaryStructure, currentPeriodIST,
} from '../payroll/salaryStructure';
import { summaryByGroup, componentMatrix } from '../payroll/reportData';
import { entryOverrides } from '../payroll/checks';

const SETTINGS = {
  basicPercentOfPackage: 50,
  daPercentOfBasic: 45,
  hraPercentOfBasic: 25,
  transportPercentOfBasic: 20,
  foodPercentOfBasic: 10,
  esiEmployeePercent: 0.75,
  esiEmployerPercent: 3.25,
  esiWageCeiling: 21000,
  pfEmployeePercent: 12,
  pfEmployerPercent: 12,
  pfWageCap: 15000,
  pfWageFactor: 60,
  pfEmployerMatchesEmployee: true,
};

describe('computeEntryWithLines', () => {
  const inputs = { monthlyPackage: 45000, totalWorkingDays: 26, isPfApplicable: true };

  it('is exactly computeEntry when there are no lines', () => {
    expect(computeEntryWithLines(inputs, SETTINGS)).toEqual(computeEntry(inputs, SETTINGS));
    expect(computeEntryWithLines(inputs, SETTINGS, [])).toEqual(computeEntry(inputs, SETTINGS));
  });

  it('adds earnings to gross and deductions to total deductions', () => {
    const base = computeEntry(inputs, SETTINGS);
    const r = computeEntryWithLines(inputs, SETTINGS, [
      { type: 'EARNING', amount: 5000 },
      { type: 'EARNING', amount: 1250.5 },
      { type: 'DEDUCTION', amount: 700 },
    ]);
    expect(r.grossSalary).toBe(51250.5);
    expect(r.totalDeductions).toBe(base.totalDeductions + 700);
    expect(r.netPayable).toBe(51250.5 - 1800 - 700);
    expect(r.ctc).toBe(51250.5 + base.employerContributions);
  });

  it('leaves PF, ESI and the fixed components untouched', () => {
    const esiInputs = { monthlyPackage: 18000, totalWorkingDays: 26, isEsiEligible: true, isPfApplicable: true };
    const base = computeEntry(esiInputs, SETTINGS);
    const r = computeEntryWithLines(esiInputs, SETTINGS, [{ type: 'EARNING', amount: 10000 }]);
    for (const k of ['basic', 'da', 'hra', 'esiEmployee', 'esiEmployer', 'pfEmployee', 'pfEmployer', 'employerContributions'] as const) {
      expect(r[k]).toBe(base[k]);
    }
  });

  it('returns only the keys computeEntry returns, so it can be saved as-is', () => {
    const r = computeEntryWithLines(inputs, SETTINGS, [{ type: 'EARNING', amount: 100 }]);
    expect(Object.keys(r).sort()).toEqual(Object.keys(computeEntry(inputs, SETTINGS)).sort());
  });

  it('totals lines by type with 2-decimal rounding', () => {
    expect(lineTotals([{ type: 'EARNING', amount: 0.1 }, { type: 'EARNING', amount: 0.2 }, { type: 'DEDUCTION', amount: 5 }]))
      .toEqual({ earnings: 0.3, deductions: 5 });
    expect(lineTotals()).toEqual({ earnings: 0, deductions: 0 });
  });
});

describe('report columns', () => {
  const bonus = { componentId: 'b1', name: 'Bonus', type: 'EARNING', amount: 5000 };
  const fine = { componentId: 'd1', name: 'Other Deduction', type: 'DEDUCTION', amount: 300 };
  const plain = { basic: 100, da: 45, hra: 25, transportAllowance: 20, foodAllowance: 10, grossSalary: 200, totalDeductions: 0, netPayable: 200, ctc: 200, lines: [] };
  const withLines = { ...plain, grossSalary: 5200, totalDeductions: 300, netPayable: 4900, ctc: 5200, lines: [bonus, fine] };

  it('slots catalogue earnings before Gross and deductions before Total Deductions', () => {
    const keys = allColumns([plain, withLines]).map(c => c.key);
    expect(keys.indexOf(lineKey('b1'))).toBe(keys.indexOf('grossSalary') - 1);
    expect(keys.indexOf(lineKey('d1'))).toBe(keys.indexOf('totalDeductions') - 1);
    expect(keys[keys.length - 1]).toBe('ctc');
  });

  it('hides optional columns that are zero for every entry', () => {
    const keys = usedColumns([plain]).map(c => c.key);
    expect(keys).toEqual(['basic', 'da', 'hra', 'transportAllowance', 'foodAllowance', 'grossSalary', 'totalDeductions', 'netPayable', 'ctc']);
    // Imported runs store no CTC: the column drops out rather than printing zero
    expect(usedColumns([{ ...plain, ctc: 0 }]).map(c => c.key)).not.toContain('ctc');
    expect(usedColumns([plain, withLines]).map(c => c.key)).toContain(lineKey('b1'));
  });

  it('reads and totals a catalogue column', () => {
    expect(columnValue(withLines, lineKey('b1'))).toBe(5000);
    expect(columnValue(plain, lineKey('b1'))).toBe(0);
    expect(columnTotal([plain, withLines], lineKey('b1'))).toBe(5000);
    expect(columnTotal([plain, withLines], 'grossSalary')).toBe(5400);
  });

  it('lists catalogue lines in the overrides report', () => {
    const labels = entryOverrides({ totalWorkingDays: 26, lines: [bonus] }, null, 26).map(i => i.label);
    expect(labels).toEqual(['Bonus']);
  });
});

describe('salary revisions', () => {
  const revisions = [
    { effectiveFrom: '2026-04-01', oldMonthlyPackage: 30000, newMonthlyPackage: 33000 },
    { effectiveFrom: '2026-10-01', oldMonthlyPackage: 33000, newMonthlyPackage: 36000 },
  ];

  it('uses the current package when nothing is recorded', () => {
    expect(packageForPeriod(28000, [], '2026-05')).toBe(28000);
  });

  it('applies a revision from its effective month onward', () => {
    expect(packageForPeriod(36000, revisions, '2026-03')).toBe(30000); // before the first revision
    expect(packageForPeriod(36000, revisions, '2026-04')).toBe(33000);
    expect(packageForPeriod(36000, revisions, '2026-09')).toBe(33000);
    expect(packageForPeriod(36000, revisions, '2026-10')).toBe(36000);
    expect(packageForPeriod(36000, revisions, '2027-01')).toBe(36000);
  });

  it('does not depend on the order revisions arrive in', () => {
    expect(packageForPeriod(36000, [...revisions].reverse(), '2026-09')).toBe(33000);
  });

  it('lets the later of two same-month revisions win', () => {
    const same = [
      { effectiveFrom: '2026-04-01', oldMonthlyPackage: 30000, newMonthlyPackage: 31000, createdAt: '2026-04-02T10:00:00Z' },
      { effectiveFrom: '2026-04-01', oldMonthlyPackage: 31000, newMonthlyPackage: 32000, createdAt: '2026-04-05T10:00:00Z' },
    ];
    expect(packageForPeriod(32000, same, '2026-04')).toBe(32000);
  });

  it('finds package changes between consecutive payslips', () => {
    expect(packageChangesFromEntries([
      { period: '2026-06', monthlyPackage: 33000 },
      { period: '2026-04', monthlyPackage: 30000 },
      { period: '2026-05', monthlyPackage: 30000 },
      { period: '2026-07', monthlyPackage: 33000 },
    ])).toEqual([{ period: '2026-06', oldMonthlyPackage: 30000, newMonthlyPackage: 33000 }]);
    expect(packageChangesFromEntries([])).toEqual([]);
  });

  it('reads the payroll month in India time', () => {
    // 31 Oct 2026 20:00 UTC is already 1 Nov in India
    expect(currentPeriodIST(new Date('2026-10-31T20:00:00Z'))).toBe('2026-11');
    expect(currentPeriodIST(new Date('2026-10-31T10:00:00Z'))).toBe('2026-10');
  });
});

describe('salary structure', () => {
  it('gives the full-month split and twelve times it for the year', () => {
    const s = salaryStructure(45000, { isPfApplicable: true }, SETTINGS);
    expect(s.monthly.basic).toBe(22500);
    expect(s.monthly.grossSalary).toBe(45000);
    expect(s.monthly.pfEmployee).toBe(1800);
    expect(s.monthly.ctc).toBe(46800);
    expect(s.annual.grossSalary).toBe(540000);
    expect(s.annual.ctc).toBe(561600);
  });

  it('matches a full month of the salary engine for any month length', () => {
    const s = salaryStructure(30001, { isEsiEligible: true }, SETTINGS);
    const month = computeEntry({ monthlyPackage: 30001, totalWorkingDays: 30, isEsiEligible: true }, SETTINGS);
    expect(s.monthly.basic).toBe(month.basic);
    expect(s.monthly.esiEmployee).toBe(month.esiEmployee);
    expect(s.monthly.netPayable).toBe(month.netPayable);
  });
});

describe('report data', () => {
  const e = (personId: string, name: string, period: string, dept: string, gross: number, extra: any = {}) => ({
    personId, period, person: { name, employeeNo: personId.toUpperCase(), department: dept },
    grossSalary: gross, totalDeductions: 100, netPayable: gross - 100, ctc: gross + 50, lines: [], ...extra,
  });

  it('summarises by group, largest first, with blanks as Unassigned', () => {
    const groups = summaryByGroup(
      [e('a', 'Asha', '2026-04', 'Delivery', 1000), e('b', 'Bala', '2026-04', '', 500), e('c', 'Chitra', '2026-04', 'Delivery', 2000)],
      x => x.person.department,
    );
    expect(groups.map(g => g.group)).toEqual(['Delivery', 'Unassigned']);
    expect(groups[0]).toEqual({ group: 'Delivery', employees: 2, gross: 3000, deductions: 200, net: 2800, ctc: 3100 });
  });

  it('builds an employee-by-month matrix with totals', () => {
    const periods = ['2026-04', '2026-05', '2026-06'];
    const m = componentMatrix([
      e('b', 'Bala', '2026-04', '', 500),
      e('a', 'Asha', '2026-04', '', 1000),
      e('a', 'Asha', '2026-06', '', 1200),
      e('a', 'Asha', '2025-12', '', 9999), // outside the year
    ], periods, 'grossSalary');
    expect(m.rows.map(r => r.label)).toEqual(['Asha', 'Bala']);
    expect(m.rows[0].values).toEqual([1000, 0, 1200]);
    expect(m.rows[0].total).toBe(2200);
    expect(m.totals).toEqual([1500, 0, 1200]);
    expect(m.grandTotal).toBe(2700);
  });

  it('reads catalogue components in the matrix', () => {
    const bonus = { componentId: 'b1', name: 'Bonus', type: 'EARNING', amount: 5000 };
    const m = componentMatrix([e('a', 'Asha', '2026-04', '', 6000, { lines: [bonus] })], ['2026-04'], lineKey('b1'));
    expect(m.grandTotal).toBe(5000);
  });
});
