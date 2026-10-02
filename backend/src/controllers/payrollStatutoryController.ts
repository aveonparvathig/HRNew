import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { orgBrand } from '../services/orgBrand';
import { logPayrollAudit, actorName } from '../services/payroll/audit';
import { INDIAN_STATES } from '../services/payroll/constants';
import {
  financialYearFor, financialYearOf, periodsOfFinancialYear,
} from '../services/payroll/financialYear';
import {
  halfYearOf, parseMonths, pfBreakup, pfAdminCharge, ptPolicyInForce, ptAreaLabel, townKey,
} from '../services/payroll/statutoryCalc';
import {
  esc, amt, inr, monthLabel, monthShort, reportShell,
} from '../services/payroll/reportHtml';
import { periodEndDate } from '../services/positionCalc';
import { stampPositions, stampRun } from '../services/positions';

const str = (v: any) => String(v ?? '').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const sum = (rows: any[], f: (row: any) => number) => r2(rows.reduce((s, row) => s + f(row), 0));
const days = (n: number) => { const v = Number(n || 0); return v % 1 === 0 ? String(v) : v.toFixed(1); };
const byName = (a: any, b: any) => (a.person?.name || '').localeCompare(b.person?.name || '');

const REMITTANCE_TYPES = ['PF', 'ESI', 'PT', 'LWF'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

async function settingsFor(organizationId: string) {
  return prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });
}

async function fetchRun(runId: string, organizationId: string) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, organizationId },
    include: { entries: { include: {
      person: { select: {
        id: true, name: true, employeeNo: true, pfUan: true, pfNumber: true, esiNumber: true,
        leavingDate: true, workLocation: { select: { name: true, state: true, city: true } },
      } },
    } } },
  });
  if (!run) throw new AppError(404, 'Payroll run not found');
  // The work location each employee was at in the run's month
  await stampRun(organizationId, run, { location: true });
  return run;
}

function periodInput(value: any, message: string): string {
  const period = str(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new AppError(400, message);
  return period;
}

function stateInput(value: any): string {
  const state = str(value);
  if (!INDIAN_STATES.includes(state)) throw new AppError(400, 'Pick a state from the list');
  return state;
}

function monthsInput(value: any, required: boolean): string {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '');
  const months = [...new Set(parseMonths(raw))];
  if (required && months.length === 0) throw new AppError(400, 'Pick at least one deduction month');
  return months.join(',');
}

function ptInput(b: any) {
  const frequency = str(b.frequency);
  if (!['MONTHLY', 'HALF_YEARLY'].includes(frequency)) throw new AppError(400, 'Pick monthly or half-yearly');
  const deductionMode = frequency === 'HALF_YEARLY' && str(b.deductionMode) === 'LUMP_SUM' ? 'LUMP_SUM' : 'SPREAD';
  if (!Array.isArray(b.slabs) || b.slabs.length === 0) throw new AppError(400, 'Add at least one slab');
  const slabs = b.slabs.map((raw: any) => {
    const incomeFrom = Number(raw.incomeFrom);
    const incomeTo = raw.incomeTo === '' || raw.incomeTo == null ? null : Number(raw.incomeTo);
    const amount = Number(raw.amount);
    if (!isFinite(incomeFrom) || incomeFrom < 0 || !isFinite(amount) || amount < 0
      || (incomeTo !== null && (!isFinite(incomeTo) || incomeTo < incomeFrom))) {
      throw new AppError(400, 'Each slab needs a valid income range and amount');
    }
    return { incomeFrom, incomeTo, amount };
  }).sort((a: any, b: any) => a.incomeFrom - b.incomeFrom);
  for (let i = 1; i < slabs.length; i++) {
    const previous = slabs[i - 1];
    if (previous.incomeTo === null || slabs[i].incomeFrom <= previous.incomeTo) {
      throw new AppError(400, 'Slabs must not overlap, and only the last one can be open-ended');
    }
  }
  const locality = str(b.locality).replace(/\s+/g, ' ');
  if (locality.length > 80) throw new AppError(400, 'Keep the town under 80 characters');
  return {
    state: stateInput(b.state),
    locality,
    effectiveFrom: periodInput(b.effectiveFrom, 'Pick the month the policy applies from'),
    frequency, deductionMode,
    deductionMonths: deductionMode === 'LUMP_SUM' ? monthsInput(b.deductionMonths, true) : '',
    slabs,
  };
}

