// Arrears in the database: raising them for back-dated revisions and
// loss-of-pay reversals, and paying them as lines on a draft payslip.
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { loadStatutoryContext, computeFullEntry, locationOptions, LOCATION_FOR_PAYROLL } from './entryCompute';
import { saveTaxWorkings } from './taxContext';
import { packageForPeriod, currentPeriodIST } from './salaryStructure';
import { logPayrollAudit, actorName } from './audit';
import { writeManagedLines } from './payComponents';
import { arrearFor, arrearAndRecoveryLines, effectiveLop, hasArrear, isRecovery, lopReversalFrom } from './arrearCalc';
import { monthLabel } from './reportHtml';

const r2 = (n: number) => Math.round(n * 100) / 100;

const settingsFor = (organizationId: string) =>
  prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });

// Recompute one draft entry from its inputs and lines as they now stand.
export async function recomputeEntry(organizationId: string, entryId: string, patch: Record<string, any> = {}) {
  const entry = await prisma.payslipEntry.findFirst({
    where: { id: entryId, organizationId },
    include: { run: true, lines: true, person: { select: { workLocation: { select: LOCATION_FOR_PAYROLL } } } },
  });
  if (!entry) throw new AppError(404, 'Payslip entry not found');
  if (entry.run.status !== 'DRAFT') throw new AppError(400, 'This run is finalized. Reopen it to make changes.');
  const ctx = await loadStatutoryContext(organizationId, entry.run.period);
  const merged = { ...entry, ...patch };
  const computed = computeFullEntry(ctx, merged, entry.lines, {
    personId: entry.personId, ...locationOptions(entry.person.workLocation),
    ptOverride: entry.ptOverridden ? entry.professionalTax : null,
    tdsOverride: entry.tdsOverridden ? entry.tds : null,
  });
  const updated = await prisma.payslipEntry.update({ where: { id: entry.id }, data: { ...patch, ...computed } });
  await saveTaxWorkings(ctx.tax, organizationId, entry.runId);
  return updated;
}

// Put a payslip's arrear lines in step with the arrears attached to it.
export async function syncArrearLines(organizationId: string, entryId: string) {
  const items = await prisma.arrearItem.findMany({ where: { paidEntryId: entryId, status: 'OPEN' } });
  const { pay, recover } = arrearAndRecoveryLines(items);
  await writeManagedLines(organizationId, entryId, 'ARREAR', {
    SALARY_ARREARS: pay.earnings, PF_ON_ARREARS: pay.pf, ESI_ON_ARREARS: pay.esi,
    SALARY_RECOVERY: recover.earnings, PF_ON_RECOVERY: recover.pf, ESI_ON_RECOVERY: recover.esi,
  });
  await recomputeEntry(organizationId, entryId);
}

// Attach every waiting arrear to its employee's payslip in a draft run.
// Arrears are paid in a later month than the one they correct.
export async function attachOpenArrears(organizationId: string, runId: string, personId?: string): Promise<number> {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, organizationId },
    include: { entries: { where: personId ? { personId } : {}, select: { id: true, personId: true } } },
  });
  if (!run || run.status !== 'DRAFT' || run.inputsLockedAt) return 0;
  const entryOf = new Map(run.entries.map(e => [e.personId, e.id]));
  const waiting = await prisma.arrearItem.findMany({
    where: {
      organizationId, status: 'OPEN', paidEntryId: null, sourcePeriod: { lt: run.period },
      personId: { in: [...entryOf.keys()] },
    },
  });
  const touched = new Set<string>();
  for (const item of waiting) {
    const entryId = entryOf.get(item.personId)!;
    await prisma.arrearItem.update({ where: { id: item.id }, data: { paidEntryId: entryId } });
    touched.add(entryId);
  }
  for (const entryId of touched) await syncArrearLines(organizationId, entryId);
  return waiting.length;
}

// The draft run an arrear raised now would be paid in: the earliest open
// one that has the employee and is later than the month corrected.
async function attachToOpenRun(organizationId: string, personId: string) {
  const runs = await prisma.payrollRun.findMany({
    where: { organizationId, status: 'DRAFT', inputsLockedAt: null, entries: { some: { personId } } },
    orderBy: { period: 'asc' },
  });
  for (const run of runs) {
    if (await attachOpenArrears(organizationId, run.id, personId)) return run.period;
  }
  return null;
}

