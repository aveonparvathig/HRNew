import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { settingsFor } from '../leave/leaveService';
import { daySummary, dayStatus, monthTotals, type Punch } from '../attendanceCalc';
import { recomputeEntry } from '../payroll/arrears';
import { buildWeekOffPredicate, sanitizeWeekOffRules, type WeekOffRule } from '../weekOff';

// A person's effective week-offs: their profile override (days and/or
// occurrence rules) if it sets anything, else the org's LeaveSettings default.
function effectiveOff(
  profile: { weekOffDays?: number[]; weekOffRules?: unknown } | null | undefined,
  settings: { weekOffDays: number[]; weekOffRules?: unknown },
): { weekOffDays: number[]; weekOffRules: WeekOffRule[] } {
  const pDays = profile?.weekOffDays ?? [];
  const pRules = sanitizeWeekOffRules(profile?.weekOffRules);
  if (pDays.length || pRules.length) return { weekOffDays: pDays, weekOffRules: pRules };
  return { weekOffDays: settings.weekOffDays, weekOffRules: sanitizeWeekOffRules(settings.weekOffRules) };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const r2 = (n: number) => Math.round(n * 100) / 100;

function monthRange(month: string) {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = `${month}-${String(dim).padStart(2, '0')}`;
  const dates: string[] = [];
  for (let d = 1; d <= dim; d++) dates.push(`${month}-${String(d).padStart(2, '0')}`);
  return { first, last, dates };
}
const DEFAULT_SHIFTS = [
  { code: 'GEN', name: 'General', startTime: '09:00', endTime: '18:00', workHours: 8, sortOrder: 0 },
];

export async function ensureDefaultShifts(organizationId: string) {
  if (await prisma.shift.count({ where: { organizationId } }) > 0) return;
  await prisma.shift.createMany({ data: DEFAULT_SHIFTS.map(s => ({ organizationId, ...s })), skipDuplicates: true });
}

// The week-off days in force for a person: their profile override, else the org
// default from LeaveSettings.
export async function effectiveWeekOff(organizationId: string, personId: string): Promise<{ weekOffDays: number[]; weekOffRules: WeekOffRule[] }> {
  const p = await prisma.attendanceProfile.findUnique({ where: { personId } });
  return effectiveOff(p, await settingsFor(organizationId));
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
      select: { id: true, name: true, employeeNo: true, attendanceProfile: { select: { defaultShiftId: true, weekOffDays: true, weekOffRules: true } } },
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
    rows: employees.map(e => {
      const off = effectiveOff(e.attendanceProfile, settings);
      return {
        personId: e.id, name: e.name, employeeNo: e.employeeNo,
        defaultShiftId: e.attendanceProfile?.defaultShiftId || null,
        defaultShiftCode: e.attendanceProfile?.defaultShiftId ? (codeById.get(e.attendanceProfile.defaultShiftId) || null) : null,
        weekOffDays: off.weekOffDays,
        weekOffRules: off.weekOffRules,
        overrides: byPerson[e.id] || {},
      };
    }),
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

// --- Processing, muster & finalisation (phase 7) --------------------------

export async function periodStatus(organizationId: string, month: string): Promise<string> {
  const p = await prisma.attendancePeriod.findUnique({ where: { organizationId_month: { organizationId, month } } });
  return p?.status || 'OPEN';
}

// Compute each employee's status for every day of the month and store it,
// preserving manual overrides. Idempotent.
export async function processMonth(organizationId: string, month: string) {
  const { first, last, dates } = monthRange(month);
  const [employees, shifts, settings, holidays, assigns, swipes, leaves, overrides] = await Promise.all([
    prisma.person.findMany({
      where: { organizationId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } },
      select: { id: true, workLocationId: true, attendanceProfile: { select: { defaultShiftId: true, weekOffDays: true, weekOffRules: true } } },
    }),
    prisma.shift.findMany({ where: { organizationId } }),
    settingsFor(organizationId),
    prisma.holiday.findMany({ where: { organizationId, date: { gte: first, lte: last } }, select: { date: true, workLocationId: true } }),
    prisma.shiftAssignment.findMany({ where: { organizationId, date: { gte: first, lte: last } }, select: { personId: true, date: true, shiftId: true } }),
    prisma.swipe.findMany({ where: { organizationId, date: { gte: first, lte: last } }, orderBy: [{ date: 'asc' }, { time: 'asc' }], select: { personId: true, date: true, time: true, direction: true } }),
    prisma.leaveRequest.findMany({ where: { organizationId, status: 'APPROVED', startDate: { lte: last }, endDate: { gte: first }, leaveType: { is: {} } }, select: { personId: true, startDate: true, endDate: true, leaveType: { select: { paid: true } } } }),
    prisma.attendanceDay.findMany({ where: { organizationId, date: { gte: first, lte: last }, source: 'OVERRIDE' }, select: { personId: true, date: true } }),
  ]);

  const shiftById = new Map(shifts.map(s => [s.id, s]));
  const allHol = new Set(holidays.filter(h => !h.workLocationId).map(h => h.date));
  const locHol = new Map<string, Set<string>>();
  for (const h of holidays) if (h.workLocationId) (locHol.get(h.workLocationId) || locHol.set(h.workLocationId, new Set()).get(h.workLocationId)!).add(h.date);
  const assignBy = new Map(assigns.map(a => [`${a.personId}|${a.date}`, a.shiftId]));
  const punchesBy: Record<string, Punch[]> = {};
  for (const s of swipes) (punchesBy[`${s.personId}|${s.date}`] = punchesBy[`${s.personId}|${s.date}`] || []).push({ time: s.time, direction: s.direction });
  const leaveBy: Record<string, 'PAID' | 'UNPAID'> = {};
  for (const lv of leaves) for (const d of dates) if (d >= lv.startDate && d <= lv.endDate) {
    const kind = lv.leaveType?.paid ? 'PAID' : 'UNPAID';
    if (kind === 'UNPAID' || !leaveBy[`${lv.personId}|${d}`]) leaveBy[`${lv.personId}|${d}`] = kind;
  }
  const overridden = new Set(overrides.map(o => `${o.personId}|${o.date}`));

  const rows: any[] = [];
  for (const e of employees) {
    const off = effectiveOff(e.attendanceProfile, settings);
    const isWeekOff = buildWeekOffPredicate(off.weekOffDays, off.weekOffRules);
    for (const date of dates) {
      if (overridden.has(`${e.id}|${date}`)) continue;
      const shiftId = assignBy.get(`${e.id}|${date}`) || e.attendanceProfile?.defaultShiftId || null;
      const shift = shiftId ? shiftById.get(shiftId) : null;
      const punches = punchesBy[`${e.id}|${date}`] || [];
      const worked = daySummary(punches).workedMinutes;
      const status = dayStatus({
        isWeekOff: isWeekOff(date),
        isHoliday: allHol.has(date) || (e.workLocationId ? locHol.get(e.workLocationId)?.has(date) ?? false : false),
        onLeave: leaveBy[`${e.id}|${date}`] || null,
        workedMinutes: worked,
        shiftMinutes: shift ? shift.workHours * 60 : 0,
      });
      rows.push({ organizationId, personId: e.id, date, status, workedMinutes: worked, shiftCode: shift?.code || '', source: 'COMPUTED' });
    }
  }
  await prisma.attendanceDay.deleteMany({ where: { organizationId, date: { gte: first, lte: last }, source: 'COMPUTED' } });
  if (rows.length) await prisma.attendanceDay.createMany({ data: rows });
  return { month, days: rows.length, employees: employees.length };
}

// The muster grid: each employee's daily status + monthly totals.
export async function getMuster(organizationId: string, month: string) {
  const { first, last } = monthRange(month);
  const [employees, days, status] = await Promise.all([
    prisma.person.findMany({
      where: { organizationId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } },
      orderBy: { name: 'asc' }, select: { id: true, name: true, employeeNo: true },
    }),
    prisma.attendanceDay.findMany({ where: { organizationId, date: { gte: first, lte: last } }, select: { personId: true, date: true, status: true, source: true } }),
    periodStatus(organizationId, month),
  ]);
  const byPerson: Record<string, Record<string, { status: string; source: string }>> = {};
  for (const d of days) (byPerson[d.personId] = byPerson[d.personId] || {})[d.date] = { status: d.status, source: d.source };
  return {
    month, status, processed: days.length > 0,
    rows: employees.map(e => {
      const cells = byPerson[e.id] || {};
      const totals = monthTotals(Object.values(cells).map(c => c.status));
      return { personId: e.id, name: e.name, employeeNo: e.employeeNo, cells, totals };
    }),
  };
}

