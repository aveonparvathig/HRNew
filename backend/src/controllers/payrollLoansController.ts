import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { orgBrand } from '../services/orgBrand';
import { logPayrollAudit, actorName } from '../services/payroll/audit';
import {
  LOAN_TYPES, addMonths, buildSchedule, instalmentOf, outstandingPrincipal,
  loanPerquisiteForMonth, perquisiteApplies,
} from '../services/payroll/loanCalc';
import {
  regenerateSchedule, assertPeriodOpen, todayIST, earliestOpenPeriod,
} from '../services/payroll/loanLedger';
import { syncDraftEntries } from '../services/payroll/draftSync';
import { financialYearFor } from '../services/payroll/financialYear';
import {
  esc, amt, inr, monthLabel, reportShell,
} from '../services/payroll/reportHtml';

const str = (v: any) => String(v ?? '').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const TYPE_VALUES = LOAN_TYPES.map(t => t.value) as string[];
const typeLabel = (type: string) => LOAN_TYPES.find(t => t.value === type)?.label || type;
const dateLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const TXN_LABELS: Record<string, string> = {
  DISBURSAL: 'Loan given', INSTALMENT: 'Instalment', PREPAYMENT: 'Part payment',
  FORECLOSURE: 'Settled in full', TOP_UP: 'Top-up', REVISION: 'Terms revised', SKIP: 'Month skipped',
};

