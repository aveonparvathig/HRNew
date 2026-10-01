import { describe, it, expect } from 'vitest';
import {
  financialYearOf, periodsOfFinancialYear, monthIndexInFinancialYear,
  monthsRemainingInFinancialYear,
} from '../payroll/financialYear';
import {
  esiCeilingChecks, fullMonthEsiWage, entryOverrides, standardWorkingDays,
} from '../payroll/checks';
import { diffFields, fieldLabel } from '../payroll/audit';

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

describe('financial year', () => {
  it('April starts a new year, March ends it', () => {
    expect(financialYearOf('2026-04')).toEqual({ startYear: 2026, label: '2026-27', start: '2026-04', end: '2027-03' });
    expect(financialYearOf('2027-03').label).toBe('2026-27');
    expect(financialYearOf('2026-03').label).toBe('2025-26');
    expect(financialYearOf('2026-12').label).toBe('2026-27');
  });

  it('labels the turn of a century with two digits', () => {
    expect(financialYearOf('2099-06').label).toBe('2099-00');
  });

  it('lists the 12 periods April to March', () => {
    const periods = periodsOfFinancialYear(2026);
    expect(periods).toHaveLength(12);
    expect(periods[0]).toBe('2026-04');
    expect(periods[8]).toBe('2026-12');
    expect(periods[9]).toBe('2027-01');
    expect(periods[11]).toBe('2027-03');
  });

  it('counts months from April and months remaining including the current one', () => {
    expect(monthIndexInFinancialYear('2026-04')).toBe(1);
    expect(monthIndexInFinancialYear('2026-10')).toBe(7);
    expect(monthIndexInFinancialYear('2027-03')).toBe(12);
    expect(monthsRemainingInFinancialYear('2026-04')).toBe(12);
    expect(monthsRemainingInFinancialYear('2026-10')).toBe(6);
    expect(monthsRemainingInFinancialYear('2027-03')).toBe(1);
  });

  it('rejects malformed periods', () => {
    expect(() => financialYearOf('2026-13')).toThrow();
    expect(() => financialYearOf('2026-4')).toThrow();
  });
});

describe('ESI ceiling checks', () => {
  const entry = (over: any) => ({
    id: 'e1', monthlyPackage: 20000, totalWorkingDays: 26, lopDays: 0,
    isEsiEligible: false, person: { name: 'Asha' }, ...over,
  });

  it('uses the full-month wage, ignoring LOP', () => {
    expect(fullMonthEsiWage(entry({ monthlyPackage: 30000, lopDays: 10 }), SETTINGS)).toBe(30000);
  });

  it('warns when ESI is deducted above the ceiling', () => {
    const checks = esiCeilingChecks([entry({ monthlyPackage: 25000, isEsiEligible: true })], SETTINGS, true);
    expect(checks).toHaveLength(1);
    expect(checks[0].code).toBe('ESI_ABOVE_CEILING');
    expect(checks[0].entryId).toBe('e1');
  });

  it('warns when a wage within the ceiling has no ESI, only if the org uses ESI', () => {
    expect(esiCeilingChecks([entry({})], SETTINGS, true)[0].code).toBe('ESI_NOT_APPLIED');
    expect(esiCeilingChecks([entry({})], SETTINGS, false)).toEqual([]);
  });

  it('treats a wage exactly at the ceiling as within it', () => {
    expect(esiCeilingChecks([entry({ monthlyPackage: 21000, isEsiEligible: true })], SETTINGS, true)).toEqual([]);
    expect(esiCeilingChecks([entry({ monthlyPackage: 21000 })], SETTINGS, true)[0].code).toBe('ESI_NOT_APPLIED');
  });

  it('stays quiet for correctly flagged entries and zero packages', () => {
    const entries = [
      entry({ isEsiEligible: true }),
      entry({ id: 'e2', monthlyPackage: 45000 }),
      entry({ id: 'e3', monthlyPackage: 0 }),
    ];
    expect(esiCeilingChecks(entries, SETTINGS, true)).toEqual([]);
  });
});

describe('overrides listing', () => {
  const person = { currentMonthlyPackage: 30000, isPfApplicable: true, isEsiEligible: false };
  const entry = (over: any) => ({
    monthlyPackage: 30000, totalWorkingDays: 26, internetAllowance: 0,
    salaryArrearAllowance: 0, salaryAdvance: 0, tds: 0,
    isPfApplicable: true, isEsiEligible: false, ...over,
  });

  it('is empty for an untouched entry', () => {
    expect(entryOverrides(entry({}), person, 26)).toEqual([]);
  });

  it('lists one-off amounts, non-standard days and differences from the employee record', () => {
    const labels = entryOverrides(entry({
      totalWorkingDays: 30, salaryAdvance: 5000, tds: 1200,
      monthlyPackage: 32000, isPfApplicable: false,
    }), person, 26).map(i => i.label);
    expect(labels).toEqual(['Working days', 'Salary advance', 'TDS', 'Monthly package', 'PF applicable']);
  });

  it('picks the most common working-days value as the run standard', () => {
    expect(standardWorkingDays([
      { totalWorkingDays: 26 }, { totalWorkingDays: 26 }, { totalWorkingDays: 30 },
    ])).toBe(26);
    expect(standardWorkingDays([])).toBe(0);
  });
});

describe('audit diff', () => {
  it('reports only changed fields with readable values', () => {
    const changes = diffFields(
      { lopDays: 0, tds: 0, isEsiEligible: false, remarks: '' },
      { lopDays: 2, tds: 0, isEsiEligible: true, remarks: '' },
      ['lopDays', 'tds', 'isEsiEligible', 'remarks'],
    );
    expect(changes).toEqual([
      { field: 'lopDays', oldValue: '0', newValue: '2' },
      { field: 'isEsiEligible', oldValue: 'No', newValue: 'Yes' },
    ]);
  });

  it('labels known fields, spaces out unknown camelCase keys, passes other text through', () => {
    expect(fieldLabel('lopDays')).toBe('LOP days');
    expect(fieldLabel('responsibleName')).toBe('Responsible name');
    expect(fieldLabel('Coimbatore Office · state')).toBe('Coimbatore Office · state');
    expect(fieldLabel('')).toBe('');
  });

  it('compares numbers by value, so a number and its string form are equal', () => {
    expect(diffFields({ totalWorkingDays: 26 }, { totalWorkingDays: '26' }, ['totalWorkingDays'])).toEqual([]);
  });
});