const raisedFor = (items: any[], entryId: string) => items.filter(i => i.sourceEntryId === entryId && i.status === 'OPEN');

// After a back-dated revision: arrears for every finalized month from the
// effective month on, each for what that month is now short by. A month
// that was overpaid (a back-dated cut) is only counted, unless `recover`
// is asked for: taking pay back is decided each time, never assumed.
export async function raiseRevisionArrears(
  req: any, personId: string, fromMonth: string, revisionId: string, opts: { recover?: boolean } = {},
) {
  const organizationId = req.user?.organizationId;
  const [person, settings, entries, existing] = await Promise.all([
    prisma.person.findFirst({ where: { id: personId, organizationId }, include: { salaryRevisions: true } }),
    settingsFor(organizationId),
    prisma.payslipEntry.findMany({
      where: { organizationId, personId, run: { status: 'FINALIZED', period: { gte: fromMonth } } },
      include: { run: { select: { period: true } } },
    }),
    prisma.arrearItem.findMany({ where: { organizationId, personId, status: 'OPEN' } }),
  ]);
  if (!person) return { months: 0, amount: 0, reductions: 0, reductionAmount: 0, recovered: 0, paidIn: null as string | null };
  const createdByName = await actorName(req.user?.userId);
  let months = 0, amount = 0, reductions = 0, reductionAmount = 0, recovered = 0;
  for (const e of entries.sort((a, b) => a.run.period.localeCompare(b.run.period))) {
    const raised = raisedFor(existing, e.id);
    const toPackage = packageForPeriod(person.currentMonthlyPackage, person.salaryRevisions, e.run.period);
    const a = arrearFor(e, { monthlyPackage: toPackage, lopDays: effectiveLop(e.lopDays, raised) }, settings, raised);
    if (!hasArrear(a)) continue;
    const takesBack = a.gross <= 0;
    if (takesBack) {
      reductions++;
      reductionAmount = r2(reductionAmount - a.gross);
      if (!opts.recover) continue;
      recovered++;
    }
    await prisma.arrearItem.create({
      data: {
        organizationId, personId, kind: 'REVISION', sourcePeriod: e.run.period, sourceEntryId: e.id, revisionId,
        fromPackage: e.monthlyPackage, toPackage, ...a, createdByName,
        reason: `Package revised from ${monthLabel(fromMonth)}`,
      },
    });
    if (takesBack) continue;
    months++;
    amount = r2(amount + a.gross);
  }
  const paidIn = months || recovered ? await attachToOpenRun(organizationId, personId) : null;
  await logPayrollAudit(req, [
    ...(months ? [{
      action: 'ARREAR_RAISED' as const, personId, personName: person.name, period: fromMonth,
      field: 'Salary arrears', newValue: `${amount} for ${months} month${months === 1 ? '' : 's'}`, source: 'REVISION' as const,
    }] : []),
    ...(recovered ? [{
      action: 'ARREAR_RAISED' as const, personId, personName: person.name, period: fromMonth,
      field: 'Salary recovery', newValue: `${reductionAmount} for ${recovered} month${recovered === 1 ? '' : 's'}`, source: 'REVISION' as const,
    }] : []),
  ]);
  return { months, amount, reductions, reductionAmount, recovered, paidIn };
}

// Removing a revision takes its unpaid arrears with it; paid ones block it.
export async function cancelRevisionArrears(organizationId: string, revisionId: string) {
  const items = await prisma.arrearItem.findMany({
    where: { organizationId, revisionId, status: 'OPEN' },
    include: { paidEntry: { select: { id: true, run: { select: { status: true, period: true } } } } },
  });
  const paid = items.find(i => i.paidEntry?.run.status === 'FINALIZED');
  if (paid) {
    throw new AppError(400, `Arrears from this revision were paid with ${monthLabel(paid.paidEntry!.run.period)} salary. It can no longer be removed; record a new revision instead.`);
  }
  const entries = new Set(items.map(i => i.paidEntryId).filter(Boolean) as string[]);
  await prisma.arrearItem.updateMany({
    where: { id: { in: items.map(i => i.id) } }, data: { status: 'CANCELLED', cancelledAt: new Date(), paidEntryId: null },
  });
  for (const entryId of entries) await syncArrearLines(organizationId, entryId);
  return items.length;
}

