// What HR looks at each morning: headcount over the months, who joined
// and left, birthdays and anniversaries coming up, records with gaps.
// Pure, DB-independent.

export interface StaffLike {
  joinDate?: string | null; // "YYYY-MM-DD"
  leavingDate?: string | null;
  employmentStatus?: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: any): v is string => typeof v === 'string' && DATE.test(v) && !isNaN(Date.parse(v));
const LEFT = ['RESIGNED', 'TERMINATED'];
const pad = (n: number) => String(n).padStart(2, '0');
const utc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (date: string, days: number) => iso(utc(date) + days * 86400000);
export const daysBetween = (from: string, to: string) => Math.round((utc(to) - utc(from)) / 86400000);
const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
const monthEnd = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return `${period}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};

// Someone marked as left with no relieving date cannot be placed in time:
// they are kept out of every month's count.
const leftUndated = (p: StaffLike) => LEFT.includes(p.employmentStatus || '') && !isDate(p.leavingDate);

// On the rolls on a date: joined on or before it and not yet left. The
// last working day still counts. With no joining date on record the
// employee is taken to have been there all along.
export function onRollsOn(p: StaffLike, date: string): boolean {
  if (leftUndated(p)) return false;
  if (isDate(p.joinDate) && p.joinDate > date) return false;
  if (isDate(p.leavingDate) && p.leavingDate < date) return false;
  return true;
}

export const headcountOn = (people: StaffLike[], date: string) => people.filter(p => onRollsOn(p, date)).length;

export interface TrendMonth {
  period: string; // "YYYY-MM"
  headcount: number; // at the month's last day; today for the month running
  joined: number;
  left: number;
}

// The last `months` months ending with the one today falls in.
export function headcountTrend(people: StaffLike[], today: string, months = 12): TrendMonth[] {
  const [y, m] = today.split('-').map(Number);
  const out: TrendMonth[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const period = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
    const end = monthEnd(period);
    const upTo = end > today ? today : end;
    const within = (date?: string | null) => isDate(date) && date.slice(0, 7) === period && date <= upTo;
    out.push({
      period,
      headcount: headcountOn(people, upTo),
      joined: people.filter(p => !leftUndated(p) && within(p.joinDate)).length,
      left: people.filter(p => within(p.leavingDate)).length,
    });
  }
  return out;
}

// Joined in the days up to and including today, latest first.
export function recentJoiners<T extends StaffLike>(people: T[], today: string, days = 30): T[] {
  const from = addDays(today, -days);
  return people.filter(p => isDate(p.joinDate) && p.joinDate > from && p.joinDate <= today)
    .sort((a, b) => b.joinDate!.localeCompare(a.joinDate!));
}

// Last working day in the days up to and including today, latest first.
export function recentLeavers<T extends StaffLike>(people: T[], today: string, days = 30): T[] {
  const from = addDays(today, -days);
  return people.filter(p => isDate(p.leavingDate) && p.leavingDate > from && p.leavingDate <= today)
    .sort((a, b) => b.leavingDate!.localeCompare(a.leavingDate!));
}

// Still working, with a last working day ahead or on notice: soonest first.
export function leavingSoon<T extends StaffLike>(people: T[], today: string): T[] {
  return people.filter(p => !LEFT.includes(p.employmentStatus || '')
      && ((isDate(p.leavingDate) && p.leavingDate > today) || (p.employmentStatus === 'NOTICE_PERIOD' && !isDate(p.leavingDate))))
    .sort((a, b) => (a.leavingDate || '9999').localeCompare(b.leavingDate || '9999'));
}

// The next time a date's day and month come round, today included. 29
// February is kept on 28 February in a year without one.
export function nextOccurrence(date: string, today: string): string {
  const [, month, day] = date.split('-').map(Number);
  const inYear = (year: number) => `${year}-${pad(month)}-${pad(month === 2 && day === 29 && !isLeap(year) ? 28 : day)}`;
  const year = Number(today.slice(0, 4));
  const thisYear = inYear(year);
  return thisYear >= today ? thisYear : inYear(year + 1);
}

export interface Upcoming<T> {
  person: T;
  on: string; // the day it falls on
  daysAway: number; // 0 = today
  years: number; // completed on that day
}

// Dates coming round within the next `days` days (today counts as the
// first), soonest first. A date in the future itself is not an occasion.
export function upcoming<T>(people: T[], dateOf: (p: T) => string | null | undefined, today: string, days = 7): Upcoming<T>[] {
  const out: Upcoming<T>[] = [];
  for (const person of people) {
    const date = dateOf(person);
    if (!isDate(date) || date > today) continue;
    const on = nextOccurrence(date, today);
    const daysAway = daysBetween(today, on);
    if (daysAway >= days) continue;
    out.push({ person, on, daysAway, years: Number(on.slice(0, 4)) - Number(date.slice(0, 4)) });
  }
  return out.sort((a, b) => a.daysAway - b.daysAway);
}

// Joining anniversaries: the day someone joins is not one.
export const upcomingAnniversaries = <T>(people: T[], dateOf: (p: T) => string | null | undefined, today: string, days = 7) =>
  upcoming(people, dateOf, today, days).filter(u => u.years >= 1);

// Records payroll will trip over. Each key is also the People list filter.
export const RECORD_GAPS = [
  { key: 'pan', label: 'No PAN', test: (p: any) => !String(p.panNumber || '').trim() },
  { key: 'bank', label: 'No bank account', test: (p: any) => !String(p.bankAccountNumber || '').trim() },
  { key: 'location', label: 'No work location', test: (p: any) => !p.workLocationId },
  { key: 'joinDate', label: 'No joining date', test: (p: any) => !isDate(p.joinDate) },
] as const;

export const recordGaps = (people: any[]) =>
  RECORD_GAPS.map(g => ({ key: g.key, label: g.label, count: people.filter(g.test).length }));
