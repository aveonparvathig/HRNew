// The automatic input cutoff. There is no background job: each payroll
// request first locks the draft runs whose cutoff date has passed, which
// comes to the same thing.
import { prisma } from '../../config/database';
import { todayIST } from './loanLedger';
import { cutoffDate, cutoffDue } from './payoutCalc';

const istDate = (at: Date) => new Date(at.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);

export async function applyInputCutoffs(organizationId: string) {
  const runs = await prisma.payrollRun.findMany({
    where: { organizationId, status: 'DRAFT', cutoffApplied: false },
    select: { id: true, period: true, createdAt: true, inputsLockedAt: true },
  });
  if (runs.length === 0) return;
  // No settings row means the default cutoff day of 0: nothing to apply.
  const settings = await prisma.payrollSettings.findUnique({ where: { organizationId }, select: { inputCutoffDay: true } });
  if (!settings || !(settings.inputCutoffDay > 0)) return;
  const today = todayIST();
  for (const run of runs) {
    const due = cutoffDue(run.period, settings.inputCutoffDay, today, istDate(run.createdAt));
    if (due !== 'MISSED' && due !== 'LOCK') continue;
    // Requests arrive in parallel; each run is claimed by exactly one of them.
    const claimed = await prisma.payrollRun.updateMany({
      where: { id: run.id, cutoffApplied: false }, data: { cutoffApplied: true },
    });
    if (claimed.count === 0 || due === 'MISSED') continue;
    const locked = await prisma.payrollRun.updateMany({
      where: { id: run.id, inputsLockedAt: null }, data: { inputsLockedAt: new Date() },
    });
    if (locked.count > 0) {
      await prisma.payrollAuditLog.create({
        data: {
          organizationId, userId: null, userName: 'Automatic cutoff', action: 'INPUTS_LOCKED', runId: run.id, period: run.period,
          newValue: `Inputs locked after ${cutoffDate(run.period, settings.inputCutoffDay)}`,
        },
      });
    }
  }
}
