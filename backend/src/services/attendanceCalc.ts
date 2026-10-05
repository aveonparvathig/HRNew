// Pure attendance calculations — no DB. Times are "HH:MM" (24h).

export interface Punch { time: string; direction: string } // IN | OUT

const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const minToHHMM = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(Math.round(mins % 60)).padStart(2, '0')}`;

export interface DaySummary {
  firstIn: string | null;
  lastOut: string | null;
  workedMinutes: number;
  punches: number;
  complete: boolean; // all IN/OUT paired
}

// Summarise one day's punches: first in, last out, total worked minutes (sum of
// IN→OUT spans), and whether every punch is paired.
export function daySummary(punches: Punch[]): DaySummary {
  const sorted = [...punches].sort((a, b) => toMin(a.time) - toMin(b.time));
  const ins = sorted.filter(p => p.direction === 'IN');
  const outs = sorted.filter(p => p.direction === 'OUT');
  let worked = 0;
  let open: number | null = null;
  let unpaired = false;
  for (const p of sorted) {
    if (p.direction === 'IN') {
      if (open !== null) unpaired = true; // two INs without an OUT between
      open = toMin(p.time);
    } else if (p.direction === 'OUT') {
      if (open === null) { unpaired = true; continue; } // OUT with no open IN
      worked += Math.max(0, toMin(p.time) - open);
      open = null;
    }
  }
  const complete = punches.length > 0 && !unpaired && open === null && ins.length === outs.length;
  return {
    firstIn: ins[0]?.time ?? null,
    lastOut: outs.length ? outs[outs.length - 1].time : null,
    workedMinutes: worked,
    punches: punches.length,
    complete,
  };
}

// An exception is a day that has punches but they don't pair up cleanly.
export function isException(punches: Punch[]): boolean {
  return punches.length > 0 && !daySummary(punches).complete;
}

export const ATTENDANCE_STATUSES = ['PRESENT', 'HALF_DAY', 'ABSENT', 'WEEKOFF', 'HOLIDAY', 'LEAVE', 'LOP'] as const;
export type AttendanceStatus = typeof ATTENDANCE_STATUSES[number];

export interface DayStatusInput {
  isWeekOff: boolean;
  isHoliday: boolean;
  onLeave: 'PAID' | 'UNPAID' | null; // approved leave on the day
  workedMinutes: number;
  shiftMinutes: number; // expected work minutes (0 → treated as 8h)
}

// Derive a day's attendance status. Holiday/week-off/leave take precedence over
// swipes; otherwise worked time against the shift decides present/half/absent.
export function dayStatus(i: DayStatusInput): AttendanceStatus {
  if (i.isHoliday) return 'HOLIDAY';
  if (i.isWeekOff) return 'WEEKOFF';
  if (i.onLeave === 'PAID') return 'LEAVE';
  if (i.onLeave === 'UNPAID') return 'LOP';
  const need = i.shiftMinutes > 0 ? i.shiftMinutes : 480;
  if (i.workedMinutes >= need * 0.75) return 'PRESENT';
  if (i.workedMinutes >= need * 0.25) return 'HALF_DAY';
  return 'ABSENT';
}

// Roll month statuses into totals. attendanceLop counts unauthorised absence
// only (unpaid-leave LOP is owned by the Leave module, so it is NOT added here —
// leave and attendance never cover the same day).
export function monthTotals(statuses: string[]) {
  const c = (s: string) => statuses.filter(x => x === s).length;
  const present = c('PRESENT'), half = c('HALF_DAY'), absent = c('ABSENT');
  const weekoff = c('WEEKOFF'), holiday = c('HOLIDAY'), leave = c('LEAVE'), lop = c('LOP');
  return {
    present, half, absent, weekoff, holiday, leave, lop,
    attendanceLop: absent + half * 0.5,
    presentDays: present + half * 0.5 + leave + weekoff + holiday,
    workingDays: present + half + absent + leave + lop,
  };
}
