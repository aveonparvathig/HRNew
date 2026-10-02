// Payout and payroll-control reports: who was paid and how, the journal
// voucher, and what changed, looks odd or is duplicated.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { orgBrand, signatureImg } from '../services/orgBrand';
import { financialYearFor, financialYearOf, periodsOfFinancialYear } from '../services/payroll/financialYear';
import { currentPeriodIST } from '../services/payroll/salaryStructure';
import { esc, amt, inr, monthLabel, reportShell } from '../services/payroll/reportHtml';
import { amountInWords } from '../services/payrollCalc';
import {
  PAYMENT_MODES, modeLabel, payAmount, runStage, journalVoucher,
  payrollReconciliation, headcountMovement, payrollAnomalies, duplicateGroups,
} from '../services/payroll/payoutCalc';
import { claimTotal } from '../services/payroll/payout';

const str = (v: any) => String(v ?? '').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const dash = '<span class="muted">—</span>';
const byName = (a: any, b: any) => a.person.name.localeCompare(b.person.name);
const dateLabel = (date?: string | Date | null) => {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T00:00:00`) : date;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', ...(typeof date === 'string' ? {} : { timeZone: 'Asia/Kolkata' }) });
};
const signed = (n: number) => (Math.abs(n) < 0.005 ? '—' : `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

const PERSON = {
  id: true, name: true, employeeNo: true, designation: true, department: true,
  paymentMode: true, bankName: true, bankAccountNumber: true, ifscCode: true,
  pfUan: true, esiNumber: true,
};

async function fetchRun(runId: string, organizationId: string) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, organizationId },
    include: { entries: { include: { person: { select: PERSON }, lines: true, payoutBatch: true } } },
  });
  if (!run) throw new AppError(404, 'Payroll run not found');
  run.entries.sort(byName);
  return run;
}

// The latest run before this one (run history may have gaps).
async function fetchPrevious(organizationId: string, period: string) {
  const prev = await prisma.payrollRun.findFirst({
    where: { organizationId, period: { lt: period } },
    orderBy: { period: 'desc' },
    include: { entries: { include: { person: { select: PERSON }, lines: true } } },
  });
  prev?.entries.sort(byName);
  return prev;
}

function fyInput(value: any): number {
  if (value === undefined || value === null || value === '') return financialYearOf(currentPeriodIST()).startYear;
  const year = Number(/^(\d{4})/.exec(String(value))?.[1]);
  if (!year || year < 2000 || year > 2100) throw new AppError(400, 'Pick a financial year');
  return year;
}

const modeOf = (e: any) => e.payoutBatch?.mode || e.person.paymentMode || 'BANK';

// "Paid on 05 Nov 2026", "In batch 3", "On hold", "Unpaid"
function payStatusText(e: any): string {
  if (e.paidOn) return `Paid on ${dateLabel(e.paidOn)}`;
  if (e.payStatus === 'HOLD') return 'On hold';
  if (e.payoutBatch) return `In batch ${e.payoutBatch.batchNo}, not paid yet`;
  return payAmount(e) > 0 ? 'Unpaid' : 'Nothing to pay';
}

