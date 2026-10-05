import { prisma } from '../../config/database';
import { settingsFor } from '../leave/leaveService';
import { daySummary, type Punch } from '../attendanceCalc';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const DEFAULT_SHIFTS = [
  { code: 'GEN', name: 'General', startTime: '09:00', endTime: '18:00', workHours: 8, sortOrder: 0 },
];

export async function ensureDefaultShifts(organizationId: string) {
  if (await prisma.shift.count({ where: { organizationId } }) > 0) return;
  await prisma.shift.createMany({ data: DEFAULT_SHIFTS.map(s => ({ organizationId, ...s })), skipDuplicates: true });
}

// The week-off days in force for a person: their profile override, else the org
// default from LeaveSettings.
export async function effectiveWeekOff(organizationId: string, personId: string): Promise<number[]> {
  const p = await prisma.attendanceProfile.findUnique({ where: { personId } });
  if (p && p.weekOffDays.length) return p.weekOffDays;
  return (await settingsFor(organizationId)).weekOffDays;
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let t = Date.parse(start + 'T00:00:00Z');
  const e = Date.parse(end + 'T00:00:00Z');
  while (t <= e && out.length < 400) { out.push(new Date(t).toISOString().slice(0, 10)); t += 86400000; }
  return out;
}

// Roster for a month: every active employee with their default shift, week-offs,
// and any dated shift overrides.
export async function getRoster(organizationId: string, month: string) {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const [employees, assigns, shifts, settings] = await Promise.all([
    prisma.person.findMany({
      where: { organizationId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, employeeNo: true, attendanceProfile: { select: { defaultShiftId: true, weekOffDays: true } } },
    }),
    prisma.shiftAssignment.findMany({ where: { organizationId, date: { gte: first, lte: last } }, include: { shift: { select: { code: true } } } }),
    prisma.shift.findMany({ where: { organizationId, active: true }, orderBy: { sortOrder: 'asc' } }),
    settingsFor(organizationId),
  ]);
  const codeById = new Map(shifts.map(s => [s.id, s.code]));
  const byPerson: Record<string, Record<string, string>> = {};
  for (const a of assigns) (byPerson[a.personId] = byPerson[a.personId] || {})[a.date] = a.shift.code;

  return {
    month, shifts,
    rows: employees.map(e => ({
      personId: e.id, name: e.name, employeeNo: e.employeeNo,
      defaultShiftId: e.attendanceProfile?.defaultShiftId || null,
      defaultShiftCode: e.attendanceProfile?.defaultShiftId ? (codeById.get(e.attendanceProfile.defaultShiftId) || null) : null,
      weekOffDays: e.attendanceProfile?.weekOffDays?.length ? e.attendanceProfile.weekOffDays : settings.weekOffDays,
      overrides: byPerson[e.id] || {},
    })),
  };
}

// Bulk-assign a shift to people across a date range (the roster). Upserts, so
// re-assigning overwrites.
export async function assignShifts(organizationId: string, personIds: string[], startDate: string, endDate: string, shiftId: string) {
  const dates = datesBetween(startDate, endDate);
  let n = 0;
  for (const personId of personIds) {
    for (const date of dates) {
      await prisma.shiftAssignment.upsert({
        where: { organizationId_personId_date: { organizationId, personId, date } },
        create: { organizationId, personId, date, shiftId },
        update: { shiftId },
      });
      n++;
    }
  }
  return n;
}

export async function clearAssignment(organizationId: string, personId: string, date: string) {
  await prisma.shiftAssignment.deleteMany({ where: { organizationId, personId, date } });
}

// --- Swipes (phase 6) -----------------------------------------------------

