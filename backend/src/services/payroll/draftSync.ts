// Keeps draft payroll runs in step with changes made elsewhere: when an
// employee's package is revised or their loans change, their entries in
// draft runs from the affected month onward are recomputed. Finalized
// runs are never touched.
import { prisma } from '../../config/database';
import { loadStatutoryContext, computeFullEntry, locationOptions, LOCATION_FOR_PAYROLL } from './entryCompute';
import { packageForPeriod } from './salaryStructure';
import { logPayrollAudit } from './audit';
import { saveTaxWorkings } from './taxContext';
import { saveRecurringLines } from './structures';

// Recompute every entry of every draft run, after a change that can touch
// anyone's pay: a structure template or who it is assigned to. Returns the
// number of payslips whose figures changed.
export async function recomputeDraftRuns(req: any, what: string): Promise<number> {
  const organizationId = req.user?.organizationId;
  const runs = await prisma.payrollRun.findMany({
    where: { organizationId, status: 'DRAFT' },
    include: { entries: { include: { lines: true, person: { select: { name: true, workLocation: { select: LOCATION_FOR_PAYROLL } } } } } },
  });
  let changed = 0;
  for (const run of runs) {
    const ctx = await loadStatutoryContext(organizationId, run.period);
    let inRun = 0;
    for (const entry of run.entries) {
      const computed = computeFullEntry(ctx, entry, entry.lines, {
        personId: entry.personId, ...locationOptions(entry.person.workLocation),
        ptOverride: entry.ptOverridden ? entry.professionalTax : null,
        tdsOverride: entry.tdsOverridden ? entry.tds : null,
      });
      if (computed.grossSalary !== entry.grossSalary || computed.netPayable !== entry.netPayable
        || computed.structureSplit !== entry.structureSplit || computed.basic !== entry.basic) inRun++;
      await prisma.payslipEntry.update({ where: { id: entry.id }, data: computed });
    }
    await saveTaxWorkings(ctx.tax, organizationId, run.id);
    await saveRecurringLines(ctx, organizationId, run.id);
    if (inRun) {
      await logPayrollAudit(req, [{
        action: 'RUN_RECALCULATED', runId: run.id, period: run.period,
        newValue: `${inRun} payslip${inRun === 1 ? '' : 's'} changed: ${what}`,
      }]);
    }
    changed += inRun;
  }
  return changed;
}

// `always` recomputes the entries even when neither the package nor the
// loan instalment changed: a recurring component was added or changed.
export async function syncDraftEntries(req: any, personId: string, fromPeriod: string, always = false): Promise<number> {
  const organizationId = req.user?.organizationId;
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: {
      name: true, currentMonthlyPackage: true, salaryRevisions: true,
      workLocation: { select: LOCATION_FOR_PAYROLL },
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
    const ctx = await loadStatutoryContext(organizationId, entry.run.period);
    const computed = computeFullEntry(ctx, { ...entry, monthlyPackage }, entry.lines, {
      personId, ...locationOptions(person.workLocation),
      ptOverride: entry.ptOverridden ? entry.professionalTax : null,
      tdsOverride: entry.tdsOverridden ? entry.tds : null,
    });
    const packageChanged = monthlyPackage !== entry.monthlyPackage;
    const loanChanged = computed.loanDeduction !== entry.loanDeduction;
    if (!packageChanged && !loanChanged && !always) continue;
    await prisma.payslipEntry.update({ where: { id: entry.id }, data: { monthlyPackage, ...computed } });
    await saveTaxWorkings(ctx.tax, organizationId, entry.runId);
    await saveRecurringLines(ctx, organizationId, entry.runId);
    const common = {
      action: 'ENTRY_UPDATED' as const, runId: entry.runId, entryId: entry.id, personId,
      period: entry.run.period, personName: person.name,
    };
    await logPayrollAudit(req, [
      ...(packageChanged ? [{
        ...common, source: 'REVISION' as const, field: 'monthlyPackage',
        oldValue: String(entry.monthlyPackage), newValue: String(monthlyPackage),
      }] : []),
      ...(loanChanged ? [{
        ...common, source: 'LOAN' as const, field: 'loanDeduction',
        oldValue: String(entry.loanDeduction), newValue: String(computed.loanDeduction),
      }] : []),
    ]);
    updated++;
  }
  return updated;
}
