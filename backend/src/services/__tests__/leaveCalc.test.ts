import { describe, it, expect } from 'vitest';
import {
  workingDaysBetween, splitByPeriod, leaveYearOf, balanceOf, validateRequest, type LeaveTypePolicy,
} from '../leaveCalc';

const MON_FRI = [0, 6]; // Sat + Sun off

describe('leaveCalc.workingDaysBetween', () => {
  it('excludes weekends', () => {
    // 2026-01-01 Thu .. 2026-01-09 Fri, Mon-Fri week => 7 working days
    expect(workingDaysBetween('2026-01-01', '2026-01-09', MON_FRI, [])).toBe(7);
  });
  it('excludes holidays too', () => {
    expect(workingDaysBetween('2026-01-05', '2026-01-07', MON_FRI, ['2026-01-06'])).toBe(2);
  });
  it('a single half-day start is 0.5', () => {
    expect(workingDaysBetween('2026-01-05', '2026-01-05', MON_FRI, [], true, false)).toBe(0.5);
  });
  it('half-day at both ends subtracts a full day', () => {
    // Mon..Wed = 3, minus 0.5 (start) minus 0.5 (end) = 2
    expect(workingDaysBetween('2026-01-05', '2026-01-07', MON_FRI, [], true, true)).toBe(2);
  });
  it('a span entirely on weekends is zero', () => {
    expect(workingDaysBetween('2026-01-03', '2026-01-04', MON_FRI, [])).toBe(0);
  });
});

describe('leaveCalc.splitByPeriod', () => {
  it('apportions a month-spanning span to each period', () => {
    // 2026-01-29 Thu .. 2026-02-03 Tue, Mon-Fri
    expect(splitByPeriod('2026-01-29', '2026-02-03', MON_FRI, [])).toEqual({ '2026-01': 2, '2026-02': 2 });
  });
  it('sums back to workingDaysBetween', () => {
    const by = splitByPeriod('2026-01-29', '2026-02-03', MON_FRI, []);
    expect(Object.values(by).reduce((a, b) => a + b, 0)).toBe(workingDaysBetween('2026-01-29', '2026-02-03', MON_FRI, []));
  });
});

describe('leaveCalc.leaveYearOf', () => {
  it('calendar year when startMonth = 1', () => {
    expect(leaveYearOf('2026-03-15', 1)).toBe(2026);
    expect(leaveYearOf('2026-12-31', 1)).toBe(2026);
  });
  it('April-start year rolls Jan-Mar into the previous year', () => {
    expect(leaveYearOf('2026-03-15', 4)).toBe(2025);
    expect(leaveYearOf('2026-05-15', 4)).toBe(2026);
  });
});

describe('leaveCalc.balanceOf', () => {
  it('opening + granted - taken - lapsed - encashed', () => {
    expect(balanceOf({ opening: 2, granted: 12, taken: 3, lapsed: 1, encashed: 0 })).toBe(10);
  });
});

describe('leaveCalc.validateRequest', () => {
  const paid: LeaveTypePolicy = { code: 'CL', paid: true, genderGate: '', halfDayAllowed: true, requiresAttachment: false, eligibleAfterProbation: false };
  const base = { gender: 'M', confirmed: true, hasAttachment: false, overlaps: false, halfDay: false };

  it('rejects zero days', () => {
    expect(validateRequest({ ...base, type: paid, days: 0, balance: 10 })).toMatch(/at least half/);
  });
  it('rejects overlap', () => {
    expect(validateRequest({ ...base, type: paid, days: 1, balance: 10, overlaps: true })).toMatch(/overlap/);
  });
  it('paid type needs balance', () => {
    expect(validateRequest({ ...base, type: paid, days: 3, balance: 2 })).toMatch(/Not enough balance/);
  });
  it('unpaid (LOP) ignores balance', () => {
    const lop: LeaveTypePolicy = { ...paid, code: 'LOP', paid: false };
    expect(validateRequest({ ...base, type: lop, days: 3, balance: 0 })).toBeNull();
  });
  it('gender gate', () => {
    const mat: LeaveTypePolicy = { ...paid, code: 'ML', genderGate: 'F' };
    expect(validateRequest({ ...base, type: mat, days: 1, balance: 99 })).toMatch(/female/);
  });
  it('probation gate', () => {
    const t: LeaveTypePolicy = { ...paid, eligibleAfterProbation: true };
    expect(validateRequest({ ...base, type: t, days: 1, balance: 99, confirmed: false })).toMatch(/probation/);
  });
  it('attachment required', () => {
    const t: LeaveTypePolicy = { ...paid, requiresAttachment: true };
    expect(validateRequest({ ...base, type: t, days: 1, balance: 99, hasAttachment: false })).toMatch(/document/);
  });
  it('half-day not allowed', () => {
    const t: LeaveTypePolicy = { ...paid, halfDayAllowed: false };
    expect(validateRequest({ ...base, type: t, days: 0.5, balance: 99, halfDay: true })).toMatch(/half-day/);
  });
  it('a clean request passes', () => {
    expect(validateRequest({ ...base, type: paid, days: 2, balance: 10 })).toBeNull();
  });
});