// One person's swipes for a month, grouped by date with a worked-time summary.
export async function getSwipeDays(organizationId: string, personId: string, month: string) {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const swipes = await prisma.swipe.findMany({
    where: { organizationId, personId, date: { gte: first, lte: last } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });
  const byDate: Record<string, any[]> = {};
  for (const s of swipes) (byDate[s.date] = byDate[s.date] || []).push(s);
  const days = Object.entries(byDate).map(([date, list]) => ({
    date,
    swipes: list.map(s => ({ id: s.id, time: s.time, direction: s.direction, source: s.source })),
    summary: daySummary(list.map(s => ({ time: s.time, direction: s.direction } as Punch))),
  }));
  return { month, days };
}

export async function addSwipe(organizationId: string, personId: string, date: string, time: string, direction: string, source = 'MANUAL', note = '') {
  return prisma.swipe.create({ data: { organizationId, personId, date, time, direction, source, note } });
}

export async function deleteSwipe(organizationId: string, swipeId: string) {
  const s = await prisma.swipe.findFirst({ where: { id: swipeId, organizationId } });
  if (!s) return false;
  await prisma.swipe.delete({ where: { id: s.id } });
  return true;
}

// Import swipes from CSV text: "empNo, date (YYYY-MM-DD), time (HH:MM), direction (IN/OUT)".
// A header line and blank lines are skipped; direction accepts IN/OUT/I/O.
export async function importSwipes(organizationId: string, text: string) {
  const people = await prisma.person.findMany({
    where: { organizationId, kind: 'CANDIDATE', isEmployee: true }, select: { id: true, employeeNo: true },
  });
  const byCode = new Map(people.filter(p => p.employeeNo).map(p => [p.employeeNo.trim().toLowerCase(), p.id]));
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const rows: any[] = [];
  const skipped: { line: number; reason: string }[] = [];
  lines.forEach((line, i) => {
    const c = line.split(/[,\t;]/).map(x => x.trim());
    if (i === 0 && /emp|code|date|time|direction|punch/i.test(line) && !DATE.test(c[1] || '')) return; // header
    const [code, date, time, dirRaw] = c;
    const personId = byCode.get((code || '').toLowerCase());
    if (!personId) { skipped.push({ line: i + 1, reason: `unknown employee "${code}"` }); return; }
    if (!DATE.test(date)) { skipped.push({ line: i + 1, reason: 'bad date (need YYYY-MM-DD)' }); return; }
    if (!TIME.test(time)) { skipped.push({ line: i + 1, reason: 'bad time (need HH:MM)' }); return; }
    const d = (dirRaw || '').toUpperCase();
    const direction = d === 'IN' || d === 'I' ? 'IN' : d === 'OUT' || d === 'O' ? 'OUT' : '';
    if (!direction) { skipped.push({ line: i + 1, reason: 'direction must be IN or OUT' }); return; }
    rows.push({ organizationId, personId, date, time, direction, source: 'IMPORT' });
  });
  if (rows.length) await prisma.swipe.createMany({ data: rows });
  return { created: rows.length, skipped };
}

// Days this month with punches that don't pair up cleanly (attendance exceptions).
export async function swipeExceptions(organizationId: string, month: string) {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const last = `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  const swipes = await prisma.swipe.findMany({
    where: { organizationId, date: { gte: first, lte: last } },
    include: { person: { select: { name: true, employeeNo: true } } },
    orderBy: [{ date: 'asc' }, { time: 'asc' }],
  });
  const byKey: Record<string, { personId: string; name: string; date: string; list: Punch[] }> = {};
  for (const s of swipes) {
    const key = `${s.personId}|${s.date}`;
    if (!byKey[key]) byKey[key] = { personId: s.personId, name: s.person.name, date: s.date, list: [] };
    byKey[key].list.push({ time: s.time, direction: s.direction });
  }
  const exceptions = Object.values(byKey)
    .map(e => ({ ...e, summary: daySummary(e.list) }))
    .filter(e => !e.summary.complete)
    .map(e => ({ personId: e.personId, name: e.name, date: e.date, punches: e.list.length, firstIn: e.summary.firstIn, lastOut: e.summary.lastOut }));
  return { month, exceptions };
}

export async function setProfile(organizationId: string, personId: string, defaultShiftId: string | null, weekOffDays: number[] | undefined) {
  const data: any = {};
  if (defaultShiftId !== undefined) data.defaultShiftId = defaultShiftId || null;
  if (weekOffDays !== undefined) data.weekOffDays = weekOffDays;
  return prisma.attendanceProfile.upsert({
    where: { personId },
    create: { organizationId, personId, defaultShiftId: data.defaultShiftId ?? null, weekOffDays: data.weekOffDays ?? [] },
    update: data,
  });
}
