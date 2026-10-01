import { describe, it, expect } from 'vitest';
import { computeEntry } from '../payrollCalc';
import {
  addMonths, buildSchedule, instalmentOf, outstandingPrincipal,
  loanPerquisiteForMonth, perquisiteApplies,
} from '../payroll/loanCalc';

const total = (lines: { principal: number }[]) => lines.reduce((s, l) => s + l.principal, 0);

describe('addMonths', () => {
  it('rolls over the year in both directions', () => {
    expect(addMonths('2026-11', 3)).toBe('2027-02');
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2026-01', 0)).toBe('2026-01');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(addMonths('2026-03', 24)).toBe('2028-03');
  });
});

describe('loan schedules', () => {
  it('interest-free advance: equal instalments, last one absorbs rounding', () => {
    const lines = buildSchedule({ type: 'FLAT', principal: 10000, annualRate: 0, instalments: 3, startPeriod: '2026-11' });
    expect(lines.map(l => l.period)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(lines.map(l => l.principal)).toEqual([3333, 3333, 3334]);
    expect(lines.every(l => l.interest === 0)).toBe(true);
    expect(total(lines)).toBe(10000);
  });

  it('flat interest: same interest every month on the full amount', () => {
    // 1,20,000 at 12% over 12 months → 10,000 principal + 1,200 interest
    const lines = buildSchedule({ type: 'FLAT', principal: 120000, annualRate: 12, instalments: 12, startPeriod: '2026-04' });
    expect(lines).toHaveLength(12);
    expect(lines.every(l => l.principal === 10000 && l.interest === 1200)).toBe(true);
    expect(instalmentOf(lines[0])).toBe(11200);
  });

  it('reducing balance: equal principal, interest falls with the balance', () => {
    const lines = buildSchedule({ type: 'REDUCING', principal: 120000, annualRate: 12, instalments: 12, startPeriod: '2026-04' });
    expect(lines[0]).toEqual({ seq: 1, period: '2026-04', principal: 10000, interest: 1200 });
    expect(lines[1].interest).toBe(1100);   // on 1,10,000
    expect(lines[11].interest).toBe(100);   // on 10,000
    expect(total(lines)).toBe(120000);
  });

  it('reducing EMI: constant instalment, matching the standard formula', () => {
    // 1,00,000 at 12% over 12 months → EMI 8,885
    const lines = buildSchedule({ type: 'REDUCING_EMI', principal: 100000, annualRate: 12, instalments: 12, startPeriod: '2026-04' });
    expect(instalmentOf(lines[0])).toBe(8885);
    expect(lines[0].interest).toBe(1000);
    expect(lines[0].principal).toBe(7885);
    for (const l of lines.slice(0, 11)) expect(instalmentOf(l)).toBe(8885);
    // The last instalment clears whatever rounding left behind
    expect(Math.abs(instalmentOf(lines[11]) - 8885)).toBeLessThan(10);
    expect(total(lines)).toBe(100000);
  });

  it('reducing EMI with no interest is an equal split', () => {
    const lines = buildSchedule({ type: 'REDUCING_EMI', principal: 9000, annualRate: 0, instalments: 4, startPeriod: '2026-04' });
    expect(lines.map(l => l.principal)).toEqual([2250, 2250, 2250, 2250]);
  });

  it('principal always adds up exactly, whatever the terms', () => {
    for (const type of ['FLAT', 'REDUCING', 'REDUCING_EMI']) {
      for (const [principal, rate, n] of [[50000, 9.5, 7], [33333, 14, 36], [1, 10, 1], [250000, 0, 11]] as number[][]) {
        const lines = buildSchedule({ type, principal, annualRate: rate, instalments: n, startPeriod: '2026-04' });
        expect(lines).toHaveLength(n);
        expect(Math.round(total(lines) * 100) / 100).toBe(principal);
        expect(lines.every(l => l.principal >= 0 && l.interest >= 0)).toBe(true);
      }
    }
  });

  it('numbers a regenerated schedule from the given sequence, and rejects empty terms', () => {
    const lines = buildSchedule({ type: 'FLAT', principal: 6000, annualRate: 0, instalments: 2, startPeriod: '2026-09', firstSeq: 5 });
    expect(lines.map(l => l.seq)).toEqual([5, 6]);
    expect(buildSchedule({ type: 'FLAT', principal: 0, annualRate: 0, instalments: 3, startPeriod: '2026-09' })).toEqual([]);
    expect(buildSchedule({ type: 'FLAT', principal: 100, annualRate: 0, instalments: 0, startPeriod: '2026-09' })).toEqual([]);
  });
});

describe('outstanding principal and perquisite', () => {
  it('nets disbursals and top-ups against repayments', () => {
    expect(outstandingPrincipal([
      { principal: 50000 }, { principal: -10000 }, { principal: -10000 }, { principal: 20000 }, { principal: -5000 },
    ])).toBe(45000);
    expect(outstandingPrincipal([])).toBe(0);
  });

  it('values the interest saved against the benchmark rate', () => {
    expect(loanPerquisiteForMonth(120000, 0, 9)).toBe(900);    // 1,20,000 × 9% / 12
    expect(loanPerquisiteForMonth(120000, 6, 9)).toBe(300);
    expect(loanPerquisiteForMonth(120000, 9, 9)).toBe(0);
    expect(loanPerquisiteForMonth(120000, 12, 9)).toBe(0);
    expect(loanPerquisiteForMonth(0, 0, 9)).toBe(0);
  });

  it('applies only above the exemption limit', () => {
    expect(perquisiteApplies(20000, 20000)).toBe(false);
    expect(perquisiteApplies(20001, 20000)).toBe(true);
  });
});

describe('engine with a loan instalment', () => {
  const SETTINGS = {
    basicPercentOfPackage: 50, daPercentOfBasic: 45, hraPercentOfBasic: 25,
    transportPercentOfBasic: 20, foodPercentOfBasic: 10,
    esiEmployeePercent: 0.75, esiEmployerPercent: 3.25, esiWageCeiling: 21000,
    pfEmployeePercent: 12, pfEmployerPercent: 12, pfWageCap: 15000, pfWageFactor: 60,
    pfEmployerMatchesEmployee: true,
  };
  const inputs = { monthlyPackage: 45000, totalWorkingDays: 26, isPfApplicable: true };

  it('deducts the instalment from net pay and nothing else', () => {
    const base = computeEntry(inputs, SETTINGS);
    const r = computeEntry({ ...inputs, loanDeduction: 3334 }, SETTINGS);
    expect(r.totalDeductions).toBe(base.totalDeductions + 3334);
    expect(r.netPayable).toBe(base.netPayable - 3334);
    expect(r.grossSalary).toBe(base.grossSalary);
    expect(r.ctc).toBe(base.ctc);
  });
});
