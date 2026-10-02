import { describe, it, expect } from 'vitest';
import {
  addDays, daysBetween, headcountOn, headcountTrend, leavingSoon, nextOccurrence, onRollsOn, recentJoiners, recentLeavers,
  recordGaps, upcoming, upcomingAnniversaries,
} from '../hrDashboard';

const staff = [
  { name: 'Asha', joinDate: '2021-09-01', leavingDate: null, employmentStatus: 'ACTIVE' },
  { name: 'Bala', joinDate: '2026-03-10', leavingDate: null, employmentStatus: 'PROBATION' },
  { name: 'Chitra', joinDate: '2024-01-15', leavingDate: '2026-06-30', employmentStatus: 'RESIGNED' },
  { name: 'Dinesh', joinDate: '2026-09-15', leavingDate: null, employmentStatus: 'ACTIVE' },
  { name: 'Esther', joinDate: '2023-05-02', leavingDate: '2026-10-20', employmentStatus: 'NOTICE_PERIOD' },
  { name: 'Farook', joinDate: null, leavingDate: null, employmentStatus: 'ACTIVE' }, // no joining date on record
  { name: 'Gita', joinDate: '2022-02-01', leavingDate: null, employmentStatus: 'TERMINATED' }, // left, date not recorded
];

describe('headcount on a date', () => {
  it('counts those who joined on or before it and have not yet left', () => {
    expect(headcountOn(staff, '2026-02-28')).toBe(4); // Asha, Chitra, Esther, Farook
    expect(headcountOn(staff, '2026-03-09')).toBe(4);
    expect(headcountOn(staff, '2026-03-10')).toBe(5); // Bala joins that day
    expect(headcountOn(staff, '2026-10-02')).toBe(5); // Chitra gone, Dinesh in
  });

  it('counts the last working day and drops the employee the day after', () => {
    const chitra = staff[2];
    expect(onRollsOn(chitra, '2026-06-30')).toBe(true);
    expect(onRollsOn(chitra, '2026-07-01')).toBe(false);
    expect(onRollsOn(chitra, '2024-01-14')).toBe(false);
    expect(onRollsOn(chitra, '2024-01-15')).toBe(true);
  });

  it('takes an employee with no joining date as there all along, and leaves out one who left without a date', () => {
    expect(onRollsOn(staff[5], '2010-01-01')).toBe(true);
    expect(onRollsOn(staff[6], '2023-01-01')).toBe(false);
    expect(onRollsOn(staff[6], '2026-10-02')).toBe(false);
  });

  it('someone serving notice is still on the rolls until the last day', () => {
    expect(onRollsOn(staff[4], '2026-10-20')).toBe(true);
    expect(onRollsOn(staff[4], '2026-10-21')).toBe(false);
  });
});

describe('headcount trend', () => {
  const trend = headcountTrend(staff, '2026-10-02');

  it('covers twelve months ending with the one running', () => {
    expect(trend).toHaveLength(12);
    expect(trend[0].period).toBe('2025-11');
    expect(trend[11].period).toBe('2026-10');
    expect(headcountTrend(staff, '2026-01-15', 3).map(t => t.period)).toEqual(['2025-11', '2025-12', '2026-01']);
  });

  it('gives each month its count at month end, joiners and leavers', () => {
    const month = (period: string) => trend.find(t => t.period === period);
    expect(month('2026-02')).toEqual({ period: '2026-02', headcount: 4, joined: 0, left: 0 });
    expect(month('2026-03')).toEqual({ period: '2026-03', headcount: 5, joined: 1, left: 0 });
    expect(month('2026-06')).toEqual({ period: '2026-06', headcount: 5, joined: 0, left: 1 }); // the last day still counts
    expect(month('2026-07')?.headcount).toBe(4);
    expect(month('2026-09')).toEqual({ period: '2026-09', headcount: 5, joined: 1, left: 0 });
  });

  it('stops the running month at today', () => {
    // Esther leaves on the 20th: still counted on the 2nd, and not yet a leaver
    expect(trend[11]).toEqual({ period: '2026-10', headcount: 5, joined: 0, left: 0 });
    expect(headcountTrend(staff, '2026-10-25')[11]).toEqual({ period: '2026-10', headcount: 4, joined: 0, left: 1 });
  });
});

describe('joiners and leavers', () => {
  it('lists those who joined in the last 30 days, latest first', () => {
    expect(recentJoiners(staff, '2026-10-02').map(p => p.name)).toEqual(['Dinesh']);
    expect(recentJoiners(staff, '2026-10-15').map(p => p.name)).toEqual([]); // the 15th of September is 30 days back
    expect(recentJoiners(staff, '2026-10-14').map(p => p.name)).toEqual(['Dinesh']);
    expect(recentJoiners(staff, '2026-09-14').map(p => p.name)).toEqual([]); // not yet joined
  });

  it('lists those whose last day fell in the last 30 days', () => {
    expect(recentLeavers(staff, '2026-07-10').map(p => p.name)).toEqual(['Chitra']);
    expect(recentLeavers(staff, '2026-10-02').map(p => p.name)).toEqual([]);
    expect(recentLeavers(staff, '2026-10-25').map(p => p.name)).toEqual(['Esther']);
  });

  it('lists those still working with a last day ahead', () => {
    expect(leavingSoon(staff, '2026-10-02').map(p => p.name)).toEqual(['Esther']);
    expect(leavingSoon(staff, '2026-10-21').map(p => p.name)).toEqual([]);
    const onNotice = [{ name: 'Hari', joinDate: '2020-01-01', leavingDate: null, employmentStatus: 'NOTICE_PERIOD' }];
    expect(leavingSoon(onNotice, '2026-10-02').map(p => p.name)).toEqual(['Hari']);
  });
});

