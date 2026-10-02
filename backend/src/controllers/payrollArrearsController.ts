// Arrears (back-dated revisions, loss-of-pay reversals) and the full and
// final settlement of employees who leave.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { orgBrand, signatureImg } from '../services/orgBrand';
import { logPayrollAudit, actorName } from '../services/payroll/audit';
import { financialYearFor, financialYearOf, periodsOfFinancialYear } from '../services/payroll/financialYear';
import { currentPeriodIST, salaryStructure } from '../services/payroll/salaryStructure';
import { loadStatutoryContext, LOCATION_FOR_PAYROLL } from '../services/payroll/entryCompute';
import { regenerateSchedule, assertPeriodOpen, todayIST } from '../services/payroll/loanLedger';
import { outstandingPrincipal } from '../services/payroll/loanCalc';
import { writeManagedLines } from '../services/payroll/payComponents';
import {
  recomputeEntry, attachOpenArrears, reversibleLopMonths, reverseLop, addRetroLop, cancelArrear,
} from '../services/payroll/arrears';
import {
  sumArrears, serviceLength, gratuityAmount, leaveEncashmentAmount, noticeAmounts,
  settlementPayDays, settlementLines, SETTLEMENT_KEYS,
} from '../services/payroll/arrearCalc';
import { payAmount } from '../services/payroll/payoutCalc';
import { esc, amt, inr, monthLabel, reportShell } from '../services/payroll/reportHtml';
import { amountInWords } from '../services/payrollCalc';
import { newEntryData } from './payrollController';
import { settingsForPerson } from '../services/payroll/structures';
import { takeNumber } from '../services/numberSeries';

const str = (v: any) => String(v ?? '').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const dash = '<span class="muted">—</span>';
const dateLabel = (date?: string | null) => (date
  ? new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const settingsFor = (organizationId: string) =>
  prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });

function fyInput(value: any): number {
  if (value === undefined || value === null || value === '') return financialYearOf(currentPeriodIST()).startYear;
  const year = Number(/^(\d{4})/.exec(String(value))?.[1]);
  if (!year || year < 2000 || year > 2100) throw new AppError(400, 'Pick a financial year');
  return year;
}
const amount = (v: any, label: string): number => {
  const n = Number(v || 0);
  if (!isFinite(n) || n < 0) throw new AppError(400, `${label} cannot be negative`);
  return r2(n);
};

// ---- Arrears ------------------------------------------------------------------
const ARREAR_INCLUDE = {
  person: { select: { id: true, name: true, employeeNo: true } },
  paidEntry: { select: { runId: true, paidOn: true, run: { select: { period: true, status: true } } } },
};

// Where an arrear stands: waiting for a run, on a draft payslip, or paid.
function arrearState(item: any): { state: string; label: string } {
  if (item.status !== 'OPEN') return { state: 'CANCELLED', label: 'Cancelled' };
  if (!item.paidEntry) return { state: 'WAITING', label: 'Waiting for the next run' };
  const month = monthLabel(item.paidEntry.run.period);
  return item.paidEntry.run.status === 'FINALIZED'
    ? { state: 'PAID', label: `Paid with ${month} salary` }
    : { state: 'IN_DRAFT', label: `On the ${month} draft` };
}

const arrearJSON = (item: any) => ({
  id: item.id, person: item.person, kind: item.kind, sourcePeriod: item.sourcePeriod,
  lopDays: item.lopDays, fromPackage: item.fromPackage, toPackage: item.toPackage,
  gross: item.gross, pfEmployee: item.pfEmployee, esiEmployee: item.esiEmployee,
  net: r2(item.gross - item.pfEmployee - item.esiEmployee),
  recovery: item.gross < 0, // pay taken back, not paid
  reason: item.reason, createdByName: item.createdByName, createdAt: item.createdAt,
  runId: item.paidEntry?.runId || null, ...arrearState(item),
});

// Arrear items whose paying month falls in a financial year, plus those still waiting.
async function arrearsOfYear(organizationId: string, fyStart: number, where: any = {}) {
  const periods = periodsOfFinancialYear(fyStart);
  const items = await prisma.arrearItem.findMany({
    where: {
      organizationId, status: 'OPEN', ...where,
      OR: [{ paidEntry: { run: { period: { in: periods } } } }, { paidEntryId: null }],
    },
    include: ARREAR_INCLUDE,
  });
  return items.sort((a, b) =>
    (a.paidEntry?.run.period || '9999').localeCompare(b.paidEntry?.run.period || '9999')
    || a.person.name.localeCompare(b.person.name) || a.sourcePeriod.localeCompare(b.sourcePeriod));
}

// ---- Settlements ------------------------------------------------------------------
const SETTLEMENT_INCLUDE = {
  person: { select: { id: true, name: true, employeeNo: true, designation: true, department: true, joinDate: true, leavingDate: true, panNumber: true } },
  entry: { include: { run: { select: { id: true, period: true, status: true } }, lines: true } },
};

const isFinal = (s: any) => s.entry?.run.status === 'FINALIZED';

function settlementState(s: any): { state: string; label: string } {
  if (!s.entry) return { state: 'NOT_APPLIED', label: `Waiting for the ${monthLabel(s.period)} run` };
  if (s.entry.run.status !== 'FINALIZED') return { state: 'IN_DRAFT', label: `On the ${monthLabel(s.entry.run.period)} draft` };
  return s.entry.paidOn
    ? { state: 'PAID', label: `Paid on ${dateLabel(s.entry.paidOn)}` }
    : { state: 'FINALIZED', label: `Finalized with ${monthLabel(s.entry.run.period)} salary` };
}

