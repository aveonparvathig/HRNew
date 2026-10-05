import { prisma } from '../../config/database';
import { settingsFor } from '../leave/leaveService';

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