// The month arrears raised now would be paid in, for the reversal window.
async function payingPeriod(organizationId: string) {
  const draft = await prisma.payrollRun.findFirst({ where: { organizationId, status: 'DRAFT' }, orderBy: { period: 'asc' } });
  return draft?.period || currentPeriodIST();
}

// Months of an employee whose loss of pay can still be reversed.
export async function reversibleLopMonths(organizationId: string, personId: string) {
  const [settings, paying] = await Promise.all([settingsFor(organizationId), payingPeriod(organizationId)]);
  const from = lopReversalFrom(paying, settings.lopReversalMonths);
  const entries = await prisma.payslipEntry.findMany({
    where: { organizationId, personId, run: { status: 'FINALIZED', period: { gte: from, lt: paying } } },
    include: { run: { select: { period: true } }, arrearsRaised: { where: { status: 'OPEN' } } },
    orderBy: { run: { period: 'desc' } },
  });
  const months = entries.map(e => {
    const left = effectiveLop(e.lopDays, e.arrearsRaised);
    return {
      entryId: e.id, period: e.run.period, lopDays: e.lopDays, left,
      reversed: r2(e.arrearsRaised.filter(i => i.kind === 'LOP_REVERSAL').reduce((s, i) => s + i.lopDays, 0)),
      added: r2(e.arrearsRaised.filter(i => i.kind === 'LOP_RECOVERY').reduce((s, i) => s + i.lopDays, 0)),
      // Days still paid, which is the most loss of pay that can be added
      canAdd: r2(Math.max(0, e.totalWorkingDays - left)),
    };
  });
  return {
    from, paying, months: settings.lopReversalMonths,
    entries: months.filter(e => e.left > 0),  // months with loss of pay to reverse
    paidMonths: months.filter(e => e.canAdd > 0), // months loss of pay can be added to
  };
}

// The package a past month is now paid at: its revised one where revision
// arrears were raised for it, else the one on its payslip.
const packageNow = (entry: any) => (entry.arrearsRaised.some((i: any) => i.kind === 'REVISION')
  ? packageForPeriod(entry.person.currentMonthlyPackage, entry.person.salaryRevisions, entry.run.period)
  : entry.monthlyPackage);

// A finalized month inside the window loss of pay can be changed for.
async function lopEntry(organizationId: string, entryId: string) {
  const entry = await prisma.payslipEntry.findFirst({
    where: { id: entryId, organizationId },
    include: {
      run: true, arrearsRaised: { where: { status: 'OPEN' } },
      person: { select: { name: true, currentMonthlyPackage: true, salaryRevisions: true } },
    },
  });
  if (!entry) throw new AppError(404, 'Payslip entry not found');
  if (entry.run.status !== 'FINALIZED') throw new AppError(400, 'That month is still a draft. Change the loss of pay on the payslip itself.');
  const [settings, paying] = await Promise.all([settingsFor(organizationId), payingPeriod(organizationId)]);
  const from = lopReversalFrom(paying, settings.lopReversalMonths);
  if (entry.run.period < from) {
    throw new AppError(400, `Loss of pay can be changed up to ${settings.lopReversalMonths} months back (from ${monthLabel(from)}).`);
  }
  return { entry, settings };
}