const totalsOf = (s: any) => Object.fromEntries(SETTLEMENT_KEYS.map(k => [k, s[k]])) as any;

const settlementJSON = (s: any) => ({
  id: s.id, person: s.person, sequence: s.sequence, settlementNo: s.settlementNo || '', period: s.period,
  lastWorkingDate: s.lastWorkingDate, resignedOn: s.resignedOn, reason: s.reason, payDays: s.payDays,
  monthlyGross: s.monthlyGross, basicDa: s.basicDa, serviceYears: s.serviceYears,
  noticeDays: s.noticeDays, noticeServedDays: s.noticeServedDays, noticePayDays: s.noticePayDays,
  leaveDays: s.leaveDays, gratuityYears: s.gratuityYears,
  ...totalsOf(s), remarks: s.remarks, createdByName: s.createdByName, createdAt: s.createdAt,
  runId: s.entry?.run.id || null, entryId: s.entryId,
  netPayable: s.entry ? payAmount(s.entry) : null,
  locked: isFinal(s), ...settlementState(s),
});

async function fetchSettlement(id: string, organizationId: string) {
  const s = await prisma.settlement.findFirst({ where: { id, organizationId }, include: SETTLEMENT_INCLUDE });
  if (!s) throw new AppError(404, 'Settlement not found');
  return s;
}

// Everything worked out for a leaving employee from their record and the
// figures typed so far.
async function workings(organizationId: string, personId: string, b: any) {
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: {
      id: true, name: true, employeeNo: true, designation: true, joinDate: true, leavingDate: true,
      currentMonthlyPackage: true, isEsiEligible: true, isPfApplicable: true, employmentStatus: true,
    },
  });
  if (!person) throw new AppError(404, 'Person not found');
  const settings = await settingsFor(organizationId);
  // As typed, else the leaving date on record, else what an earlier settlement used, else today
  const before = await prisma.settlement.findFirst({ where: { personId: person.id }, orderBy: { sequence: 'desc' }, select: { lastWorkingDate: true } });
  const lastWorkingDate = str(b.lastWorkingDate) || person.leavingDate || before?.lastWorkingDate || todayIST();
  if (!DATE.test(lastWorkingDate) || isNaN(Date.parse(lastWorkingDate))) throw new AppError(400, 'Enter the last working day');
  // Split by the employee's structure template, when one applies to them
  const monthly = salaryStructure(person.currentMonthlyPackage || 0, person, (await settingsForPerson(organizationId, settings, person)).settings).monthly;
  const basicDa = r2(monthly.basic + monthly.da);
  const service = serviceLength(person.joinDate, lastWorkingDate);
  const noticeDays = b.noticeDays === undefined || b.noticeDays === '' ? settings.noticePeriodDays : Number(b.noticeDays);
  const noticeServedDays = b.noticeServedDays === undefined || b.noticeServedDays === '' ? noticeDays : Number(b.noticeServedDays);
  const noticePayDays = Number(b.noticePayDays || 0);
  const leaveDays = Number(b.leaveDays || 0);
  for (const n of [noticeDays, noticeServedDays, noticePayDays, leaveDays]) {
    if (!isFinite(n) || n < 0) throw new AppError(400, 'Days cannot be negative');
  }
  const gratuity = gratuityAmount(basicDa, service, settings);
  const notice = noticeAmounts({ noticeDays, noticeServedDays, noticePayDays }, monthly.grossSalary, settings.settlementDayBasis);
  return {
    person, settings, lastWorkingDate, service, basicDa, monthlyGross: monthly.grossSalary,
    noticeDays, noticeServedDays, noticePayDays, leaveDays,
    computed: {
      leaveEncashment: leaveEncashmentAmount(leaveDays, basicDa, settings.settlementDayBasis),
      gratuity: gratuity.amount, gratuityYears: gratuity.years, gratuityEligible: gratuity.eligible,
      noticePay: notice.noticePay, noticeRecovery: notice.noticeRecovery, noticeShortfallDays: notice.shortfallDays,
    },
  };
}

// Active loans of an employee, with what is owed and what the month takes.
async function loansOf(organizationId: string, personId: string, period: string) {
  const loans = await prisma.loan.findMany({
    where: { organizationId, personId, status: 'ACTIVE' },
    include: { transactions: true, schedule: { where: { status: 'DUE' } } },
  });
  return loans.map(l => ({
    id: l.id, loanNo: l.loanNo, title: l.title,
    outstanding: outstandingPrincipal(l.transactions),
    dueInPeriod: r2(l.schedule.filter(s => s.period === period).reduce((t, s) => t + s.principal, 0)),
    later: r2(l.schedule.filter(s => s.period > period).reduce((t, s) => t + s.principal, 0)),
  })).filter(l => l.outstanding > 0);
}

