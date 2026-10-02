// Run workflow beyond draft/finalized (input locks, salary holds), payout
// batches and their bank file, payment settings, the journal ledger
// mapping, and expense claims paid with salary.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logPayrollAudit, actorName, diffFields } from '../services/payroll/audit';
import { todayIST } from '../services/payroll/loanLedger';
import { monthLabel } from '../services/payroll/reportHtml';
import {
  PAYMENT_MODES, modeLabel, payAmount, hasBankDetails, runStage, bankFileCsv, jvAccounts,
  payableOutside, paidOutside, outsidePayDate,
} from '../services/payroll/payoutCalc';
import { claimTotal, syncReimbursement } from '../services/payroll/payout';
import { ensureListValues } from '../services/listValues';
import { JV_SPLITS, isJvSplit } from '../services/payroll/payoutCalc';
import { takeNumber } from '../services/numberSeries';
import { stampRun } from '../services/positions';

const str = (v: any) => String(v ?? '').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const MODES = PAYMENT_MODES.map(m => m.value);
const PAYOUT_SETTINGS = ['payoutBankName', 'payoutBranch', 'payoutAccountNumber', 'payoutIfsc'];
const PAYOUT_FLAGS = ['autoReleaseOnFinalize', 'autoCreateNextRun'];
const LEDGER_DIMENSIONS = ['DEPARTMENT', 'LOCATION'];

const PERSON_PAY = {
  id: true, name: true, employeeNo: true, designation: true, department: true,
  paymentMode: true, bankName: true, bankAccountNumber: true, ifscCode: true,
};

function dateInput(value: any, fallback?: string): string {
  const date = str(value) || fallback || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) throw new AppError(400, 'Enter a valid date');
  return date;
}

async function fetchRun(runId: string, organizationId: string) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, organizationId },
    include: {
      entries: { include: { person: { select: PERSON_PAY }, payoutBatch: true } },
      payoutBatches: { orderBy: { batchNo: 'asc' }, include: { bankAccount: true } },
    },
  });
  if (!run) throw new AppError(404, 'Payroll run not found');
  await stampRun(organizationId, run);
  return run;
}

async function fetchBatch(batchId: string, organizationId: string) {
  const batch = await prisma.payoutBatch.findFirst({
    where: { id: batchId, organizationId },
    include: {
      run: true,
      entries: { include: { person: { select: PERSON_PAY } } },
    },
  });
  if (!batch) throw new AppError(404, 'Payment batch not found');
  await stampRun(organizationId, { period: batch.run.period, entries: batch.entries });
  batch.entries.sort((a, b) => a.person.name.localeCompare(b.person.name));
  return batch;
}

async function fetchEntry(entryId: string, organizationId: string) {
  const entry = await prisma.payslipEntry.findFirst({
    where: { id: entryId, organizationId },
    include: { run: true, person: { select: { id: true, name: true } }, payoutBatch: true },
  });
  if (!entry) throw new AppError(404, 'Payslip entry not found');
  return entry;
}

// Earlier finalized months with no payment recorded at all: nothing paid
// and no batch. These are the months run before payout tracking was used.
async function earlierUnpaidRuns(organizationId: string, period: string) {
  const runs = await prisma.payrollRun.findMany({
    where: { organizationId, status: 'FINALIZED', period: { lt: period }, payoutBatches: { none: {} } },
    select: {
      id: true, period: true,
      entries: { select: { id: true, paidOn: true, payStatus: true, payoutBatchId: true, netPayable: true, reimbursement: true } },
    },
    orderBy: { period: 'asc' },
  });
  return runs
    .filter(r => !r.entries.some(e => e.paidOn) && payableOutside(r.entries).length > 0)
    .map(r => ({ id: r.id, period: r.period, count: payableOutside(r.entries).length }));
}

const settingsFor = (organizationId: string) =>
  prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });

// Where an entry stands in the payout.
function payState(entry: any): 'PAID' | 'IN_BATCH' | 'HELD' | 'UNPAID' | 'NOTHING' {
  if (entry.paidOn) return 'PAID';
  if (entry.payStatus === 'HOLD') return 'HELD';
  if (entry.payoutBatchId) return 'IN_BATCH';
  return payAmount(entry) > 0 ? 'UNPAID' : 'NOTHING';
}

