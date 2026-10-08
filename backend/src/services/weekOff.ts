// Week-off evaluation — day-of-week offs plus occurrence-based rules
// (e.g. 2nd & 4th Saturday). Pure: no DB, no Prisma. Dates are "YYYY-MM-DD"
// strings using the same UTC convention as leaveCalc.ts.
//
// Representation:
//   weekOffDays  — JS day numbers (0=Sun..6=Sat) that are off EVERY week.
//   weekOffRules — occurrence-based offs: a day is off only on the listed
//                  nth occurrences of that weekday within the month.

export interface WeekOffRule {
  day: number;     // 0=Sun .. 6=Sat
  weeks: number[]; // subset of [1,2,3,4,5]; nth occurrence of `day` in the month
}

const dayUTC = (d: string) => new Date(d + 'T00:00:00Z');
const dowOf = (d: string) => dayUTC(d).getUTCDay();

// The nth occurrence (1..5) of this date's weekday within its month.
// e.g. a Saturday on the 8th–14th is the 2nd Saturday. The 5th occurrence
// only exists in months that have one.
export function nthOccurrence(dateStr: string): number {
  const dom = dayUTC(dateStr).getUTCDate();
  return Math.floor((dom - 1) / 7) + 1;
}

// Normalize untrusted input into clean WeekOffRule[]: clamp day to 0..6 and
// weeks to 1..5, de-dupe, sort, and drop rules with no weeks.
export function sanitizeWeekOffRules(input: unknown): WeekOffRule[] {
  if (!Array.isArray(input)) return [];
  const byDay = new Map<number, Set<number>>();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const day = Number((raw as any).day);
    if (!Number.isInteger(day) || day < 0 || day > 6) continue;
    const weeksIn = (raw as any).weeks;
    if (!Array.isArray(weeksIn)) continue;
    const set = byDay.get(day) ?? new Set<number>();
    for (const w of weeksIn) {
      const n = Number(w);
      if (Number.isInteger(n) && n >= 1 && n <= 5) set.add(n);
    }
    if (set.size) byDay.set(day, set);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([day, weeks]) => ({ day, weeks: [...weeks].sort((a, b) => a - b) }));
}

// Build an O(1) predicate testing whether a given date is a week-off.
// A date is off when its weekday is in weekOffDays (every week) OR a rule
// for that weekday lists the date's nth occurrence.
export function buildWeekOffPredicate(
  weekOffDays: number[] = [],
  weekOffRules: WeekOffRule[] = [],
): (dateStr: string) => boolean {
  const everyWeek = new Set(weekOffDays);
  const ruleWeeks = new Map<number, Set<number>>();
  for (const r of weekOffRules) {
    if (everyWeek.has(r.day)) continue; // every-week already covers this day
    const set = ruleWeeks.get(r.day) ?? new Set<number>();
    for (const w of r.weeks) set.add(w);
    ruleWeeks.set(r.day, set);
  }
  return (dateStr: string) => {
    const dow = dowOf(dateStr);
    if (everyWeek.has(dow)) return true;
    const weeks = ruleWeeks.get(dow);
    return weeks ? weeks.has(nthOccurrence(dateStr)) : false;
  };
}

// Convenience single-shot check (prefer buildWeekOffPredicate in loops).
export function isWeekOff(
  dateStr: string,
  weekOffDays: number[] = [],
  weekOffRules: WeekOffRule[] = [],
): boolean {
  return buildWeekOffPredicate(weekOffDays, weekOffRules)(dateStr);
}