export async function overrideDay(organizationId: string, personId: string, date: string, status: string, note: string) {
  if (await periodStatus(organizationId, date.slice(0, 7)) === 'FINALISED') {
    throw new AppError(400, 'This month is finalised. Reopen it to make changes.');
  }
  return prisma.attendanceDay.upsert({
    where: { organizationId_personId_date: { organizationId, personId, date } },
    create: { organizationId, personId, date, status, source: 'OVERRIDE', note },
    update: { status, source: 'OVERRIDE', note },
  });
}

// Finalise the month: lock it and push present/LOP days into its DRAFT payroll
// run. attendanceLopDays stays apart from leaveLopDays so neither double-counts.
export async function finalisePeriod(organizationId: string, month: string) {
  await processMonth(organizationId, month);
  await prisma.attendancePeriod.upsert({
    where: { organizationId_month: { organizationId, month } },
    create: { organizationId, month, status: 'FINALISED', finalisedAt: new Date() },
    update: { status: 'FINALISED', finalisedAt: new Date() },
  });

  const run = await prisma.payrollRun.findFirst({ where: { organizationId, period: month, status: 'DRAFT' } });
  let pushed = 0;
  if (run) {
    const { first, last } = monthRange(month);
    const days = await prisma.attendanceDay.findMany({ where: { organizationId, date: { gte: first, lte: last } }, select: { personId: true, status: true } });
    const byPerson: Record<string, string[]> = {};
    for (const d of days) (byPerson[d.personId] = byPerson[d.personId] || []).push(d.status);
    const entries = await prisma.payslipEntry.findMany({ where: { organizationId, runId: run.id }, select: { id: true, personId: true, lopDays: true, attendanceLopDays: true } });
    for (const e of entries) {
      const t = monthTotals(byPerson[e.personId] || []);
      const newLop = r2(Math.max(0, e.lopDays - e.attendanceLopDays + t.attendanceLop));
      await recomputeEntry(organizationId, e.id, {
        lopDays: newLop, attendanceLopDays: r2(t.attendanceLop), attendancePresentDays: r2(t.presentDays),
        presentDays: r2(t.presentDays), empLeaveDays: r2(t.leave),
      });
      pushed++;
    }
  }
  return { month, finalised: true, payrollEntriesUpdated: pushed, hasDraftRun: !!run };
}

export async function reopenPeriod(organizationId: string, month: string) {
  await prisma.attendancePeriod.upsert({
    where: { organizationId_month: { organizationId, month } },
    create: { organizationId, month, status: 'OPEN' },
    update: { status: 'OPEN', finalisedAt: null },
  });
  return { month, status: 'OPEN' };
}

export async function setProfile(organizationId: string, personId: string, defaultShiftId: string | null, weekOffDays: number[] | undefined, weekOffRules?: WeekOffRule[]) {
  const data: any = {};
  if (defaultShiftId !== undefined) data.defaultShiftId = defaultShiftId || null;
  if (weekOffDays !== undefined) data.weekOffDays = weekOffDays;
  if (weekOffRules !== undefined) {
    const everyWeek = new Set<number>(weekOffDays ?? []);
    data.weekOffRules = weekOffRules.filter(r => !everyWeek.has(r.day));
  }
  return prisma.attendanceProfile.upsert({
    where: { personId },
    create: { organizationId, personId, defaultShiftId: data.defaultShiftId ?? null, weekOffDays: data.weekOffDays ?? [], weekOffRules: data.weekOffRules ?? [] },
    update: data,
  });
}
