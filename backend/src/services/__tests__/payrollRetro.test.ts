import { describe, it, expect } from 'vitest';
import {
  arrearFor, hasArrear, effectiveLop, isRecovery, arrearAndRecoveryLines,
} from '../payroll/arrearCalc';
import { cutoffDate, cutoffDue } from '../payroll/payoutCalc';
import { dueControlChanges, itemsMissingProof } from '../payroll/declarationCalc';
import { computeEntryWithLines } from '../payroll/lines';

const SETTINGS = {
  basicPercentOfPackage: 50, daPercentOfBasic: 45, hraPercentOfBasic: 25,
  transportPercentOfBasic: 20, foodPercentOfBasic: 10, esiEmployeePercent: 0.75, esiEmployerPercent: 3.25,
  pfEmployeePercent: 12, pfEmployerPercent: 12, pfWageCap: 15000, pfWageFactor: 60, pfEmployerMatchesEmployee: true,
};
const month = (over: any = {}) => ({
  monthlyPackage: 20000, totalWorkingDays: 30, empLeaveDays: 0, lopDays: 0,
  isEsiEligible: false, isPfApplicable: true, ...over,
});

describe('loss of pay added to a past month', () => {
  it('takes back the pay for the days, with the PF deducted on it', () => {
    const a = arrearFor(month(), { monthlyPackage: 20000, lopDays: 3 }, SETTINGS);
    expect(a.basic).toBe(-1000);   // 3 of 30 days of 10,000
    expect(a.gross).toBe(-2000);   // 3 of 30 days of 20,000
    expect(a.pfEmployee).toBeLessThan(0);
    expect(a.pfEmployer).toBe(a.pfEmployee);
    expect(isRecovery(a)).toBe(true);
    expect(hasArrear(a)).toBe(true);
  });

  it('is undone exactly by reversing the same days later', () => {
    const added = arrearFor(month(), { monthlyPackage: 20000, lopDays: 3 }, SETTINGS);
    const reversed = arrearFor(month(), { monthlyPackage: 20000, lopDays: 0 }, SETTINGS, [added]);
    expect(reversed.gross).toBe(2000);
    expect(reversed.pfEmployee).toBe(-added.pfEmployee);
  });

  it('works out the days of a month as they now stand', () => {
    expect(effectiveLop(2, [])).toBe(2);
    expect(effectiveLop(2, [{ kind: 'LOP_REVERSAL', lopDays: 1.5 }])).toBe(0.5);
    expect(effectiveLop(0, [{ kind: 'LOP_RECOVERY', lopDays: 3 }])).toBe(3);
    expect(effectiveLop(2, [{ kind: 'LOP_REVERSAL', lopDays: 2 }, { kind: 'LOP_RECOVERY', lopDays: 1 }, { kind: 'REVISION', lopDays: 0 }])).toBe(1);
    expect(effectiveLop(2, [{ kind: 'LOP_RECOVERY', lopDays: 4, status: 'CANCELLED' }])).toBe(2);
  });
});

describe('a back-dated cut', () => {
  it('shows as an overpayment of the month', () => {
    const a = arrearFor(month({ monthlyPackage: 24000 }), { monthlyPackage: 20000, lopDays: 0 }, SETTINGS);
    expect(a.gross).toBe(-4000);
    expect(isRecovery(a)).toBe(true);
  });
});

describe('arrears and recoveries on one payslip', () => {
  const raise = arrearFor(month(), { monthlyPackage: 24000, lopDays: 0 }, SETTINGS);          // +4,000
  const retro = arrearFor(month(), { monthlyPackage: 20000, lopDays: 3 }, SETTINGS);          // −2,000

  it('are kept apart, not netted', () => {
    const { pay, recover } = arrearAndRecoveryLines([raise, retro]);
    expect(pay.earnings).toBe(4000);
    expect(recover.earnings).toBe(-2000);
    expect(recover.pf).toBe(retro.pfEmployee);
  });

  it('lower the payslip’s gross and give back the PF on the recovered pay', () => {
    const { recover } = arrearAndRecoveryLines([retro]);
    const base = computeEntryWithLines(month(), SETTINGS, []);
    const withRecovery = computeEntryWithLines(month(), SETTINGS, [
      { type: 'EARNING', amount: recover.earnings },
      { type: 'DEDUCTION', amount: recover.pf },
    ]);
    expect(withRecovery.grossSalary).toBe(base.grossSalary - 2000);
    expect(withRecovery.totalDeductions).toBe(Math.round((base.totalDeductions + recover.pf) * 100) / 100);
    expect(withRecovery.netPayable).toBe(Math.round((base.netPayable + recover.net) * 100) / 100);
    expect(recover.net).toBeLessThan(0);
  });
});