describe('birthdays and anniversaries', () => {
  const born = (name: string, dateOfBirth: string | null) => ({ name, dateOfBirth });
  const dob = (p: { dateOfBirth: string | null }) => p.dateOfBirth;

  it('finds the next time a date comes round', () => {
    expect(nextOccurrence('1990-10-02', '2026-10-02')).toBe('2026-10-02');
    expect(nextOccurrence('1990-10-01', '2026-10-02')).toBe('2027-10-01');
    expect(nextOccurrence('1990-12-31', '2026-10-02')).toBe('2026-12-31');
  });

  it('lists birthdays in the next seven days, today first', () => {
    const people = [born('Later', '1992-10-09'), born('Sixth', '1988-10-08'), born('Today', '1995-10-02'), born('Past', '1990-10-01'), born('None', null)];
    const list = upcoming(people, dob, '2026-10-02');
    expect(list.map(u => [u.person.name, u.on, u.daysAway])).toEqual([['Today', '2026-10-02', 0], ['Sixth', '2026-10-08', 6]]);
    expect(list[0].years).toBe(31);
  });

  it('carries across a year end', () => {
    const people = [born('New Year', '1990-01-02'), born('Eve', '1985-12-31'), born('Too far', '1990-01-05')];
    const list = upcoming(people, dob, '2026-12-29');
    expect(list.map(u => [u.person.name, u.on, u.daysAway])).toEqual([['Eve', '2026-12-31', 2], ['New Year', '2027-01-02', 4]]);
    expect(list[1].years).toBe(37);
  });

  it('keeps 29 February on the 28th in a year without one', () => {
    expect(nextOccurrence('1996-02-29', '2027-02-25')).toBe('2027-02-28');
    expect(nextOccurrence('1996-02-29', '2028-02-25')).toBe('2028-02-29');
    expect(nextOccurrence('1996-02-29', '2027-03-01')).toBe('2028-02-29');
    const leapling = [born('Leap', '1996-02-29')];
    expect(upcoming(leapling, dob, '2027-02-25').map(u => [u.on, u.daysAway, u.years])).toEqual([['2027-02-28', 3, 31]]);
    expect(upcoming(leapling, dob, '2028-02-25').map(u => [u.on, u.daysAway])).toEqual([['2028-02-29', 4]]);
    expect(upcoming(leapling, dob, '2027-02-20')).toEqual([]); // eight days off
  });

  it('counts joining anniversaries from the first year on', () => {
    const joined = (p: { joinDate?: string | null }) => p.joinDate;
    // Dinesh joined 15 Sep 2026: no anniversary that year, the first a year on
    expect(upcomingAnniversaries(staff, joined, '2026-09-12').map(u => u.person.name)).toEqual([]);
    expect(upcomingAnniversaries(staff, joined, '2027-09-12').map(u => [u.person.name, u.years])).toEqual([['Dinesh', 1]]);
    expect(upcomingAnniversaries(staff, joined, '2026-08-30').map(u => [u.person.name, u.on, u.years])).toEqual([['Asha', '2026-09-01', 5]]);
    // Someone joining next week is not an anniversary
    expect(upcomingAnniversaries([{ joinDate: '2026-10-05' }], joined, '2026-10-02')).toEqual([]);
  });
});

describe('records with gaps', () => {
  it('counts employees with no PAN, bank account, work location or joining date', () => {
    const people = [
      { panNumber: 'ABCDE1234F', bankAccountNumber: '123', workLocationId: 'loc', joinDate: '2024-01-01' },
      { panNumber: ' ', bankAccountNumber: '', workLocationId: null, joinDate: null },
      { panNumber: 'ABCDE1234F', bankAccountNumber: null, workLocationId: 'loc', joinDate: '2024-01-01' },
    ];
    expect(recordGaps(people)).toEqual([
      { key: 'pan', label: 'No PAN', count: 1 },
      { key: 'bank', label: 'No bank account', count: 2 },
      { key: 'location', label: 'No work location', count: 1 },
      { key: 'joinDate', label: 'No joining date', count: 1 },
    ]);
  });

  it('adds days and measures them across months', () => {
    expect(addDays('2026-10-02', -30)).toBe('2026-09-02');
    expect(addDays('2026-12-29', 4)).toBe('2027-01-02');
    expect(daysBetween('2026-12-29', '2027-01-02')).toBe(4);
  });
});
