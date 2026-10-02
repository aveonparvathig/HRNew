// Salary structure templates and who they apply to, recurring components
// of an employee, and a package typed as an annual figure.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logPayrollAudit, actorName } from '../services/payroll/audit';
import { currentPeriodIST, salaryStructure } from '../services/payroll/salaryStructure';
import {
  PACKAGE_MODES, SCOPES, SCOPE_LABELS, SPLIT_FIELDS, SPLIT_LABELS, annualCtcOf, grossPercent, monthlyPackageFrom,
  splitInput, splitOf, withSplit,
} from '../services/payroll/structureCalc';
import { recurringProblem } from '../services/payroll/recurringCalc';
import { loadStructures } from '../services/payroll/structures';
import { recomputeDraftRuns, syncDraftEntries } from '../services/payroll/draftSync';
import { MANAGED_CODES } from '../services/payroll/payComponents';
import { componentsFor } from './payrollStructureController';
import { listValuesFor } from '../services/listValues';

const str = (v: any) => String(v ?? '').trim();
const settingsFor = (organizationId: string) =>
  prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });

const templateJSON = (t: any) => ({
  id: t.id, name: t.name, isActive: t.isActive, ...splitOf(t), grossPercent: grossPercent(splitOf(t)),
});

async function fetchTemplate(id: string, organizationId: string) {
  const template = await prisma.structureTemplate.findFirst({ where: { id, organizationId } });
  if (!template) throw new AppError(404, 'Structure template not found');
  return template;
}

async function fetchPerson(personId: string, organizationId: string) {
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: {
      id: true, name: true, employeeNo: true, designation: true, department: true,
      currentMonthlyPackage: true, isEsiEligible: true, isPfApplicable: true,
    },
  });
  if (!person) throw new AppError(404, 'Person not found');
  return person;
}

