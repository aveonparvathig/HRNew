// Reports for the employer's NPS contribution and for consultants paid
// through payroll with tax at a flat rate.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { orgBrand } from '../services/orgBrand';
import { financialYearFor, financialYearOf } from '../services/payroll/financialYear';
import { currentPeriodIST } from '../services/payroll/salaryStructure';
import { QUARTERS, monthEnd, quarterPeriods } from '../services/payroll/tdsReturnCalc';
import { hasValidPan } from '../services/payroll/taxCalc';
import { CONSULTANT_SECTIONS, returnCode, sectionLabel } from '../services/payroll/consultantCalc';
import { esc, amt, inr, monthLabel, reportShell } from '../services/payroll/reportHtml';

const str = (v: any) => String(v ?? '').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const dmy = (date?: string | null) => (date ? date.slice(0, 10).split('-').reverse().join('/') : '');

function fyInput(value: any): number {
  if (value === undefined || value === null || value === '') return financialYearOf(currentPeriodIST()).startYear;
  const year = Number(/^(\d{4})/.exec(String(value))?.[1]);
  if (!year || year < 2000 || year > 2100) throw new AppError(400, 'Pick a financial year');
  return year;
}

// Fees paid to consultants in finalized runs of some months.
export async function consultantFees(organizationId: string, periods: string[], personId?: string) {
  const entries = await prisma.payslipEntry.findMany({
    where: {
      organizationId, NOT: { consultantSection: '' }, ...(personId ? { personId } : {}),
      run: { status: 'FINALIZED', period: { in: periods } },
    },
    include: {
      run: { select: { period: true } },
      person: { select: { id: true, name: true, employeeNo: true, panNumber: true, address: true } },
    },
  });
  return entries
    .map(e => ({
      personId: e.personId, name: e.person.name, employeeNo: e.person.employeeNo || '', address: e.person.address || '',
      pan: hasValidPan(e.person.panNumber) ? e.person.panNumber.trim().toUpperCase() : '',
      period: e.run.period, paidOn: e.paidOn || monthEnd(e.run.period),
      section: e.consultantSection, percent: e.consultantTdsPercent, fee: e.grossSalary, tds: e.tds,
    }))
    .sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name) || a.period.localeCompare(b.period));
}

