import { describe, it, expect } from 'vitest';
import { nthOccurrence, isWeekOff, sanitizeWeekOffRules, buildWeekOffPredicate } from '../weekOff';

// Reference month: January 2026 (Jan 1 is a Thursday), so its Saturdays are
// Jan 3 (1st), 10 (2nd), 17 (3rd), 24 (4th), 31 (5th) — a month WITH a 5th
// Saturday. February 2026 has only four Saturdays (7,14,21,28).

describe('weekOff.nthOccurrence', () => {
  it('numbers the occurrences of a weekday within the month', () => {
    expect(nthOccurrence('2026-01-03')).toBe(1);
    expect(nthOccurrence('2026-01-10')).toBe(2);
    expect(nthOccurrence('2026-01-17')).toBe(3);
    expect(nthOccurrence('2026-01-24')).toBe(4);
    expect(nthOccurrence('2026-01-31')).toBe(5);
  });
  it('is independent of weekday — just the date band', () => {
    expect(nthOccurrence('2026-02-01')).toBe(1); // 1st of the month
    expect(nthOccurrence('2026-02-28')).toBe(4);
  });
});

describe('weekOff.isWeekOff — 2nd & 4th Saturday', () => {
  const rules = [{ day: 6, weeks: [2, 4] }];
  it('offs only the 2nd and 4th Saturdays', () => {
    expect(isWeekOff('2026-01-10', [], rules)).toBe(true);  // 2nd Sat
    expect(isWeekOff('2026-01-24', [], rules)).toBe(true);  // 4th Sat
    expect(isWeekOff('2026-01-03', [], rules)).toBe(false); // 1st Sat
    expect(isWeekOff('2026-01-17', [], rules)).toBe(false); // 3rd Sat
    expect(isWeekOff('2026-01-31', [], rules)).toBe(false); // 5th Sat
  });
  it('a weekday that is not the rule day is never off', () => {
    expect(isWeekOff('2026-01-12', [], rules)).toBe(false); // a Monday
  });
});

describe('weekOff — months without a 5th occurrence', () => {
  it('a rule for the 5th Saturday simply never fires in a 4-Saturday month', () => {
    const rules = [{ day: 6, weeks: [5] }];
    // Feb 2026 has no 5th Saturday — none of its Saturdays are off.
    for (const d of ['2026-02-07', '2026-02-14', '2026-02-21', '2026-02-28']) {
      expect(isWeekOff(d, [], rules)).toBe(false);
    }
    // Jan 2026 does have a 5th Saturday.
    expect(isWeekOff('2026-01-31', [], rules)).toBe(true);
  });
});

describe('weekOff — union of every-week days and rules', () => {
  it('counts both Sunday (every week) and 2nd/4th Saturday', () => {
    const off = buildWeekOffPredicate([0], [{ day: 6, weeks: [2, 4] }]);
    expect(off('2026-01-04')).toBe(true);  // Sunday
    expect(off('2026-01-10')).toBe(true);  // 2nd Saturday
    expect(off('2026-01-03')).toBe(false); // 1st Saturday
  });
  it('every-week supersedes a rule for the same day', () => {
    // Saturday off every week wins, even if a (contradictory) rule is present.
    const off = buildWeekOffPredicate([6], [{ day: 6, weeks: [2] }]);
    expect(off('2026-01-03')).toBe(true); // 1st Saturday still off
    expect(off('2026-01-10')).toBe(true); // 2nd Saturday off
  });
});

describe('weekOff.sanitizeWeekOffRules', () => {
  it('clamps days/weeks, de-dupes, merges and drops empties', () => {
    const out = sanitizeWeekOffRules([
      { day: 6, weeks: [2, 4, 9, 0, 2] }, // 9 and 0 dropped, dup 2 merged
      { day: 6, weeks: [1] },             // merged into the day-6 rule
      { day: 9, weeks: [1] },             // bad day → dropped
      { day: 1, weeks: [] },              // no weeks → dropped
    ]);
    expect(out).toEqual([{ day: 6, weeks: [1, 2, 4] }]);
  });
  it('returns [] for non-arrays / junk', () => {
    expect(sanitizeWeekOffRules(undefined)).toEqual([]);
    expect(sanitizeWeekOffRules('nope' as any)).toEqual([]);
    expect(sanitizeWeekOffRules([null, 5, { nope: true }] as any)).toEqual([]);
  });
});
