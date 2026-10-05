// Pure leave calculations — no DB, no Prisma. Dates are "YYYY-MM-DD" strings;
// periods are "YYYY-MM". weekOffDays are JS day numbers (0=Sun .. 6=Sat).

export interface LeaveTypePolicy {
  code: string;
  paid: boolean;
  genderGate: string; // "" | M | F
  halfDayAllowed: boolean;
  requiresAttachment: boolean;
  eligibleAfterProbation: boolean;
}

const dayUTC = (d: string) => new Date(d + 'T00:00:00Z');
const dowOf = (d: string) => dayUTC(d).getUTCDay();

function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  let t = dayUTC(start).getTime();
  const e = dayUTC(end).getTime();
  while (t <= e) { out.push(new Date(t).toISOString().slice(0, 10)); t += 86400000; }
  return out;
}

const asSet = (h: Set<string> | string[]) => (h instanceof Set ? h : new Set(h));

// Working days of a leave span bucketed by period: { "YYYY-MM": days }.
// Excludes weekends and holidays; subtracts 0.5 for a half-day on the start
// and/or end date (when that date is itself a working day).
export function splitByPeriod(
  start: string, end: string, weekOffDays: number[], holidays: Set<string> | string[],
  halfDayStart = false, halfDayEnd = false,
): Record<string, number> {
  const off = new Set(weekOffDays);
  const hol = asSet(holidays);
  const isWorking = (d: string) => !off.has(dowOf(d)) && !hol.has(d);
  const out: Record<string, number> = {};
  for (const d of eachDay(start, end)) {
    if (!isWorking(d)) continue;
    const p = d.slice(0, 7);
    out[p] = (out[p] || 0) + 1;
  }
  if (halfDayStart && isWorking(start)) out[start.slice(0, 7)] -= 0.5;
  if (halfDayEnd && end !== start && isWorking(end)) out[end.slice(0, 7)] -= 0.5;
  // Drop any period that netted to zero or less
  for (const p of Object.keys(out)) if (out[p] <= 0) delete out[p];
  return out;
}

// Total working days of a leave span (sum across periods).
export function workingDaysBetween(
  start: string, end: string, weekOffDays: number[], holidays: Set<string> | string[],
  halfDayStart = false, halfDayEnd = false,
): number {
  const by = splitByPeriod(start, end, weekOffDays, holidays, halfDayStart, halfDayEnd);
  return Object.values(by).reduce((s, n) => s + n, 0);
}

// The leave year (integer) a date falls in. startMonth 1 = calendar year.
export function leaveYearOf(dateStr: string, startMonth = 1): number {
  const [y, m] = dateStr.split('-').map(Number);
  return m >= startMonth ? y : y - 1;
}

export function balanceOf(b: {
  opening?: number; granted?: number; taken?: number; lapsed?: number; encashed?: number;
}): number {
  return (b.opening || 0) + (b.granted || 0) - (b.taken || 0) - (b.lapsed || 0) - (b.encashed || 0);
}

export interface ValidateInput {
  type: LeaveTypePolicy;
  gender: string;      // the person's gender ("" | M | F)
  confirmed: boolean;  // past probation / confirmed
  days: number;        // computed working days of the request
  balance: number;     // current balance for this type + year
  hasAttachment: boolean;
  overlaps: boolean;   // overlaps another of this person's live requests
  halfDay: boolean;    // request uses a half-day flag
}

// Returns a human reason the request is not allowed, or null when it is.
export function validateRequest(v: ValidateInput): string | null {
  if (v.days <= 0) return 'Select at least half a day of leave';
  if (v.halfDay && !v.type.halfDayAllowed) return 'This leave type does not allow half-days';
  if (v.overlaps) return 'These dates overlap another leave request';
  if (v.type.genderGate && v.gender && v.type.genderGate !== v.gender) {
    return `This leave type is only for ${v.type.genderGate === 'F' ? 'female' : 'male'} employees`;
  }
  if (v.type.eligibleAfterProbation && !v.confirmed) {
    return 'This leave type is available only after probation is confirmed';
  }
  if (v.type.requiresAttachment && !v.hasAttachment) {
    return 'This leave type needs a supporting document attached';
  }
  // Unpaid (LOP) leave has no balance cap — it simply becomes loss of pay.
  if (v.type.paid && v.days > v.balance + 1e-9) {
    return `Not enough balance: ${v.balance} day(s) available for ${v.type.code}`;
  }
  return null;
}