const accountLabel = (a: any) => (a ? `${a.label || a.bankName} …${String(a.accountNumber).slice(-4)}` : '');

const batchSummary = (batch: any, entries: any[]) => ({
  id: batch.id, batchNo: batch.batchNo, batchRef: batch.batchRef || '', mode: batch.mode, modeLabel: modeLabel(batch.mode),
  bankAccountId: batch.bankAccountId ?? null, bankAccount: accountLabel(batch.bankAccount),
  payDate: batch.payDate, reference: batch.reference, status: batch.status, notes: batch.notes,
  createdBy: batch.createdBy, paidAt: batch.paidAt,
  count: entries.length, total: r2(entries.reduce((s, e) => s + payAmount(e), 0)),
});

export const payrollPayoutController = {
  // ---- Input lock ---------------------------------------------------------------
  async lockInputs(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await prisma.payrollRun.findFirst({ where: { id: req.params.runId, organizationId } });
    if (!run) throw new AppError(404, 'Payroll run not found');
    if (run.status !== 'DRAFT') throw new AppError(400, 'This run is already finalized');
    const updated = await prisma.payrollRun.update({ where: { id: run.id }, data: { inputsLockedAt: new Date() } });
    await logPayrollAudit(req, [{ action: 'INPUTS_LOCKED', runId: run.id, period: run.period }]);
    res.json(updated);
  },

  async unlockInputs(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await prisma.payrollRun.findFirst({ where: { id: req.params.runId, organizationId } });
    if (!run) throw new AppError(404, 'Payroll run not found');
    if (run.status !== 'DRAFT') throw new AppError(400, 'This run is finalized. Reopen it to make changes.');
    const updated = await prisma.payrollRun.update({ where: { id: run.id }, data: { inputsLockedAt: null } });
    await logPayrollAudit(req, [{ action: 'INPUTS_UNLOCKED', runId: run.id, period: run.period }]);
    res.json(updated);
  },

  // ---- Hold and release a salary ------------------------------------------------
  // A held salary is computed and stays on the register, but is left out
  // of payment batches and hidden from the employee until released.
  async holdEntry(req: any, res: Response) {
    const entry = await fetchEntry(req.params.entryId, req.user?.organizationId);
    if (entry.paidOn) throw new AppError(400, 'This salary is already paid');
    if (entry.payoutBatchId) throw new AppError(400, 'This salary is in a payment batch. Take it out of the batch first.');
    const reason = str(req.body.reason);
    if (!reason) throw new AppError(400, 'Give a reason for holding the salary');
    const updated = await prisma.payslipEntry.update({
      where: { id: entry.id },
      data: { payStatus: 'HOLD', holdReason: reason, heldAt: new Date(), holdReleasedAt: null },
    });
    await ensureListValues(req.user?.organizationId, { HOLD_REASON: reason });
    await logPayrollAudit(req, [{
      action: 'SALARY_HELD', runId: entry.runId, entryId: entry.id, personId: entry.personId,
      period: entry.run.period, personName: entry.person.name, newValue: reason,
    }]);
    res.json(updated);
  },

  async releaseEntry(req: any, res: Response) {
    const entry = await fetchEntry(req.params.entryId, req.user?.organizationId);
    if (entry.payStatus !== 'HOLD') throw new AppError(400, 'This salary is not on hold');
    const updated = await prisma.payslipEntry.update({
      where: { id: entry.id },
      data: { payStatus: 'PAY', holdReleasedAt: new Date() },
    });
    await logPayrollAudit(req, [{
      action: 'SALARY_HOLD_RELEASED', runId: entry.runId, entryId: entry.id, personId: entry.personId,
      period: entry.run.period, personName: entry.person.name, oldValue: entry.holdReason,
    }]);
    res.json(updated);
  },

  // ---- An employee's payment mode and salary stop ------------------------------
  async getPaySettings(req: any, res: Response) {
    const person = await prisma.person.findFirst({
      where: { id: req.params.personId, organizationId: req.user?.organizationId },
      select: {
        id: true, paymentMode: true, salaryStopped: true, salaryStopReason: true,
        bankName: true, bankAccountNumber: true, ifscCode: true,
      },
    });
    if (!person) throw new AppError(404, 'Person not found');
    const held = await prisma.payslipEntry.findMany({
      where: { personId: person.id, payStatus: 'HOLD' },
      select: { id: true, runId: true, netPayable: true, reimbursement: true, holdReason: true, run: { select: { period: true } } },
      orderBy: { run: { period: 'asc' } },
    });
    res.json({
      paymentMode: person.paymentMode, salaryStopped: person.salaryStopped, salaryStopReason: person.salaryStopReason,
      hasBankDetails: hasBankDetails(person), modes: PAYMENT_MODES,
      held: held.map(e => ({ id: e.id, runId: e.runId, period: e.run.period, amount: payAmount(e), reason: e.holdReason })),
    });
  },

  async updatePaySettings(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const before = await prisma.person.findFirst({ where: { id: req.params.personId, organizationId } });
    if (!before) throw new AppError(404, 'Person not found');
    const b = req.body;
    const data: any = {};
    if (b.paymentMode !== undefined) {
      if (!MODES.includes(b.paymentMode)) throw new AppError(400, 'Pick a payment mode');
      data.paymentMode = b.paymentMode;
    }
    if (b.salaryStopped !== undefined) data.salaryStopped = Boolean(b.salaryStopped);
    if (b.salaryStopReason !== undefined) data.salaryStopReason = str(b.salaryStopReason);
    const stopped = data.salaryStopped ?? before.salaryStopped;
    if (stopped && !(data.salaryStopReason ?? before.salaryStopReason)) {
      throw new AppError(400, 'Give a reason for stopping the salary');
    }
    if (!stopped) data.salaryStopReason = '';
    const updated = await prisma.person.update({ where: { id: before.id }, data });
    await ensureListValues(organizationId, { STOP_REASON: updated.salaryStopReason });
    await logPayrollAudit(req, diffFields(before, updated, ['paymentMode', 'salaryStopped', 'salaryStopReason'])
      .map(c => ({ action: 'PAY_SETTINGS_UPDATED' as const, personId: before.id, personName: before.name, ...c })));
    res.json({ paymentMode: updated.paymentMode, salaryStopped: updated.salaryStopped, salaryStopReason: updated.salaryStopReason });
  },

  // ---- Payout of a run ------------------------------------------------------------
  async getPayout(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const entries = [...run.entries].sort((a, b) => a.person.name.localeCompare(b.person.name));
    const rows = entries.map(e => ({
      id: e.id,
      person: { id: e.person.id, name: e.person.name, employeeNo: e.person.employeeNo },
      mode: e.payoutBatch?.mode || e.person.paymentMode, modeLabel: modeLabel(e.payoutBatch?.mode || e.person.paymentMode),
      hasBankDetails: hasBankDetails(e.person),
      netPayable: e.netPayable, reimbursement: e.reimbursement, amount: payAmount(e),
      state: payState(e), holdReason: e.holdReason, heldAt: e.heldAt, holdReleasedAt: e.holdReleasedAt,
      batchId: e.payoutBatchId, batchNo: e.payoutBatch?.batchNo ?? null,
      paidOn: e.paidOn, paymentRef: e.paymentRef,
    }));
    const of = (state: string) => rows.filter(r => r.state === state);
    const total = (list: typeof rows) => ({ count: list.length, amount: r2(list.reduce((s, r) => s + r.amount, 0)) });
    const unpaid = of('UNPAID');
    const idsOf = (list: any[]) => new Set(list.map(e => e.id));
    const canMark = idsOf(payableOutside(run.entries));
    const markedOutside = idsOf(paidOutside(run.entries));
    const earlierMonths = await earlierUnpaidRuns(organizationId, run.period);
    const bankAccounts = await prisma.companyBankAccount.findMany({
      where: { organizationId, isActive: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({
      run: { id: run.id, period: run.period, status: run.status, releasedAt: run.releasedAt },
      stage: runStage(run, run.entries),
      // The company accounts a bank batch can be paid from, default first
      bankAccounts: bankAccounts.map(a => ({ id: a.id, name: accountLabel(a), isDefault: a.isDefault })),
      modes: PAYMENT_MODES,
      today: todayIST(),
      // Marking the month as paid outside the system
      outside: {
        payable: total(rows.filter(r => canMark.has(r.id))),
        paid: total(rows.filter(r => markedOutside.has(r.id))),
        suggestedDate: outsidePayDate(run.period, todayIST()),
        earlierMonths,
      },
      entries: rows,
      batches: run.payoutBatches.map(b => batchSummary(b, run.entries.filter(e => e.payoutBatchId === b.id))),
      totals: {
        payable: total(rows.filter(r => r.state !== 'HELD' && r.state !== 'NOTHING')),
        paid: total(of('PAID')), inBatch: total(of('IN_BATCH')), unpaid: total(unpaid), held: total(of('HELD')),
      },
      // What is still to be put in a batch, by payment mode
      unpaidByMode: PAYMENT_MODES.map(m => {
        const list = unpaid.filter(r => r.mode === m.value);
        const ready = m.value === 'BANK' ? list.filter(r => r.hasBankDetails) : list;
        return { mode: m.value, label: m.label, ...total(ready), missingBank: list.length - ready.length };
      }).filter(m => m.count || m.missingBank),
    });
  },

  // A batch takes every unpaid salary of one payment mode (or the ones
  // picked). Bank transfers need account details; held salaries stay out.
  async createBatch(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    if (run.status !== 'FINALIZED') throw new AppError(400, 'Finalize the run before paying it');
    const mode = str(req.body.mode);
    if (!MODES.includes(mode)) throw new AppError(400, 'Pick a payment mode');
    const payDate = dateInput(req.body.payDate, todayIST());
    const picked: string[] | null = Array.isArray(req.body.entryIds) ? req.body.entryIds.map(String) : null;
    const eligible = run.entries.filter(e =>
      payState(e) === 'UNPAID' && e.person.paymentMode === mode
      && (mode !== 'BANK' || hasBankDetails(e.person))
      && (!picked || picked.includes(e.id)));
    if (eligible.length === 0) {
      throw new AppError(400, `No unpaid ${modeLabel(mode).toLowerCase()} salaries to put in a batch`);
    }
    // A bank batch is paid from the account picked, else the default one
    let bankAccount: any = null;
    if (mode === 'BANK') {
      const accounts = await prisma.companyBankAccount.findMany({ where: { organizationId, isActive: true } });
      bankAccount = req.body.bankAccountId
        ? accounts.find(a => a.id === str(req.body.bankAccountId))
        : accounts.find(a => a.isDefault) || accounts[0] || null;
      if (req.body.bankAccountId && !bankAccount) throw new AppError(400, 'Pick the company account the batch is paid from');
    }
    const last = await prisma.payoutBatch.findFirst({ where: { organizationId }, orderBy: { batchNo: 'desc' }, select: { batchNo: true } });
    const batch = await prisma.payoutBatch.create({
      data: {
        organizationId, runId: run.id, batchNo: (last?.batchNo || 0) + 1, mode, payDate,
        // A reference from the number series, when one is set up
        batchRef: (await takeNumber(organizationId, 'PAYOUT_BATCH')) || '',
        bankAccountId: bankAccount?.id ?? null,
        reference: str(req.body.reference), notes: str(req.body.notes),
        createdBy: await actorName(req.user?.userId),
      },
    });
    await prisma.payslipEntry.updateMany({ where: { id: { in: eligible.map(e => e.id) } }, data: { payoutBatchId: batch.id } });
    const summary = batchSummary({ ...batch, bankAccount }, eligible);
    await logPayrollAudit(req, [{
      action: 'PAYOUT_BATCH_CREATED', runId: run.id, period: run.period,
      field: `Batch ${batch.batchNo}`, newValue: `${modeLabel(mode)}: ${summary.count} salaries, ${summary.total}`,
    }]);
    res.status(201).json(summary);
  },

  async getBatch(req: any, res: Response) {
    const batch = await fetchBatch(req.params.batchId, req.user?.organizationId);
    res.json({
      ...batchSummary(batch, batch.entries),
      run: { id: batch.run.id, period: batch.run.period },
      entries: batch.entries.map(e => ({
        id: e.id, person: { id: e.person.id, name: e.person.name, employeeNo: e.person.employeeNo },
        bankName: e.person.bankName, bankAccountNumber: e.person.bankAccountNumber, ifscCode: e.person.ifscCode,
        amount: payAmount(e), paidOn: e.paidOn, paymentRef: e.paymentRef,
      })),
    });
  },

  // Payment made: every salary in the batch is marked paid on the date.
  // Cheque numbers typed per employee are kept; the rest take the batch reference.
  async markBatchPaid(req: any, res: Response) {
    const batch = await fetchBatch(req.params.batchId, req.user?.organizationId);
    if (batch.status === 'PAID') throw new AppError(400, 'This batch is already marked paid');
    const payDate = dateInput(req.body.payDate, batch.payDate);
    const reference = req.body.reference !== undefined ? str(req.body.reference) : batch.reference;
    const refs: Record<string, string> = req.body.refs && typeof req.body.refs === 'object' ? req.body.refs : {};
    await prisma.$transaction([
      prisma.payoutBatch.update({ where: { id: batch.id }, data: { status: 'PAID', payDate, reference, paidAt: new Date() } }),
      ...batch.entries.map(e => prisma.payslipEntry.update({
        where: { id: e.id },
        data: { paidOn: payDate, paymentRef: str(refs[e.id]) || e.paymentRef || reference },
      })),
    ]);
    await logPayrollAudit(req, [{
      action: 'PAYOUT_BATCH_PAID', runId: batch.runId, period: batch.run.period,
      field: `Batch ${batch.batchNo}`, newValue: `Paid on ${payDate}${reference ? `, ref ${reference}` : ''}`,
    }]);
    res.json({ message: `Batch ${batch.batchNo} marked paid` });
  },

  // Salaries paid before payout tracking was in use, or paid some other
  // way: every unpaid salary of the run is marked paid on the date given,
  // with no batch and no bank file. Held salaries and salaries already in
  // a batch are left alone. `earlier` does the same for earlier finalized
  // months that have nothing recorded, each on its own month's last day.
  async markPaidOutside(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    if (run.status !== 'FINALIZED') throw new AppError(400, 'Finalize the run before marking it paid');
    const payDate = dateInput(req.body.payDate, outsidePayDate(run.period, todayIST()));
    const reference = str(req.body.reference).slice(0, 100) || 'Paid outside the system';
    const targets: { run: any; payDate: string }[] = [{ run, payDate }];
    if (req.body.earlier) {
      for (const r of await earlierUnpaidRuns(organizationId, run.period)) {
        targets.push({ run: await fetchRun(r.id, organizationId), payDate: outsidePayDate(r.period, todayIST()) });
      }
    }
    const marked: { period: string; count: number; amount: number; payDate: string; runId: string }[] = [];
    for (const t of targets) {
      const entries = payableOutside(t.run.entries);
      if (entries.length === 0) continue;
      await prisma.payslipEntry.updateMany({
        where: { id: { in: entries.map((e: any) => e.id) } },
        data: { paidOn: t.payDate, paymentRef: reference },
      });
      marked.push({
        period: t.run.period, runId: t.run.id, count: entries.length, payDate: t.payDate,
        amount: r2(entries.reduce((s: number, e: any) => s + payAmount(e), 0)),
      });
    }
    if (marked.length === 0) throw new AppError(400, 'There are no unpaid salaries to mark');
    await logPayrollAudit(req, marked.map(m => ({
      action: 'PAID_OUTSIDE_MARKED' as const, runId: m.runId, period: m.period,
      newValue: `${m.count} salaries, ${m.amount}, paid on ${m.payDate} (${reference})`,
    })));
    const count = marked.reduce((s, m) => s + m.count, 0);
    res.json({
      marked,
      message: marked.length === 1
        ? `${count} ${count === 1 ? 'salary' : 'salaries'} marked as paid on ${marked[0].payDate}.`
        : `${count} salaries across ${marked.length} months marked as paid.`,
    });
  },

  // Undo for this run: salaries marked paid outside the system show as unpaid again.
  async undoPaidOutside(req: any, res: Response) {
    const run = await fetchRun(req.params.runId, req.user?.organizationId);
    const entries = paidOutside(run.entries);
    if (entries.length === 0) throw new AppError(400, 'No salary of this run is marked as paid outside the system');
    await prisma.payslipEntry.updateMany({
      where: { id: { in: entries.map(e => e.id) } }, data: { paidOn: null, paymentRef: '' },
    });
    await logPayrollAudit(req, [{
      action: 'PAID_OUTSIDE_UNDONE', runId: run.id, period: run.period,
      oldValue: `${entries.length} salaries, ${r2(entries.reduce((s, e) => s + payAmount(e), 0))}`,
    }]);
    res.json({ message: `${entries.length} ${entries.length === 1 ? 'salary shows' : 'salaries show'} as unpaid again.` });
  },

  // Take one salary out of a batch that has not been paid yet.
  async removeFromBatch(req: any, res: Response) {
    const entry = await fetchEntry(req.params.entryId, req.user?.organizationId);
    if (!entry.payoutBatch) throw new AppError(400, 'This salary is not in a payment batch');
    if (entry.payoutBatch.status === 'PAID') throw new AppError(400, 'The batch is already paid. Delete the batch to undo the payment.');
    await prisma.payslipEntry.update({ where: { id: entry.id }, data: { payoutBatchId: null, paymentRef: '' } });
    await logPayrollAudit(req, [{
      action: 'PAYOUT_BATCH_CHANGED', runId: entry.runId, entryId: entry.id, personId: entry.personId,
      period: entry.run.period, personName: entry.person.name,
      field: `Batch ${entry.payoutBatch.batchNo}`, newValue: 'Taken out of the batch',
    }]);
    res.json({ message: 'Taken out of the batch' });
  },

  // Deleting a batch undoes it: its salaries become unpaid again.
  async deleteBatch(req: any, res: Response) {
    const batch = await fetchBatch(req.params.batchId, req.user?.organizationId);
    await prisma.$transaction([
      prisma.payslipEntry.updateMany({ where: { payoutBatchId: batch.id }, data: { paidOn: null, paymentRef: '' } }),
      prisma.payoutBatch.delete({ where: { id: batch.id } }),
    ]);
    await logPayrollAudit(req, [{
      action: 'PAYOUT_BATCH_DELETED', runId: batch.runId, period: batch.run.period,
      field: `Batch ${batch.batchNo}`,
      oldValue: `${modeLabel(batch.mode)}: ${batch.entries.length} salaries, ${batch.status === 'PAID' ? 'paid' : 'not paid'}`,
    }]);
    res.json({ message: `Deleted batch ${batch.batchNo}` });
  },

  // The transfer list for the bank: a CSV any bulk-upload template can be filled from.
  async bankFile(req: any, res: Response) {
    const batch = await fetchBatch(req.params.batchId, req.user?.organizationId);
    if (batch.mode !== 'BANK') throw new AppError(400, 'Only bank transfer batches have a bank file');
    const narration = `Salary ${monthLabel(batch.run.period)}`;
    res.json({
      filename: `bank-transfer-${batch.run.period}-batch-${batch.batchNo}.csv`,
      content: bankFileCsv(batch.entries, narration),
      members: batch.entries.length,
      total: r2(batch.entries.reduce((s, e) => s + payAmount(e), 0)),
    });
  },

  // ---- Payout settings and the journal ledger mapping ------------------------------
  async getPayoutSettings(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const [settings, mappings, components, latest, overrides, departments, locations, earlier] = await Promise.all([
      settingsFor(organizationId),
      prisma.ledgerMapping.findMany({ where: { organizationId } }),
      prisma.payComponent.findMany({ where: { organizationId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      prisma.payrollRun.findFirst({ where: { organizationId }, orderBy: { period: 'desc' }, include: { entries: { include: { lines: true } } } }),
      prisma.ledgerOverride.findMany({ where: { organizationId }, orderBy: [{ groupName: 'asc' }, { key: 'asc' }] }),
      prisma.person.findMany({ where: { organizationId, isEmployee: true, NOT: { department: '' } }, select: { department: true }, distinct: ['department'] }),
      prisma.workLocation.findMany({ where: { organizationId }, select: { name: true }, orderBy: { name: 'asc' } }),
      // Departments employees were in earlier: older months still post under them
      prisma.positionChange.findMany({ where: { organizationId, NOT: { department: '' } }, select: { department: true }, distinct: ['department'] }),
    ]);
    // Accounts for every pay component in the catalogue, used or not
    const sample = [{ lines: components.map(c => ({ componentId: c.id, name: c.name, type: c.type, amount: 0 })) }, ...(latest?.entries || [])];
    const mapped = new Map(mappings.map(m => [m.key, m.ledgerName]));
    res.json({
      settings: Object.fromEntries([...PAYOUT_SETTINGS, ...PAYOUT_FLAGS, 'jvSplitBy'].map(f => [f, (settings as any)[f]])),
      // Journal voucher by department or work location, and the ledgers a group has of its own
      jvSplits: JV_SPLITS,
      ledgerOverrides: overrides.map(o => ({ dimension: o.dimension, groupName: o.groupName, key: o.key, ledgerName: o.ledgerName })),
      ledgerGroups: {
        DEPARTMENT: [...new Set([...departments, ...earlier].map(d => d.department))].sort((a, b) => a.localeCompare(b)),
        LOCATION: locations.map(l => l.name),
      },
      accounts: jvAccounts(sample).filter(a => !['esiEmployee', 'pfEmployee', 'lwfEmployee'].includes(a.key))
        .map(a => ({ ...a, ledgerName: mapped.get(a.key) || '' })),
    });
  },

  async updatePayoutSettings(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const before = await settingsFor(organizationId);
    const data: any = {};
    for (const f of PAYOUT_SETTINGS) if (req.body[f] !== undefined) data[f] = str(req.body[f]);
    for (const f of PAYOUT_FLAGS) if (req.body[f] !== undefined) data[f] = Boolean(req.body[f]);
    if (data.payoutIfsc) data.payoutIfsc = data.payoutIfsc.toUpperCase();
    if (req.body.jvSplitBy !== undefined) {
      if (!isJvSplit(req.body.jvSplitBy)) throw new AppError(400, 'Pick how the journal voucher is split');
      data.jvSplitBy = req.body.jvSplitBy;
    }
    const updated = await prisma.payrollSettings.update({ where: { organizationId }, data });
    await logPayrollAudit(req, diffFields(before, updated, [...PAYOUT_SETTINGS, ...PAYOUT_FLAGS, 'jvSplitBy'])
      .map(c => ({ action: 'PAYOUT_SETTINGS_UPDATED' as const, ...c })));
    res.json(Object.fromEntries([...PAYOUT_SETTINGS, ...PAYOUT_FLAGS, 'jvSplitBy'].map(f => [f, (updated as any)[f]])));
  },

  // { mapping: { "<account key>": "<ledger name>" } } — a blank name returns the account to its default ledger.
  async updateLedgerMapping(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const mapping = req.body.mapping;
    if (!mapping || typeof mapping !== 'object') throw new AppError(400, 'Nothing to save');
    const existing = new Map((await prisma.ledgerMapping.findMany({ where: { organizationId } })).map(m => [m.key, m.ledgerName]));
    const audit: any[] = [];
    for (const [key, value] of Object.entries(mapping)) {
      const ledgerName = str(value).slice(0, 120);
      const old = existing.get(key) || '';
      if (ledgerName === old) continue;
      if (ledgerName) {
        await prisma.ledgerMapping.upsert({
          where: { organizationId_key: { organizationId, key } },
          create: { organizationId, key, ledgerName }, update: { ledgerName },
        });
      } else {
        await prisma.ledgerMapping.deleteMany({ where: { organizationId, key } });
      }
      audit.push({ action: 'LEDGER_MAPPING_UPDATED' as const, field: key, oldValue: old || 'Default', newValue: ledgerName || 'Default' });
    }
    await logPayrollAudit(req, audit);
    res.json({ message: audit.length ? `Saved ${audit.length} ledger${audit.length === 1 ? '' : 's'}` : 'Nothing changed' });
  },

  // A ledger of its own for one department or work location. A blank
  // name takes it away: the company's ledger applies again.
  async updateLedgerOverride(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const dimension = str(req.body.dimension);
    if (!LEDGER_DIMENSIONS.includes(dimension)) throw new AppError(400, 'Pick department or work location');
    const groupName = str(req.body.groupName).slice(0, 120);
    const key = str(req.body.key).slice(0, 120);
    if (!groupName || !key) throw new AppError(400, 'Pick the group and the account');
    const ledgerName = str(req.body.ledgerName).slice(0, 120);
    const id = { organizationId_dimension_groupName_key: { organizationId, dimension, groupName, key } };
    const before = await prisma.ledgerOverride.findUnique({ where: id });
    if (ledgerName) {
      await prisma.ledgerOverride.upsert({ where: id, create: { organizationId, dimension, groupName, key, ledgerName }, update: { ledgerName } });
    } else if (before) {
      await prisma.ledgerOverride.delete({ where: id });
    }
    if ((before?.ledgerName || '') !== ledgerName) {
      await logPayrollAudit(req, [{
        action: 'LEDGER_MAPPING_UPDATED', field: `${groupName} · ${key}`,
        oldValue: before?.ledgerName || 'Company ledger', newValue: ledgerName || 'Company ledger',
      }]);
    }
    res.json({ message: ledgerName ? 'Ledger saved' : 'Ledger removed' });
  },

  // ---- Expense claims paid with salary ------------------------------------------------
  // Approved claims of the employees in a run: those already attached to
  // it, and those waiting that could be.
  async getRunClaims(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.runId, organizationId },
      include: { entries: { select: { id: true, personId: true } } },
    });
    if (!run) throw new AppError(404, 'Payroll run not found');
    const entryIds = run.entries.map(e => e.id);
    const reports = await prisma.expenseReport.findMany({
      where: {
        organizationId,
        OR: [
          { payrollEntryId: { in: entryIds } },
          { status: 'APPROVED', payrollEntryId: null, personId: { in: run.entries.map(e => e.personId) } },
        ],
      },
      include: { lines: { select: { amount: true } }, person: { select: { id: true, name: true, employeeNo: true } } },
      orderBy: { reportNumber: 'asc' },
    });
    const claims = reports.map(r => ({
      id: r.id, reportNumber: r.reportNumber, title: r.title, person: r.person,
      amount: claimTotal(r), attached: Boolean(r.payrollEntryId), status: r.status,
    }));
    res.json({
      claims,
      attachedTotal: r2(claims.filter(c => c.attached).reduce((s, c) => s + c.amount, 0)),
      waitingTotal: r2(claims.filter(c => !c.attached).reduce((s, c) => s + c.amount, 0)),
    });
  },

  // body: { reportId, attach: boolean }
  async setRunClaim(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await prisma.payrollRun.findFirst({ where: { id: req.params.runId, organizationId } });
    if (!run) throw new AppError(404, 'Payroll run not found');
    if (run.status !== 'DRAFT') throw new AppError(400, 'This run is finalized. Reopen it to change the claims paid with it.');
    if (run.inputsLockedAt) throw new AppError(400, 'Inputs for this run are locked. Unlock them to make changes.');
    const report = await prisma.expenseReport.findFirst({
      where: { id: str(req.body.reportId), organizationId },
      include: { lines: { select: { amount: true } }, person: { select: { name: true } } },
    });
    if (!report) throw new AppError(404, 'Expense claim not found');
    const entry = await prisma.payslipEntry.findUnique({ where: { runId_personId: { runId: run.id, personId: report.personId } } });
    if (!entry) throw new AppError(400, `${report.person.name} is not in this run`);

    const attach = Boolean(req.body.attach);
    if (attach) {
      if (report.status !== 'APPROVED') throw new AppError(400, 'Only approved claims can be paid with salary');
      if (report.payrollEntryId && report.payrollEntryId !== entry.id) throw new AppError(400, 'This claim is already attached to another payroll run');
      await prisma.expenseReport.update({ where: { id: report.id }, data: { payrollEntryId: entry.id } });
    } else {
      if (report.payrollEntryId !== entry.id) throw new AppError(400, 'This claim is not attached to this run');
      await prisma.expenseReport.update({ where: { id: report.id }, data: { payrollEntryId: null } });
    }
    const reimbursement = await syncReimbursement(entry.id);
    await logPayrollAudit(req, [{
      action: attach ? 'CLAIM_ATTACHED' : 'CLAIM_DETACHED', runId: run.id, entryId: entry.id, personId: report.personId,
      period: run.period, personName: report.person.name, field: report.reportNumber,
      newValue: attach ? String(claimTotal(report)) : '', oldValue: attach ? '' : String(claimTotal(report)),
    }]);
    res.json({ reimbursement });
  },
};
