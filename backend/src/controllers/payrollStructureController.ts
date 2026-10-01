import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logPayrollAudit, actorName } from '../services/payroll/audit';
import {
  packageForPeriod, sortRevisions, currentPeriodIST,
} from '../services/payroll/salaryStructure';
import { syncDraftEntries } from '../services/payroll/draftSync';
import { ensureDefaultComponents } from '../services/payroll/payComponents';
import { raiseRevisionArrears, cancelRevisionArrears } from '../services/payroll/arrears';

const str = (v: any) => String(v ?? '').trim();

const COMPONENT_TYPES = ['EARNING', 'DEDUCTION'];

export async function componentsFor(organizationId: string) {
  await ensureDefaultComponents(organizationId);
  return prisma.payComponent.findMany({
    where: { organizationId },
    include: { _count: { select: { lines: true } } },
    orderBy: [{ type: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }], // EARNING before DEDUCTION
  });
}

const componentJSON = (c: any) => ({
  id: c.id, code: c.code, name: c.name, type: c.type, taxable: c.taxable,
  isActive: c.isActive, usedCount: c._count?.lines ?? 0,
});

const codeFromName = (name: string) =>
  name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');

async function fetchOrgComponent(id: string, organizationId: string) {
  const component = await prisma.payComponent.findFirst({ where: { id, organizationId } });
  if (!component) throw new AppError(404, 'Pay component not found');
  return component;
}

