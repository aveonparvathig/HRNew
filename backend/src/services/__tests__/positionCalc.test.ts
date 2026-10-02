import { describe, it, expect } from 'vitest';
import {
  carryForward, changeProblem, dayBefore, historyOf, isDate, periodEndDate, positionInput, positionOn, reasonLabel, samePosition,
  startingDate, whatChanged,
} from '../positionCalc';

const at = (effectiveFrom: string, designation: string, department = 'Engineering', workLocationId: string | null = null, grade = '') =>
  ({ effectiveFrom, designation, department, workLocationId, grade });

// Joined as a trainee, made a developer in April 2026, moved to Chennai as a lead in October
const history = [
  at('2025-02-01', 'Trainee'),
  at('2026-04-01', 'Developer', 'Engineering', null, 'L2'),
  at('2026-10-15', 'Team Lead', 'Delivery', 'chennai', 'L3'),
];
const locationName = (id: string | null) => (id === 'chennai' ? 'Chennai' : id === 'cbe' ? 'Coimbatore' : '');

describe('position in force on a date', () => {
  it('is the latest record on or before the date', () => {
    expect(positionOn(history, '2025-06-30')?.designation).toBe('Trainee');
    expect(positionOn(history, '2026-03-31')?.designation).toBe('Trainee');
    expect(positionOn(history, '2026-04-01')?.designation).toBe('Developer');
    expect(positionOn(history, '2026-10-14')?.designation).toBe('Developer');
    expect(positionOn(history, '2026-10-15')?.designation).toBe('Team Lead');
    expect(positionOn(history, '2030-01-01')?.department).toBe('Delivery');
  });

  it('reads the first record for dates before the history begins', () => {
    expect(positionOn(history, '2024-12-31')?.designation).toBe('Trainee');
    expect(positionOn([], '2026-01-01')).toBeNull();
  });

  it('does not depend on the order the records were entered in', () => {
    const shuffled = [history[2], history[0], history[1]];
    expect(positionOn(shuffled, '2026-05-31')?.designation).toBe('Developer');
    expect(positionOn(shuffled, '2026-10-31')?.designation).toBe('Team Lead');
    expect(shuffled[0].designation).toBe('Team Lead'); // the list given is left as it was
  });

  it('gives a month the position at its last day', () => {
    expect(periodEndDate('2026-10')).toBe('2026-10-31');
    expect(periodEndDate('2026-02')).toBe('2026-02-28');
    expect(periodEndDate('2028-02')).toBe('2028-02-29');
    expect(periodEndDate('2026-12')).toBe('2026-12-31');
    // A change on the 15th shows on that month's payslip; the month before keeps the old one
    expect(positionOn(history, periodEndDate('2026-10'))?.designation).toBe('Team Lead');
    expect(positionOn(history, periodEndDate('2026-09'))?.designation).toBe('Developer');
  });

  it('with only a starting record every month reads the same', () => {
    const only = [at('2021-09-01', 'Trainee', 'Support')];
    for (const period of ['2021-04', '2021-09', '2024-01', '2026-09', '2030-12']) {
      expect(positionOn(only, periodEndDate(period))).toEqual(only[0]);
    }
  });
});