function periodInput(value: any, message: string): string {
  const period = str(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new AppError(400, message);
  return period;
}

function dateInput(value: any, message: string): string {
  const date = str(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(400, message);
  return date;
}

// Amount, rate and number of instalments, validated.
function termsInput(b: any) {
  const annualRate = Number(b.annualRate || 0);
  if (!isFinite(annualRate) || annualRate < 0 || annualRate > 60) throw new AppError(400, 'Interest rate must be between 0 and 60% a year');
  const instalments = parseInt(b.instalments);
  if (!instalments || instalments < 1 || instalments > 360) throw new AppError(400, 'Number of instalments must be between 1 and 360');
  return { annualRate, instalments, startPeriod: periodInput(b.startPeriod, 'Pick the month deductions start') };
}

async function fetchLoan(id: string, organizationId: string) {
  const loan = await prisma.loan.findFirst({
    where: { id, organizationId },
    include: {
      person: { select: { id: true, name: true, employeeNo: true, designation: true } },
      schedule: { orderBy: { seq: 'asc' } },
      transactions: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!loan) throw new AppError(404, 'Loan not found');
  return loan;
}

function assertActive(loan: { status: string }) {
  if (loan.status !== 'ACTIVE') throw new AppError(400, 'This loan is closed');
}

// What the list and the detail page both show for a loan.
function loanSummary(loan: any) {
  const due = loan.schedule.filter((l: any) => l.status === 'DUE');
  const next = due[0];
  return {
    id: loan.id, loanNo: loan.loanNo, title: loan.title, type: loan.type,
    typeLabel: loan.annualRate > 0 ? typeLabel(loan.type) : 'Interest-free',
    principal: loan.principal, annualRate: loan.annualRate, instalments: loan.instalments,
    loanDate: loan.loanDate, startPeriod: loan.startPeriod, status: loan.status, closedOn: loan.closedOn,
    remarks: loan.remarks, person: loan.person,
    totalLent: r2(loan.transactions.filter((t: any) => t.principal > 0).reduce((s: number, t: any) => s + t.principal, 0)),
    outstanding: outstandingPrincipal(loan.transactions),
    interestPaid: r2(loan.transactions.reduce((s: number, t: any) => s + t.interest, 0)),
    instalmentsLeft: due.length,
    nextInstalment: next ? { period: next.period, amount: instalmentOf(next) } : null,
    lastPeriod: due.length ? due[due.length - 1].period : null,
  };
}

async function nextLoanNo(organizationId: string): Promise<string> {
  const loans = await prisma.loan.findMany({ where: { organizationId }, select: { loanNo: true } });
  const highest = loans.reduce((max, l) => Math.max(max, Number(/(\d+)$/.exec(l.loanNo)?.[1] || 0)), 0);
  return `LN-${String(highest + 1).padStart(4, '0')}`;
}

const firstDuePeriod = (loan: any) => loan.schedule.find((l: any) => l.status === 'DUE')?.period;

// One loan: terms, every transaction, and the plan for what is left.
// With onlyPersonId the loan must belong to that employee.
export async function buildLoanStatement(organizationId: string, loanId: string, onlyPersonId?: string) {
  const loan = await fetchLoan(loanId, organizationId);
  if (onlyPersonId && loan.personId !== onlyPersonId) throw new AppError(404, 'Loan not found');
  const s = loanSummary(loan);
  const txns = loan.transactions.map(t => `<tr>
    <td class="nw">${esc(dateLabel(t.date))}</td><td>${esc(TXN_LABELS[t.type] || t.type)}${t.period ? ` <span class="muted">(${esc(monthLabel(t.period))})</span>` : ''}</td>
    <td class="amt">${t.principal > 0 ? inr(t.principal) : '—'}</td><td class="amt">${t.principal < 0 ? inr(-t.principal) : '—'}</td>
    <td class="amt">${t.interest ? inr(t.interest) : '—'}</td><td class="amt">${inr(t.balanceAfter)}</td>
    <td>${esc(t.remarks) || '<span class="muted">—</span>'}</td></tr>`).join('');
  const due = loan.schedule.filter(l => l.status === 'DUE');
  const plan = due.map(l => `<tr><td class="nw">${esc(monthLabel(l.period))}</td>
    <td class="amt">${inr(l.principal)}</td><td class="amt">${l.interest ? inr(l.interest) : '—'}</td><td class="amt">${inr(instalmentOf(l))}</td></tr>`).join('');
  const html = reportShell(await orgBrand(organizationId), 'Loan Statement', `${loan.loanNo} · as on ${dateLabel(todayIST())}`, `
  <p style="margin:0 0 10px;"><strong>${esc(loan.person.name)}</strong>${loan.person.employeeNo ? ` · ${esc(loan.person.employeeNo)}` : ''}${loan.title ? ` · ${esc(loan.title)}` : ''}</p>
  <table class="st-table" style="width:auto;min-width:60%;">
  <tr><th colspan="2">Terms</th></tr>
  <tr><td>Type</td><td>${esc(s.typeLabel)}${loan.annualRate ? `, ${loan.annualRate}% a year` : ''}</td></tr>
  <tr><td>Given on</td><td>${esc(dateLabel(loan.loanDate))}</td></tr>
  <tr><td>Amount lent</td><td class="amt">${inr(s.totalLent)}</td></tr>
  <tr><td>Interest paid so far</td><td class="amt">${inr(s.interestPaid)}</td></tr>
  <tr class="tot"><td>Principal outstanding</td><td class="amt">${inr(s.outstanding)}</td></tr>
  <tr><td>Status</td><td>${loan.status === 'CLOSED' ? `Closed on ${esc(dateLabel(loan.closedOn || ''))}` : `${due.length} instalment${due.length === 1 ? '' : 's'} left`}</td></tr>
  </table>
  <div class="st-h">Transactions</div>
  <table class="st-table">
  <tr><th>Date</th><th>Transaction</th><th class="amt">Lent</th><th class="amt">Principal repaid</th><th class="amt">Interest</th><th class="amt">Balance</th><th>Remarks</th></tr>
  ${txns}
  </table>
  ${due.length ? `<div class="st-h">Instalments to come</div>
  <table class="st-table" style="width:auto;min-width:60%;">
  <tr><th>Month</th><th class="amt">Principal</th><th class="amt">Interest</th><th class="amt">Instalment</th></tr>
  ${plan}
  <tr class="tot"><td>Total</td><td class="amt">${inr(r2(due.reduce((t, l) => t + l.principal, 0)))}</td><td class="amt">${inr(r2(due.reduce((t, l) => t + l.interest, 0)))}</td><td class="amt">${inr(r2(due.reduce((t, l) => t + instalmentOf(l), 0)))}</td></tr>
  </table>` : ''}`);
  return { html, title: `Loan Statement — ${loan.loanNo} — ${loan.person.name}` };
}

// Summary rows of an employee's loans, for their own view.
export async function loansOfPerson(organizationId: string, personId: string) {
  const loans = await prisma.loan.findMany({
    where: { organizationId, personId },
    include: {
      person: { select: { id: true, name: true, employeeNo: true, designation: true } },
      schedule: { orderBy: { seq: 'asc' } },
      transactions: true,
    },
    orderBy: { createdAt: 'desc' },
  });
  return loans.map(loanSummary);
}

export const payrollLoansController = {
  async getLoans(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const where: any = { organizationId };
    if (req.query.personId) where.personId = String(req.query.personId);
    const loans = await prisma.loan.findMany({
      where,
      include: {
        person: { select: { id: true, name: true, employeeNo: true, designation: true } },
        schedule: { orderBy: { seq: 'asc' } },
        transactions: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    const rows = loans.map(loanSummary);
    const active = rows.filter(l => l.status === 'ACTIVE');
    res.json({
      loans: rows,
      types: LOAN_TYPES,
      totals: {
        active: active.length,
        outstanding: r2(active.reduce((s, l) => s + l.outstanding, 0)),
        closed: rows.length - active.length,
      },
    });
  },

  // The repayment plan for a set of terms, before anything is saved.
  async previewSchedule(req: any, res: Response) {
    const b = req.body;
    const type = str(b.type);
    if (!TYPE_VALUES.includes(type)) throw new AppError(400, 'Pick a loan type');
    const principal = Number(b.principal);
    if (!isFinite(principal) || principal <= 0) throw new AppError(400, 'Enter the loan amount');
    const terms = termsInput(b);
    const lines = buildSchedule({ type, principal, ...terms });
    res.json({
      lines: lines.map(l => ({ ...l, instalment: instalmentOf(l) })),
      totalInterest: r2(lines.reduce((s, l) => s + l.interest, 0)),
      totalRepayable: r2(lines.reduce((s, l) => s + instalmentOf(l), 0)),
    });
  },

  async createLoan(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const b = req.body;
    const person = await prisma.person.findFirst({
      where: { id: str(b.personId), organizationId, kind: 'CANDIDATE', isEmployee: true },
      select: { id: true, name: true },
    });
    if (!person) throw new AppError(400, 'Pick an employee');
    const type = str(b.type);
    if (!TYPE_VALUES.includes(type)) throw new AppError(400, 'Pick a loan type');
    const principal = Number(b.principal);
    if (!isFinite(principal) || principal <= 0) throw new AppError(400, 'Enter the loan amount');
    const terms = termsInput(b);
    const loanDate = dateInput(b.loanDate, 'Pick the date the loan was given');
    await assertPeriodOpen(organizationId, terms.startPeriod);

    const userName = await actorName(req.user?.userId);
    const lines = buildSchedule({ type, principal, ...terms });
    const loan = await prisma.loan.create({
      data: {
        organizationId, personId: person.id, loanNo: await nextLoanNo(organizationId),
        title: str(b.title), type, principal: r2(principal),
        annualRate: terms.annualRate, instalments: terms.instalments,
        loanDate, startPeriod: terms.startPeriod, remarks: str(b.remarks), createdByName: userName,
        schedule: { create: lines },
        transactions: { create: [{
          organizationId, date: loanDate, type: 'DISBURSAL', principal: r2(principal),
          balanceAfter: r2(principal), createdByName: userName,
        }] },
      },
    });
    await logPayrollAudit(req, [{
      action: 'LOAN_CREATED', personId: person.id, personName: person.name, period: terms.startPeriod,
      field: loan.loanNo, newValue: `${loan.principal} over ${terms.instalments} months at ${terms.annualRate}%`,
    }]);
    await syncDraftEntries(req, person.id, terms.startPeriod);
    res.status(201).json({ id: loan.id, loanNo: loan.loanNo });
  },

  async getLoanDetail(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const loan = await fetchLoan(req.params.loanId, organizationId);
    const settings = await prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });
    // Perquisite counts everything lent to this employee, across loans
    const lent = await prisma.loanTransaction.aggregate({
      where: { organizationId, principal: { gt: 0 }, loan: { personId: loan.personId } },
      _sum: { principal: true },
    });
    const applies = settings.loanBenchmarkRate > loan.annualRate
      && perquisiteApplies(lent._sum.principal || 0, settings.loanPerquisiteExemptLimit);
    let balance = outstandingPrincipal(loan.transactions);
    const schedule = loan.schedule.map(l => {
      const row = {
        ...l, instalment: instalmentOf(l),
        perquisite: l.status === 'DUE' && applies ? loanPerquisiteForMonth(balance, loan.annualRate, settings.loanBenchmarkRate) : 0,
      };
      if (l.status === 'DUE') balance = r2(balance - l.principal);
      return row;
    });
    res.json({
      ...loanSummary(loan), schedule,
      transactions: loan.transactions.map(t => ({ ...t, label: TXN_LABELS[t.type] || t.type })),
      perquisite: { applies, benchmarkRate: settings.loanBenchmarkRate, exemptLimit: settings.loanPerquisiteExemptLimit },
      canDelete: !loan.transactions.some(t => ['INSTALMENT', 'PREPAYMENT', 'FORECLOSURE'].includes(t.type)),
      currentPeriod: earliestOpenPeriod(),
    });
  },

  // Leave one month's instalment out; the plan shifts a month later.
  async skipMonth(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const loan = await fetchLoan(req.params.loanId, organizationId);
    assertActive(loan);
    const period = periodInput(req.body.period, 'Pick the month to skip');
    const due = loan.schedule.filter(l => l.status === 'DUE');
    if (!due.some(l => l.period === period)) throw new AppError(400, 'No instalment is due in that month');
    await assertPeriodOpen(organizationId, period);
    const remaining = due.filter(l => l.period >= period).length;
    const startPeriod = addMonths(period, 1);
    const outstanding = outstandingPrincipal(loan.transactions);
    // Lines before the skipped month (overdue ones) stay; only this month onward moves
    const earlierPrincipal = due.filter(l => l.period < period).reduce((s, l) => s + l.principal, 0);
    await prisma.loanScheduleLine.deleteMany({ where: { loanId: loan.id, status: 'DUE', period: { gte: period } } });
    const lastSeq = (await prisma.loanScheduleLine.findFirst({ where: { loanId: loan.id }, orderBy: { seq: 'desc' } }))?.seq ?? 0;
    const lines = buildSchedule({
      type: loan.type, principal: r2(outstanding - earlierPrincipal), annualRate: loan.annualRate,
      instalments: remaining, startPeriod, firstSeq: lastSeq + 1,
    });
    await prisma.loanScheduleLine.createMany({ data: lines.map(l => ({ loanId: loan.id, ...l })) });
    await prisma.loanTransaction.create({
      data: {
        organizationId, loanId: loan.id, date: todayIST(), period, type: 'SKIP',
        balanceAfter: outstanding, remarks: str(req.body.remarks), createdByName: await actorName(req.user?.userId),
      },
    });
    await logPayrollAudit(req, [{
      action: 'LOAN_CHANGED', personId: loan.personId, personName: loan.person.name, period,
      field: `${loan.loanNo} · skipped month`, newValue: monthLabel(period),
    }]);
    await syncDraftEntries(req, loan.personId, period);
    res.json({ message: `${monthLabel(period)} skipped; the plan now ends a month later` });
  },

  // A payment outside payroll that reduces the balance. Instalments left
  // stay the same in number and get smaller.
  async prepay(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const loan = await fetchLoan(req.params.loanId, organizationId);
    assertActive(loan);
    const amount = Number(req.body.amount);
    const outstanding = outstandingPrincipal(loan.transactions);
    if (!isFinite(amount) || amount <= 0) throw new AppError(400, 'Enter the amount paid');
    if (amount >= outstanding) throw new AppError(400, `That clears the whole balance of ${outstanding}. Use "Settle in full" instead.`);
    const date = dateInput(req.body.date, 'Pick the payment date');
    const due = loan.schedule.filter(l => l.status === 'DUE');
    if (due.length === 0) throw new AppError(400, 'No instalments are left on this loan');
    const balance = r2(outstanding - amount);
    await prisma.loanTransaction.create({
      data: {
        organizationId, loanId: loan.id, date, type: 'PREPAYMENT', principal: -r2(amount),
        balanceAfter: balance, remarks: str(req.body.remarks), createdByName: await actorName(req.user?.userId),
      },
    });
    await regenerateSchedule(loan, {
      outstanding: balance, annualRate: loan.annualRate, instalments: due.length, startPeriod: due[0].period,
    });
    await logPayrollAudit(req, [{
      action: 'LOAN_CHANGED', personId: loan.personId, personName: loan.person.name,
      field: `${loan.loanNo} · part payment`, oldValue: String(outstanding), newValue: String(balance),
    }]);
    await syncDraftEntries(req, loan.personId, earliestOpenPeriod(due[0].period));
    res.json({ message: 'Part payment recorded', outstanding: balance });
  },

  // The whole balance paid outside payroll; the loan closes.
  async foreclose(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const loan = await fetchLoan(req.params.loanId, organizationId);
    assertActive(loan);
    const date = dateInput(req.body.date, 'Pick the settlement date');
    const interest = Number(req.body.interest || 0);
    if (!isFinite(interest) || interest < 0) throw new AppError(400, 'Enter a valid interest amount');
    const outstanding = outstandingPrincipal(loan.transactions);
    const first = firstDuePeriod(loan);
    await prisma.$transaction([
      prisma.loanTransaction.create({
        data: {
          organizationId, loanId: loan.id, date, type: 'FORECLOSURE', principal: -outstanding,
          interest: r2(interest), balanceAfter: 0, remarks: str(req.body.remarks),
          createdByName: await actorName(req.user?.userId),
        },
      }),
      prisma.loanScheduleLine.deleteMany({ where: { loanId: loan.id, status: 'DUE' } }),
      prisma.loan.update({ where: { id: loan.id }, data: { status: 'CLOSED', closedOn: date } }),
    ]);
    await logPayrollAudit(req, [{
      action: 'LOAN_CHANGED', personId: loan.personId, personName: loan.person.name,
      field: `${loan.loanNo} · settled in full`, oldValue: String(outstanding), newValue: '0',
    }]);
    await syncDraftEntries(req, loan.personId, earliestOpenPeriod(first));
    res.json({ message: 'Loan settled and closed' });
  },

  // New terms for what is still owed: an optional top-up, the rate, the
  // number of instalments left and the month they start.
  async revise(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const loan = await fetchLoan(req.params.loanId, organizationId);
    assertActive(loan);
    const terms = termsInput(req.body);
    const topUp = Number(req.body.topUp || 0);
    if (!isFinite(topUp) || topUp < 0) throw new AppError(400, 'Enter a valid top-up amount');
    await assertPeriodOpen(organizationId, terms.startPeriod);
    const userName = await actorName(req.user?.userId);
    const before = outstandingPrincipal(loan.transactions);
    const balance = r2(before + topUp);
    if (balance <= 0) throw new AppError(400, 'Nothing is owed on this loan');
    const first = firstDuePeriod(loan);
    const date = todayIST();
    if (topUp > 0) {
      await prisma.loanTransaction.create({
        data: {
          organizationId, loanId: loan.id, date, type: 'TOP_UP', principal: r2(topUp),
          balanceAfter: balance, remarks: str(req.body.remarks), createdByName: userName,
        },
      });
    }
    await prisma.loanTransaction.create({
      data: {
        organizationId, loanId: loan.id, date, type: 'REVISION', balanceAfter: balance, createdByName: userName,
        remarks: `${terms.instalments} instalments from ${monthLabel(terms.startPeriod)} at ${terms.annualRate}%`,
      },
    });
    await prisma.loan.update({ where: { id: loan.id }, data: { annualRate: terms.annualRate } });
    await regenerateSchedule(loan, { outstanding: balance, ...terms });
    await logPayrollAudit(req, [{
      action: 'LOAN_CHANGED', personId: loan.personId, personName: loan.person.name, period: terms.startPeriod,
      field: `${loan.loanNo} · revised`,
      oldValue: `${before} owed at ${loan.annualRate}%`,
      newValue: `${balance} over ${terms.instalments} months at ${terms.annualRate}%`,
    }]);
    await syncDraftEntries(req, loan.personId, earliestOpenPeriod(first, terms.startPeriod));
    res.json({ message: 'Loan revised', outstanding: balance });
  },

  // Only a loan with no repayments yet can be deleted outright.
  async deleteLoan(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const loan = await fetchLoan(req.params.loanId, organizationId);
    if (loan.transactions.some(t => ['INSTALMENT', 'PREPAYMENT', 'FORECLOSURE'].includes(t.type))) {
      throw new AppError(400, 'This loan has repayments recorded. Settle it in full instead of deleting it.');
    }
    const first = firstDuePeriod(loan);
    await prisma.loan.delete({ where: { id: loan.id } });
    await logPayrollAudit(req, [{
      action: 'LOAN_DELETED', personId: loan.personId, personName: loan.person.name,
      field: loan.loanNo, oldValue: String(loan.principal),
    }]);
    await syncDraftEntries(req, loan.personId, earliestOpenPeriod(first));
    res.json({ message: `Deleted ${loan.loanNo}` });
  },

  // ---- Reports ------------------------------------------------------------
  async loanStatement(req: any, res: Response) {
    res.json(await buildLoanStatement(req.user?.organizationId, str(req.query.loanId)));
  },

  // Every loan with its terms and balance, and totals by status.
  async loanRegister(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const loans = await prisma.loan.findMany({
      where: { organizationId },
      include: {
        person: { select: { id: true, name: true, employeeNo: true, designation: true } },
        schedule: { orderBy: { seq: 'asc' } }, transactions: true,
      },
    });
    const rows = loans.map(loanSummary).sort((a, b) => a.status.localeCompare(b.status) || a.person.name.localeCompare(b.person.name));
    const active = rows.filter(r => r.status === 'ACTIVE');
    const total = (list: typeof rows, f: (r: typeof rows[number]) => number) => r2(list.reduce((s, r) => s + f(r), 0));
    const body = rows.map(r => `<tr>
      <td class="nw">${esc(r.loanNo)}</td><td class="nw">${esc(r.person.employeeNo)}</td><td class="nw">${esc(r.person.name)}${r.title ? `<div class="muted" style="font-size:10.5px;">${esc(r.title)}</div>` : ''}</td>
      <td>${esc(r.typeLabel)}</td><td class="nw">${esc(dateLabel(r.loanDate))}</td>
      <td class="amt">${amt(r.totalLent)}</td><td class="amt">${r.annualRate ? `${r.annualRate}%` : '—'}</td>
      <td class="amt">${amt(r2(r.totalLent - r.outstanding))}</td><td class="amt">${amt(r.interestPaid)}</td><td class="amt"><strong>${amt(r.outstanding)}</strong></td>
      <td class="ctr">${r.status === 'CLOSED' ? 'Closed' : r.instalmentsLeft}</td>
      <td class="amt">${r.nextInstalment ? amt(r.nextInstalment.amount) : '—'}</td>
      <td class="nw">${r.lastPeriod ? esc(monthLabel(r.lastPeriod)) : '—'}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Loan Register', `As on ${dateLabel(todayIST())}`, `
  <table class="st-table">
    <tr><th>Loan</th><th>Code</th><th>Employee</th><th>Type</th><th>Given on</th><th class="amt">Lent</th><th class="amt">Rate</th>
      <th class="amt">Principal repaid</th><th class="amt">Interest paid</th><th class="amt">Outstanding</th><th class="ctr">Instalments left</th><th class="amt">Next instalment</th><th>Ends</th></tr>
    ${body || '<tr><td colspan="13">No loans recorded.</td></tr>'}
    <tr class="tot"><td colspan="5">Total (${rows.length} loans, ${active.length} active)</td>
      <td class="amt">${amt(total(rows, r => r.totalLent))}</td><td></td>
      <td class="amt">${amt(total(rows, r => r.totalLent - r.outstanding))}</td><td class="amt">${amt(total(rows, r => r.interestPaid))}</td>
      <td class="amt">${amt(total(rows, r => r.outstanding))}</td><td></td>
      <td class="amt">${amt(total(active, r => r.nextInstalment?.amount || 0))}</td><td></td></tr>
  </table>`);
    res.json({ html, title: 'Loan Register' });
  },

  // Every loan transaction dated within a financial year.
  async loanTransactions(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const startYear = Number(/^(\d{4})/.exec(String(req.query.fy || ''))?.[1]);
    if (!startYear) throw new AppError(400, 'Pick a financial year');
    const fy = financialYearFor(startYear);
    const txns = await prisma.loanTransaction.findMany({
      where: { organizationId, date: { gte: `${fy.start}-01`, lte: `${fy.end}-31` } },
      include: { loan: { select: { loanNo: true, person: { select: { name: true, employeeNo: true } } } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    const body = txns.map(t => `<tr>
      <td class="nw">${esc(dateLabel(t.date))}</td><td class="nw">${esc(t.loan.loanNo)}</td><td class="nw">${esc(t.loan.person.name)}</td>
      <td>${esc(TXN_LABELS[t.type] || t.type)}${t.period ? ` <span class="muted">(${esc(monthLabel(t.period))})</span>` : ''}</td>
      <td class="amt">${t.principal > 0 ? inr(t.principal) : '—'}</td><td class="amt">${t.principal < 0 ? inr(-t.principal) : '—'}</td>
      <td class="amt">${t.interest ? inr(t.interest) : '—'}</td><td class="amt">${inr(t.balanceAfter)}</td>
      <td>${esc(t.remarks) || '<span class="muted">—</span>'}</td></tr>`).join('');
    const lent = r2(txns.filter(t => t.principal > 0).reduce((s, t) => s + t.principal, 0));
    const repaid = r2(txns.filter(t => t.principal < 0).reduce((s, t) => s - t.principal, 0));
    const interest = r2(txns.reduce((s, t) => s + t.interest, 0));
    const html = reportShell(await orgBrand(organizationId), 'Loan Transactions', `FY ${fy.label}`, `
  <table class="st-table">
    <tr><th>Date</th><th>Loan</th><th>Employee</th><th>Transaction</th><th class="amt">Lent</th><th class="amt">Principal repaid</th><th class="amt">Interest</th><th class="amt">Loan balance</th><th>Remarks</th></tr>
    ${body || `<tr><td colspan="9">No loan transactions in FY ${fy.label}.</td></tr>`}
    <tr class="tot"><td colspan="4">Total (${txns.length} transactions)</td><td class="amt">${inr(lent)}</td><td class="amt">${inr(repaid)}</td><td class="amt">${inr(interest)}</td><td colspan="2"></td></tr>
  </table>`);
    res.json({ html, title: `Loan Transactions — FY ${fy.label}` });
  },
};