function lwfInput(b: any) {
  const employeeAmount = Number(b.employeeAmount);
  const employerAmount = Number(b.employerAmount);
  if (!isFinite(employeeAmount) || employeeAmount < 0 || !isFinite(employerAmount) || employerAmount < 0) {
    throw new AppError(400, 'Enter the employee and employer contribution');
  }
  return {
    state: stateInput(b.state),
    effectiveFrom: periodInput(b.effectiveFrom, 'Pick the month the policy applies from'),
    employeeAmount, employerAmount,
    deductionMonths: monthsInput(b.deductionMonths, true),
  };
}

const duplicateMessage = (what: string, input: { state: string; locality?: string; effectiveFrom: string }) =>
  `A ${what} policy for ${ptAreaLabel(input)} from ${monthLabel(input.effectiveFrom)} already exists`;

// Another Professional Tax policy for the same place and starting month.
// Towns are compared without case, so "Coimbatore" and "coimbatore" clash.
async function ptDuplicate(organizationId: string, input: { state: string; locality: string; effectiveFrom: string }, excludeId?: string) {
  const same = await prisma.ptPolicy.findMany({
    where: { organizationId, state: input.state, effectiveFrom: input.effectiveFrom, ...(excludeId ? { id: { not: excludeId } } : {}) },
  });
  return same.find(p => townKey(p.locality) === townKey(input.locality));
}

const monthList = (csv: string) => parseMonths(csv).map(m => MONTH_NAMES[m - 1]).join(', ');

// PF figures of a run in whole rupees, as the monthly return needs them.
function pfRows(entries: any[], settings: any) {
  return [...entries].sort(byName)
    .filter(e => e.pfEmployee > 0)
    .map(e => ({ e, b: pfBreakup(e, settings) }));
}

function pfChallan(rows: ReturnType<typeof pfRows>, settings: any) {
  const total = (f: (b: any) => number) => rows.reduce((s, r) => s + f(r.b), 0);
  const employee = total(b => b.epfEmployee);
  const employerEpf = total(b => b.epfEmployer);
  const eps = total(b => b.epsEmployer);
  const edli = total(b => b.edli);
  const admin = pfAdminCharge(total(b => b.epfWage), settings);
  return { employee, employerEpf, eps, edli, admin, total: employee + employerEpf + eps + edli + admin };
}

// What a month's payroll owes each authority.
function duesOf(entries: any[], settings: any) {
  return {
    PF: pfChallan(pfRows(entries, settings), settings).total,
    ESI: sum(entries, e => e.esiEmployee + e.esiEmployer),
    PT: sum(entries, e => e.professionalTax),
    LWF: sum(entries, e => e.lwfEmployee + e.lwfEmployer),
  };
}

