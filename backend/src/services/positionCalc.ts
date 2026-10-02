// An employee's position over time: designation, department, work location
// and grade, as dated records. Pure, DB-independent.
import { cleanLabel } from './masters';

export interface PositionLike {
  effectiveFrom: string; // "YYYY-MM-DD"
  designation: string;
  department: string;
  workLocationId: string | null;
  grade: string;
}

export const STARTING = 'STARTING';
export const POSITION_REASONS = [
  { value: 'PROMOTION', label: 'Promotion' },
  { value: 'TRANSFER', label: 'Transfer' },
  { value: 'CORRECTION', label: 'Correction' },
];
export const reasonLabel = (reason: string) =>
  (reason === STARTING ? 'Starting record' : POSITION_REASONS.find(r => r.value === reason)?.label || reason);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isDate = (value: any): value is string =>
  typeof value === 'string' && DATE.test(value) && !isNaN(Date.parse(value)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

const inOrder = <T extends PositionLike>(changes: T[]) =>
  [...changes].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

// The position in force on a date: the latest record on or before it. A
// date earlier than every record reads the first one, so months before
// the history begins print what the record began with. Null = no history.
export function positionOn<T extends PositionLike>(changes: T[], date: string): T | null {
  const sorted = inOrder(changes);
  if (sorted.length === 0) return null;
  let found = sorted[0];
  for (const c of sorted) {
    if (c.effectiveFrom <= date) found = c;
    else break;
  }
  return found;
}

// The last day of a month: "2026-02" → "2026-02-28"
export function periodEndDate(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

export const dayBefore = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

const FIELDS = ['designation', 'department', 'workLocationId', 'grade'] as const;
export const samePosition = (a: PositionLike, b: PositionLike) =>
  FIELDS.every(f => (a[f] || '') === (b[f] || ''));

export const positionOf = (record: any): Omit<PositionLike, 'effectiveFrom'> => ({
  designation: record.designation || '', department: record.department || '',
  workLocationId: record.workLocationId || null, grade: record.grade || '',
});

// A value changed on an earlier date carries into the later records that
// still hold the old one: a transfer back-dated to before a promotion
// stays in force after the promotion, which only changed the designation.
// A later record that set the value itself stops the carry. Removing a
// record is the same thing the other way round. Returns, for each later
// record touched, the values it takes.
export function carryForward<T extends PositionLike>(
  later: T[], from: Omit<PositionLike, 'effectiveFrom'>, to: Omit<PositionLike, 'effectiveFrom'>,
): { change: T; data: Partial<Omit<PositionLike, 'effectiveFrom'>> }[] {
  const touched = new Map<T, Partial<Omit<PositionLike, 'effectiveFrom'>>>();
  for (const f of FIELDS) {
    const [old, now] = [from[f] || null, to[f] || null];
    if (old === now) continue;
    for (const change of inOrder(later)) {
      if ((change[f] || null) !== old) break;
      touched.set(change, { ...touched.get(change), [f]: to[f] });
    }
  }
  return [...touched].map(([change, data]) => ({ change, data }));
}

// What differs between two positions, in words: "Designation: Trainee → Developer"
export function whatChanged(before: PositionLike | null, after: PositionLike, locationName: (id: string | null) => string): string[] {
  if (!before) return [];
  const show = (v: string) => v || 'None';
  const out: string[] = [];
  if (before.designation !== after.designation) out.push(`Designation: ${show(before.designation)} → ${show(after.designation)}`);
  if (before.department !== after.department) out.push(`Department: ${show(before.department)} → ${show(after.department)}`);
  if ((before.workLocationId || null) !== (after.workLocationId || null)) {
    out.push(`Work location: ${show(locationName(before.workLocationId))} → ${show(locationName(after.workLocationId))}`);
  }
  if (before.grade !== after.grade) out.push(`Grade: ${show(before.grade)} → ${show(after.grade)}`);
  return out;
}

export interface PositionInput extends PositionLike {
  reason: string;
  remarks: string;
}

// A change as typed, cleaned up — or the reason it cannot be taken.
export function positionInput(b: any): PositionInput | string {
  if (!isDate(b?.effectiveFrom)) return 'Enter the date the change takes effect';
  const year = Number(b.effectiveFrom.slice(0, 4));
  if (year < 1950 || year > 2100) return 'Enter the date the change takes effect';
  if (!POSITION_REASONS.some(r => r.value === b.reason)) return 'Pick a reason for the change';
  const input = {
    effectiveFrom: b.effectiveFrom as string,
    designation: cleanLabel(b.designation), department: cleanLabel(b.department),
    workLocationId: b.workLocationId ? String(b.workLocationId) : null, grade: cleanLabel(b.grade),
    reason: String(b.reason), remarks: String(b.remarks ?? '').trim(),
  };
  for (const f of ['designation', 'department', 'grade'] as const) {
    if (input[f].length > 120) return 'Keep each value under 120 characters';
  }
  if (input.remarks.length > 500) return 'Keep the remarks under 500 characters';
  return input;
}

// Why a change cannot be recorded against the history so far, or null.
// A change on a date that already has a record replaces that record.
export function changeProblem(changes: PositionLike[], input: PositionLike): string | null {
  const sorted = inOrder(changes);
  if (sorted.length === 0) return null;
  if (input.effectiveFrom < sorted[0].effectiveFrom) {
    return `The position record starts on ${sorted[0].effectiveFrom}. Pick that date or a later one.`;
  }
  const others = sorted.filter(c => c.effectiveFrom !== input.effectiveFrom);
  const replacing = others.length < sorted.length;
  const before = others.filter(c => c.effectiveFrom < input.effectiveFrom).pop() || null;
  if (!replacing && before && samePosition(before, input)) {
    return 'Nothing changes on that date: the designation, department, work location and grade are what the employee already holds then.';
  }
  return null;
}

export interface HistoryRow<T extends PositionLike> {
  change: T;
  until: string | null; // the day before the next record; null = still running
  state: 'PAST' | 'CURRENT' | 'UPCOMING';
  changes: string[];
  first: boolean;
}

// The history newest first, each record with the span it covers, whether
// it is the one in force today, and what it changed.
export function historyOf<T extends PositionLike>(changes: T[], today: string, locationName: (id: string | null) => string): HistoryRow<T>[] {
  const sorted = inOrder(changes);
  const current = positionOn(sorted, today);
  return sorted.map((change, i) => {
    const next = sorted[i + 1];
    return {
      change,
      until: next ? dayBefore(next.effectiveFrom) : null,
      state: change === current ? 'CURRENT' as const : change.effectiveFrom > today ? 'UPCOMING' as const : 'PAST' as const,
      changes: whatChanged(sorted[i - 1] || null, change, locationName),
      first: i === 0,
    };
  }).reverse();
}

// Where a first record is dated: the joining date, else the day the
// employee's record was made.
export function startingDate(person: { joinDate?: string | null; createdAt?: Date | string | null }): string {
  if (isDate(person.joinDate)) return person.joinDate;
  const made = person.createdAt ? new Date(person.createdAt) : new Date();
  return new Date(made.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
