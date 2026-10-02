// Position history in the database: the starting record, keeping the
// employee's own record in step with the history, and reading people as
// they stood in a given month for payslips and reports.
import { prisma } from '../config/database';
import { todayIST } from './payroll/loanLedger';
import {
  STARTING, carryForward, historyOf, isDate, periodEndDate, positionOf, positionOn, reasonLabel, samePosition, startingDate,
} from './positionCalc';

const today = () => todayIST();
const withDate = (record: any) => ({ effectiveFrom: '', ...positionOf(record) });

// ---- Reading people as of a date -------------------------------------------------
export interface PositionTarget {
  personId: string;
  person: any; // as loaded; only the fields it carries are replaced
  on: string; // "YYYY-MM-DD"
}

const LOCATION_FIELDS = ['name', 'city', 'state', 'excludeFromPt'];
// A work location with the same fields the person was loaded with
const locationLike = (row: any, like: any) =>
  (row ? Object.fromEntries((like ? Object.keys(like) : LOCATION_FIELDS).map(k => [k, row[k]])) : null);

// Give each person the designation, department and grade they held on a
// date — and, when asked, the work location. People without history are
// left as loaded. Changes the objects given.
export async function stampPositions(organizationId: string, targets: PositionTarget[], opts: { location?: boolean } = {}) {
  const list = targets.filter(t => t.person);
  const ids = [...new Set(list.map(t => t.personId))];
  if (ids.length === 0) return;
  const rows = await prisma.positionChange.findMany({
    where: { organizationId, personId: { in: ids } }, orderBy: { effectiveFrom: 'asc' },
  });
  if (rows.length === 0) return;
  const byPerson = new Map<string, typeof rows>();
  for (const r of rows) byPerson.set(r.personId, [...(byPerson.get(r.personId) || []), r]);
  const locations = opts.location && list.some(t => 'workLocation' in t.person)
    ? new Map((await prisma.workLocation.findMany({ where: { organizationId } })).map(l => [l.id, l]))
    : null;
  for (const t of list) {
    const position = positionOn(byPerson.get(t.personId) || [], t.on);
    if (!position) continue;
    for (const f of ['designation', 'department', 'grade'] as const) {
      if (f in t.person) t.person[f] = position[f];
    }
    if (opts.location) {
      if ('workLocationId' in t.person) t.person.workLocationId = position.workLocationId;
      if (locations && 'workLocation' in t.person) {
        t.person.workLocation = locationLike(position.workLocationId ? locations.get(position.workLocationId) : null, t.person.workLocation);
      }
    }
  }
}

// A run's employees as they stood at the end of its month
export async function stampRun(organizationId: string, run: any, opts: { location?: boolean } = {}) {
  if (!run?.entries?.length) return;
  const on = periodEndDate(run.period);
  await stampPositions(organizationId, run.entries.map((e: any) => ({ personId: e.personId, person: e.person, on })), opts);
}

// One payslip entry (carrying its run and person) the same way
export const stampEntry = (organizationId: string, entry: any, opts: { location?: boolean } = {}) =>
  stampPositions(organizationId, [{ personId: entry.personId, person: entry.person, on: periodEndDate(entry.run.period) }], opts);

// ---- Keeping the history and the employee's record in step -----------------------
// An employee with no history gets one record: the position on their
// record now, from their joining date.
export async function ensureStartingPosition(person: any) {
  if (!person?.isEmployee) return;
  if (await prisma.positionChange.count({ where: { personId: person.id } }) > 0) return;
  await prisma.positionChange.create({
    data: {
      organizationId: person.organizationId, personId: person.id, effectiveFrom: startingDate(person),
      ...positionOf(person), reason: STARTING, enteredByName: 'Starting record', appliedAt: new Date(),
    },
  });
}

