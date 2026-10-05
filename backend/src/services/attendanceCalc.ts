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
