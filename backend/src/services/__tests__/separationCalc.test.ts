import { describe, it, expect } from 'vitest';
import {
  addDays, daysBetween, modeHasNotice, noticeLastDay, noticeShortfall, finalStatusForMode, exitComplete,
  canAccept, canRelieve, canWithdraw, separationInput, relievingDate,
} from '../separationCalc';

describe('date maths', () => {
  it('adds days and counts between', () => {
    expect(addDays('2026-01-01', 30)).toBe('2026-01-31');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-02-01', '2026-01-01')).toBe(-31);
  });
});

describe('notice period', () => {
  it('works out the last working day the notice implies', () => {
    // 30-day notice from Jan 1 counts Jan 1 as day one -> last day Jan 30
    expect(noticeLastDay('2026-01-01', 30)).toBe('2026-01-30');
    expect(noticeLastDay('2026-01-01', 0)).toBe('2026-01-01');
    expect(noticeLastDay('2026-01-01', null)).toBeNull();
    expect(noticeLastDay(null, 30)).toBeNull();
  });
  it('measures the shortfall, zero when waived or fully served', () => {
    expect(noticeShortfall('2026-01-30', '2026-01-20')).toBe(10); // left 10 days early
    expect(noticeShortfall('2026-01-30', '2026-02-05')).toBe(0); // stayed longer
    expect(noticeShortfall('2026-01-30', '2026-01-20', true)).toBe(0); // waived
    expect(noticeShortfall(null, '2026-01-20')).toBe(0);
  });
  it('knows which modes carry notice', () => {
    expect(modeHasNotice('RESIGNATION')).toBe(true);
    expect(modeHasNotice('TERMINATION')).toBe(false);
    expect(modeHasNotice('DEATH')).toBe(false);
  });
});

describe('status and mode', () => {
  it('maps the mode to the final leaving status', () => {
    expect(finalStatusForMode('TERMINATION')).toBe('TERMINATED');
    expect(finalStatusForMode('RESIGNATION')).toBe('RESIGNED');
    expect(finalStatusForMode('RETIREMENT')).toBe('RESIGNED');
  });
  it('guards the transitions', () => {
    expect(canAccept({ mode: 'RESIGNATION', status: 'SUBMITTED' })).toBe(true);
    expect(canAccept({ mode: 'TERMINATION', status: 'SUBMITTED' })).toBe(false);
    expect(canAccept({ mode: 'RESIGNATION', status: 'ACCEPTED' })).toBe(false);
    // a resignation must be accepted before relieving; other modes can relieve straight away
    expect(canRelieve({ mode: 'RESIGNATION', status: 'SUBMITTED' })).toBe(false);
    expect(canRelieve({ mode: 'RESIGNATION', status: 'ACCEPTED' })).toBe(true);
    expect(canRelieve({ mode: 'TERMINATION', status: 'SUBMITTED' })).toBe(true);
    expect(canRelieve({ mode: 'RESIGNATION', status: 'RELIEVED' })).toBe(false);
    expect(canWithdraw({ status: 'ACCEPTED' })).toBe(true);
    expect(canWithdraw({ status: 'RELIEVED' })).toBe(false);
  });
});

describe('exit checklist', () => {
  it('is complete only when every item is done', () => {
    const all = { assetsReturned: true, accessRevoked: true, handoverDone: true, exitInterviewDone: true };
    expect(exitComplete(all)).toBe(true);
    expect(exitComplete({ ...all, handoverDone: false })).toBe(false);
  });
});

describe('separation input', () => {
  it('needs a known mode', () => {
    expect(separationInput({ mode: '' })).toMatch(/how the employee is leaving/);
    expect(separationInput({ mode: 'HOLIDAY' })).toMatch(/how the employee is leaving/);
  });
  it('takes a resignation and computes notice last day + shortfall', () => {
    const r = separationInput({ mode: 'resignation', submittedOn: '2026-01-01', noticeDays: 30, agreedLastDay: '2026-01-20', reason: 'Better offer', remarks: 'Good leaver' }) as any;
    expect(r.mode).toBe('RESIGNATION');
    expect(r.noticeLastDay).toBe('2026-01-30');
    expect(r.noticeShortfallDays).toBe(10);
    expect(r.reason).toBe('Better offer');
  });
  it('a waiver zeroes the shortfall', () => {
    const r = separationInput({ mode: 'RESIGNATION', submittedOn: '2026-01-01', noticeDays: 30, agreedLastDay: '2026-01-20', noticeWaived: true }) as any;
    expect(r.noticeShortfallDays).toBe(0);
    expect(r.noticeWaived).toBe(true);
  });
  it('a non-notice mode has no notice last day', () => {
    const r = separationInput({ mode: 'TERMINATION', submittedOn: '2026-01-01', noticeDays: 30, agreedLastDay: '2026-01-20' }) as any;
    expect(r.noticeLastDay).toBeNull();
    expect(r.noticeShortfallDays).toBe(0);
  });
  it('rejects bad dates, notice and fit-to-rehire', () => {
    expect(separationInput({ mode: 'RESIGNATION', submittedOn: '2026-02-30' })).toMatch(/valid date submitted/);
    expect(separationInput({ mode: 'RESIGNATION', noticeDays: '400' })).toMatch(/up to 365/);
    expect(separationInput({ mode: 'RESIGNATION', noticeDays: '3.5' })).toMatch(/whole number/);
    expect(separationInput({ mode: 'RESIGNATION', fitToRehire: 'MAYBE' })).toMatch(/Fit to rehire/);
  });
  it('carries the exit checklist and fit-to-rehire through', () => {
    const r = separationInput({ mode: 'RETIREMENT', assetsReturned: true, accessRevoked: true, handoverDone: true, exitInterviewDone: true, fitToRehire: 'yes' }) as any;
    expect(exitComplete(r)).toBe(true);
    expect(r.fitToRehire).toBe('YES');
  });
});

describe('relieving date', () => {
  const sep = { agreedLastDay: '2026-01-20', noticeLastDay: '2026-01-30' };
  it('prefers the given date, then agreed, then notice', () => {
    expect(relievingDate('2026-01-25', sep)).toBe('2026-01-25');
    expect(relievingDate('', sep)).toBe('2026-01-20');
    expect(relievingDate('', { agreedLastDay: null, noticeLastDay: '2026-01-30' })).toBe('2026-01-30');
    expect(relievingDate('', { agreedLastDay: null, noticeLastDay: null })).toBeNull();
    expect(relievingDate('not-a-date', sep)).toBe('2026-01-20');
  });
});
