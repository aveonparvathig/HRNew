// The editable value lists in the database: reading them (filled on first
// use from what is already typed on records), keeping them in step with
// records, and renaming or merging a value.
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { LIST_TYPES, cleanLabel, initialListValues, labelKey, listType, sameLabel } from './masters';

// The person column a list feeds. Records hold the label itself.
const PERSON_FIELD: Record<string, string> = {
  DEPARTMENT: 'department', DESIGNATION: 'designation', GRADE: 'grade', BANK: 'bankName', EMPLOYMENT_TYPE: 'employmentType',
  BLOOD_GROUP: 'bloodGroup', MARITAL_STATUS: 'maritalStatus',
  LEAVING_REASON: 'reasonForLeaving', STOP_REASON: 'salaryStopReason',
};

// The lists a position record holds a value of, by its column
const POSITION_FIELD: Record<string, 'department' | 'designation' | 'grade'> = {
  DEPARTMENT: 'department', DESIGNATION: 'designation', GRADE: 'grade',
};

const distinct = (rows: any[], field: string) =>
  [...new Set(rows.map(r => cleanLabel(r[field])).filter(Boolean))];

// Every value of a list already typed on records.
async function usedValues(organizationId: string, type: string): Promise<string[]> {
  const out: string[] = [];
  const field = PERSON_FIELD[type];
  if (field) {
    out.push(...distinct(await prisma.person.findMany({
      where: { organizationId, NOT: { [field]: '' } }, select: { [field]: true } as any, distinct: [field as any],
    }), field));
  }
  const held = POSITION_FIELD[type];
  if (held) {
    // Values an employee held earlier and no longer does
    out.push(...distinct(await prisma.positionChange.findMany({
      where: { organizationId, NOT: { [held]: '' } }, select: { [held]: true } as any, distinct: [held],
    }), held));
  }
  if (type === 'DEPARTMENT') {
    out.push(...distinct(await prisma.jobOpening.findMany({
      where: { organizationId, NOT: { department: '' } }, select: { department: true }, distinct: ['department'],
    }), 'department'));
  }
  if (type === 'BANK') {
    out.push(...distinct(await prisma.companyBankAccount.findMany({
      where: { organizationId }, select: { bankName: true }, distinct: ['bankName'],
    }), 'bankName'));
  }
  if (type === 'DOCUMENT_CATEGORY') {
    out.push(...distinct(await prisma.employeeDocument.findMany({
      where: { organizationId }, select: { category: true }, distinct: ['category'],
    }), 'category'));
  }
  if (type === 'HOLD_REASON') {
    out.push(...distinct(await prisma.payslipEntry.findMany({
      where: { run: { organizationId }, NOT: { holdReason: '' } }, select: { holdReason: true }, distinct: ['holdReason'],
    }), 'holdReason'));
  }
  return out;
}

// An empty list is filled with its defaults and the values already in use.
async function seedIfEmpty(organizationId: string, type: string) {
  const count = await prisma.listValue.count({ where: { organizationId, listType: type } });
  if (count > 0) return;
  const labels = initialListValues(listType(type)?.defaults || [], await usedValues(organizationId, type));
  if (labels.length === 0) return;
  await prisma.listValue.createMany({
    data: labels.map((label, i) => ({ organizationId, listType: type, label, sortOrder: i })),
    skipDuplicates: true,
  });
}

function assertType(type: string) {
  if (!listType(type)) throw new AppError(400, 'Unknown list');
}

export async function listValuesFor(organizationId: string, types: string[] = LIST_TYPES.map(t => t.type)) {
  for (const type of types) await seedIfEmpty(organizationId, type);
  const rows = await prisma.listValue.findMany({
    where: { organizationId, listType: { in: types } },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });
  // A list with built-in values keeps their order; the rest read alphabetically
  return Object.fromEntries(types.map(type => {
    const values = rows.filter(r => r.listType === type);
    if (!listType(type)?.defaults.length) values.sort((x, y) => x.label.localeCompare(y.label));
    return [type, values];
  }));
}