export const payrollStatutoryController = {
  // ---- Professional Tax and Labour Welfare Fund policies -------------------
  async getPolicies(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const [ptPolicies, lwfPolicies, locations] = await Promise.all([
      prisma.ptPolicy.findMany({
        where: { organizationId },
        include: { slabs: { orderBy: { incomeFrom: 'asc' } } },
        orderBy: [{ state: 'asc' }, { locality: 'asc' }, { effectiveFrom: 'desc' }],
      }),
      prisma.lwfPolicy.findMany({ where: { organizationId }, orderBy: [{ state: 'asc' }, { effectiveFrom: 'desc' }] }),
      prisma.workLocation.findMany({
        where: { organizationId }, select: { name: true, state: true, city: true, excludeFromPt: true, isActive: true },
      }),
    ]);
    // The towns work locations are in, by state: what a town policy can be for
    const towns: Record<string, string[]> = {};
    for (const l of locations) {
      if (!townKey(l.city)) continue;
      const list = towns[l.state] || (towns[l.state] = []);
      if (!list.some(t => townKey(t) === townKey(l.city))) list.push(l.city.trim());
    }
    res.json({
      ptPolicies: ptPolicies.map(p => ({
        ...p,
        // Locations a town policy applies to; none means it is not in use
        locations: townKey(p.locality)
          ? locations.filter(l => l.state === p.state && townKey(l.city) === townKey(p.locality)).map(l => l.name)
          : null,
      })),
      lwfPolicies,
      states: INDIAN_STATES,
      // States where employees actually work, to suggest in the forms
      locationStates: [...new Set(locations.map(l => l.state))],
      towns,
      excludedLocations: locations.filter(l => l.excludeFromPt).map(l => l.name),
    });
  },

  async createPtPolicy(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const { slabs, ...input } = ptInput(req.body);
    if (await ptDuplicate(organizationId, input)) throw new AppError(400, duplicateMessage('Professional Tax', input));
    const policy = await prisma.ptPolicy.create({
      data: { organizationId, ...input, slabs: { create: slabs } },
      include: { slabs: { orderBy: { incomeFrom: 'asc' } } },
    });
    await logPayrollAudit(req, [{
      action: 'PT_POLICY_SAVED', field: `${ptAreaLabel(input)} from ${monthLabel(input.effectiveFrom)}`,
      newValue: `${slabs.length} slabs`,
    }]);
    res.status(201).json(policy);
  },

  async updatePtPolicy(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const existing = await prisma.ptPolicy.findFirst({ where: { id: req.params.policyId, organizationId } });
    if (!existing) throw new AppError(404, 'Policy not found');
    const { slabs, ...input } = ptInput(req.body);
    if (await ptDuplicate(organizationId, input, existing.id)) throw new AppError(400, duplicateMessage('Professional Tax', input));
    const policy = await prisma.ptPolicy.update({
      where: { id: existing.id },
      data: { ...input, slabs: { deleteMany: {}, create: slabs } },
      include: { slabs: { orderBy: { incomeFrom: 'asc' } } },
    });
    await logPayrollAudit(req, [{
      action: 'PT_POLICY_SAVED', field: `${ptAreaLabel(input)} from ${monthLabel(input.effectiveFrom)}`,
      newValue: `${slabs.length} slabs`,
    }]);
    res.json(policy);
  },

  async deletePtPolicy(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const existing = await prisma.ptPolicy.findFirst({ where: { id: req.params.policyId, organizationId } });
    if (!existing) throw new AppError(404, 'Policy not found');
    await prisma.ptPolicy.delete({ where: { id: existing.id } });
    await logPayrollAudit(req, [{
      action: 'PT_POLICY_DELETED', field: `${ptAreaLabel(existing)} from ${monthLabel(existing.effectiveFrom)}`,
    }]);
    res.json({ message: 'Policy deleted' });
  },

  async createLwfPolicy(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const input = lwfInput(req.body);
    const dup = await prisma.lwfPolicy.findFirst({ where: { organizationId, state: input.state, effectiveFrom: input.effectiveFrom } });
    if (dup) throw new AppError(400, duplicateMessage('Labour Welfare Fund', input));
    const policy = await prisma.lwfPolicy.create({ data: { organizationId, ...input } });
    await logPayrollAudit(req, [{
      action: 'LWF_POLICY_SAVED', field: `${input.state} from ${monthLabel(input.effectiveFrom)}`,
      newValue: `Employee ${input.employeeAmount}, employer ${input.employerAmount}, in ${monthList(input.deductionMonths)}`,
    }]);
    res.status(201).json(policy);
  },

  async updateLwfPolicy(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const existing = await prisma.lwfPolicy.findFirst({ where: { id: req.params.policyId, organizationId } });
    if (!existing) throw new AppError(404, 'Policy not found');
    const input = lwfInput(req.body);
    const dup = await prisma.lwfPolicy.findFirst({
      where: { organizationId, state: input.state, effectiveFrom: input.effectiveFrom, id: { not: existing.id } },
    });
    if (dup) throw new AppError(400, duplicateMessage('Labour Welfare Fund', input));
    const policy = await prisma.lwfPolicy.update({ where: { id: existing.id }, data: input });
    await logPayrollAudit(req, [{
      action: 'LWF_POLICY_SAVED', field: `${input.state} from ${monthLabel(input.effectiveFrom)}`,
      newValue: `Employee ${input.employeeAmount}, employer ${input.employerAmount}, in ${monthList(input.deductionMonths)}`,
    }]);
    res.json(policy);
  },

  async deleteLwfPolicy(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const existing = await prisma.lwfPolicy.findFirst({ where: { id: req.params.policyId, organizationId } });
    if (!existing) throw new AppError(404, 'Policy not found');
    await prisma.lwfPolicy.delete({ where: { id: existing.id } });
    await logPayrollAudit(req, [{
      action: 'LWF_POLICY_DELETED', field: `${existing.state} from ${monthLabel(existing.effectiveFrom)}`,
    }]);
    res.json({ message: 'Policy deleted' });
  },

  // ---- Remittances ----------------------------------------------------------
  // Dues from each month's payroll against the payments recorded for it.
  async getRemittances(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const runs = await prisma.payrollRun.findMany({
      where: { organizationId }, include: { entries: true }, orderBy: { period: 'desc' },
    });
    const years = [...new Set(runs.map(r => financialYearOf(r.period).startYear))].sort((a, b) => b - a);
    const startYear = Number(req.query.fy) || years[0] || new Date().getFullYear();
    const fy = financialYearFor(startYear);
    const settings = await settingsFor(organizationId);
    const payments = await prisma.remittance.findMany({
      where: { organizationId, period: { gte: fy.start, lte: fy.end } },
      orderBy: [{ paidOn: 'asc' }, { createdAt: 'asc' }],
    });
    const months = runs
      .filter(r => r.period >= fy.start && r.period <= fy.end)
      .map(r => {
        const dues = duesOf(r.entries, settings);
        const paid: Record<string, number> = { PF: 0, ESI: 0, PT: 0, LWF: 0 };
        const own = payments.filter(p => p.period === r.period);
        for (const p of own) paid[p.type] = r2((paid[p.type] || 0) + p.amount);
        return { period: r.period, runId: r.id, status: r.status, dues, paid, payments: own };
      });
    res.json({
      financialYear: fy.label, startYear,
      financialYears: years.map(y => ({ startYear: y, label: financialYearFor(y).label })),
      types: REMITTANCE_TYPES, months,
    });
  },

  async createRemittance(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const b = req.body;
    const period = periodInput(b.period, 'Pick the payroll month');
    const type = str(b.type);
    if (!REMITTANCE_TYPES.includes(type)) throw new AppError(400, 'Pick what the payment is for');
    const amount = Number(b.amount);
    if (!isFinite(amount) || amount <= 0) throw new AppError(400, 'Enter the amount paid');
    const paidOn = str(b.paidOn);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) throw new AppError(400, 'Pick the payment date');
    const payment = await prisma.remittance.create({
      data: {
        organizationId, period, type, amount: r2(amount), paidOn,
        reference: str(b.reference), bankName: str(b.bankName), remarks: str(b.remarks),
        createdByName: await actorName(req.user?.userId),
      },
    });
    await logPayrollAudit(req, [{
      action: 'REMITTANCE_RECORDED', period, field: type, newValue: `${payment.amount} on ${paidOn}`,
    }]);
    res.status(201).json(payment);
  },

  async deleteRemittance(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const payment = await prisma.remittance.findFirst({ where: { id: req.params.remittanceId, organizationId } });
    if (!payment) throw new AppError(404, 'Payment not found');
    await prisma.remittance.delete({ where: { id: payment.id } });
    await logPayrollAudit(req, [{
      action: 'REMITTANCE_DELETED', period: payment.period, field: payment.type,
      oldValue: `${payment.amount} on ${payment.paidOn}`,
    }]);
    res.json({ message: 'Payment removed' });
  },

  // ---- Provident Fund -------------------------------------------------------
  // Employee-wise wages and contributions split the way the monthly return
  // needs them, with the account-wise challan.
  async pfStatement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const settings = await settingsFor(organizationId);
    const rows = pfRows(run.entries, settings);
    const c = pfChallan(rows, settings);
    const total = (f: (b: any) => number) => rows.reduce((s, r) => s + f(r.b), 0);
    const body = rows.map(({ e, b }, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(e.person.pfUan) || '<span class="muted">missing</span>'}</td><td class="nw">${esc(e.person.name)}</td>
      <td class="amt">${amt(Math.round(e.grossSalary))}</td><td class="amt">${amt(b.epfWage)}</td><td class="amt">${amt(b.epsWage)}</td><td class="amt">${amt(b.edliWage)}</td>
      <td class="amt">${amt(b.epfEmployee)}</td><td class="amt">${amt(b.epsEmployer)}</td><td class="amt">${amt(b.epfEmployer)}</td>
      <td class="ctr">${e.lopDays ? days(e.lopDays) : '—'}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'PF Statement', monthLabel(run.period), `
  <table class="st-table">
    <tr><th>#</th><th>UAN</th><th>Member</th><th class="amt">Gross wages</th><th class="amt">EPF wages</th><th class="amt">EPS wages</th><th class="amt">EDLI wages</th>
      <th class="amt">Employee share</th><th class="amt">Pension (EPS)</th><th class="amt">Employer EPF</th><th class="ctr">NCP days</th></tr>
    ${body || '<tr><td colspan="11">No PF members in this run.</td></tr>'}
    <tr class="tot"><td colspan="3">Total (${rows.length} members)</td>
      <td class="amt">${amt(rows.reduce((s, r) => s + Math.round(r.e.grossSalary), 0))}</td><td class="amt">${amt(total(b => b.epfWage))}</td><td class="amt">${amt(total(b => b.epsWage))}</td><td class="amt">${amt(total(b => b.edliWage))}</td>
      <td class="amt">${amt(c.employee)}</td><td class="amt">${amt(c.eps)}</td><td class="amt">${amt(c.employerEpf)}</td><td></td></tr>
  </table>
  <div class="st-h">Challan summary</div>
  <table class="st-table" style="width:auto;min-width:55%;">
    <tr><th>Account</th><th class="amt">Amount</th></tr>
    <tr><td>A/c 1 — EPF (employee share + employer share)</td><td class="amt">${inr(c.employee + c.employerEpf)}</td></tr>
    <tr><td>A/c 2 — Administration charges</td><td class="amt">${inr(c.admin)}</td></tr>
    <tr><td>A/c 10 — Pension (EPS)</td><td class="amt">${inr(c.eps)}</td></tr>
    <tr><td>A/c 21 — Insurance (EDLI)</td><td class="amt">${inr(c.edli)}</td></tr>
    <tr class="tot"><td>Total payable</td><td class="amt">${inr(c.total)}</td></tr>
  </table>
  <p style="font-size:11.5px;color:#6b7280;">Whole rupees, as filed. Every member is treated as a pension (EPS) member; adjust in the return for members who are not.</p>`);
    res.json({ html, title: `PF Statement — ${monthLabel(run.period)}` });
  },

  // Electronic challan-cum-return text file for the EPFO portal.
  async pfEcr(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const rows = pfRows(run.entries, await settingsFor(organizationId));
    const included = rows.filter(r => r.e.person.pfUan);
    const lines = included.map(({ e, b }) => [
      e.person.pfUan.replace(/\s/g, ''), e.person.name.toUpperCase(), Math.round(e.grossSalary),
      b.epfWage, b.epsWage, b.edliWage, b.epfEmployee, b.epsEmployer, b.epfEmployer,
      Math.round(e.lopDays || 0), 0,
    ].join('#~#'));
    res.json({
      filename: `pf-ecr-${run.period}.txt`,
      content: lines.join('\r\n'),
      members: included.length,
      skipped: rows.filter(r => !r.e.person.pfUan).map(r => r.e.person.name),
    });
  },

  // ---- ESI --------------------------------------------------------------------
  // Monthly contribution sheet in the ESIC portal's upload layout.
  async esiUpload(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const covered = [...run.entries].sort(byName).filter(e => e.isEsiEligible);
    const included = covered.filter(e => e.person.esiNumber);
    const Excel = await import('exceljs');
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.addRow(['IP Number', 'IP Name', 'No of Days for which wages paid/payable during the month',
      'Total Monthly Wages', 'Reason Code for Zero workings days', 'Last Working Day']);
    ws.getRow(1).font = { bold: true };
    for (const e of included) {
      const wages = Math.round(e.basic + e.da + e.hra + e.transportAllowance + e.foodAllowance);
      ws.addRow([e.person.esiNumber.replace(/\s/g, ''), e.person.name, Math.ceil(e.payDays), wages, '', '']);
    }
    ws.columns.forEach((c: any, i: number) => { c.width = i === 1 ? 30 : 22; });
    const buffer = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
    res.json({
      filename: `esi-contribution-${run.period}.xlsx`,
      base64: buffer.toString('base64'),
      members: included.length,
      skipped: covered.filter(e => !e.person.esiNumber).map(e => e.person.name),
    });
  },

  // ---- Professional Tax and Labour Welfare Fund -----------------------------
  async ptStatement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const rows = [...run.entries].sort(byName).filter(e => e.professionalTax > 0);
    // Each town with its own policy is paid separately; the rest go to the state
    const policies = await prisma.ptPolicy.findMany({ where: { organizationId } });
    const areaOf = (e: any) => {
      const l = e.person.workLocation;
      if (!l) return 'No work location';
      const policy = ptPolicyInForce(policies, l.state, l.city, run.period);
      return policy ? ptAreaLabel(policy) : l.state;
    };
    const states = [...new Set(rows.map(areaOf))].sort();
    const body = rows.map((e, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(e.person.employeeNo)}</td><td class="nw">${esc(e.person.name)}</td>
      <td>${esc(e.person.workLocation ? `${e.person.workLocation.name}, ${e.person.workLocation.state}` : '—')}</td>
      <td>${esc(areaOf(e))}</td>
      <td class="amt">${inr(e.grossSalary)}</td>
      <td class="amt">${inr(e.professionalTax)}${e.ptOverridden ? ' <span class="muted">(manual)</span>' : ''}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Professional Tax Statement', monthLabel(run.period), `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>Location</th><th>Paid to</th><th class="amt">Gross</th><th class="amt">Professional Tax</th></tr>
    ${body || '<tr><td colspan="7">No Professional Tax was deducted in this run.</td></tr>'}
    <tr class="tot"><td colspan="5">Total (${rows.length} employees)</td><td class="amt">${inr(sum(rows, e => e.grossSalary))}</td><td class="amt">${inr(sum(rows, e => e.professionalTax))}</td></tr>
  </table>
  ${states.length > 1 ? `<table class="st-table" style="width:auto;min-width:40%;">
    <tr><th>Paid to</th><th class="amt">Employees</th><th class="amt">Professional Tax</th></tr>
    ${states.map(s => { const list = rows.filter(e => areaOf(e) === s); return `<tr><td>${esc(s)}</td><td class="amt">${list.length}</td><td class="amt">${inr(sum(list, e => e.professionalTax))}</td></tr>`; }).join('')}
  </table>` : ''}`);
    res.json({ html, title: `Professional Tax Statement — ${monthLabel(run.period)}` });
  },

  async lwfStatement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const rows = [...run.entries].sort(byName).filter(e => e.lwfEmployee > 0 || e.lwfEmployer > 0);
    const body = rows.map((e, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(e.person.employeeNo)}</td><td class="nw">${esc(e.person.name)}</td>
      <td>${esc(e.person.workLocation ? `${e.person.workLocation.name}, ${e.person.workLocation.state}` : '—')}</td>
      <td class="amt">${inr(e.lwfEmployee)}</td><td class="amt">${inr(e.lwfEmployer)}</td><td class="amt">${inr(e.lwfEmployee + e.lwfEmployer)}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Labour Welfare Fund Statement', monthLabel(run.period), `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>Location</th><th class="amt">Employee</th><th class="amt">Employer</th><th class="amt">Total</th></tr>
    ${body || '<tr><td colspan="7">No Labour Welfare Fund contribution fell due in this run.</td></tr>'}
    <tr class="tot"><td colspan="4">Total (${rows.length} employees)</td><td class="amt">${inr(sum(rows, e => e.lwfEmployee))}</td><td class="amt">${inr(sum(rows, e => e.lwfEmployer))}</td><td class="amt">${inr(sum(rows, e => e.lwfEmployee + e.lwfEmployer))}</td></tr>
  </table>`);
    res.json({ html, title: `Labour Welfare Fund Statement — ${monthLabel(run.period)}` });
  },

  // Half-year Professional Tax: income and tax per employee, and the
  // number of employees in each slab — what the half-yearly return asks for.
  async ptHalfYear(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const startYear = Number(/^(\d{4})/.exec(String(req.query.fy || ''))?.[1]);
    if (!startYear) throw new AppError(400, 'Pick a financial year');
    const second = String(req.query.half) === '2';
    const half = halfYearOf(second ? `${startYear}-10` : `${startYear}-04`);
    if (!periodsOfFinancialYear(startYear).includes(half.periods[0])) throw new AppError(400, 'Pick a half-year');
    const entries = await prisma.payslipEntry.findMany({
      where: { organizationId, run: { period: { in: half.periods } } },
      include: {
        run: { select: { period: true } },
        person: { select: { name: true, employeeNo: true, workLocation: { select: { state: true, city: true } } } },
      },
    });
    // The policy each employee falls under at the end of the half
    await stampPositions(organizationId, entries.map(e => ({ personId: e.personId, person: e.person, on: periodEndDate(half.periods[5]) })), { location: true });
    const policies = await prisma.ptPolicy.findMany({ where: { organizationId }, include: { slabs: { orderBy: { incomeFrom: 'asc' } } } });
    const lastPeriod = half.periods[5];
    const people = new Map<string, { name: string; code: string; state: string; policyId: string; gross: number; tax: number[] }>();
    for (const e of entries) {
      const l = e.person.workLocation;
      const policy = l ? ptPolicyInForce(policies, l.state, l.city, lastPeriod) : undefined;
      const row = people.get(e.personId) || {
        name: e.person.name, code: e.person.employeeNo,
        state: policy ? ptAreaLabel(policy) : l?.state || '', policyId: policy?.id || '',
        gross: 0, tax: half.periods.map(() => 0),
      };
      row.gross = r2(row.gross + e.grossSalary);
      row.tax[half.periods.indexOf(e.run.period)] += e.professionalTax;
      people.set(e.personId, row);
    }
    const rows = [...people.values()].sort((a, b) => a.name.localeCompare(b.name));
    const taxOf = (r: { tax: number[] }) => r2(r.tax.reduce((s, v) => s + v, 0));

    // Slab distribution for each town or state that has a policy
    const slabTables = policies
      .filter(p => rows.some(r => r.policyId === p.id))
      .sort((a, b) => ptAreaLabel(a).localeCompare(ptAreaLabel(b)))
      .map(policy => {
      const inState = rows.filter(r => r.policyId === policy.id);
      return `<div class="st-h">${esc(ptAreaLabel(policy))} — employees by slab</div>
  <table class="st-table" style="width:auto;min-width:55%;">
    <tr><th>Half-year income</th><th class="amt">Tax per employee</th><th class="amt">Employees</th><th class="amt">Tax deducted</th></tr>
    ${policy.slabs.map(s => {
      const list = inState.filter(r => r.gross >= s.incomeFrom && (s.incomeTo == null || r.gross <= s.incomeTo));
      return `<tr><td>${amt(s.incomeFrom) === '—' ? '0' : amt(s.incomeFrom)} – ${s.incomeTo == null ? 'above' : amt(s.incomeTo)}</td><td class="amt">${inr(s.amount)}</td><td class="amt">${list.length}</td><td class="amt">${inr(sum(list, taxOf))}</td></tr>`;
    }).join('')}
    <tr class="tot"><td colspan="2">Total</td><td class="amt">${inState.length}</td><td class="amt">${inr(sum(inState, taxOf))}</td></tr>
  </table>`;
    }).join('');

    const body = rows.map((r, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(r.code)}</td><td class="nw">${esc(r.name)}</td><td>${esc(r.state) || '<span class="muted">—</span>'}</td>
      <td class="amt">${inr(r.gross)}</td>${r.tax.map(v => `<td class="amt">${amt(v)}</td>`).join('')}<td class="amt"><strong>${inr(taxOf(r))}</strong></td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Professional Tax — Half-Year', half.label, `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>Town or state</th><th class="amt">Half-year gross</th>${half.periods.map(p => `<th class="amt">${esc(monthShort(p))}</th>`).join('')}<th class="amt">Tax</th></tr>
    ${body || `<tr><td colspan="12">No payslips in ${esc(half.label)}.</td></tr>`}
    <tr class="tot"><td colspan="4">Total (${rows.length} employees)</td><td class="amt">${inr(sum(rows, r => r.gross))}</td>
      ${half.periods.map((_, i) => `<td class="amt">${amt(sum(rows, r => r.tax[i]))}</td>`).join('')}<td class="amt">${inr(sum(rows, taxOf))}</td></tr>
  </table>
  ${slabTables}`);
    res.json({ html, title: `Professional Tax — ${half.label}` });
  },
};