describe('automatic input cutoff', () => {
  it('falls on the chosen day of the run’s own month, or its last day', () => {
    expect(cutoffDate('2026-10', 25)).toBe('2026-10-25');
    expect(cutoffDate('2026-10', 31)).toBe('2026-10-31');
    expect(cutoffDate('2026-11', 31)).toBe('2026-11-30');
    expect(cutoffDate('2027-02', 30)).toBe('2027-02-28');
    expect(cutoffDate('2026-10', 0)).toBeNull();
  });

  it('waits through the cutoff day and locks from the next', () => {
    expect(cutoffDue('2026-10', 25, '2026-10-25', '2026-10-01')).toBe('WAIT');
    expect(cutoffDue('2026-10', 25, '2026-10-26', '2026-10-01')).toBe('LOCK');
    expect(cutoffDue('2026-10', 31, '2026-11-01', '2026-10-01')).toBe('LOCK');
  });

  it('leaves a run made after its own cutoff open', () => {
    expect(cutoffDue('2026-09', 25, '2026-10-02', '2026-10-01')).toBe('MISSED');
    expect(cutoffDue('2026-09', 25, '2026-10-02', '2026-09-25')).toBe('LOCK');
  });

  it('does nothing when switched off', () => {
    expect(cutoffDue('2026-10', 0, '2027-01-01', '2026-10-01')).toBe('OFF');
  });
});

describe('declaration dates', () => {
  const control = { declarationOpen: true, proofOpen: false, declarationLockOn: '2026-10-03', proofOpenFrom: '2026-12' };

  it('do nothing until they come due', () => {
    expect(dueControlChanges(control, '2026-10-03')).toBeNull();
  });

  it('close the window the day after its lock date, once', () => {
    expect(dueControlChanges(control, '2026-10-04')).toEqual({ declarationOpen: false, declarationLockOn: null });
  });

  it('open proof submission from its month, once', () => {
    expect(dueControlChanges({ ...control, declarationLockOn: null }, '2026-12-01')).toEqual({ proofOpen: true, proofOpenFrom: null });
  });

  it('clear a date that no longer has anything to do', () => {
    expect(dueControlChanges({ declarationOpen: false, proofOpen: true, declarationLockOn: '2026-01-01', proofOpenFrom: '2026-01' }, '2026-10-04'))
      .toEqual({ declarationLockOn: null, proofOpenFrom: null });
  });

  it('are quiet when none is set', () => {
    expect(dueControlChanges({ declarationOpen: true, proofOpen: false }, '2026-10-04')).toBeNull();
  });
});

describe('items that need a proof', () => {
  const items = [
    { id: 'lic', name: 'Life insurance premium', proofRequired: true },
    { id: 'ppf', name: 'Public Provident Fund', proofRequired: false },
    { id: 'med', name: 'Medical insurance', proofRequired: true },
  ];

  it('are named when an amount has no proof attached', () => {
    const lines = [{ itemId: 'lic', amount: 50000 }, { itemId: 'ppf', amount: 20000 }, { itemId: 'med', amount: 15000 }];
    expect(itemsMissingProof(lines, items, new Map([['med', 1]]))).toEqual(['Life insurance premium']);
  });

  it('do not matter while nothing is claimed on them', () => {
    expect(itemsMissingProof([{ itemId: 'lic', amount: 0 }], items, new Map())).toEqual([]);
  });
});