export const payrollControlController = {
  // ---- Payout ---------------------------------------------------------------------
  // Net pay of every employee by payment mode, with where each payment stands.
  async paymentRegister(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const sections = PAYMENT_MODES.map(m => {
      const list = run.entries.filter(e => modeOf(e) === m.value);
      if (list.length === 0) return '';
      const rows = list.map((e, i) => `<tr>
        <td>${i + 1}</td><td class="nw">${esc(e.person.employeeNo)}</td><td class="nw">${esc(e.person.name)}</td>
        ${m.value === 'BANK' ? `<td>${esc(e.person.bankName) || dash}</td><td class="nw">${esc(e.person.bankAccountNumber) || dash}</td><td class="nw">${esc(e.person.ifscCode) || dash}</td>` : ''}
        <td class="amt">${amt(e.netPayable)}</td><td class="amt">${amt(e.reimbursement)}</td><td class="amt">${amt(payAmount(e))}</td>
        <td class="nw">${esc(payStatusText(e))}</td><td>${esc(e.paymentRef) || dash}</td></tr>`).join('');
      const span = m.value === 'BANK' ? 6 : 3;
      return `<div class="st-h">${esc(m.label)} — ${list.length} employee${list.length === 1 ? '' : 's'}</div>
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th>${m.value === 'BANK' ? '<th>Bank</th><th>Account number</th><th>IFSC</th>' : ''}
      <th class="amt">Net salary</th><th class="amt">Claims</th><th class="amt">To pay</th><th>Status</th><th>Reference</th></tr>
    ${rows}
    <tr class="tot"><td colspan="${span}">Total</td>
      <td class="amt">${amt(r2(list.reduce((s, e) => s + e.netPayable, 0)))}</td>
      <td class="amt">${amt(r2(list.reduce((s, e) => s + e.reimbursement, 0)))}</td>
      <td class="amt">${amt(r2(list.reduce((s, e) => s + payAmount(e), 0)))}</td><td colspan="2"></td></tr>
  </table>`;
    }).join('');
    const summary = PAYMENT_MODES.map(m => {
      const list = run.entries.filter(e => modeOf(e) === m.value);
      return list.length ? `<tr><td>${esc(m.label)}</td><td class="ctr">${list.length}</td><td class="amt">${inr(r2(list.reduce((s, e) => s + payAmount(e), 0)))}</td></tr>` : '';
    }).join('');
    const html = reportShell(await orgBrand(organizationId), 'Payment Register', monthLabel(run.period), `
  <table class="st-table" style="width:auto;min-width:45%;">
    <tr><th>Payment mode</th><th class="ctr">Employees</th><th class="amt">Amount</th></tr>
    ${summary}
    <tr class="tot"><td>Total</td><td class="ctr">${run.entries.length}</td><td class="amt">${inr(r2(run.entries.reduce((s, e) => s + payAmount(e), 0)))}</td></tr>
  </table>
  ${sections}`);
    res.json({ html, title: `Payment Register — ${monthLabel(run.period)}` });
  },

  // Salaries paid by cash or cheque, with room to sign for cash received.
  async cashChequeStatement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const list = run.entries.filter(e => modeOf(e) !== 'BANK' && payAmount(e) > 0);
    const rows = list.map((e, i) => `<tr style="height:34px;">
      <td>${i + 1}</td><td class="nw">${esc(e.person.employeeNo)}</td><td class="nw">${esc(e.person.name)}</td>
      <td>${esc(modeLabel(modeOf(e)))}</td><td class="amt">${inr(payAmount(e))}</td>
      <td class="nw">${esc(payStatusText(e))}</td><td>${esc(e.paymentRef) || dash}</td><td style="min-width:140px;"></td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Cash and Cheque Statement', monthLabel(run.period), `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>Mode</th><th class="amt">Amount</th><th>Status</th><th>Cheque no. / reference</th><th>Received by (signature)</th></tr>
    ${rows || '<tr><td colspan="8">No salaries are paid by cash or cheque in this run.</td></tr>'}
    <tr class="tot"><td colspan="4">Total (${list.length})</td><td class="amt">${inr(r2(list.reduce((s, e) => s + payAmount(e), 0)))}</td><td colspan="3"></td></tr>
  </table>`);
    res.json({ html, title: `Cash and Cheque Statement — ${monthLabel(run.period)}` });
  },

  // Processed against paid: what the run says should be paid, what has been,
  // and what is left and why.
  async payoutReconciliation(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const stage = runStage(run, run.entries);
    const groups: [string, (e: any) => boolean][] = [
      ['Paid', e => Boolean(e.paidOn)],
      ['In a batch, not paid yet', e => !e.paidOn && e.payStatus !== 'HOLD' && Boolean(e.payoutBatch)],
      ['Not in any batch', e => !e.paidOn && e.payStatus !== 'HOLD' && !e.payoutBatch && payAmount(e) > 0],
      ['On hold', e => !e.paidOn && e.payStatus === 'HOLD'],
      ['Nothing to pay', e => !e.paidOn && e.payStatus !== 'HOLD' && !e.payoutBatch && payAmount(e) <= 0],
    ];
    const total = (list: any[]) => r2(list.reduce((s, e) => s + payAmount(e), 0));
    const summary = groups.map(([label, test]) => {
      const list = run.entries.filter(test);
      return `<tr><td>${esc(label)}</td><td class="ctr">${list.length || '—'}</td><td class="amt">${amt(total(list))}</td></tr>`;
    }).join('');
    const open = run.entries.filter(e => !e.paidOn && (payAmount(e) > 0 || e.payStatus === 'HOLD'));
    const openRows = open.map((e, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(e.person.employeeNo)}</td><td class="nw">${esc(e.person.name)}</td>
      <td>${esc(modeLabel(modeOf(e)))}</td><td class="amt">${inr(payAmount(e))}</td>
      <td>${esc(payStatusText(e))}${e.payStatus === 'HOLD' && e.holdReason ? `: ${esc(e.holdReason)}` : ''}</td></tr>`).join('');
    const batches = await prisma.payoutBatch.findMany({ where: { runId: run.id }, orderBy: { batchNo: 'asc' }, include: { entries: true } });
    const batchRows = batches.map(b => `<tr>
      <td>${b.batchNo}</td><td>${esc(modeLabel(b.mode))}</td><td class="nw">${esc(dateLabel(b.payDate))}</td>
      <td>${esc(b.reference) || dash}</td><td class="ctr">${b.entries.length}</td>
      <td class="amt">${inr(total(b.entries))}</td><td>${b.status === 'PAID' ? 'Paid' : 'Prepared'}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Payout Reconciliation', `${monthLabel(run.period)} · ${stage.label}`, `
  <table class="st-table" style="width:auto;min-width:50%;">
    <tr><th>Salaries</th><th class="ctr">Employees</th><th class="amt">Amount</th></tr>
    <tr class="sub"><td>Processed in the run</td><td class="ctr">${run.entries.length}</td><td class="amt">${amt(total(run.entries))}</td></tr>
    ${summary}
  </table>
  <div class="st-h">Payment batches</div>
  <table class="st-table">
    <tr><th>Batch</th><th>Mode</th><th>Date</th><th>Reference</th><th class="ctr">Salaries</th><th class="amt">Amount</th><th>Status</th></tr>
    ${batchRows || '<tr><td colspan="7">No payment batches yet.</td></tr>'}
  </table>
  <div class="st-h">Still to be paid</div>
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>Mode</th><th class="amt">Amount</th><th>Why</th></tr>
    ${openRows || '<tr><td colspan="6">Nothing outstanding.</td></tr>'}
  </table>`);
    res.json({ html, title: `Payout Reconciliation — ${monthLabel(run.period)}` });
  },

  // The letter to the bank for one transfer batch, with the list of credits.
  async bankAdvice(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const batch = await prisma.payoutBatch.findFirst({
      where: { id: str(req.query.batchId), organizationId },
      include: { run: true, bankAccount: true, entries: { include: { person: { select: PERSON } } } },
    });
    if (!batch) throw new AppError(404, 'Payment batch not found');
    if (batch.mode !== 'BANK') throw new AppError(400, 'A bank advice is only for bank transfer batches');
    batch.entries.sort(byName);
    const brand = await orgBrand(organizationId);
    // The account the batch was made for; a batch from before accounts
    // were listed uses the default one.
    const from = batch.bankAccount || await prisma.companyBankAccount.findFirst({
      where: { organizationId, isActive: true }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    const total = r2(batch.entries.reduce((s, e) => s + payAmount(e), 0));
    const rows = batch.entries.map((e, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(e.person.employeeNo)}</td><td class="nw">${esc(e.person.name)}</td>
      <td>${esc(e.person.bankName) || dash}</td><td class="nw">${esc(e.person.bankAccountNumber)}</td>
      <td class="nw">${esc(e.person.ifscCode)}</td><td class="amt">${inr(payAmount(e))}</td></tr>`).join('');
    const account = from
      ? `our account number <strong>${esc(from.accountNumber)}</strong>`
      : 'our account <span class="muted">(add the company bank account in Company Settings → Bank accounts)</span>';
    const html = reportShell(brand, 'Bank Transfer Advice', `${monthLabel(batch.run.period)} · Batch ${batch.batchNo}`, `
  <div style="font-size:13px;margin-bottom:16px;">
    <p>Date: ${esc(dateLabel(batch.payDate))}</p>
    <p>To<br/>The Manager<br/>${esc(from?.bankName) || '____________________'}${from?.branch ? `<br/>${esc(from.branch)}` : ''}</p>
    <p><strong>Subject: Salary transfer for ${esc(monthLabel(batch.run.period))}</strong></p>
    <p>Dear Sir / Madam,</p>
    <p>Please debit ${account}${from?.ifsc ? ` (IFSC ${esc(from.ifsc)})` : ''} with
      <strong>${inr(total)}</strong> (${esc(amountInWords(total))}) and credit the ${batch.entries.length}
      account${batch.entries.length === 1 ? '' : 's'} listed below towards salary for ${esc(monthLabel(batch.run.period))}.${batch.reference ? ` Reference: ${esc(batch.reference)}.` : ''}</p>
  </div>
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Beneficiary</th><th>Bank</th><th>Account number</th><th>IFSC</th><th class="amt">Amount</th></tr>
    ${rows}
    <tr class="tot"><td colspan="6">Total</td><td class="amt">${inr(total)}</td></tr>
  </table>
  <div style="margin-top:44px;font-size:13px;display:flex;justify-content:space-between;">
    <div>For ${esc(brand.name)}</div>
    <div style="text-align:right;">${brand.signatureData ? `<div style="display:flex;justify-content:flex-end;">${signatureImg(brand.signatureData)}</div>` : ''}____________________________<br/>Authorised signatory${brand.signatoryName ? `<br/>${esc(brand.signatoryName)}${brand.signatoryDesignation ? `, ${esc(brand.signatoryDesignation)}` : ''}` : ''}</div>
  </div>`);
    res.json({ html, title: `Bank Transfer Advice — ${monthLabel(batch.run.period)} — Batch ${batch.batchNo}` });
  },

  // Salaries put on hold in a financial year, and when they were released and paid.
  async holdRelease(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fy = financialYearFor(fyInput(req.query.fy));
    const entries = await prisma.payslipEntry.findMany({
      where: { organizationId, heldAt: { not: null }, run: { period: { in: periodsOfFinancialYear(fy.startYear) } } },
      include: { run: { select: { period: true } }, person: { select: { name: true, employeeNo: true } } },
    });
    entries.sort((a, b) => a.run.period.localeCompare(b.run.period) || byName(a, b));
    const rows = entries.map((e, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(monthLabel(e.run.period))}</td><td class="nw">${esc(e.person.employeeNo)}</td><td class="nw">${esc(e.person.name)}</td>
      <td class="amt">${inr(payAmount(e))}</td><td class="nw">${esc(dateLabel(e.heldAt))}</td><td>${esc(e.holdReason) || dash}</td>
      <td class="nw">${e.holdReleasedAt && e.payStatus !== 'HOLD' ? esc(dateLabel(e.holdReleasedAt)) : '<strong>Still on hold</strong>'}</td>
      <td class="nw">${e.paidOn ? esc(dateLabel(e.paidOn)) : dash}</td></tr>`).join('');
    const stillHeld = entries.filter(e => e.payStatus === 'HOLD');
    const html = reportShell(await orgBrand(organizationId), 'Hold and Release Report', `FY ${fy.label}`, `
  <table class="st-table">
    <tr><th>#</th><th>Salary month</th><th>Code</th><th>Employee</th><th class="amt">Amount</th><th>Held on</th><th>Reason</th><th>Released on</th><th>Paid on</th></tr>
    ${rows || `<tr><td colspan="9">No salary was put on hold in FY ${fy.label}.</td></tr>`}
  </table>
  <p style="font-size:11.5px;color:#6b7280;">${entries.length} held in the year; ${stillHeld.length} still on hold, ${inr(r2(stillHeld.reduce((s, e) => s + payAmount(e), 0)))}.</p>`);
    res.json({ html, title: `Hold and Release Report — FY ${fy.label}` });
  },

  // ---- Accounting ---------------------------------------------------------------------
  async journalVoucher(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const mappings = await prisma.ledgerMapping.findMany({ where: { organizationId } });
    const jv = journalVoucher(run.entries, Object.fromEntries(mappings.map(m => [m.key, m.ledgerName])));
    const rows = jv.lines.map(l => `<tr>
      <td>${esc(l.ledger)}<div class="muted" style="font-size:10.5px;">${esc(l.detail)}</div></td>
      <td class="amt">${l.debit ? inr(l.debit) : ''}</td><td class="amt">${l.credit ? inr(l.credit) : ''}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Payroll Journal Voucher', monthLabel(run.period), `
  <p style="font-size:12.5px;margin:0 0 10px;">Being salaries and statutory dues for ${esc(monthLabel(run.period))}, ${run.entries.length} employees${run.status === 'FINALIZED' ? '' : ' — <strong>draft run, figures may change</strong>'}.</p>
  <table class="st-table" style="width:auto;min-width:70%;">
    <tr><th>Ledger account</th><th class="amt">Debit</th><th class="amt">Credit</th></tr>
    ${rows || '<tr><td colspan="3">Nothing to post.</td></tr>'}
    <tr class="tot"><td>Total</td><td class="amt">${inr(jv.totalDebit)}</td><td class="amt">${inr(jv.totalCredit)}</td></tr>
  </table>
  <p style="font-size:11.5px;color:#6b7280;">Ledger names come from Payroll Settings → Payout. Loan instalments are credited in full to the loan ledger;
  move any interest portion to interest income. Paying the salaries and the statutory dues are separate bank entries.</p>`);
    res.json({ html, title: `Payroll Journal Voucher — ${monthLabel(run.period)}` });
  },

  // ---- Control ---------------------------------------------------------------------------
  // Why this month differs from the last: joiners, leavers, revisions, attendance, the rest.
  async reconciliation(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const prev = await fetchPrevious(organizationId, run.period);
    if (!prev) throw new AppError(404, 'No earlier run found to compare against');
    const rec = payrollReconciliation(prev.entries, run.entries);
    const causeRows = rec.causes.map(c => `<tr class="sub"><td>${esc(c.label)}</td><td class="ctr">${c.employees}</td>
      <td class="amt">${signed(c.gross)}</td><td class="amt">${signed(c.net)}</td></tr>
      ${c.people.map(p => `<tr><td style="padding-left:22px;">${esc(p.name)}${p.note ? ` <span class="muted">(${esc(p.note)})</span>` : ''}</td><td></td>
      <td class="amt">${signed(p.gross)}</td><td class="amt">${signed(p.net)}</td></tr>`).join('')}`).join('');
    const componentRows = rec.components.map(c => `<tr${['GROSS', 'TOTAL_DEDUCTIONS', 'NET'].includes(c.group) ? ' class="sub"' : ''}>
      <td>${esc(c.label)}</td><td class="amt">${amt(c.previous)}</td><td class="amt">${amt(c.current)}</td><td class="amt">${signed(c.change)}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Payroll Reconciliation', `${monthLabel(prev.period)} to ${monthLabel(run.period)}`, `
  <table class="st-table" style="width:auto;min-width:70%;">
    <tr><th>What changed</th><th class="ctr">Employees</th><th class="amt">Gross</th><th class="amt">Net pay</th></tr>
    <tr class="tot"><td>${esc(monthLabel(prev.period))}</td><td class="ctr">${rec.previous.employees}</td><td class="amt">${amt(rec.previous.gross)}</td><td class="amt">${amt(rec.previous.net)}</td></tr>
    ${causeRows || '<tr><td colspan="4">No differences.</td></tr>'}
    <tr class="tot"><td>${esc(monthLabel(run.period))}</td><td class="ctr">${rec.current.employees}</td><td class="amt">${amt(rec.current.gross)}</td><td class="amt">${amt(rec.current.net)}</td></tr>
  </table>
  <div class="st-h">By component</div>
  <table class="st-table" style="width:auto;min-width:70%;">
    <tr><th>Component</th><th class="amt">${esc(monthLabel(prev.period))}</th><th class="amt">${esc(monthLabel(run.period))}</th><th class="amt">Change</th></tr>
    ${componentRows}
  </table>
  <p style="font-size:11.5px;color:#6b7280;">Each employee's change is placed under one cause: a package change first, then a change in pay days, then anything else.</p>`);
    res.json({ html, title: `Payroll Reconciliation — ${monthLabel(run.period)}` });
  },

  // Headcount movement against the previous run.
  async headcount(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const prev = await fetchPrevious(organizationId, run.period);
    if (!prev) throw new AppError(404, 'No earlier run found to compare against');
    const h = headcountMovement(prev.entries, run.entries);
    const list = (entries: any[], empty: string) => entries.map((e, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(e.person.employeeNo)}</td><td class="nw">${esc(e.person.name)}</td>
      <td>${esc(e.person.designation) || dash}</td><td>${esc(e.person.department) || dash}</td>
      <td class="amt">${amt(e.grossSalary)}</td></tr>`).join('') || `<tr><td colspan="6">${empty}</td></tr>`;
    const head = '<tr><th>#</th><th>Code</th><th>Employee</th><th>Designation</th><th>Department</th><th class="amt">Gross</th></tr>';
    const html = reportShell(await orgBrand(organizationId), 'Employee Reconciliation', `${monthLabel(prev.period)} to ${monthLabel(run.period)}`, `
  <table class="st-table" style="width:auto;min-width:45%;">
    <tr><th>Headcount</th><th class="ctr">Employees</th></tr>
    <tr><td>In ${esc(monthLabel(prev.period))}</td><td class="ctr">${h.opening}</td></tr>
    <tr><td>Added</td><td class="ctr">${h.joiners.length ? `+${h.joiners.length}` : '—'}</td></tr>
    <tr><td>No longer in the run</td><td class="ctr">${h.leavers.length ? `−${h.leavers.length}` : '—'}</td></tr>
    <tr class="tot"><td>In ${esc(monthLabel(run.period))}</td><td class="ctr">${h.closing}</td></tr>
  </table>
  <div class="st-h">Added in ${esc(monthLabel(run.period))}</div>
  <table class="st-table">${head}${list(h.joiners, 'Nobody was added.')}</table>
  <div class="st-h">In ${esc(monthLabel(prev.period))} but not in ${esc(monthLabel(run.period))}</div>
  <table class="st-table">${head}${list(h.leavers, 'Nobody dropped out.')}</table>`);
    res.json({ html, title: `Employee Reconciliation — ${monthLabel(run.period)}` });
  },

  // Employees whose deductions exceed (or wipe out) their earnings.
  async negativeNet(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const list = run.entries.filter(e => e.netPayable <= 0);
    const rows = list.map((e, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(e.person.employeeNo)}</td><td class="nw">${esc(e.person.name)}</td>
      <td class="ctr">${e.payDays} / ${e.totalWorkingDays}</td><td class="amt">${amt(e.grossSalary)}</td>
      <td class="amt">${amt(e.totalDeductions)}</td><td class="amt">${e.netPayable < 0 ? `<strong>${inr(e.netPayable)}</strong>` : inr(0)}</td>
      <td>${[['PF', e.pfEmployee], ['ESI', e.esiEmployee], ['Advance', e.salaryAdvance], ['TDS', e.tds], ['PT', e.professionalTax], ['Loan', e.loanDeduction],
        ...e.lines.filter(l => l.type === 'DEDUCTION').map(l => [l.name, l.amount] as [string, number])]
        .filter(([, v]) => Number(v) > 0).map(([k, v]) => `${esc(k)} ${amt(Number(v))}`).join(', ') || dash}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Negative and Zero Net Pay', monthLabel(run.period), `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th class="ctr">Pay days</th><th class="amt">Gross</th><th class="amt">Deductions</th><th class="amt">Net pay</th><th>Deductions made</th></tr>
    ${rows || '<tr><td colspan="8">Every employee in this run has a positive net pay.</td></tr>'}
  </table>
  <p style="font-size:11.5px;color:#6b7280;">A run cannot be finalized while any net pay is negative.</p>`);
    res.json({ html, title: `Negative and Zero Net Pay — ${monthLabel(run.period)}` });
  },

  // Things worth a second look: swings against last month, zero pay, missing statutory numbers.
  async anomalies(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const prev = await fetchPrevious(organizationId, run.period);
    const found = payrollAnomalies(prev?.entries || [], run.entries);
    const rows = found.map((a, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(a.employeeNo)}</td><td class="nw">${esc(a.personName)}</td>
      <td class="nw">${esc(a.kind)}</td><td>${esc(a.detail)}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Payroll Anomalies', monthLabel(run.period), `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>What</th><th>Detail</th></tr>
    ${rows || '<tr><td colspan="5">Nothing unusual found.</td></tr>'}
  </table>
  <p style="font-size:11.5px;color:#6b7280;">Net pay that moves by 25% or more against ${prev ? esc(monthLabel(prev.period)) : 'the previous run'} counts as sudden.
  ${new Set(found.map(a => a.entryId)).size} of ${run.entries.length} employees listed.</p>`);
    res.json({ html, title: `Payroll Anomalies — ${monthLabel(run.period)}` });
  },

  // Employees sharing a bank account or PAN.
  async duplicates(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const people = await prisma.person.findMany({
      where: { organizationId, kind: 'CANDIDATE', isEmployee: true },
      select: { id: true, name: true, employeeNo: true, bankAccountNumber: true, panNumber: true, employmentStatus: true },
      orderBy: { name: 'asc' },
    });
    const status = new Map(people.map(p => [p.id, p.employmentStatus]));
    const section = (title: string, field: string, label: string) => {
      const groups = duplicateGroups(people, field);
      const rows = groups.map((g, i) => `<tr><td>${i + 1}</td><td class="nw">${esc(g.value)}</td>
        <td>${g.people.map(p => `${esc(p.name)}${p.employeeNo ? ` <span class="muted">(${esc(p.employeeNo)})</span>` : ''}${['RESIGNED', 'TERMINATED'].includes(status.get(p.id) || '') ? ' <span class="muted">— left</span>' : ''}`).join('<br/>')}</td></tr>`).join('');
      return `<div class="st-h">${esc(title)}</div>
  <table class="st-table">
    <tr><th>#</th><th>${esc(label)}</th><th>Employees sharing it</th></tr>
    ${rows || `<tr><td colspan="3">No ${esc(label.toLowerCase())} is shared by more than one employee.</td></tr>`}
  </table>`;
    };
    const codes = duplicateGroups(people, 'employeeNo');
    const html = reportShell(await orgBrand(organizationId), 'Duplicate Check', `${people.length} employees on record`, `
  ${section('Same bank account', 'bankAccountNumber', 'Account number')}
  ${section('Same PAN', 'panNumber', 'PAN')}
  ${codes.length ? section('Same employee code', 'employeeNo', 'Employee code') : ''}`);
    res.json({ html, title: 'Duplicate Check' });
  },

  // Expense claims settled in a financial year: with a month's salary, or directly.
  async reimbursements(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fy = financialYearFor(fyInput(req.query.fy));
    const [from, to] = [`${fy.startYear}-04-01`, `${fy.startYear + 1}-03-31`];
    const reports = await prisma.expenseReport.findMany({
      where: {
        organizationId,
        OR: [
          { payrollEntry: { run: { period: { in: periodsOfFinancialYear(fy.startYear) } } } },
          { payrollEntryId: null, status: { in: ['APPROVED', 'REIMBURSED'] }, submittedOn: { gte: from, lte: to } },
        ],
      },
      include: {
        lines: { select: { amount: true } },
        person: { select: { name: true, employeeNo: true } },
        payrollEntry: { select: { paidOn: true, run: { select: { period: true, status: true } } } },
      },
    });
    reports.sort((a, b) => a.person.name.localeCompare(b.person.name) || a.reportNumber.localeCompare(b.reportNumber));
    const how = (r: typeof reports[number]) => (r.payrollEntry
      ? `With ${monthLabel(r.payrollEntry.run.period)} salary${r.payrollEntry.run.status === 'DRAFT' ? ' (run not finalized)' : r.payrollEntry.paidOn ? `, paid ${dateLabel(r.payrollEntry.paidOn)}` : ''}`
      : r.status === 'REIMBURSED' ? 'Reimbursed directly' : 'Approved, not yet reimbursed');
    const rows = reports.map((r, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(r.reportNumber)}</td><td class="nw">${esc(r.person.name)}<div class="muted" style="font-size:10.5px;">${esc(r.person.employeeNo)}</div></td>
      <td>${esc(r.title)}</td><td class="nw">${esc(dateLabel(r.submittedOn)) || dash}</td>
      <td class="amt">${inr(claimTotal(r))}</td><td>${esc(how(r))}</td></tr>`).join('');
    const sum = (list: typeof reports) => r2(list.reduce((s, r) => s + claimTotal(r), 0));
    const viaPayroll = reports.filter(r => r.payrollEntry);
    const direct = reports.filter(r => !r.payrollEntry && r.status === 'REIMBURSED');
    const waiting = reports.filter(r => !r.payrollEntry && r.status === 'APPROVED');
    const html = reportShell(await orgBrand(organizationId), 'Reimbursement Summary', `FY ${fy.label}`, `
  <table class="st-table" style="width:auto;min-width:50%;">
    <tr><th>Expense claims</th><th class="ctr">Claims</th><th class="amt">Amount</th></tr>
    <tr><td>Paid with salary</td><td class="ctr">${viaPayroll.length || '—'}</td><td class="amt">${amt(sum(viaPayroll))}</td></tr>
    <tr><td>Reimbursed directly</td><td class="ctr">${direct.length || '—'}</td><td class="amt">${amt(sum(direct))}</td></tr>
    <tr><td>Approved, waiting</td><td class="ctr">${waiting.length || '—'}</td><td class="amt">${amt(sum(waiting))}</td></tr>
    <tr class="tot"><td>Total</td><td class="ctr">${reports.length}</td><td class="amt">${amt(sum(reports))}</td></tr>
  </table>
  <table class="st-table">
    <tr><th>#</th><th>Claim</th><th>Employee</th><th>Title</th><th>Submitted</th><th class="amt">Amount</th><th>How it was settled</th></tr>
    ${rows || `<tr><td colspan="7">No approved or reimbursed claims in FY ${fy.label}.</td></tr>`}
  </table>`);
    res.json({ html, title: `Reimbursement Summary — FY ${fy.label}` });
  },
};