async function assertUniqueName(organizationId: string, name: string, excludeId?: string) {
  const dup = await prisma.structureTemplate.findFirst({
    where: { organizationId, name: { equals: name, mode: 'insensitive' }, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  if (dup) throw new AppError(400, `A template named "${dup.name}" already exists`);
}

const splitDescription = (t: any) => SPLIT_FIELDS.map(f => `${SPLIT_LABELS[f]} ${t[f]}`).join('; ');
const recurringJSON = (r: any, period: string) => ({
  id: r.id, componentId: r.componentId, name: r.component.name, type: r.component.type,
  amount: r.amount, fromPeriod: r.fromPeriod, toPeriod: r.toPeriod, prorate: r.prorate, remarks: r.remarks,
  createdByName: r.createdByName,
  state: r.toPeriod && r.toPeriod < period ? 'ENDED' : r.fromPeriod > period ? 'UPCOMING' : 'RUNNING',
});

export const payrollStructuresController = {
  // ---- Templates and who they apply to ---------------------------------------
  async getTemplates(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const [settings, structures, people, lists, drafts] = await Promise.all([
      settingsFor(organizationId),
      loadStructures(organizationId),
      prisma.person.findMany({
        where: { organizationId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } },
        select: { id: true, name: true, employeeNo: true, designation: true, department: true },
        orderBy: { name: 'asc' },
      }),
      listValuesFor(organizationId, ['DEPARTMENT', 'DESIGNATION']),
      prisma.payrollRun.count({ where: { organizationId, status: 'DRAFT' } }),
    ]);
    const resolved = people.map(p => ({ ...p, structure: structures.forPerson(p) }));
    const nameOf = new Map(people.map(p => [p.id, p.name]));
    res.json({
      company: { ...splitOf(settings), grossPercent: grossPercent(splitOf(settings)) },
      labels: SPLIT_LABELS,
      templates: structures.templates.map(t => ({
        ...templateJSON(t),
        assignments: structures.assignments.filter(a => a.templateId === t.id).map(a => ({
          id: a.id, scope: a.scope, target: a.target,
          label: a.scope === 'EMPLOYEE' ? nameOf.get(a.target) || 'An employee no longer active' : a.target,
        })),
        employees: resolved.filter(p => p.structure?.templateId === t.id).length,
      })),
      onCompanySplit: resolved.filter(p => !p.structure).length,
      people: resolved.map(p => ({
        id: p.id, name: p.name, employeeNo: p.employeeNo, designation: p.designation, department: p.department,
        structure: p.structure ? { name: p.structure.name, scope: p.structure.scope } : null,
      })),
      designations: lists.DESIGNATION.filter(v => v.isActive).map(v => v.label),
      departments: lists.DEPARTMENT.filter(v => v.isActive).map(v => v.label),
      draftRuns: drafts,
    });
  },

  async createTemplate(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const name = str(req.body.name).slice(0, 80);
    if (!name) throw new AppError(400, 'Give the template a name');
    await assertUniqueName(organizationId, name);
    const split = splitInput(req.body);
    if (typeof split === 'string') throw new AppError(400, split);
    const template = await prisma.structureTemplate.create({ data: { organizationId, name, ...split } });
    await logPayrollAudit(req, [{ action: 'STRUCTURE_TEMPLATE_SAVED', field: name, newValue: splitDescription(template) }]);
    // Nobody is assigned to a new template, so no payslip changes yet
    res.status(201).json(templateJSON(template));
  },

  async updateTemplate(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const before = await fetchTemplate(req.params.templateId, organizationId);
    const data: any = {};
    if (req.body.name !== undefined) {
      const name = str(req.body.name).slice(0, 80);
      if (!name) throw new AppError(400, 'Give the template a name');
      if (name !== before.name) await assertUniqueName(organizationId, name, before.id);
      data.name = name;
    }
    if (SPLIT_FIELDS.some(f => req.body[f] !== undefined)) {
      const split = splitInput({ ...splitOf(before), ...Object.fromEntries(SPLIT_FIELDS.filter(f => req.body[f] !== undefined).map(f => [f, req.body[f]])) });
      if (typeof split === 'string') throw new AppError(400, split);
      Object.assign(data, split);
    }
    if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
    const template = await prisma.structureTemplate.update({ where: { id: before.id }, data });
    const changes: [string, string, string][] = [
      ['name', before.name, template.name],
      ['split', splitDescription(before), splitDescription(template)],
      ['active', before.isActive ? 'Yes' : 'No', template.isActive ? 'Yes' : 'No'],
    ];
    await logPayrollAudit(req, changes.filter(([, a, b]) => a !== b).map(([what, a, b]) => ({
      action: 'STRUCTURE_TEMPLATE_SAVED' as const, field: `${before.name} · ${what}`, oldValue: a, newValue: b,
    })));
    res.json({ ...templateJSON(template), draftPayslipsChanged: await recomputeDraftRuns(req, `structure template "${template.name}" changed`) });
  },

  // Payslips already issued keep the split they were paid with: each
  // carries its own copy.
  async deleteTemplate(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const template = await fetchTemplate(req.params.templateId, organizationId);
    await prisma.structureTemplate.delete({ where: { id: template.id } });
    await logPayrollAudit(req, [{ action: 'STRUCTURE_TEMPLATE_DELETED', field: template.name, oldValue: splitDescription(template) }]);
    res.json({
      message: `Deleted ${template.name}`,
      draftPayslipsChanged: await recomputeDraftRuns(req, `structure template "${template.name}" deleted`),
    });
  },

  // Put a template on an employee, a designation or a department — or,
  // with no template, take the assignment away.
  async assign(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const scope = str(req.body.scope);
    if (!(SCOPES as readonly string[]).includes(scope)) throw new AppError(400, 'Pick who the template is for');
    let target = str(req.body.target);
    let label = target;
    if (scope === 'EMPLOYEE') {
      const person = await fetchPerson(target, organizationId);
      label = person.name;
    } else {
      if (!target) throw new AppError(400, `Pick the ${SCOPE_LABELS[scope]}`);
      // The same label, however it was typed, is one assignment, written as the list has it
      const [existing, lists] = await Promise.all([
        prisma.structureAssignment.findMany({ where: { organizationId, scope } }),
        listValuesFor(organizationId, [scope]),
      ]);
      const same = (label: string) => label.trim().toLowerCase() === target.toLowerCase();
      target = existing.find(a => same(a.target))?.target || lists[scope]?.find(v => same(v.label))?.label || target;
      label = target;
    }
    const key = { organizationId_scope_target: { organizationId, scope, target } };
    const before = await prisma.structureAssignment.findUnique({ where: key, include: { template: true } });
    const templateId = str(req.body.templateId);
    if (!templateId) {
      if (!before) return res.json({ message: 'Nothing to remove', draftPayslipsChanged: 0 });
      await prisma.structureAssignment.delete({ where: { id: before.id } });
      await logPayrollAudit(req, [{
        action: 'STRUCTURE_ASSIGNED', field: `${SCOPE_LABELS[scope]}: ${label}`, oldValue: before.template.name, newValue: 'Company split',
        ...(scope === 'EMPLOYEE' ? { personId: target, personName: label } : {}),
      }]);
      return res.json({
        message: 'Assignment removed',
        draftPayslipsChanged: await recomputeDraftRuns(req, `${label} no longer on "${before.template.name}"`),
      });
    }
    const template = await fetchTemplate(templateId, organizationId);
    if (!template.isActive) throw new AppError(400, `${template.name} is switched off`);
    await prisma.structureAssignment.upsert({
      where: key, create: { organizationId, scope, target, templateId: template.id }, update: { templateId: template.id },
    });
    await logPayrollAudit(req, [{
      action: 'STRUCTURE_ASSIGNED', field: `${SCOPE_LABELS[scope]}: ${label}`,
      oldValue: before?.template.name || 'Company split', newValue: template.name,
      ...(scope === 'EMPLOYEE' ? { personId: target, personName: label } : {}),
    }]);
    res.json({
      message: `${template.name} applies to ${label}`,
      draftPayslipsChanged: await recomputeDraftRuns(req, `"${template.name}" assigned to ${label}`),
    });
  },

  // ---- One employee: their structure and recurring components -------------------
  async getPersonStructure(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const person = await fetchPerson(req.params.personId, organizationId);
    const period = currentPeriodIST();
    const [settings, structures, recurring, components] = await Promise.all([
      settingsFor(organizationId),
      loadStructures(organizationId),
      prisma.recurringComponent.findMany({
        where: { organizationId, personId: person.id }, include: { component: { select: { name: true, type: true } } },
        orderBy: [{ fromPeriod: 'desc' }, { createdAt: 'desc' }],
      }),
      componentsFor(organizationId),
    ]);
    const structure = structures.forPerson(person);
    const split = structure?.split || splitOf(settings);
    const s = salaryStructure(person.currentMonthlyPackage || 0, person, withSplit(settings, structure?.split));
    res.json({
      person: { id: person.id, name: person.name, designation: person.designation, department: person.department },
      period,
      structure: structure ? { templateId: structure.templateId, name: structure.name, scope: structure.scope } : null,
      // The employee's own assignment, which wins over designation and department
      ownTemplateId: structures.assignments.find(a => a.scope === 'EMPLOYEE' && a.target === person.id)?.templateId || '',
      templates: structures.templates.filter(t => t.isActive).map(t => ({ id: t.id, name: t.name })),
      split, grossPercent: grossPercent(split),
      monthlyPackage: person.currentMonthlyPackage || 0,
      monthly: s.monthly, annual: s.annual,
      recurring: recurring.map(r => recurringJSON(r, period)),
      components: components
        .filter(c => c.isActive && !MANAGED_CODES.includes(c.code))
        .map(c => ({ id: c.id, name: c.name, type: c.type })),
    });
  },

  async createRecurring(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const person = await fetchPerson(req.params.personId, organizationId);
    const b = req.body;
    const item = {
      componentId: str(b.componentId), amount: Math.round(Number(b.amount) * 100) / 100,
      fromPeriod: str(b.fromPeriod), toPeriod: str(b.toPeriod),
    };
    const component = await prisma.payComponent.findFirst({ where: { id: item.componentId, organizationId } });
    if (!component) throw new AppError(400, 'Pick a pay component');
    if (!component.isActive) throw new AppError(400, `${component.name} is inactive`);
    if (MANAGED_CODES.includes(component.code)) throw new AppError(400, `${component.name} is written by arrears or settlements and cannot be made recurring`);
    const others = await prisma.recurringComponent.findMany({ where: { organizationId, personId: person.id } });
    const problem = recurringProblem(item, others);
    if (problem) throw new AppError(400, problem);
    const created = await prisma.recurringComponent.create({
      data: {
        organizationId, personId: person.id, ...item, prorate: b.prorate !== false,
        remarks: str(b.remarks).slice(0, 200), createdByName: await actorName(req.user?.userId),
      },
      include: { component: { select: { name: true, type: true } } },
    });
    await logPayrollAudit(req, [{
      action: 'RECURRING_SAVED', personId: person.id, personName: person.name, period: item.fromPeriod,
      field: component.name, newValue: `${item.amount} a month from ${item.fromPeriod}${item.toPeriod ? ` to ${item.toPeriod}` : ''}${created.prorate ? '' : ', not reduced for loss of pay'}`,
    }]);
    res.status(201).json({
      ...recurringJSON(created, currentPeriodIST()),
      draftEntriesUpdated: await syncDraftEntries(req, person.id, item.fromPeriod, true),
    });
  },

  async updateRecurring(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const before = await prisma.recurringComponent.findFirst({
      where: { id: req.params.recurringId, organizationId },
      include: { component: { select: { name: true, type: true } }, person: { select: { name: true } } },
    });
    if (!before) throw new AppError(404, 'Recurring component not found');
    const b = req.body;
    const item = {
      id: before.id, componentId: before.componentId,
      amount: b.amount !== undefined ? Math.round(Number(b.amount) * 100) / 100 : before.amount,
      fromPeriod: b.fromPeriod !== undefined ? str(b.fromPeriod) : before.fromPeriod,
      toPeriod: b.toPeriod !== undefined ? str(b.toPeriod) : before.toPeriod,
    };
    const others = await prisma.recurringComponent.findMany({ where: { organizationId, personId: before.personId } });
    const problem = recurringProblem(item, others);
    if (problem) throw new AppError(400, problem);
    const updated = await prisma.recurringComponent.update({
      where: { id: before.id },
      data: {
        amount: item.amount, fromPeriod: item.fromPeriod, toPeriod: item.toPeriod,
        ...(b.prorate !== undefined ? { prorate: Boolean(b.prorate) } : {}),
        ...(b.remarks !== undefined ? { remarks: str(b.remarks).slice(0, 200) } : {}),
      },
      include: { component: { select: { name: true, type: true } } },
    });
    const text = (r: any) => `${r.amount} a month, ${r.fromPeriod} to ${r.toPeriod || 'until changed'}${r.prorate ? '' : ', not reduced for loss of pay'}`;
    if (text(before) !== text(updated)) {
      await logPayrollAudit(req, [{
        action: 'RECURRING_SAVED', personId: before.personId, personName: before.person.name, period: updated.fromPeriod,
        field: before.component.name, oldValue: text(before), newValue: text(updated),
      }]);
    }
    const from = before.fromPeriod < updated.fromPeriod ? before.fromPeriod : updated.fromPeriod;
    res.json({
      ...recurringJSON(updated, currentPeriodIST()),
      draftEntriesUpdated: await syncDraftEntries(req, before.personId, from, true),
    });
  },

  // Payslips already finalized keep their line; drafts lose it.
  async deleteRecurring(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const item = await prisma.recurringComponent.findFirst({
      where: { id: req.params.recurringId, organizationId },
      include: { component: { select: { name: true } }, person: { select: { name: true } } },
    });
    if (!item) throw new AppError(404, 'Recurring component not found');
    await prisma.recurringComponent.delete({ where: { id: item.id } });
    await logPayrollAudit(req, [{
      action: 'RECURRING_DELETED', personId: item.personId, personName: item.person.name, period: item.fromPeriod,
      field: item.component.name, oldValue: `${item.amount} a month from ${item.fromPeriod}`,
    }]);
    res.json({ message: `Removed ${item.component.name}`, draftEntriesUpdated: await syncDraftEntries(req, item.personId, item.fromPeriod, true) });
  },

  // ---- A package typed monthly, as a yearly figure, or as annual CTC -----------------
  async packagePreview(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const b = req.body;
    const mode = str(b.mode) || 'MONTHLY';
    if (!(PACKAGE_MODES as readonly string[]).includes(mode)) throw new AppError(400, 'Pick how the package is entered');
    const amount = Number(b.amount);
    if (!isFinite(amount) || amount <= 0) throw new AppError(400, 'Enter the amount');
    const [base, structures] = await Promise.all([settingsFor(organizationId), loadStructures(organizationId)]);
    // An existing employee's own flags and template; otherwise what was sent, on the company split
    const person = b.personId ? await fetchPerson(str(b.personId), organizationId) : null;
    const flags = {
      isEsiEligible: b.isEsiEligible !== undefined ? Boolean(b.isEsiEligible) : Boolean(person?.isEsiEligible),
      isPfApplicable: b.isPfApplicable !== undefined ? Boolean(b.isPfApplicable) : Boolean(person?.isPfApplicable),
    };
    const structure = person
      ? structures.forPerson(person)
      : structures.forPerson({ id: '', designation: str(b.designation), department: str(b.department) });
    const settings = withSplit(base, structure?.split);
    const monthlyPackage = monthlyPackageFrom(mode, amount, flags, settings);
    if (!(monthlyPackage > 0)) throw new AppError(400, 'That amount is too small to make a monthly package');
    const s = salaryStructure(monthlyPackage, flags, settings);
    res.json({
      mode, amount, monthlyPackage, annualPackage: Math.round(monthlyPackage * 12 * 100) / 100,
      annualCtc: annualCtcOf(monthlyPackage, flags, settings),
      structureName: structure?.name || '', monthly: s.monthly, annual: s.annual,
    });
  },
};