// People using each value of a list, keyed by the value without case.
export async function usageOf(organizationId: string, type: string): Promise<Map<string, number>> {
  const usage = new Map<string, number>();
  const field = PERSON_FIELD[type];
  if (!field) return usage;
  const people = await prisma.person.findMany({
    where: { organizationId, NOT: { [field]: '' } }, select: { [field]: true } as any,
  });
  for (const p of people as any[]) {
    const key = labelKey(p[field]);
    usage.set(key, (usage.get(key) || 0) + 1);
  }
  return usage;
}

// Values saved on a record join their lists, so a list always holds what
// is in use. Pass { DEPARTMENT: 'Delivery', ... }; blanks are skipped.
export async function ensureListValues(organizationId: string, values: Record<string, any>) {
  for (const [type, raw] of Object.entries(values)) {
    const label = cleanLabel(raw);
    if (!label || !listType(type)) continue;
    await seedIfEmpty(organizationId, type);
    const existing = await prisma.listValue.findMany({ where: { organizationId, listType: type }, select: { label: true, sortOrder: true } });
    if (existing.some(v => sameLabel(v.label, label))) continue;
    await prisma.listValue.create({
      data: { organizationId, listType: type, label, sortOrder: Math.max(-1, ...existing.map(v => v.sortOrder)) + 1 },
    });
  }
}

export async function addListValue(organizationId: string, type: string, rawLabel: any) {
  assertType(type);
  const label = cleanLabel(rawLabel);
  if (!label) throw new AppError(400, 'Enter a value');
  if (label.length > 120) throw new AppError(400, 'Keep the value under 120 characters');
  await seedIfEmpty(organizationId, type);
  const existing = await prisma.listValue.findMany({ where: { organizationId, listType: type } });
  const same = existing.find(v => sameLabel(v.label, label));
  if (same) {
    // Adding a value that was switched off brings it back
    if (!same.isActive) return prisma.listValue.update({ where: { id: same.id }, data: { isActive: true } });
    throw new AppError(400, `"${same.label}" is already in the list`);
  }
  return prisma.listValue.create({
    data: { organizationId, listType: type, label, sortOrder: Math.max(-1, ...existing.map(v => v.sortOrder)) + 1 },
  });
}

async function fetchValue(organizationId: string, id: string) {
  const value = await prisma.listValue.findFirst({ where: { id, organizationId } });
  if (!value) throw new AppError(404, 'List value not found');
  return value;
}