// A value changed on a date carries into the records after it that still
// held the old value. Returns how many later records took it.
export async function carryIntoLater(personId: string, after: string, from: any, to: any): Promise<number> {
  const later = await prisma.positionChange.findMany({
    where: { personId, effectiveFrom: { gt: after } }, orderBy: { effectiveFrom: 'asc' },
  });
  const carried = carryForward(later, positionOf(from), positionOf(to));
  for (const { change, data } of carried) await prisma.positionChange.update({ where: { id: change.id }, data });
  return carried.length;
}

// The employee's record takes the position in force today.
export async function syncCurrentPosition(personId: string, on = today()) {
  const rows = await prisma.positionChange.findMany({ where: { personId }, orderBy: { effectiveFrom: 'asc' } });
  const current = positionOn(rows, on);
  if (!current) return;
  const person = await prisma.person.findUnique({
    where: { id: personId }, select: { designation: true, department: true, workLocationId: true, grade: true },
  });
  if (person && !samePosition(withDate(person), current)) {
    await prisma.person.update({ where: { id: personId }, data: positionOf(current) });
  }
  await prisma.positionChange.updateMany({
    where: { personId, appliedAt: null, effectiveFrom: { lte: on } }, data: { appliedAt: new Date() },
  });
}

// Changes dated ahead whose day has come. There is no background job:
// requests to the people and payroll pages apply them first, which comes
// to the same thing.
export async function applyDuePositions(organizationId: string) {
  if (!organizationId) return;
  const on = today();
  const due = await prisma.positionChange.findMany({
    where: { organizationId, appliedAt: null, effectiveFrom: { lte: on } }, select: { personId: true }, distinct: ['personId'],
  });
  for (const d of due) await syncCurrentPosition(d.personId, on);
}

// Designation, department, work location or grade edited on the profile
// form is a correction of the record in force — it adds no history. A
// corrected joining date moves the starting record with it.
export async function followProfileEdit(before: any, updated: any) {
  if (!updated.isEmployee) return;
  const rows = await prisma.positionChange.findMany({ where: { personId: updated.id }, orderBy: { effectiveFrom: 'asc' } });
  if (rows.length === 0) {
    await ensureStartingPosition(updated);
    return;
  }
  if (!samePosition(withDate(before), withDate(updated))) {
    const current = positionOn(rows, today())!;
    await prisma.positionChange.update({ where: { id: current.id }, data: { ...positionOf(updated), appliedAt: current.appliedAt ?? new Date() } });
    await carryIntoLater(updated.id, current.effectiveFrom, current, updated);
  }
  const first = rows[0];
  if (first.reason === STARTING && isDate(updated.joinDate) && updated.joinDate !== before.joinDate
    && updated.joinDate !== first.effectiveFrom && (!rows[1] || updated.joinDate < rows[1].effectiveFrom)) {
    await prisma.positionChange.update({ where: { id: first.id }, data: { effectiveFrom: updated.joinDate } });
  }
}

// ---- History as shown --------------------------------------------------------------
export async function positionHistory(person: any, staff: boolean) {
  const [rows, locations] = await Promise.all([
    prisma.positionChange.findMany({ where: { personId: person.id }, orderBy: { effectiveFrom: 'asc' } }),
    prisma.workLocation.findMany({ where: { organizationId: person.organizationId }, select: { id: true, name: true } }),
  ]);
  const names = new Map(locations.map(l => [l.id, l.name]));
  const locationName = (id: string | null) => (id ? names.get(id) || '' : '');
  return {
    personId: person.id,
    history: historyOf(rows, today(), locationName).map(({ change, until, state, changes, first }) => ({
      id: change.id, effectiveFrom: change.effectiveFrom, until, state,
      designation: change.designation, department: change.department,
      workLocationId: change.workLocationId, locationName: locationName(change.workLocationId), grade: change.grade,
      reason: change.reason, reasonLabel: reasonLabel(change.reason), changes, first,
      // Who entered it and why, in their words, is for HR
      ...(staff ? { remarks: change.remarks, enteredByName: change.enteredByName, createdAt: change.createdAt } : {}),
    })),
  };
}