export const payrollExtrasController = {
  // Employer's NPS contribution for a month, employee by employee.
  async npsStatement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.runId, organizationId },
      include: { entries: {
        where: { npsEmployer: { gt: 0 } },
        include: { person: { select: { name: true, employeeNo: true, npsPran: true, npsEmployerPercent: true } } },
      } },
    });
    if (!run) throw new AppError(404, 'Payroll run not found');
    const rows = [...run.entries].sort((a, b) => a.person.name.localeCompare(b.person.name));
    const sum = (f: (e: typeof rows[number]) => number) => r2(rows.reduce((s, e) => s + f(e), 0));
    const body = rows.map((e, i) => {
      const base = r2(e.basic + e.da);
      return `<tr><td>${i + 1}</td><td class="nw">${esc(e.person.employeeNo)}</td><td class="nw">${esc(e.person.name)}</td>
      <td class="nw">${esc(e.person.npsPran) || '<span class="muted">missing</span>'}</td>
      <td class="amt">${amt(base)}</td><td class="amt">${base ? r2(e.npsEmployer / base * 100) : 0}%</td>
      <td class="amt"><strong>${amt(e.npsEmployer)}</strong></td></tr>`;
    }).join('');
    const html = reportShell(await orgBrand(organizationId), 'NPS Statement — Employer Contribution', monthLabel(run.period), `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>PRAN</th><th class="amt">Basic + DA</th><th class="amt">Share</th><th class="amt">Employer contribution</th></tr>
    ${body || '<tr><td colspan="7">No employer NPS contribution in this run.</td></tr>'}
    <tr class="tot"><td colspan="4">Total (${rows.length} employees)</td><td class="amt">${amt(sum(e => e.basic + e.da))}</td><td></td><td class="amt">${inr(sum(e => e.npsEmployer))}</td></tr>
  </table>
  <p style="font-size:11.5px;color:#6b7280;">The contribution is a cost to the company on top of pay: it is not deducted from the employee.
  For income tax it counts as salary and is deducted again under section 80CCD(2), up to the limit in Payroll Settings → Income tax.
  ${run.status === 'FINALIZED' ? '' : '<strong>Draft run: figures may change.</strong>'}</p>`);
    res.json({ html, title: `NPS Statement — ${monthLabel(run.period)}` });
  },

  // Fees paid to consultants and the tax deducted from them, for a quarter
  // or a year: what the return for payments other than salary (Form 26Q)
  // is keyed from. With one consultant picked, their own statement.
  async consultantTds(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const fy = financialYearFor(fyStart);
    const quarter = req.query.quarter ? Number(req.query.quarter) : 0;
    if (![0, 1, 2, 3, 4].includes(quarter)) throw new AppError(400, 'Pick a quarter');
    const periods = quarter ? quarterPeriods(fyStart, quarter) : [1, 2, 3, 4].flatMap(q => quarterPeriods(fyStart, q));
    const personId = str(req.query.personId) || undefined;
    const rows = await consultantFees(organizationId, periods, personId);
    const scope = quarter ? `${QUARTERS[quarter - 1].label} (${QUARTERS[quarter - 1].months})` : 'Whole year';
    const sum = (list: typeof rows, f: 'fee' | 'tds') => r2(list.reduce((s, r) => s + r[f], 0));
    const sections = CONSULTANT_SECTIONS.map(s => s.value).filter(v => rows.some(r => r.section === v));
    const blocks = sections.map(section => {
      const list = rows.filter(r => r.section === section);
      return `<div class="st-h">${esc(sectionLabel(section))} <span class="muted" style="font-weight:400;">· return code ${esc(returnCode(section))}</span></div>
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Name</th><th>PAN</th><th>Month</th><th>Date of payment</th>
      <th class="amt">Amount paid</th><th class="amt">Rate</th><th class="amt">Tax deducted</th></tr>
    ${list.map((r, i) => `<tr><td>${i + 1}</td><td class="nw">${esc(r.employeeNo)}</td><td class="nw">${esc(r.name)}</td>
      <td class="nw">${r.pan ? esc(r.pan) : '<strong>PANNOTAVBL</strong>'}</td><td class="nw">${esc(monthLabel(r.period))}</td>
      <td class="nw">${esc(dmy(r.paidOn))}</td><td class="amt">${amt(r.fee)}</td><td class="amt">${r.percent}%</td><td class="amt">${amt(r.tds)}</td></tr>`).join('')}
    <tr class="tot"><td colspan="6">Total</td><td class="amt">${amt(sum(list, 'fee'))}</td><td></td><td class="amt">${amt(sum(list, 'tds'))}</td></tr>
  </table>`;
    }).join('');
    const one = personId && rows[0] ? rows[0] : null;
    const html = reportShell(await orgBrand(organizationId),
      one ? 'Statement of Tax Deducted on Fees' : 'Consultant Fees and Tax Deducted', `FY ${fy.label} · ${scope}`, `
  ${one ? `<p style="margin:0 0 10px;"><strong>${esc(one.name)}</strong>${one.employeeNo ? ` · ${esc(one.employeeNo)}` : ''} · PAN ${one.pan ? esc(one.pan) : 'not on record'}${one.address ? `<br/>${esc(one.address)}` : ''}</p>` : ''}
  ${blocks || '<p>No fees were paid to consultants in this period.</p>'}
  ${rows.length ? `<table class="st-table" style="width:auto;min-width:50%;">
    <tr><th>All sections</th><th class="amt">Amount paid</th><th class="amt">Tax deducted</th></tr>
    <tr class="tot"><td>${new Set(rows.map(r => r.personId)).size} consultant${new Set(rows.map(r => r.personId)).size === 1 ? '' : 's'}</td>
      <td class="amt">${inr(sum(rows, 'fee'))}</td><td class="amt">${inr(sum(rows, 'tds'))}</td></tr>
  </table>` : ''}
  <p style="font-size:11.5px;color:#6b7280;">Finalized months only. This tax is reported in the quarterly return for payments other than salary
  (Form 26Q), not in the salary return, and its certificate (Form 16A) is issued from the tax department's portal. Its challans are not
  recorded here: deposit it under the section's own challan. Without a valid PAN the rate is at least 20%.</p>`);
    res.json({ html, title: `${one ? `Tax Deducted on Fees — ${one.name}` : 'Consultant Fees and Tax Deducted'} — FY ${fy.label}${quarter ? ` — ${QUARTERS[quarter - 1].label}` : ''}` });
  },
};
