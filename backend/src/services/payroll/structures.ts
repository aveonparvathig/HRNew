// Structure templates and recurring components in the database: which
// split applies to whom, and the recurring lines of a run's payslips.
import { prisma } from '../../config/database';
import { Split, splitOf, templateFor, withSplit } from './structureCalc';
import { RecurringLike, RecurringLine, coversPeriod } from './recurringCalc';
import { currentPeriodIST } from './salaryStructure';

export interface PersonStructure {
  templateId: string;
  name: string;
  scope: string; // EMPLOYEE | DESIGNATION | DEPARTMENT: where the template came from
  split: Split;
}

type PersonKey = { id: string; designation?: string | null; department?: string | null };

// Templates and who they are assigned to, with a resolver for one
// employee. With no assignment at all, everyone gets the company's split.
export async function loadStructures(organizationId: string) {
  const [templates, assignments] = await Promise.all([
    prisma.structureTemplate.findMany({ where: { organizationId }, orderBy: { name: 'asc' } }),
    prisma.structureAssignment.findMany({ where: { organizationId } }),
  ]);
  const forPerson = (person: PersonKey): PersonStructure | null => {
    const found = assignments.length ? templateFor(person, assignments, templates) : null;
    return found ? { templateId: found.template.id, name: found.template.name, scope: found.scope, split: splitOf(found.template) } : null;
  };
  return { templates, assignments, forPerson };
}

// The structure of every employee who has one, by person id.
export async function structuresByPerson(organizationId: string): Promise<Map<string, PersonStructure>> {
  const map = new Map<string, PersonStructure>();
  const structures = await loadStructures(organizationId);
  if (structures.assignments.length === 0) return map;
  const people = await prisma.person.findMany({
    where: { organizationId, isEmployee: true }, select: { id: true, designation: true, department: true },
  });
  for (const person of people) {
    const structure = structures.forPerson(person);
    if (structure) map.set(person.id, structure);
  }
  return map;
}

// Payroll settings as they apply to one employee today.
export async function settingsForPerson(organizationId: string, settings: any, person: PersonKey) {
  const structure = (await loadStructures(organizationId)).forPerson(person);
  return { settings: withSplit(settings, structure?.split), structure };
}

const recurringLike = (r: any): RecurringLike => ({
  id: r.id, componentId: r.componentId, name: r.component.name, type: r.component.type,
  amount: r.amount, fromPeriod: r.fromPeriod, toPeriod: r.toPeriod, prorate: r.prorate,
});

// Recurring components still running in a month or after it, by person.
export async function recurringByPerson(organizationId: string, period: string, personId?: string) {
  const rows = await prisma.recurringComponent.findMany({
    where: { organizationId, ...(personId ? { personId } : {}), OR: [{ toPeriod: '' }, { toPeriod: { gte: period } }] },
    include: { component: { select: { name: true, type: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const map = new Map<string, RecurringLike[]>();
  for (const row of rows) map.set(row.personId, [...(map.get(row.personId) || []), recurringLike(row)]);
  return map;
}

// Recurring components running in the current month, for the structure reports.
export async function recurringNow(organizationId: string, personId?: string) {
  const period = currentPeriodIST();
  const rows = await prisma.recurringComponent.findMany({
    where: { organizationId, ...(personId ? { personId } : {}) },
    include: { component: { select: { name: true, type: true } } },
  });
  return rows.filter(r => coversPeriod(r, period));
}

// Write the recurring lines worked out while a run's entries were
// computed. An entry's recurring lines that are no longer due are removed.
export async function saveRecurringLines(
  ctx: { recurringLines?: Map<string, RecurringLine[]> }, organizationId: string, runId: string,
) {
  const computed = ctx.recurringLines;
  if (!computed || computed.size === 0) return;
  const entries = await prisma.payslipEntry.findMany({
    where: { organizationId, runId, personId: { in: [...computed.keys()] } },
    select: { id: true, personId: true, lines: { where: { source: 'RECURRING' }, select: { id: true, componentId: true } } },
  });
  for (const entry of entries) {
    const lines = computed.get(entry.personId) || [];
    const keep = new Set(lines.map(l => l.componentId));
    const gone = entry.lines.filter(l => !keep.has(l.componentId)).map(l => l.id);
    if (gone.length) await prisma.payslipLine.deleteMany({ where: { id: { in: gone } } });
    for (const l of lines) {
      await prisma.payslipLine.upsert({
        where: { entryId_componentId: { entryId: entry.id, componentId: l.componentId } },
        create: { organizationId, entryId: entry.id, componentId: l.componentId, name: l.name, type: l.type, amount: l.amount, source: 'RECURRING' },
        update: { amount: l.amount, name: l.name, type: l.type, source: 'RECURRING' },
      });
    }
  }
  computed.clear();
}
