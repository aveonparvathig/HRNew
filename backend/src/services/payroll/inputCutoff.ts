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
  const settings = await prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });
  if (!(settings.inputCutoffDay > 0)) return;
  const today = todayIST();
  for (const run of runs) {
    const due = cutoffDue(run.period, settings.inputCutoffDay, today, istDate(run.createdAt));
    if (due === 'MISSED') {
      await prisma.payrollRun.update({ where: { id: run.id }, data: { cutoffApplied: true } });
    } else if (due === 'LOCK') {
      await prisma.payrollRun.update({
        where: { id: run.id }, data: { cutoffApplied: true, inputsLockedAt: run.inputsLockedAt ?? new Date() },
      });
      if (!run.inputsLockedAt) {
        await prisma.payrollAuditLog.create({
          data: {
            organizationId, userId: null, userName: 'Automatic cutoff', action: 'INPUTS_LOCKED', runId: run.id, period: run.period,
            newValue: `Inputs locked after ${cutoffDate(run.period, settings.inputCutoffDay)}`,
          },
        });
      }
    }
  }
}