// Put the settlement on the employee's payslip in the draft run of its
// month, creating the payslip if the employee has already been marked as
// left. Returns false when there is no open run to put it on.
async function applySettlement(req: any, settlementId: string) {
  const organizationId = req.user?.organizationId;
  const s = await prisma.settlement.findFirst({ where: { id: settlementId, organizationId }, include: { entry: { include: { run: true } } } });
  if (!s) throw new AppError(404, 'Settlement not found');
  if (s.entry?.run.status === 'FINALIZED') throw new AppError(400, 'This settlement is finalized. Record a resettlement to correct it.');
  const run = await prisma.payrollRun.findUnique({ where: { organizationId_period: { organizationId, period: s.period } } });

  // Moved to another month, or its run has gone: take it off the old payslip
  if (s.entry && (!run || s.entry.runId !== run.id)) {
    await clearSettlementLines(organizationId, s.entry.id);
    await prisma.settlement.update({ where: { id: s.id }, data: { entryId: null } });
  }
  if (!run || run.status !== 'DRAFT') return { applied: false, why: run ? `Payroll for ${monthLabel(s.period)} is finalized. Pick a later month.` : `There is no payroll run for ${monthLabel(s.period)} yet.` };
  if (run.inputsLockedAt) return { applied: false, why: `Inputs for ${monthLabel(s.period)} are locked. Unlock them, then apply the settlement.` };

  let entry = await prisma.payslipEntry.findUnique({ where: { runId_personId: { runId: run.id, personId: s.personId } } });
  if (!entry) {
    const emp = await prisma.person.findFirst({
      where: { id: s.personId, organizationId }, omit: { photoData: true },
      include: { salaryRevisions: true, workLocation: { select: LOCATION_FOR_PAYROLL } },
    });
    const twd = (await prisma.payslipEntry.findFirst({ where: { runId: run.id }, select: { totalWorkingDays: true } }))?.totalWorkingDays || 30;
    const ctx = await loadStatutoryContext(organizationId, run.period);
    entry = await prisma.payslipEntry.create({ data: newEntryData(ctx, organizationId, run.id, emp, twd) });
  }
  const earlier = await prisma.settlement.findMany({ where: { personId: s.personId, sequence: { lt: s.sequence } } });
  const lines = settlementLines(totalsOf(s), earlier.map(totalsOf));
  await writeManagedLines(organizationId, entry.id, 'SETTLEMENT', {
    LEAVE_ENCASHMENT: lines.leaveEncashment, GRATUITY: lines.gratuity, NOTICE_PAY: lines.noticePay,
    NOTICE_PAY_RECOVERY: lines.noticeRecovery, SETTLEMENT_ADJUSTMENT: lines.adjustmentPay, SETTLEMENT_RECOVERY: lines.adjustmentRecovery,
  });
  await prisma.settlement.update({ where: { id: s.id }, data: { entryId: entry.id } });
  // Paid days of the month: none for someone who left before it, else what
  // the settlement sets (a resettlement leaves the attendance alone)
  const payDays = settlementPayDays(s.period, s.lastWorkingDate, entry.totalWorkingDays) === 0 ? 0
    : s.sequence === 1 ? s.payDays : null;
  const patch = payDays != null
    ? { lopDays: Math.max(0, r2(entry.totalWorkingDays - Math.min(payDays, entry.totalWorkingDays))) } : {};
  await recomputeEntry(organizationId, entry.id, patch);
  await attachOpenArrears(organizationId, run.id, s.personId);
  return { applied: true, why: '' };
}

async function clearSettlementLines(organizationId: string, entryId: string) {
  const entry = await prisma.payslipEntry.findUnique({ where: { id: entryId }, include: { run: true } });
  if (!entry || entry.run.status !== 'DRAFT') return;
  await prisma.payslipLine.deleteMany({ where: { entryId, source: 'SETTLEMENT' } });
  await recomputeEntry(organizationId, entryId);
}

function settlementData(w: Awaited<ReturnType<typeof workings>>, b: any) {
  const period = str(b.period);
  if (!PERIOD.test(period)) throw new AppError(400, 'Pick the payroll month the settlement is paid in');
  const resignedOn = str(b.resignedOn);
  if (resignedOn && !DATE.test(resignedOn)) throw new AppError(400, 'Enter a valid resignation date');
  const payDays = b.payDays === '' || b.payDays === null || b.payDays === undefined ? null : Number(b.payDays);
  if (payDays !== null && (!isFinite(payDays) || payDays < 0 || payDays > 31)) throw new AppError(400, 'Paid days must be between 0 and 31');
  // Amounts as typed; left out, they take the computed figure
  const typed = (key: 'leaveEncashment' | 'gratuity' | 'noticePay' | 'noticeRecovery', label: string) =>
    (b[key] === undefined || b[key] === '' ? w.computed[key] : amount(b[key], label));
  return {
    period, lastWorkingDate: w.lastWorkingDate, resignedOn: resignedOn || null, reason: str(b.reason), payDays,
    monthlyGross: w.monthlyGross, basicDa: w.basicDa, serviceYears: w.service.totalYears,
    noticeDays: w.noticeDays, noticeServedDays: w.noticeServedDays, noticePayDays: w.noticePayDays,
    leaveDays: w.leaveDays, gratuityYears: w.computed.gratuityYears,
    leaveEncashment: typed('leaveEncashment', 'Leave encashment'), gratuity: typed('gratuity', 'Gratuity'),
    noticePay: typed('noticePay', 'Notice pay'), noticeRecovery: typed('noticeRecovery', 'Notice recovery'),
    remarks: str(b.remarks),
  };
}