async function assertUniqueComponentName(organizationId: string, name: string, excludeId?: string) {
  const dup = await prisma.payComponent.findFirst({
    where: {
      organizationId,
      OR: [{ name: { equals: name, mode: 'insensitive' } }, { code: codeFromName(name) }],
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (dup) throw new AppError(400, `A component named "${dup.name}" already exists`);
}

async function fetchOrgEmployee(personId: string, organizationId: string) {
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: { id: true, name: true, currentMonthlyPackage: true },
  });
  if (!person) throw new AppError(404, 'Person not found');
  return person;
}

const revisionJSON = (r: any) => ({
  id: r.id, effectiveFrom: r.effectiveFrom,
  oldMonthlyPackage: r.oldMonthlyPackage, newMonthlyPackage: r.newMonthlyPackage,
  reason: r.reason, createdByName: r.createdByName, createdAt: r.createdAt,
});

export const payrollStructureController = {
  // ---- Pay components -----------------------------------------------------
  async getComponents(req: any, res: Response) {
    const components = await componentsFor(req.user?.organizationId);
    res.json({ components: components.map(componentJSON) });
  },

  async createComponent(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    await componentsFor(orgId);
    const name = str(req.body.name);
    if (!name) throw new AppError(400, 'Component name is required');
    const type = str(req.body.type);
    if (!COMPONENT_TYPES.includes(type)) throw new AppError(400, 'Pick earning or deduction');
    const code = codeFromName(name);
    if (!code) throw new AppError(400, 'Component name needs at least one letter or digit');
    await assertUniqueComponentName(orgId, name);
    const last = await prisma.payComponent.findFirst({
      where: { organizationId: orgId }, orderBy: { sortOrder: 'desc' },
    });
    const component = await prisma.payComponent.create({
      data: {
        organizationId: orgId, code, name, type,
        taxable: type === 'EARNING' ? req.body.taxable !== false : false,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
    await logPayrollAudit(req, [{
      action: 'COMPONENT_CREATED', field: component.name, newValue: type === 'EARNING' ? 'Earning' : 'Deduction',
    }]);
    res.status(201).json(componentJSON(component));
  },

  // Type is fixed once created: payslips already issued carry it.
  async updateComponent(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const before = await fetchOrgComponent(req.params.componentId, orgId);
    const data: any = {};
    if (req.body.name !== undefined) {
      const name = str(req.body.name);
      if (!name) throw new AppError(400, 'Component name is required');
      if (name !== before.name) await assertUniqueComponentName(orgId, name, before.id);
      data.name = name;
    }
    if (req.body.taxable !== undefined && before.type === 'EARNING') data.taxable = Boolean(req.body.taxable);
    if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
    const component = await prisma.payComponent.update({
      where: { id: before.id }, data,
      include: { _count: { select: { lines: true } } },
    });
    const changes: [string, any, any][] = [
      ['name', before.name, component.name],
      ['taxable', before.taxable ? 'Yes' : 'No', component.taxable ? 'Yes' : 'No'],
      ['active', before.isActive ? 'Yes' : 'No', component.isActive ? 'Yes' : 'No'],
    ];
    await logPayrollAudit(req, changes.filter(([, a, b]) => a !== b).map(([what, a, b]) => ({
      action: 'COMPONENT_UPDATED' as const, field: `${before.name} · ${what}`, oldValue: a, newValue: b,
    })));
    res.json(componentJSON(component));
  },

  async deleteComponent(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const component = await fetchOrgComponent(req.params.componentId, orgId);
    const used = await prisma.payslipLine.count({ where: { componentId: component.id } });
    if (used > 0) {
      throw new AppError(400, `${component.name} is on ${used} payslip${used === 1 ? '' : 's'}. Mark it inactive instead.`);
    }
    await prisma.payComponent.delete({ where: { id: component.id } });
    await logPayrollAudit(req, [{ action: 'COMPONENT_DELETED', field: component.name }]);
    res.json({ message: `Deleted ${component.name}` });
  },

  // ---- Salary revisions ---------------------------------------------------
  async getRevisions(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchOrgEmployee(req.params.personId, orgId);
    const revisions = await prisma.salaryRevision.findMany({ where: { organizationId: orgId, personId: person.id } });
    res.json({
      currentMonthlyPackage: person.currentMonthlyPackage,
      revisions: sortRevisions(revisions).reverse().map(revisionJSON),
    });
  },

  async createRevision(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchOrgEmployee(req.params.personId, orgId);
    const month = str(req.body.effectiveMonth); // "YYYY-MM"
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError(400, 'Pick the month the new salary applies from');
    const newPackage = Number(req.body.newMonthlyPackage);
    if (!isFinite(newPackage) || newPackage <= 0) throw new AppError(400, 'Enter the new monthly package');

    const existing = await prisma.salaryRevision.findMany({ where: { organizationId: orgId, personId: person.id } });
    if (existing.some(r => r.effectiveFrom.slice(0, 7) > month)) {
      throw new AppError(400, 'A later revision already exists. Remove it first, or pick a later month.');
    }
    const oldPackage = packageForPeriod(person.currentMonthlyPackage, existing, month);
    if (oldPackage === newPackage) throw new AppError(400, 'The new package is the same as the current one');

    const finalized = await prisma.payslipEntry.findFirst({
      where: { organizationId: orgId, personId: person.id, run: { period: { gte: month }, status: 'FINALIZED' } },
      include: { run: { select: { period: true } } },
      orderBy: { run: { period: 'desc' } },
    });

    const revision = await prisma.salaryRevision.create({
      data: {
        organizationId: orgId, personId: person.id,
        effectiveFrom: `${month}-01`,
        oldMonthlyPackage: oldPackage, newMonthlyPackage: newPackage,
        reason: str(req.body.reason),
        createdByName: await actorName(req.user?.userId),
      },
    });
    const current = packageForPeriod(person.currentMonthlyPackage, [...existing, revision], currentPeriodIST());
    await prisma.person.update({ where: { id: person.id }, data: { currentMonthlyPackage: current } });
    await logPayrollAudit(req, [{
      action: 'SALARY_REVISED', personId: person.id, personName: person.name, period: month,
      field: 'Monthly package', oldValue: String(oldPackage), newValue: String(newPackage),
    }]);
    const draftEntriesUpdated = await syncDraftEntries(req, person.id, month);
    res.status(201).json({
      revision: revisionJSON(revision),
      currentMonthlyPackage: current,
      draftEntriesUpdated,
      // Finalized months on or after the effective month keep their old
      // package; the difference is raised as arrears
      finalizedThrough: finalized?.run.period || null,
      arrears: finalized ? await raiseRevisionArrears(req, person.id, month, revision.id) : null,
    });
  },

  // Only the latest revision can be removed, so the chain stays consistent.
  async deleteRevision(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchOrgEmployee(req.params.personId, orgId);
    const revisions = sortRevisions(await prisma.salaryRevision.findMany({
      where: { organizationId: orgId, personId: person.id },
    }));
    const latest = revisions[revisions.length - 1];
    if (!latest || latest.id !== req.params.revisionId) {
      throw new AppError(400, 'Only the latest revision can be removed');
    }
    // Unpaid arrears of the revision go with it; paid ones stop the removal
    await cancelRevisionArrears(orgId, latest.id);
    await prisma.salaryRevision.delete({ where: { id: latest.id } });
    const remaining = revisions.slice(0, -1);
    const today = currentPeriodIST();
    // With no revisions left there is nothing to derive from: fall back to
    // the removed revision's old package if it had already taken effect.
    const current = remaining.length
      ? packageForPeriod(person.currentMonthlyPackage, remaining, today)
      : latest.effectiveFrom.slice(0, 7) <= today ? latest.oldMonthlyPackage : person.currentMonthlyPackage;
    await prisma.person.update({ where: { id: person.id }, data: { currentMonthlyPackage: current } });
    await logPayrollAudit(req, [{
      action: 'SALARY_REVISION_REMOVED', personId: person.id, personName: person.name,
      period: latest.effectiveFrom.slice(0, 7), field: 'Monthly package',
      oldValue: String(latest.newMonthlyPackage), newValue: String(current),
    }]);
    res.json({
      currentMonthlyPackage: current,
      draftEntriesUpdated: await syncDraftEntries(req, person.id, latest.effectiveFrom.slice(0, 7)),
    });
  },
};
