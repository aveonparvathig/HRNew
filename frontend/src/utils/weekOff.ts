// Week-off helpers shared by Leave Settings and the Roster. Mirrors the
// backend's weekOff.ts: a day is off either every week (weekOffDays) or on
// specific nth-occurrences of that weekday in the month (weekOffRules).

export interface WeekOffRule {
  day: number;     // 0=Sun .. 6=Sat
  weeks: number[]; // subset of [1,2,3,4,5]
}

const dowOf = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();

// The nth occurrence (1..5) of this date's weekday within its month.
export const nthOccurrence = (date: string) =>
  Math.floor((new Date(date + 'T00:00:00Z').getUTCDate() - 1) / 7) + 1;

export function isWeekOff(date: string, weekOffDays: number[] = [], weekOffRules: WeekOffRule[] = []): boolean {
  const dow = dowOf(date);
  if (weekOffDays.includes(dow)) return true;
  const rule = weekOffRules.find(r => r.day === dow);
  return rule ? rule.weeks.includes(nthOccurrence(date)) : false;
}

export const ORDINAL = ['1st', '2nd', '3rd', '4th', '5th'];
export const WEEK_NUMBERS = [1, 2, 3, 4, 5];

// One-click presets for the common "alternate Saturday" patterns.
export const WEEK_PRESETS: { label: string; weeks: number[] }[] = [
  { label: '2nd & 4th', weeks: [2, 4] },
  { label: '1st & 3rd', weeks: [1, 3] },
  { label: '1st, 3rd & 5th', weeks: [1, 3, 5] },
];

// Compact label like "Sun, Sat(2nd,4th)" for a given config.
export function offSummary(weekOffDays: number[] = [], weekOffRules: WeekOffRule[] = [], dayLabels: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < 7; i++) {
    if (weekOffDays.includes(i)) parts.push(dayLabels[i]);
    else {
      const rule = weekOffRules.find(r => r.day === i);
      if (rule?.weeks.length) parts.push(`${dayLabels[i]}(${rule.weeks.map(w => ORDINAL[w - 1]).join(',')})`);
    }
  }
  return parts.join(', ') || '—';
}