export const payrollArrearsController = {
  // ---- Arrears ---------------------------------------------------------------------
  async getArrears(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const [items, settings] = await Promise.all([
      prisma.arrearItem.findMany({ where: { organizationId }, include: ARREAR_INCLUDE, orderBy: { createdAt: 'desc' }, take: 300 }),
      settingsFor(organizationId),
    ]);
    const rows = items.map(arrearJSON);
    const open = rows.filter(r => r.state === 'WAITING' || r.state === 'IN_DRAFT');
    res.json({
      arrears: rows,
      lopReversalMonths: settings.lopReversalMonths,
      totals: {
        open: { count: open.filter(r => !r.recovery).length, amount: r2(open.filter(r => !r.recovery).reduce((s, r) => s + r.gross, 0)) },
        recovering: { count: open.filter(r => r.recovery).length, amount: r2(open.filter(r => r.recovery).reduce((s, r) => s - r.gross, 0)) },
        waiting: rows.filter(r => r.state === 'WAITING').length,
        paid: rows.filter(r => r.state === 'PAID').length,
      },
    });
  },

  // Months of an employee with loss of pay that can still be reversed.
  async getLopMonths(req: any, res: Response) {
    res.json(await reversibleLopMonths(req.user?.organizationId, req.params.personId));
  },

  async reverseLop(req: any, res: Response) {
    const days = Number(req.body.days);
    if (!isFinite(days) || days <= 0) throw new AppError(400, 'Enter the number of days to reverse');
    const { item, paidIn } = await reverseLop(req, str(req.body.entryId), Math.round(days * 2) / 2, str(req.body.reason));
    res.status(201).json({ gross: item.gross, paidIn });
  },

  // Loss of pay added to a finalized month; the pay comes back on the next payslip.
  async addRetroLop(req: any, res: Response) {
    const days = Number(req.body.days);
    if (!isFinite(days) || days <= 0) throw new AppError(400, 'Enter the number of days of loss of pay');
    const reason = str(req.body.reason);
    if (!reason) throw new AppError(400, 'Give a reason: this takes back pay already given');
    const { item, paidIn } = await addRetroLop(req, str(req.body.entryId), Math.round(days * 2) / 2, reason);
    res.status(201).json({ gross: item.gross, net: r2(item.gross - item.pfEmployee - item.esiEmployee), paidIn });
  },

  async cancelArrear(req: any, res: Response) {
    const reason = str(req.body.reason);
    if (!reason) throw new AppError(400, 'Give a reason for cancelling');
    await cancelArrear(req, req.params.arrearId, reason);
    res.json({ message: 'Arrear cancelled' });
  },

  // ---- Settlements -------------------------------------------------------------------
  async getSettlements(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const [settlements, leavers] = await Promise.all([
      prisma.settlement.findMany({ where: { organizationId }, include: SETTLEMENT_INCLUDE, orderBy: { createdAt: 'desc' } }),
      // People who have left or are leaving and have no settlement yet
      prisma.person.findMany({
        where: {
          organizationId, kind: 'CANDIDATE', isEmployee: true, settlements: { none: {} },
          OR: [{ employmentStatus: { in: ['NOTICE_PERIOD', 'RESIGNED', 'TERMINATED'] } }, { leavingDate: { not: null } }],
        },
        select: { id: true, name: true, employeeNo: true, employmentStatus: true, leavingDate: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    res.json({ settlements: settlements.map(settlementJSON), leavers });
  },

  // Figures for the settlement form: computed defaults and what else the
  // last payslip will carry.
  async previewSettlement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const w = await workings(organizationId, req.params.personId, req.body);
    const [draft, earlier, openArrears, claims] = await Promise.all([
      prisma.payrollRun.findFirst({ where: { organizationId, status: 'DRAFT' }, orderBy: { period: 'asc' } }),
      prisma.settlement.findMany({ where: { personId: w.person.id }, include: SETTLEMENT_INCLUDE, orderBy: { sequence: 'asc' } }),
      prisma.arrearItem.findMany({ where: { organizationId, personId: w.person.id, status: 'OPEN', OR: [{ paidEntryId: null }, { paidEntry: { run: { status: 'DRAFT' } } }] } }),
      prisma.expenseReport.count({ where: { organizationId, personId: w.person.id, status: 'APPROVED', payrollEntryId: null } }),
    ]);
    const period = PERIOD.test(str(req.body.period)) ? str(req.body.period)
      : draft?.period || (w.lastWorkingDate.slice(0, 7) > currentPeriodIST() ? w.lastWorkingDate.slice(0, 7) : currentPeriodIST());
    const run = await prisma.payrollRun.findUnique({
      where: { organizationId_period: { organizationId, period } },
      include: { entries: { select: { personId: true, totalWorkingDays: true }, take: 1 } },
    });
    const twd = run?.entries[0]?.totalWorkingDays || 0;
    const open = earlier.find(s => !isFinal(s));
    res.json({
      person: w.person, lastWorkingDate: w.lastWorkingDate, period,
      service: w.service, basicDa: w.basicDa, monthlyGross: w.monthlyGross,
      dayBasis: w.settings.settlementDayBasis, gratuityMinYears: w.settings.gratuityMinYears,
      noticeDays: w.noticeDays, noticeServedDays: w.noticeServedDays, noticePayDays: w.noticePayDays, leaveDays: w.leaveDays,
      computed: w.computed,
      run: run ? { id: run.id, status: run.status, inputsLocked: Boolean(run.inputsLockedAt), totalWorkingDays: twd } : null,
      payDays: twd ? settlementPayDays(period, w.lastWorkingDate, twd) : null,
      loans: await loansOf(organizationId, w.person.id, period),
      openArrears: r2(sumArrears(openArrears).gross), approvedClaims: claims,
      // A settlement still being worked on is edited; once paid, a new one corrects it
      openSettlementId: open?.id || null,
      earlier: earlier.filter(isFinal).map(s => ({ sequence: s.sequence, period: s.period, ...totalsOf(s) })),
    });
  },

  async createSettlement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const w = await workings(organizationId, str(req.body.personId), req.body);
    const earlier = await prisma.settlement.findMany({ where: { personId: w.person.id }, include: SETTLEMENT_INCLUDE });
    if (earlier.some(s => !isFinal(s))) throw new AppError(400, `${w.person.name} already has a settlement being worked on. Edit that one.`);
    const data = settlementData(w, req.body);
    await assertPeriodOpen(organizationId, data.period);
    const sequence = Math.max(0, ...earlier.map(s => s.sequence)) + 1;
    const created = await prisma.settlement.create({
      data: {
        organizationId, personId: w.person.id, sequence, ...data,
        // A number from the series, when one is set up
        settlementNo: (await takeNumber(organizationId, 'SETTLEMENT')) || '',
        // A resettlement leaves the attendance of its month alone
        payDays: sequence === 1 ? data.payDays : null,
        createdByName: await actorName(req.user?.userId),
      },
    });
    const result = await applySettlement(req, created.id);
    await logPayrollAudit(req, [{
      action: 'SETTLEMENT_SAVED', personId: w.person.id, personName: w.person.name, period: data.period,
      field: sequence === 1 ? 'Final settlement' : `Resettlement ${sequence - 1}`,
      newValue: `Leave ${data.leaveEncashment}, gratuity ${data.gratuity}, notice pay ${data.noticePay}, notice recovery ${data.noticeRecovery}`,
    }]);
    res.status(201).json({ ...settlementJSON(await fetchSettlement(created.id, organizationId)), ...result });
  },

  async getSettlement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const s = await fetchSettlement(req.params.settlementId, organizationId);
    res.json({ ...settlementJSON(s), loans: await loansOf(organizationId, s.personId, s.period) });
  },

  async updateSettlement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const s = await fetchSettlement(req.params.settlementId, organizationId);
    if (isFinal(s)) throw new AppError(400, 'This settlement is finalized. Record a resettlement to correct it.');
    const w = await workings(organizationId, s.personId, req.body);
    const data = settlementData(w, req.body);
    await assertPeriodOpen(organizationId, data.period);
    await prisma.settlement.update({ where: { id: s.id }, data: { ...data, payDays: s.sequence === 1 ? data.payDays : null } });
    const result = await applySettlement(req, s.id);
    await logPayrollAudit(req, [{
      action: 'SETTLEMENT_SAVED', personId: s.personId, personName: s.person.name, period: data.period,
      field: s.sequence === 1 ? 'Final settlement' : `Resettlement ${s.sequence - 1}`,
      oldValue: `Leave ${s.leaveEncashment}, gratuity ${s.gratuity}, notice pay ${s.noticePay}, notice recovery ${s.noticeRecovery}`,
      newValue: `Leave ${data.leaveEncashment}, gratuity ${data.gratuity}, notice pay ${data.noticePay}, notice recovery ${data.noticeRecovery}`,
    }]);
    res.json({ ...settlementJSON(await fetchSettlement(s.id, organizationId)), ...result });
  },

  // Try again to put a waiting settlement on its month's payslip.
  async applySettlement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const s = await fetchSettlement(req.params.settlementId, organizationId);
    const result = await applySettlement(req, s.id);
    if (!result.applied) throw new AppError(400, result.why);
    res.json(settlementJSON(await fetchSettlement(s.id, organizationId)));
  },

  async deleteSettlement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const s = await fetchSettlement(req.params.settlementId, organizationId);
    if (isFinal(s)) throw new AppError(400, 'This settlement is finalized and cannot be deleted. Reopen its payroll run first.');
    if (s.entryId) await clearSettlementLines(organizationId, s.entryId);
    await prisma.settlement.delete({ where: { id: s.id } });
    await logPayrollAudit(req, [{
      action: 'SETTLEMENT_DELETED', personId: s.personId, personName: s.person.name, period: s.period,
      field: s.sequence === 1 ? 'Final settlement' : `Resettlement ${s.sequence - 1}`,
    }]);
    res.json({ message: 'Settlement deleted' });
  },

  // Bring everything still owed on the employee's loans into the
  // settlement month, so the last payslip recovers it.
  async recoverLoans(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const s = await fetchSettlement(req.params.settlementId, organizationId);
    if (isFinal(s)) throw new AppError(400, 'This settlement is finalized');
    await assertPeriodOpen(organizationId, s.period);
    const loans = await prisma.loan.findMany({ where: { organizationId, personId: s.personId, status: 'ACTIVE' }, include: { transactions: true } });
    const userName = await actorName(req.user?.userId);
    let recovered = 0;
    for (const loan of loans) {
      const outstanding = outstandingPrincipal(loan.transactions);
      if (outstanding <= 0) continue;
      await prisma.loanTransaction.create({
        data: {
          organizationId, loanId: loan.id, date: todayIST(), type: 'REVISION', balanceAfter: outstanding, createdByName: userName,
          remarks: `Whole balance due in ${monthLabel(s.period)}: final settlement`,
        },
      });
      await regenerateSchedule(loan, { outstanding, annualRate: loan.annualRate, instalments: 1, startPeriod: s.period });
      await logPayrollAudit(req, [{
        action: 'LOAN_CHANGED', personId: s.personId, personName: s.person.name, period: s.period,
        field: `${loan.loanNo} · recovered in final settlement`, newValue: String(outstanding), source: 'LOAN',
      }]);
      recovered = r2(recovered + outstanding);
    }
    if (s.entry && s.entry.run.status === 'DRAFT') await recomputeEntry(organizationId, s.entry.id);
    res.json({ recovered, message: recovered ? `${inr(recovered)} of loans will be recovered in ${monthLabel(s.period)}.` : 'No loan balance to recover.' });
  },

  // ---- Reports -------------------------------------------------------------------------
  // The full and final settlement statement of one settlement.
  async settlementStatement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const s = await fetchSettlement(str(req.query.settlementId), organizationId);
    const brand = await orgBrand(organizationId);
    const e: any = s.entry;
    const service = serviceLength(s.person.joinDate, s.lastWorkingDate);
    const row = (label: string, value: number) => (Math.abs(value) >= 0.005 ? `<tr><td>${esc(label)}</td><td class="amt">${inr(value)}</td></tr>` : '');
    const lineRows = (type: string) => (e?.lines || []).filter((l: any) => l.type === type)
      .sort((a: any, b: any) => a.name.localeCompare(b.name)).map((l: any) => row(l.name, l.amount)).join('');
    const title = s.sequence === 1 ? 'Full and Final Settlement' : `Resettlement ${s.sequence - 1}`;
    const pay = e ? payAmount(e) : 0;
    const body = e ? `
  <div style="display:flex;gap:18px;align-items:flex-start;">
    <table class="st-table" style="flex:1;">
      <tr><th>Earnings</th><th class="amt">Amount</th></tr>
      ${row('Basic', e.basic)}${row('Dearness Allowance', e.da)}${row('House Rent Allowance', e.hra)}
      ${row('Transport Allowance', e.transportAllowance)}${row('Food Allowance', e.foodAllowance)}
      ${row('Internet Allowance', e.internetAllowance)}${row('Salary Arrear', e.salaryArrearAllowance)}
      ${lineRows('EARNING')}
      <tr class="tot"><td>Total earnings</td><td class="amt">${inr(e.grossSalary)}</td></tr>
    </table>
    <table class="st-table" style="flex:1;">
      <tr><th>Deductions and recoveries</th><th class="amt">Amount</th></tr>
      ${row('ESI (Employee)', e.esiEmployee)}${row('PF (Employee)', e.pfEmployee)}${row('Salary Advance', e.salaryAdvance)}
      ${row('TDS', e.tds)}${row('Professional Tax', e.professionalTax)}${row('Labour Welfare Fund', e.lwfEmployee)}
      ${row('Loan recovery', e.loanDeduction)}
      ${lineRows('DEDUCTION')}
      ${e.totalDeductions ? '' : '<tr><td class="muted">None</td><td class="amt">—</td></tr>'}
      <tr class="tot"><td>Total deductions</td><td class="amt">${inr(e.totalDeductions)}</td></tr>
    </table>
  </div>
  ${e.reimbursement > 0 ? `<table class="st-table" style="width:auto;min-width:50%;"><tr><td>Expense claims paid with this settlement (not taxed)</td><td class="amt">${inr(e.reimbursement)}</td></tr></table>` : ''}
  <table class="st-table">
    <tr class="tot"><td>${pay >= 0 ? 'Net payable to the employee' : 'Net recoverable from the employee'}</td><td class="amt" style="font-size:14px;">${inr(Math.abs(pay))}</td></tr>
    <tr><td colspan="2" class="muted">${esc(amountInWords(Math.abs(pay)))}${e.paidOn ? ` · paid on ${esc(dateLabel(e.paidOn))}${e.paymentRef ? `, ref ${esc(e.paymentRef)}` : ''}` : ''}</td></tr>
  </table>` : `
  <table class="st-table" style="width:auto;min-width:60%;">
    <tr><th>Settlement amounts</th><th class="amt">Amount</th></tr>
    ${row('Leave encashment', s.leaveEncashment)}${row('Gratuity', s.gratuity)}${row('Notice pay', s.noticePay)}
    ${row('Less: Notice period recovery', s.noticeRecovery)}
  </table>
  <p class="muted" style="font-size:12px;">Not yet on a payslip: the salary, statutory deductions and tax of ${esc(monthLabel(s.period))} will appear here once that month's payroll run exists.</p>`;
    const shortfall = Math.max(0, s.noticeDays - s.noticeServedDays);
    const html = reportShell(brand, title, `${s.person.name} · ${monthLabel(s.period)}${s.settlementNo ? ` · No. ${s.settlementNo}` : ''}`, `
  <style>@media print { @page { size: A4 portrait; margin: 12mm; } }</style>
  <table class="st-table">
    <tr><td style="width:22%;">Employee</td><td><strong>${esc(s.person.name)}</strong>${s.person.employeeNo ? ` (${esc(s.person.employeeNo)})` : ''}</td>
      <td style="width:22%;">Designation</td><td>${esc(s.person.designation) || dash}</td></tr>
    <tr><td>Date of joining</td><td>${esc(dateLabel(s.person.joinDate)) || dash}</td><td>Last working day</td><td>${esc(dateLabel(s.lastWorkingDate))}</td></tr>
    <tr><td>Service</td><td>${service.years} years, ${service.months} months, ${service.days} days</td>
      <td>Resigned on</td><td>${esc(dateLabel(s.resignedOn)) || dash}</td></tr>
    <tr><td>Reason for leaving</td><td>${esc(s.reason) || dash}</td><td>Settled with</td><td>${esc(monthLabel(s.period))} salary${e ? `, ${e.payDays} of ${e.totalWorkingDays} days paid` : ''}</td></tr>
  </table>
  ${body}
  <div class="st-h">How the settlement amounts were worked out</div>
  <table class="st-table">
    <tr><th>Item</th><th>Working</th><th class="amt">Amount</th></tr>
    <tr><td>Leave encashment</td><td>${s.leaveDays} day${s.leaveDays === 1 ? '' : 's'} on Basic + DA of ${inr(s.basicDa)} a month</td><td class="amt">${inr(s.leaveEncashment)}</td></tr>
    <tr><td>Gratuity</td><td>${s.gratuity > 0 ? `15/26 × ${inr(s.basicDa)} × ${s.gratuityYears} years` : `Not payable (${service.years} completed years of service)`}</td><td class="amt">${inr(s.gratuity)}</td></tr>
    <tr><td>Notice pay</td><td>${s.noticePayDays} day${s.noticePayDays === 1 ? '' : 's'} on monthly gross of ${inr(s.monthlyGross)}</td><td class="amt">${inr(s.noticePay)}</td></tr>
    <tr><td>Notice period recovery</td><td>${s.noticeServedDays} of ${s.noticeDays} days served; ${shortfall} short</td><td class="amt">${inr(s.noticeRecovery)}</td></tr>
  </table>
  ${s.sequence > 1 ? '<p style="font-size:12px;color:#6b7280;">This is a resettlement: the amounts above are the corrected totals, and only the difference from what was settled before is on the payslip.</p>' : ''}
  ${s.remarks ? `<p style="font-size:12.5px;"><strong>Remarks:</strong> ${esc(s.remarks)}</p>` : ''}
  <div style="display:flex;justify-content:space-between;margin-top:46px;font-size:12.5px;">
    <div>____________________________<br/>Employee: I accept this as full and final settlement of my dues.</div>
    <div style="text-align:right;">${brand.signatureData ? `<div style="display:flex;justify-content:flex-end;">${signatureImg(brand.signatureData)}</div>` : ''}____________________________<br/>For ${esc(brand.name)}${brand.signatoryName ? `<br/>${esc(brand.signatoryName)}${brand.signatoryDesignation ? `, ${esc(brand.signatoryDesignation)}` : ''}` : ''}</div>
  </div>`);
    res.json({ html, title: `${title} — ${s.person.name}` });
  },

  // Every settlement whose month falls in a financial year.
  async settlementRegister(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fy = financialYearFor(fyInput(req.query.fy));
    const list = await prisma.settlement.findMany({
      where: { organizationId, period: { in: periodsOfFinancialYear(fy.startYear) } }, include: SETTLEMENT_INCLUDE,
    });
    list.sort((a, b) => a.period.localeCompare(b.period) || a.person.name.localeCompare(b.person.name) || a.sequence - b.sequence);
    const sum = (f: (s: typeof list[number]) => number) => r2(list.reduce((t, s) => t + f(s), 0));
    // Settlement amounts are totals as they finally stand, so only each
    // employee's latest settlement counts towards the column totals
    const latest = new Map<string, number>();
    for (const s of list) latest.set(s.personId, Math.max(latest.get(s.personId) || 0, s.sequence));
    const final = (f: (s: typeof list[number]) => number) => sum(s => (latest.get(s.personId) === s.sequence ? f(s) : 0));
    const rows = list.map((s, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(monthLabel(s.period))}</td><td class="nw">${esc(s.person.employeeNo)}</td><td class="nw">${esc(s.person.name)}</td>
      <td>${s.sequence === 1 ? 'Final settlement' : `Resettlement ${s.sequence - 1}`}</td><td class="nw">${esc(dateLabel(s.lastWorkingDate))}</td>
      <td class="amt">${amt(s.leaveEncashment)}</td><td class="amt">${amt(s.gratuity)}</td><td class="amt">${amt(s.noticePay)}</td><td class="amt">${amt(s.noticeRecovery)}</td>
      <td class="amt">${s.entry ? `<strong>${amt(payAmount(s.entry))}</strong>` : '—'}</td><td>${esc(settlementState(s).label)}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Settlement and Resettlement Report', `FY ${fy.label}`, `
  <table class="st-table">
    <tr><th>#</th><th>Paid with</th><th>Code</th><th>Employee</th><th>Kind</th><th>Last working day</th><th class="amt">Leave encashment</th>
      <th class="amt">Gratuity</th><th class="amt">Notice pay</th><th class="amt">Notice recovery</th><th class="amt">Net on the payslip</th><th>Status</th></tr>
    ${rows || `<tr><td colspan="12">No settlements in FY ${fy.label}.</td></tr>`}
    <tr class="tot"><td colspan="6">Total (${list.length})</td><td class="amt">${amt(final(s => s.leaveEncashment))}</td><td class="amt">${amt(final(s => s.gratuity))}</td>
      <td class="amt">${amt(final(s => s.noticePay))}</td><td class="amt">${amt(final(s => s.noticeRecovery))}</td>
      <td class="amt">${amt(sum(s => (s.entry ? payAmount(s.entry) : 0)))}</td><td></td></tr>
  </table>
  <p style="font-size:11.5px;color:#6b7280;">The net figure is the whole payslip of that month: salary to the last working day, the settlement amounts, statutory deductions, tax and recoveries. For a resettlement, the settlement columns show the corrected totals, and the total row counts each employee's latest figures once.</p>`);
    res.json({ html, title: `Settlement and Resettlement Report — FY ${fy.label}` });
  },

  // Arrears by the month they were paid in, component by component.
  async arrearReport(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fy = financialYearFor(fyInput(req.query.fy));
    const kind = str(req.query.kind); // "" = all, LOP_REVERSAL = reversals only
    const items = await arrearsOfYear(organizationId, fy.startYear, kind ? { kind } : {});
    const reversals = kind === 'LOP_REVERSAL';
    const rows = items.map((a, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${a.paidEntry ? esc(monthLabel(a.paidEntry.run.period)) + (a.paidEntry.run.status === 'DRAFT' ? ' <span class="muted">(draft)</span>' : '') : '<span class="muted">waiting</span>'}</td>
      <td class="nw">${esc(a.person.employeeNo)}</td><td class="nw">${esc(a.person.name)}</td><td class="nw">${esc(monthLabel(a.sourcePeriod))}</td>
      <td>${a.kind === 'LOP_REVERSAL' ? `${a.lopDays} LOP day${a.lopDays === 1 ? '' : 's'} reversed`
        : a.kind === 'LOP_RECOVERY' ? `${a.lopDays} LOP day${a.lopDays === 1 ? '' : 's'} added`
        : `Package ${amt(a.fromPackage)} → ${amt(a.toPackage)}`}${a.reason && reversals ? `<div class="muted" style="font-size:10.5px;">${esc(a.reason)}</div>` : ''}</td>
      <td class="amt">${amt(a.basic)}</td><td class="amt">${amt(a.da)}</td><td class="amt">${amt(a.hra)}</td><td class="amt">${amt(a.transportAllowance)}</td><td class="amt">${amt(a.foodAllowance)}</td>
      <td class="amt"><strong>${amt(a.gross)}</strong></td><td class="amt">${amt(a.pfEmployee)}</td><td class="amt">${amt(a.esiEmployee)}</td>
      <td class="amt">${amt(r2(a.gross - a.pfEmployee - a.esiEmployee))}</td></tr>`).join('');
    const t = sumArrears(items);
    const name = reversals ? 'LOP Reversal Report' : 'Arrear Report';
    const html = reportShell(await orgBrand(organizationId), name, `FY ${fy.label}`, `
  <table class="st-table">
    <tr><th>#</th><th>Paid with</th><th>Code</th><th>Employee</th><th>For the month</th><th>Why</th>
      <th class="amt">Basic</th><th class="amt">DA</th><th class="amt">HRA</th><th class="amt">Transport</th><th class="amt">Food</th>
      <th class="amt">Arrear</th><th class="amt">PF</th><th class="amt">ESI</th><th class="amt">Net</th></tr>
    ${rows || `<tr><td colspan="15">${reversals ? 'No loss of pay was reversed' : 'No arrears'} in FY ${fy.label}.</td></tr>`}
    <tr class="tot"><td colspan="6">Total (${items.length})</td>
      <td class="amt">${amt(t.basic)}</td><td class="amt">${amt(t.da)}</td><td class="amt">${amt(t.hra)}</td><td class="amt">${amt(t.transportAllowance)}</td><td class="amt">${amt(t.foodAllowance)}</td>
      <td class="amt">${amt(t.gross)}</td><td class="amt">${amt(t.pfEmployee)}</td><td class="amt">${amt(t.esiEmployee)}</td>
      <td class="amt">${amt(r2(t.gross - t.pfEmployee - t.esiEmployee))}</td></tr>
  </table>
  <p style="font-size:11.5px;color:#6b7280;">Listed by the month the arrear is paid in; arrears still waiting for a payroll run come last. Cancelled arrears are left out.</p>`);
    res.json({ html, title: `${name} — FY ${fy.label}` });
  },

  // PF and ESI on arrears, employee and employer shares, by paying month:
  // for the supplementary (arrear) remittance.
  async pfArrearReport(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fy = financialYearFor(fyInput(req.query.fy));
    const all = await arrearsOfYear(organizationId, fy.startYear);
    const items = all.filter(a => a.pfEmployee || a.pfEmployer || a.esiEmployee || a.esiEmployer);
    const people = await prisma.person.findMany({
      where: { id: { in: [...new Set(items.map(a => a.personId))] } }, select: { id: true, pfUan: true, esiNumber: true },
    });
    const numbers = new Map(people.map(p => [p.id, p]));
    const rows = items.map((a, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${a.paidEntry ? esc(monthLabel(a.paidEntry.run.period)) : '<span class="muted">waiting</span>'}</td>
      <td class="nw">${esc(a.person.employeeNo)}</td><td class="nw">${esc(a.person.name)}</td>
      <td class="nw">${esc(numbers.get(a.personId)?.pfUan) || dash}</td><td class="nw">${esc(monthLabel(a.sourcePeriod))}</td>
      <td class="amt">${amt(r2(a.basic + a.da))}</td><td class="amt">${amt(a.pfEmployee)}</td><td class="amt">${amt(a.pfEmployer)}</td>
      <td class="amt">${amt(a.gross)}</td><td class="amt">${amt(a.esiEmployee)}</td><td class="amt">${amt(a.esiEmployer)}</td></tr>`).join('');
    const t = sumArrears(items);
    const html = reportShell(await orgBrand(organizationId), 'PF and ESI on Arrears', `FY ${fy.label}`, `
  <table class="st-table">
    <tr><th>#</th><th>Paid with</th><th>Code</th><th>Employee</th><th>UAN</th><th>For the month</th>
      <th class="amt">Basic + DA arrear</th><th class="amt">PF employee</th><th class="amt">PF employer</th>
      <th class="amt">Arrear wages</th><th class="amt">ESI employee</th><th class="amt">ESI employer</th></tr>
    ${rows || `<tr><td colspan="12">No PF or ESI on arrears in FY ${fy.label}.</td></tr>`}
    <tr class="tot"><td colspan="6">Total</td><td class="amt">${amt(r2(t.basic + t.da))}</td><td class="amt">${amt(t.pfEmployee)}</td><td class="amt">${amt(t.pfEmployer)}</td>
      <td class="amt">${amt(t.gross)}</td><td class="amt">${amt(t.esiEmployee)}</td><td class="amt">${amt(t.esiEmployer)}</td></tr>
  </table>
  <p style="font-size:11.5px;color:#6b7280;">The employee shares are deducted on the payslip as "PF on Arrears" and "ESI on Arrears". The employer shares are not in the
  month's PF statement, ECR file or journal voucher: remit them with the arrear (supplementary) return and post them by hand.</p>`);
    res.json({ html, title: `PF and ESI on Arrears — FY ${fy.label}` });
  },
};
