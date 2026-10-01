// Keeps draft payroll runs in step with salary revisions: when an
// employee's package changes, their entries in draft runs from the
// effective month onward take the package that now applies and are
// recomputed. Finalized runs are never touched.
import { prisma } from '../../config/database';
import { loadStatutoryContext, computeFullEntry } from './entryCompute';
import { packageForPeriod } from './salaryStructure';
import { logPayrollAudit } from './audit';

export async function syncDraftPackages(req: any, personId: string, fromPeriod: string): Promise<number> {
  const organizationId = req.user?.organizationId;
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: {
      name: true, currentMonthlyPackage: true, salaryRevisions: true,
      workLocation: { select: { state: true } },
    },
  });
  if (!person) return 0;
  const entries = await prisma.payslipEntry.findMany({
    where: { organizationId, personId, run: { status: 'DRAFT', period: { gte: fromPeriod } } },
    include: { run: { select: { period: true } }, lines: true },
  });
  if (entries.length === 0) return 0;

  let updated = 0;
  for (const entry of entries) {
    const monthlyPackage = packageForPeriod(person.currentMonthlyPackage, person.salaryRevisions, entry.run.period);
    if (monthlyPackage === entry.monthlyPackage) continue;
    const ctx = await loadStatutoryContext(organizationId, entry.run.period);
    await prisma.payslipEntry.update({
      where: { id: entry.id },
      data: {
        monthlyPackage,
        ...computeFullEntry(ctx, { ...entry, monthlyPackage }, entry.lines, {
          personId, state: person.workLocation?.state,
          ptOverride: entry.ptOverridden ? entry.professionalTax : null,
        }),
      },
    });
    await logPayrollAudit(req, [{
      action: 'ENTRY_UPDATED', runId: entry.runId, entryId: entry.id, personId,
      period: entry.run.period, personName: person.name, source: 'REVISION',
      field: 'monthlyPackage', oldValue: String(entry.monthlyPackage), newValue: String(monthlyPackage),
    }]);
    updated++;
  }
  return updated;
}