describe('recording a change', () => {
  it('a back-dated change takes over only the months from its date to the next record', () => {
    const back = at('2025-09-01', 'Junior Developer');
    const after = [...history, back];
    expect(changeProblem(history, back)).toBeNull();
    expect(positionOn(after, '2025-08-31')?.designation).toBe('Trainee');
    expect(positionOn(after, '2025-09-30')?.designation).toBe('Junior Developer');
    expect(positionOn(after, '2026-03-31')?.designation).toBe('Junior Developer');
    expect(positionOn(after, '2026-04-30')?.designation).toBe('Developer'); // later records stand
    expect(positionOn(after, '2026-12-31')?.designation).toBe('Team Lead');
  });

  it('refuses a date before the first record', () => {
    expect(changeProblem(history, at('2025-01-31', 'Intern'))).toMatch(/starts on 2025-02-01/);
    expect(changeProblem([], at('2020-01-01', 'Intern'))).toBeNull();
  });

  it('refuses a change that changes nothing', () => {
    expect(changeProblem(history, at('2026-06-01', 'Developer', 'Engineering', null, 'L2'))).toMatch(/Nothing changes/);
    expect(changeProblem(history, at('2026-06-01', 'Developer', 'Engineering', null, 'L3'))).toBeNull();
    // Compared with the record before the date, not with the latest
    expect(changeProblem(history, at('2025-06-01', 'Trainee'))).toMatch(/Nothing changes/);
  });

  it('a change on a date that has a record replaces it', () => {
    expect(changeProblem(history, at('2026-04-01', 'Trainee'))).toBeNull();
    expect(changeProblem(history, at('2025-02-01', 'Apprentice'))).toBeNull();
  });

  it('an out-of-order change carries into later records that kept the old value', () => {
    // A transfer to Delivery back-dated to September 2025, entered after the April 2026 promotion
    const before = positionOn(history, '2025-08-31')!;
    const transfer = at('2025-09-01', 'Trainee', 'Delivery');
    const carried = carryForward(history.filter(c => c.effectiveFrom > transfer.effectiveFrom), before, transfer);
    // The promotion kept Engineering, so it moves to Delivery; the October record set its own department
    expect(carried.map(c => [c.change.effectiveFrom, c.data])).toEqual([['2026-04-01', { department: 'Delivery' }]]);
    const after = [history[0], transfer, { ...history[1], ...carried[0].data }, history[2]];
    expect(positionOn(after, '2025-12-31')).toMatchObject({ designation: 'Trainee', department: 'Delivery' });
    expect(positionOn(after, '2026-06-30')).toMatchObject({ designation: 'Developer', department: 'Delivery', grade: 'L2' });
    expect(positionOn(after, '2026-12-31')).toMatchObject({ designation: 'Team Lead', department: 'Delivery' });
  });

  it('the carry stops at the first later record that changed the value itself', () => {
    const later = [at('2026-01-01', 'Trainee', 'Support'), at('2026-06-01', 'Developer', 'Support'), at('2026-09-01', 'Trainee', 'Support')];
    const carried = carryForward(later, at('', 'Trainee', 'Engineering'), at('', 'Apprentice', 'Engineering'));
    expect(carried.map(c => [c.change.effectiveFrom, c.data])).toEqual([['2026-01-01', { designation: 'Apprentice' }]]);
    // Several values at once, each carried as far as it was held
    const both = carryForward(later, at('', 'Trainee', 'Support', null, ''), at('', 'Associate', 'Operations', 'cbe', ''));
    expect(both.map(c => [c.change.effectiveFrom, c.data])).toEqual([
      ['2026-01-01', { designation: 'Associate', department: 'Operations', workLocationId: 'cbe' }],
      ['2026-06-01', { department: 'Operations', workLocationId: 'cbe' }],
      ['2026-09-01', { department: 'Operations', workLocationId: 'cbe' }],
    ]);
    expect(carryForward(later, at('', 'Trainee', 'Support'), at('', 'Trainee', 'Support'))).toEqual([]);
  });

  it('removing a record takes its change back out of the later ones', () => {
    // Undo the April 2026 promotion: the October record set everything itself, so nothing else moves
    expect(carryForward([history[2]], history[1], history[0])).toEqual([]);
    // A later record that had carried the promotion's grade gives it back
    const later = [at('2026-08-01', 'Developer', 'Delivery', null, 'L2')];
    expect(carryForward(later, history[1], history[0]).map(c => c.data)).toEqual([{ designation: 'Trainee', grade: '' }]);
  });

  it('takes what was typed, tidied', () => {
    expect(positionInput({ effectiveFrom: '2026-11-01', reason: 'PROMOTION', designation: '  Senior   Developer ', department: 'Engineering', workLocationId: '', grade: ' L3 ', remarks: ' Annual review ' }))
      .toEqual({ effectiveFrom: '2026-11-01', reason: 'PROMOTION', designation: 'Senior Developer', department: 'Engineering', workLocationId: null, grade: 'L3', remarks: 'Annual review' });
    expect(positionInput({ effectiveFrom: '2026-02-30', reason: 'PROMOTION' })).toMatch(/date/);
    expect(positionInput({ effectiveFrom: '01-11-2026', reason: 'PROMOTION' })).toMatch(/date/);
    expect(positionInput({ effectiveFrom: '2026-11-01', reason: 'STARTING' })).toMatch(/reason/);
    expect(positionInput({ effectiveFrom: '2026-11-01', reason: 'TRANSFER', designation: 'x'.repeat(121) })).toMatch(/120/);
    expect(positionInput(null)).toMatch(/date/);
  });
});

describe('history as shown', () => {
  it('runs newest first with the span, the state and what changed', () => {
    const rows = historyOf([history[1], history[2], history[0]], '2026-10-02', locationName);
    expect(rows.map(r => r.change.designation)).toEqual(['Team Lead', 'Developer', 'Trainee']);
    expect(rows.map(r => r.state)).toEqual(['UPCOMING', 'CURRENT', 'PAST']);
    expect(rows.map(r => r.until)).toEqual([null, '2026-10-14', '2026-03-31']);
    expect(rows.map(r => r.first)).toEqual([false, false, true]);
    expect(rows[0].changes).toEqual([
      'Designation: Developer → Team Lead', 'Department: Engineering → Delivery',
      'Work location: None → Chennai', 'Grade: L2 → L3',
    ]);
    expect(rows[1].changes).toEqual(['Designation: Trainee → Developer', 'Grade: None → L2']);
    expect(rows[2].changes).toEqual([]);
  });

  it('marks the first record current before its own date', () => {
    const rows = historyOf([at('2026-11-01', 'Trainee')], '2026-10-02', locationName);
    expect(rows[0].state).toBe('CURRENT');
  });

  it('compares positions and names reasons', () => {
    expect(samePosition(at('2026-01-01', 'A'), at('2027-01-01', 'A'))).toBe(true);
    expect(samePosition(at('2026-01-01', 'A', 'X', null), at('2026-01-01', 'A', 'X', 'cbe'))).toBe(false);
    expect(whatChanged(null, history[0], locationName)).toEqual([]);
    expect(reasonLabel('STARTING')).toBe('Starting record');
    expect(reasonLabel('TRANSFER')).toBe('Transfer');
    expect(dayBefore('2026-03-01')).toBe('2026-02-28');
    expect(isDate('2026-10-31')).toBe(true);
    expect(isDate('2026-11-31')).toBe(false);
  });

  it('dates a first record at the joining date, else the day the record was made', () => {
    expect(startingDate({ joinDate: '2021-09-01', createdAt: new Date('2026-01-01T00:00:00Z') })).toBe('2021-09-01');
    expect(startingDate({ joinDate: null, createdAt: new Date('2026-01-01T20:00:00Z') })).toBe('2026-01-02'); // IST
    expect(startingDate({ joinDate: 'soon', createdAt: '2026-05-05T05:00:00Z' })).toBe('2026-05-05');
  });
});
