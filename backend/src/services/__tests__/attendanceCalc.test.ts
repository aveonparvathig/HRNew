import { describe, it, expect } from 'vitest';
import { daySummary, isException, minToHHMM, dayStatus, monthTotals, type Punch } from '../attendanceCalc';

const P = (time: string, direction: string): Punch => ({ time, direction });

describe('attendanceCalc.daySummary', () => {
  it('a clean in/out day', () => {
    const s = daySummary([P('09:00', 'IN'), P('18:00', 'OUT')]);
    expect(s.firstIn).toBe('09:00');
    expect(s.lastOut).toBe('18:00');
    expect(s.workedMinutes).toBe(540);
    expect(s.complete).toBe(true);
  });
  it('sums multiple in/out pairs (lunch break)', () => {
    const s = daySummary([P('09:00', 'IN'), P('13:00', 'OUT'), P('14:00', 'IN'), P('18:00', 'OUT')]);
    expect(s.workedMinutes).toBe(480); // 240 + 240
    expect(s.complete).toBe(true);
  });
  it('sorts unordered punches', () => {
    const s = daySummary([P('18:00', 'OUT'), P('09:00', 'IN')]);
    expect(s.workedMinutes).toBe(540);
    expect(s.complete).toBe(true);
  });
  it('a missing OUT is incomplete', () => {
    const s = daySummary([P('09:00', 'IN')]);
    expect(s.workedMinutes).toBe(0);
    expect(s.complete).toBe(false);
    expect(s.lastOut).toBeNull();
  });
  it('two INs without an OUT between is incomplete', () => {
    const s = daySummary([P('09:00', 'IN'), P('10:00', 'IN'), P('18:00', 'OUT')]);
    expect(s.complete).toBe(false);
  });
  it('empty day', () => {
    expect(daySummary([]).complete).toBe(false);
  });
});

describe('attendanceCalc.isException', () => {
  it('flags unpaired days, not clean ones', () => {
    expect(isException([P('09:00', 'IN')])).toBe(true);
    expect(isException([P('09:00', 'IN'), P('18:00', 'OUT')])).toBe(false);
    expect(isException([])).toBe(false); // no punches ≠ exception
  });
});

describe('attendanceCalc.minToHHMM', () => {
  it('formats minutes', () => {
    expect(minToHHMM(540)).toBe('09:00');
    expect(minToHHMM(485)).toBe('08:05');
  });
});

describe('attendanceCalc.dayStatus', () => {
  const base = { isWeekOff: false, isHoliday: false, onLeave: null as any, workedMinutes: 0, shiftMinutes: 480 };
  it('holiday/week-off/leave take precedence', () => {
    expect(dayStatus({ ...base, isHoliday: true, workedMinutes: 500 })).toBe('HOLIDAY');
    expect(dayStatus({ ...base, isWeekOff: true })).toBe('WEEKOFF');
    expect(dayStatus({ ...base, onLeave: 'PAID' })).toBe('LEAVE');
    expect(dayStatus({ ...base, onLeave: 'UNPAID' })).toBe('LOP');
  });
  it('worked time decides present / half / absent', () => {
    expect(dayStatus({ ...base, workedMinutes: 480 })).toBe('PRESENT');  // full
    expect(dayStatus({ ...base, workedMinutes: 360 })).toBe('PRESENT');  // 75%
    expect(dayStatus({ ...base, workedMinutes: 240 })).toBe('HALF_DAY'); // 50%
    expect(dayStatus({ ...base, workedMinutes: 0 })).toBe('ABSENT');
  });
});

describe('attendanceCalc.monthTotals', () => {
  it('counts statuses; attendanceLop = absent + half/2, excludes leave-LOP', () => {
    const t = monthTotals(['PRESENT', 'PRESENT', 'HALF_DAY', 'ABSENT', 'WEEKOFF', 'HOLIDAY', 'LEAVE', 'LOP']);
    expect(t.present).toBe(2);
    expect(t.attendanceLop).toBe(1.5); // 1 absent + 0.5 half (LOP-leave not counted)
    expect(t.presentDays).toBe(2 + 0.5 + 1 + 1 + 1); // present + half/2 + leave + weekoff + holiday
  });
});