// Records holding a value, whatever its case or spacing, take a new label.
async function relabelRecords(organizationId: string, type: string, from: string, to: string): Promise<number> {
  let moved = 0;
  const field = PERSON_FIELD[type];
  if (field) {
    const people = await prisma.person.findMany({
      where: { organizationId, NOT: { [field]: '' } }, select: { id: true, [field]: true } as any,
    });
    const ids = (people as any[]).filter(p => sameLabel(p[field], from) && p[field] !== to).map(p => p.id);
    if (ids.length) await prisma.person.updateMany({ where: { id: { in: ids } }, data: { [field]: to } });
    moved += (people as any[]).filter(p => sameLabel(p[field], from)).length;
  }
  // Files are filed under the category's label
  if (type === 'DOCUMENT_CATEGORY') {
    const files = await prisma.employeeDocument.findMany({ where: { organizationId }, select: { id: true, category: true } });
    const ids = files.filter(f => sameLabel(f.category, from) && f.category !== to).map(f => f.id);
    if (ids.length) await prisma.employeeDocument.updateMany({ where: { id: { in: ids } }, data: { category: to } });
    moved += files.filter(f => sameLabel(f.category, from)).length;
  }
  // Position history carries the same labels
  const held = POSITION_FIELD[type];
  if (held) {
    const rows = await prisma.positionChange.findMany({
      where: { organizationId, NOT: { [held]: '' } }, select: { id: true, [held]: true } as any,
    });
    const ids = (rows as any[]).filter(r => sameLabel(r[held], from) && r[held] !== to).map(r => r.id);
    if (ids.length) await prisma.positionChange.updateMany({ where: { id: { in: ids } }, data: { [held]: to } });
  }
  // Structure templates assigned to the value, and a department's own ledgers
  const scope = type === 'DESIGNATION' || type === 'DEPARTMENT' ? type : null;
  if (scope) {
    const assignments = await prisma.structureAssignment.findMany({ where: { organizationId, scope } });
    const held = assignments.filter(a => sameLabel(a.target, from));
    const taken = assignments.some(a => a.target === to);
    for (const a of held) {
      // Renaming onto a value that has its own template keeps that one
      if (taken && a.target !== to) await prisma.structureAssignment.delete({ where: { id: a.id } });
      else if (a.target !== to) await prisma.structureAssignment.update({ where: { id: a.id }, data: { target: to } });
    }
  }
  if (type === 'DEPARTMENT') {
    const overrides = await prisma.ledgerOverride.findMany({ where: { organizationId, dimension: 'DEPARTMENT' } });
    for (const o of overrides.filter(x => sameLabel(x.groupName, from) && x.groupName !== to)) {
      const id = { organizationId, dimension: o.dimension, groupName: o.groupName, key: o.key };
      await prisma.ledgerOverride.delete({ where: { organizationId_dimension_groupName_key: id } });
      await prisma.ledgerOverride.upsert({
        where: { organizationId_dimension_groupName_key: { ...id, groupName: to } },
        create: { organizationId, dimension: o.dimension, groupName: to, key: o.key, ledgerName: o.ledgerName }, update: {},
      });
    }
  }
  if (type === 'DEPARTMENT') {
    const openings = await prisma.jobOpening.findMany({ where: { organizationId, NOT: { department: '' } }, select: { id: true, department: true } });
    const ids = openings.filter(o => sameLabel(o.department, from)).map(o => o.id);
    if (ids.length) await prisma.jobOpening.updateMany({ where: { id: { in: ids } }, data: { department: to } });
  }
  return moved;
}

// Rename a value, or switch it on or off. Renaming to a label the list
// already has is a merge: records move to the other value and this one
// goes. A merge has to be asked for, so a typo cannot fold two values.
export async function updateListValue(organizationId: string, id: string, b: any) {
  const value = await fetchValue(organizationId, id);
  const data: any = {};
  if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);
  if (b.sortOrder !== undefined && Number.isInteger(Number(b.sortOrder))) data.sortOrder = Number(b.sortOrder);

  let moved = 0;
  if (b.label !== undefined && cleanLabel(b.label) !== value.label) {
    const label = cleanLabel(b.label);
    if (!label) throw new AppError(400, 'Enter a value');
    if (label.length > 120) throw new AppError(400, 'Keep the value under 120 characters');
    const others = await prisma.listValue.findMany({ where: { organizationId, listType: value.listType, id: { not: value.id } } });
    const target = others.find(v => sameLabel(v.label, label));
    if (target) {
      if (!b.merge) {
        throw new AppError(409, `"${target.label}" is already in the list. Merge "${value.label}" into it?`);
      }
      moved = await relabelRecords(organizationId, value.listType, value.label, target.label);
      await prisma.listValue.delete({ where: { id: value.id } });
      return { value: target, merged: true, moved, from: value.label };
    }
    moved = await relabelRecords(organizationId, value.listType, value.label, label);
    data.label = label;
  }
  const updated = await prisma.listValue.update({ where: { id: value.id }, data });
  return { value: updated, merged: false, moved, from: value.label };
}

// A value still on records cannot be deleted: merge it or switch it off.
export async function deleteListValue(organizationId: string, id: string) {
  const value = await fetchValue(organizationId, id);
  const inUse = (await usageOf(organizationId, value.listType)).get(labelKey(value.label)) || 0;
  if (inUse > 0) {
    throw new AppError(400, `${inUse} ${inUse === 1 ? 'person has' : 'people have'} "${value.label}". Rename it to merge it into another value, or switch it off to stop it being picked.`);
  }
  await prisma.listValue.delete({ where: { id: value.id } });
  return value;
}