// Loss of pay found after a month was finalized: the days are added to
// that month and the pay for them is taken back on the next payslip, with
// the PF and ESI deducted on that pay returned.
export async function addRetroLop(req: any, entryId: string, days: number, reason: string) {
  const organizationId = req.user?.organizationId;
  const { entry, settings } = await lopEntry(organizationId, entryId);
  const now = effectiveLop(entry.lopDays, entry.arrearsRaised);
  const canAdd = r2(Math.max(0, entry.totalWorkingDays - now));
  if (!(days > 0) || days > canAdd) {
    throw new AppError(400, canAdd > 0 ? `Enter between 0.5 and ${canAdd} days` : 'Every day of this month is already loss of pay');
  }
  const toPackage = packageNow(entry);
  const a = arrearFor(entry, { monthlyPackage: toPackage, lopDays: r2(now + days) }, settings, entry.arrearsRaised);
  if (!hasArrear(a) || !isRecovery(a)) throw new AppError(400, 'Adding these days changes nothing');
  const item = await prisma.arrearItem.create({
    data: {
      organizationId, personId: entry.personId, kind: 'LOP_RECOVERY', sourcePeriod: entry.run.period, sourceEntryId: entry.id,
      lopDays: days, fromPackage: entry.monthlyPackage, toPackage, ...a, reason,
      createdByName: await actorName(req.user?.userId),
    },
  });
  const paidIn = await attachToOpenRun(organizationId, entry.personId);
  await logPayrollAudit(req, [{
    action: 'ARREAR_RAISED', personId: entry.personId, personName: entry.person.name, period: entry.run.period,
    field: 'Loss of pay added', newValue: `${days} day${days === 1 ? '' : 's'}, ${a.gross}${reason ? ` — ${reason}` : ''}`,
  }]);
  return { item, paidIn };
}

// Undo loss-of-pay days of a finalized month and pay the difference.
export async function reverseLop(req: any, entryId: string, days: number, reason: string) {
  const organizationId = req.user?.organizationId;
  const { entry, settings } = await lopEntry(organizationId, entryId);
  const left = effectiveLop(entry.lopDays, entry.arrearsRaised);
  if (!(days > 0) || days > left) {
    throw new AppError(400, left > 0 ? `Enter between 0.5 and ${left} days` : 'This month has no loss of pay left to reverse');
  }
  const toPackage = packageNow(entry);
  const a = arrearFor(entry, { monthlyPackage: toPackage, lopDays: r2(left - days) }, settings, entry.arrearsRaised);
  if (!hasArrear(a) || a.gross <= 0) throw new AppError(400, 'Reversing these days changes nothing');
  const item = await prisma.arrearItem.create({
    data: {
      organizationId, personId: entry.personId, kind: 'LOP_REVERSAL', sourcePeriod: entry.run.period, sourceEntryId: entry.id,
      lopDays: days, fromPackage: entry.monthlyPackage, toPackage, ...a, reason,
      createdByName: await actorName(req.user?.userId),
    },
  });
  const paidIn = await attachToOpenRun(organizationId, entry.personId);
  await logPayrollAudit(req, [{
    action: 'ARREAR_RAISED', personId: entry.personId, personName: entry.person.name, period: entry.run.period,
    field: 'Loss of pay reversed', newValue: `${days} day${days === 1 ? '' : 's'}, ${a.gross}${reason ? ` — ${reason}` : ''}`,
  }]);
  return { item, paidIn };
}

export async function cancelArrear(req: any, itemId: string, reason: string) {
  const organizationId = req.user?.organizationId;
  const item = await prisma.arrearItem.findFirst({
    where: { id: itemId, organizationId },
    include: { person: { select: { name: true } }, paidEntry: { select: { run: { select: { status: true, period: true } } } } },
  });
  if (!item) throw new AppError(404, 'Arrear not found');
  if (item.status !== 'OPEN') throw new AppError(400, 'This arrear is already cancelled');
  if (item.paidEntry?.run.status === 'FINALIZED') {
    throw new AppError(400, `This arrear was paid with ${monthLabel(item.paidEntry.run.period)} salary.`);
  }
  const entryId = item.paidEntryId;
  await prisma.arrearItem.update({
    where: { id: item.id }, data: { status: 'CANCELLED', cancelledAt: new Date(), paidEntryId: null, reason: [item.reason, reason].filter(Boolean).join(' · ') },
  });
  if (entryId) await syncArrearLines(organizationId, entryId);
  await logPayrollAudit(req, [{
    action: 'ARREAR_CANCELLED', personId: item.personId, personName: item.person.name, period: item.sourcePeriod,
    field: item.kind === 'LOP_REVERSAL' ? 'Loss of pay reversal' : item.kind === 'LOP_RECOVERY' ? 'Loss of pay added'
      : item.gross < 0 ? 'Salary recovery' : 'Salary arrears',
    oldValue: String(item.gross), newValue: reason,
  }]);
}
