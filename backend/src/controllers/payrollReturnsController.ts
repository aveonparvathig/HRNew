// TDS deposits and returns: challans and their allocation to employees,
// the quarterly return data, Form 16 Part B and Form 12BA.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { orgBrand, OrgBrand, signatureImg } from '../services/orgBrand';
import { logPayrollAudit, actorName } from '../services/payroll/audit';
import { financialYearFor, financialYearOf, periodsOfFinancialYear } from '../services/payroll/financialYear';
import { currentPeriodIST } from '../services/payroll/salaryStructure';
import { hasValidPan } from '../services/payroll/taxCalc';
import { yearControlFor } from '../services/payroll/declarations';
import { annualTaxFor, AnnualTax } from '../services/payroll/taxYear';
import { loanPerquisites } from '../services/payroll/taxContext';
import {
  QUARTERS, quarterPeriods, quarterOf, monthEnd, depositDueDate, challanTotal, challanTax,
  allocateChallan, quarterIssues, BSR_FORMAT, CHALLAN_SERIAL_FORMAT,
  previousQuarter, returnAddress, RECEIPT_FORMAT,
} from '../services/payroll/tdsReturnCalc';
import { LOAN_HEAD, PerquisiteLike, perquisiteInput, perquisiteRows } from '../services/payroll/perquisiteCalc';
import { MAX_LANDLORDS } from '../services/payroll/declarationCalc';
import { esc, amt, inr, monthLabel, reportShell } from '../services/payroll/reportHtml';
import { htmlToPdf, mergePdfs } from '../services/pdf';
import { filePart } from '../services/payroll/payslipFiles';
import { sendFile } from '../services/payroll/payslipDocs';

const str = (v: any) => String(v ?? '').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;
const dash = '<span class="muted">—</span>';
const CHALLAN_AMOUNTS = ['tds', 'surcharge', 'cess', 'interest', 'fee', 'others'] as const;
const MAX_PART_A = 6 * 1024 * 1024; // of the data URI

const currentFyStart = () => financialYearOf(currentPeriodIST()).startYear;
function fyInput(value: any): number {
  if (value === undefined || value === null || value === '') return currentFyStart();
  const year = Number(/^(\d{4})/.exec(String(value))?.[1]);
  if (!year || year < 2000 || year > 2100) throw new AppError(400, 'Pick a financial year');
  return year;
}
function quarterInput(value: any): number {
  const q = Number(value);
  if (![1, 2, 3, 4].includes(q)) throw new AppError(400, 'Pick a quarter');
  return q;
}
const yearOptions = () => {
  const now = currentFyStart();
  return [now + 1, now, now - 1].map(y => ({ startYear: y, label: financialYearFor(y).label }));
};
// "2026-11-05" → "05/11/2026"
const dmy = (date?: string | null) => (date ? date.slice(0, 10).split('-').reverse().join('/') : '');
const dateLabel = (date?: string | null) => (date
  ? new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

const settingsFor = (organizationId: string) =>
  prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });
const statutoryFor = async (organizationId: string) =>
  (await prisma.orgStatutoryProfile.findUnique({ where: { organizationId } })) || ({} as any);

// Section code of the return: salary paid by a government or by anyone else.
const sectionCode = (deductorType: string) => (/government/i.test(deductorType || '') ? '92A' : '92B');

// Everything about the year's TDS: what each month deducted, the challans
// and what they cover.
async function loadYear(organizationId: string, fyStart: number) {
  const periods = periodsOfFinancialYear(fyStart);
  const [loaded, challans] = await Promise.all([
    prisma.payrollRun.findMany({
      where: { organizationId, period: { in: periods } },
      include: { entries: {
        include: {
          person: { select: { id: true, name: true, employeeNo: true, panNumber: true } },
          tdsAllocations: true,
        },
      } },
    }),
    prisma.tdsChallan.findMany({
      where: { organizationId, fyStart },
      include: { allocations: true },
      orderBy: [{ depositedOn: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);
  // entries: payslips with tax deducted; everyone: all payslips of the month
  const runs = loaded.map(r => ({ ...r, everyone: r.entries, entries: r.entries.filter(e => e.tds > 0) }));
  const runByPeriod = new Map(runs.map(r => [r.period, r]));
  const months = periods.map(period => {
    const run = runByPeriod.get(period);
    const entries = run?.entries || [];
    const deducted = r2(entries.reduce((s, e) => s + e.tds, 0));
    const deposited = r2(challans.filter(c => c.period === period).reduce((s, c) => s + challanTax(c), 0));
    return {
      period, label: monthLabel(period), quarter: quarterOf(period).quarter,
      runId: run?.id || null, status: run?.status || null,
      employees: entries.length, deducted, deposited, balance: r2(deducted - deposited),
      dueDate: depositDueDate(period),
    };
  });
  return { periods, runs, runByPeriod, challans, months };
}

const challanRow = (c: any) => {
  const allocated = r2(c.allocations.reduce((s: number, a: any) => s + a.amount, 0));
  return {
    id: c.id, period: c.period, quarter: c.quarter, bsrCode: c.bsrCode, challanSerial: c.challanSerial,
    depositedOn: c.depositedOn, tds: c.tds, surcharge: c.surcharge, cess: c.cess, interest: c.interest,
    fee: c.fee, others: c.others, minorHead: c.minorHead, remarks: c.remarks, createdByName: c.createdByName,
    total: challanTotal(c), tax: challanTax(c), allocated, unallocated: r2(challanTax(c) - allocated),
    employees: c.allocations.length, late: c.depositedOn > depositDueDate(c.period),
  };
};

// Checks for one quarter, from the loaded year.
function issuesFor(year: Awaited<ReturnType<typeof loadYear>>, statutory: any, fyStart: number, quarter: number) {
  const periods = quarterPeriods(fyStart, quarter);
  const noPan = new Set<string>();
  for (const period of periods) {
    for (const e of year.runByPeriod.get(period)?.entries || []) {
      if (!hasValidPan(e.person.panNumber)) noPan.add(e.person.name);
    }
  }
  return quarterIssues({
    deductor: statutory,
    addressFilled: returnAddress(statutory, 'deductor', '').filled,
    months: year.months.filter(m => periods.includes(m.period)),
    challans: year.challans.filter(c => periods.includes(c.period)).map(c => ({
      ...c, allocated: r2(c.allocations.reduce((s, a) => s + a.amount, 0)),
    })),
    noPan: [...noPan].sort(),
  });
}

// Deductee rows of Annexure I for a quarter: one per challan and employee.
// The amount paid appears once per payslip, on its first row. Employees
// paid with no tax deducted are listed too when the setting asks for it,
// under the month's first challan.
function deducteeRows(year: Awaited<ReturnType<typeof loadYear>>, fyStart: number, quarter: number, includeZero = false) {
  const periods = quarterPeriods(fyStart, quarter);
  const challans = year.challans.filter(c => periods.includes(c.period));
  const challanNo = new Map(challans.map((c, i) => [c.id, i + 1]));
  const rows: any[] = [];
  for (const period of periods) {
    const run = year.runByPeriod.get(period);
    if (!run || run.status !== 'FINALIZED') continue;
    const monthChallan = challans.find(c => c.period === period);
    for (const e of [...(includeZero ? run.everyone : run.entries)].sort((a, b) => a.person.name.localeCompare(b.person.name))) {
      const paidOn = e.paidOn || monthEnd(period);
      const valid = hasValidPan(e.person.panNumber);
      const base = {
        period, employeeNo: e.person.employeeNo || '', name: e.person.name,
        pan: valid ? e.person.panNumber.trim().toUpperCase() : 'PANNOTAVBL',
        paidOn, deductedOn: paidOn, remark: valid ? '' : 'C',
      };
      if (!(e.tds > 0)) {
        rows.push({
          ...base, remark: '', zero: true, challanNo: monthChallan ? challanNo.get(monthChallan.id) : null,
          amountPaid: e.grossSalary, deducted: 0, deposited: 0,
        });
        continue;
      }
      const mine = e.tdsAllocations.filter(a => challanNo.has(a.challanId));
      const covered = r2(mine.reduce((s, a) => s + a.amount, 0));
      mine.forEach((a, i) => rows.push({
        ...base, challanNo: challanNo.get(a.challanId), amountPaid: i === 0 ? e.grossSalary : 0,
        deducted: a.amount, deposited: a.amount,
      }));
      const open = r2(e.tds - covered);
      if (open > 0.5) {
        rows.push({ ...base, challanNo: null, amountPaid: mine.length ? 0 : e.grossSalary, deducted: open, deposited: 0 });
      }
    }
  }
  rows.sort((a, b) => (a.challanNo ?? 9999) - (b.challanNo ?? 9999) || a.period.localeCompare(b.period) || a.name.localeCompare(b.name));
  return { challans, rows };
}

// ---- Form 16 Part B ---------------------------------------------------------------
const PORTRAIT = '<style>@media print { @page { size: A4 portrait; margin: 12mm; } }</style>';

function form16Html(brand: OrgBrand, statutory: any, formName: string, a: AnnualTax, fyStart: number): string {
  const f = a.form;
  const fy = financialYearFor(fyStart);
  const money = (n: number) => (n < 0 ? `(${inr(-n)})` : inr(n));
  const line = (no: string, label: string, value: number | null, cls = '') =>
    `<tr class="${cls}"><td class="ctr">${no}</td><td>${label}</td><td class="amt">${value === null ? '' : money(value)}</td></tr>`;
  const c6 = f.chapter6.rows.map(r => `<tr><td class="ctr">(${r.key})</td><td>${esc(r.label)}</td>
    <td class="amt">${r.gross ? inr(r.gross) : '—'}</td><td class="amt">${r.deductible ? inr(r.deductible) : '—'}</td></tr>`).join('');
  return `${PORTRAIT}
  <div style="text-align:center;margin-bottom:10px;">
    <div style="font-size:16px;font-weight:700;">${esc(formName)} — Part B</div>
    <div style="font-size:12px;color:#555;">Details of salary paid, other income and tax deducted at source</div>
  </div>
  <table class="st-table">
    <tr><th style="width:50%;">Employer</th><th>Employee</th></tr>
    <tr><td><strong>${esc(brand.name)}</strong><br/>${esc(brand.addressLine) || dash}</td>
      <td><strong>${esc(a.person.name)}</strong>${a.person.designation ? `, ${esc(a.person.designation)}` : ''}<br/>${esc(a.person.address) || dash}</td></tr>
    <tr><td>PAN of the employer: ${esc(statutory.panNumber) || dash}<br/>TAN of the employer: ${esc(statutory.tanNumber) || dash}</td>
      <td>PAN of the employee: ${a.hasValidPan ? esc(a.person.panNumber.toUpperCase()) : '<strong>not on record</strong>'}<br/>Employee reference: ${esc(a.person.employeeNo) || dash}</td></tr>
    <tr><td>Financial year ${esc(fy.label)} (assessment year ${fyStart + 1}-${String((fyStart + 2) % 100).padStart(2, '0')})</td>
      <td>Period with the employer: ${esc(dateLabel(a.employedFrom))} to ${esc(dateLabel(a.employedTo))}</td></tr>
    <tr><td colspan="2">Whether opting for the new tax regime (section 115BAC): <strong>${f.newRegime ? 'Yes' : 'No'}</strong></td></tr>
  </table>
  <table class="st-table">
    <tr><th class="ctr" style="width:44px;">No.</th><th>Particulars</th><th class="amt" style="width:150px;">Amount</th></tr>
    ${line('1', '<strong>Gross salary</strong>', null)}
    ${line('(a)', 'Salary as per section 17(1)', f.gross.salary171)}
    ${line('(b)', 'Value of perquisites under section 17(2)', f.gross.perquisites)}
    ${line('(c)', 'Profits in lieu of salary under section 17(3)', f.gross.profitsInLieu)}
    ${line('(d)', 'Total', f.gross.total, 'sub')}
    ${line('(e)', 'Salary reported from other employers', f.gross.otherEmployers)}
    ${line('2', '<strong>Less: Allowances exempt under section 10</strong>', null)}
    ${line('(e)', 'House rent allowance under section 10(13A)', f.exempt.hra)}
    ${f.exempt.allowances.map(x => line('(g)', `${esc(x.name)} — other exemption under section 10`, x.amount)).join('')}
    ${line('(h)', 'Total exemption claimed under section 10', f.exempt.total, 'sub')}
    ${line('3', 'Salary received from the current employer [1(d) − 2(h)]', f.fromCurrent, 'sub')}
    ${line('4', '<strong>Less: Deductions under section 16</strong>', null)}
    ${line('(a)', 'Standard deduction under section 16(ia)', f.section16.standard)}
    ${line('(b)', 'Entertainment allowance under section 16(ii)', f.section16.entertainment)}
    ${line('(c)', 'Tax on employment under section 16(iii)', f.section16.professionalTax)}
    ${line('5', 'Total deductions under section 16', f.section16.total, 'sub')}
    ${line('6', 'Income chargeable under the head "Salaries" [3 + 1(e) − 5]', f.chargeable, 'sub')}
    ${line('7', '<strong>Add: Other income reported by the employee</strong>', null)}
    ${line('(a)', 'Income (or admissible loss) from house property', f.other.houseProperty)}
    ${line('(b)', 'Income under the head "Other sources"', f.other.otherSources)}
    ${line('8', 'Total other income', f.other.total, 'sub')}
    ${line('9', 'Gross total income [6 + 8]', f.grossTotalIncome, 'tot')}
  </table>
  <table class="st-table">
    <tr><th class="ctr" style="width:44px;">10</th><th>Deductions under Chapter VI-A</th><th class="amt" style="width:150px;">Gross amount</th><th class="amt" style="width:150px;">Deductible amount</th></tr>
    ${c6}
    <tr class="sub"><td class="ctr">11</td><td>Aggregate of deductible amount under Chapter VI-A</td><td></td><td class="amt">${inr(f.chapter6.total)}</td></tr>
  </table>
  <table class="st-table">
    <tr><th class="ctr" style="width:44px;">No.</th><th>Tax</th><th class="amt" style="width:150px;">Amount</th></tr>
    ${line('12', 'Total taxable income [9 − 11]', f.taxableIncome, 'tot')}
    ${line('13', 'Tax on total income', f.tax.onIncome)}
    ${line('14', 'Rebate under section 87A', f.tax.rebate)}
    ${line('15', 'Surcharge', f.tax.surcharge)}
    ${line('16', 'Health and education cess', f.tax.cess)}
    ${line('17', 'Tax payable [13 + 15 + 16 − 14]', f.tax.payable, 'sub')}
    ${line('18', 'Less: Relief under section 89', f.tax.relief89)}
    ${line('19', `Net tax payable [17 − 18]${f.tax.higherRateForPan ? ' — at 20% of taxable income, as no valid PAN is on record' : ''}`, f.tax.net, 'tot')}
    ${line('', 'Tax deducted at source by the current employer', f.deducted.current)}
    ${f.deducted.otherEmployers ? line('', 'Tax deducted at source by other employers', f.deducted.otherEmployers) : ''}
    ${f.deducted.elsewhere ? line('', 'Tax deducted or collected elsewhere, as reported by the employee', f.deducted.elsewhere) : ''}
    ${line('', f.balance > 0 ? 'Tax still payable' : f.balance < 0 ? 'Tax deducted in excess (refundable)' : 'Balance', Math.abs(f.balance), 'sub')}
  </table>
  <div style="font-size:12.5px;margin-top:14px;">
    <p><strong>Verification</strong></p>
    <p>I, ${esc(statutory.form16SignatoryName) || '____________________'}${statutory.form16SignatoryFatherName ? `, son / daughter of ${esc(statutory.form16SignatoryFatherName)}` : ''},
      working in the capacity of ${esc(statutory.form16SignatoryDesignation) || '____________________'}, do hereby certify that the information given above
      is true, complete and correct and is based on the books of account, documents, TDS statements and other available records.</p>
    <div style="display:flex;justify-content:space-between;margin-top:34px;">
      <div>Place: ${esc(statutory.form16SigningPlace) || '____________________'}<br/>Date: ____________________</div>
      <div style="text-align:right;">${statutory.form16SignatureData ? `<div style="display:flex;justify-content:flex-end;">${signatureImg(statutory.form16SignatureData)}</div>` : ''}____________________________<br/>Signature of the person responsible for deducting tax<br/>${esc(statutory.form16SignatoryName)}</div>
    </div>
  </div>
  <p style="font-size:11px;color:#6b7280;margin-top:14px;">Covers ${a.working.monthsPaid} salary month${a.working.monthsPaid === 1 ? '' : 's'} paid in the year.
    ${a.usePoi ? 'Deductions are as approved against proofs.' : 'Deductions are as declared by the employee; proofs have not been applied.'}
    Section references are those of the Income-tax Act, 1961. Part A is issued from the tax department's portal.</p>`;
}

// ---- Form 12BA: statement of perquisites --------------------------------------------
function form12baHtml(brand: OrgBrand, statutory: any, formName: string, a: AnnualTax, fyStart: number): string {
  const fy = financialYearFor(fyStart);
  const perquisites = perquisiteRows(a.perquisiteValues, a.loanPerquisite);
  const cell = (n: number) => (n ? inr(n) : '—');
  const rows = perquisites.rows.map(p => `<tr><td class="ctr">${p.head}</td><td>${esc(p.label)}</td>
      <td class="amt">${cell(p.value)}</td><td class="amt">${cell(p.recovered)}</td><td class="amt">${cell(p.taxable)}</td></tr>`).join('');
  return `${PORTRAIT}
  <div style="text-align:center;margin-bottom:10px;">
    <div style="font-size:16px;font-weight:700;">${esc(formName)}</div>
    <div style="font-size:12px;color:#555;">Statement showing particulars of perquisites, other fringe benefits or amenities and profits in lieu of salary</div>
  </div>
  <table class="st-table">
    <tr><td style="width:46%;">1. Name and address of the employer</td><td><strong>${esc(brand.name)}</strong><br/>${esc(brand.addressLine) || dash}</td></tr>
    <tr><td>2. TAN</td><td>${esc(statutory.tanNumber) || dash}</td></tr>
    <tr><td>3. TDS assessment range of the employer</td><td>${esc(statutory.tdsCircleAddress) || dash}</td></tr>
    <tr><td>4. Name, designation and PAN of the employee</td><td><strong>${esc(a.person.name)}</strong>${a.person.designation ? `, ${esc(a.person.designation)}` : ''}<br/>PAN: ${a.hasValidPan ? esc(a.person.panNumber.toUpperCase()) : 'not on record'}</td></tr>
    <tr><td>5. Is the employee a director or a person with a substantial interest in the company</td><td>____________</td></tr>
    <tr><td>6. Income under the head "Salaries" of the employee (other than from perquisites)</td><td>${inr(r2(a.form.chargeable - a.form.gross.perquisites))}</td></tr>
    <tr><td>7. Financial year</td><td>${esc(fy.label)}</td></tr>
  </table>
  <div class="st-h">8. Valuation of perquisites</div>
  <table class="st-table">
    <tr><th class="ctr" style="width:44px;">No.</th><th>Nature of perquisite</th><th class="amt">Value as per rules</th><th class="amt">Recovered from the employee</th><th class="amt">Chargeable to tax</th></tr>
    ${rows}
    <tr class="tot"><td></td><td>Total value of perquisites</td><td class="amt">${inr(perquisites.total.value)}</td><td class="amt">${cell(perquisites.total.recovered)}</td><td class="amt">${inr(perquisites.total.taxable)}</td></tr>
    <tr class="sub"><td></td><td>Total value of profits in lieu of salary under section 17(3)</td><td class="amt">—</td><td class="amt">—</td><td class="amt">—</td></tr>
  </table>
  <div class="st-h">9. Details of tax</div>
  <table class="st-table" style="width:auto;min-width:60%;">
    <tr><td>(a) Tax deducted from the salary of the employee</td><td class="amt">${inr(a.form.deducted.current)}</td></tr>
    <tr><td>(b) Tax paid by the employer on behalf of the employee</td><td class="amt">—</td></tr>
    <tr class="sub"><td>(c) Total tax paid</td><td class="amt">${inr(a.form.deducted.current)}</td></tr>
  </table>
  <div style="font-size:12.5px;margin-top:14px;">
    <p><strong>Declaration by the employer</strong></p>
    <p>I, ${esc(statutory.form16SignatoryName) || '____________________'}${statutory.form16SignatoryFatherName ? `, son / daughter of ${esc(statutory.form16SignatoryFatherName)}` : ''},
      working as ${esc(statutory.form16SignatoryDesignation) || '____________________'}, do hereby declare on behalf of ${esc(brand.name)} that the information
      given above is based on the books of account, documents and other relevant records, and is true and correct.</p>
    <div style="display:flex;justify-content:space-between;margin-top:34px;">
      <div>Place: ${esc(statutory.form16SigningPlace) || '____________________'}<br/>Date: ____________________</div>
      <div style="text-align:right;">${statutory.form16SignatureData ? `<div style="display:flex;justify-content:flex-end;">${signatureImg(statutory.form16SignatureData)}</div>` : ''}____________________________<br/>Signature of the person responsible for deducting tax</div>
    </div>
  </div>
  <p style="font-size:11px;color:#6b7280;margin-top:14px;">The value of concessional loans comes from the loan ledger; the other lines are as entered by payroll. Section references are those of the Income-tax Act, 1961.</p>`;
}

// One employee's year, or a 404 explaining why there is none.
async function oneYear(organizationId: string, personId: string, fyStart: number) {
  const year = await annualTaxFor(organizationId, fyStart, personId);
  const row = year.rows[0];
  if (!row) throw new AppError(404, `No finalized salary for this employee in FY ${financialYearFor(fyStart).label}.`);
  return row;
}

export async function buildForm16(organizationId: string, personId: string, fyStart: number) {
  const [row, brand, statutory, settings] = await Promise.all([
    oneYear(organizationId, personId, fyStart), orgBrand(organizationId), statutoryFor(organizationId), settingsFor(organizationId),
  ]);
  const fy = financialYearFor(fyStart);
  return {
    html: reportShell(brand, `${settings.form16Name} — Part B`, `FY ${fy.label}`, form16Html(brand, statutory, settings.form16Name, row, fyStart)),
    title: `${settings.form16Name} — ${row.person.name} — FY ${fy.label}`,
  };
}

// Form 16 as one PDF file: Part A as downloaded from the tax department's
// portal (when it has been uploaded), then Part B, then the perquisites
// statement when the employee has any.
export async function form16File(organizationId: string, personId: string, fyStart: number) {
  const [row, partB, partA, settings] = await Promise.all([
    oneYear(organizationId, personId, fyStart), buildForm16(organizationId, personId, fyStart),
    prisma.form16PartA.findFirst({ where: { organizationId, personId, fyStart } }),
    settingsFor(organizationId),
  ]);
  const parts: Buffer[] = [];
  if (partA) parts.push(Buffer.from(partA.fileData.replace(/^data:application\/pdf;base64,/, ''), 'base64'));
  parts.push(await htmlToPdf(partB.html));
  if (row.form.gross.perquisites > 0) parts.push(await htmlToPdf((await buildForm12ba(organizationId, personId, fyStart)).html));
  let pdf: Buffer;
  try {
    pdf = await mergePdfs(parts);
  } catch (err: any) {
    if (err instanceof AppError || !partA) throw err;
    throw new AppError(400, 'Part A could not be joined to Part B. If the uploaded file needs a password to open, upload it again without one.');
  }
  const fy = financialYearFor(fyStart);
  return {
    filename: `${filePart(settings.form16Name) || 'Form16'}_${filePart(row.person.employeeNo) || filePart(row.person.name)}_FY${fy.label}.pdf`,
    pdf, hasPartA: Boolean(partA),
  };
}

export async function buildForm12ba(organizationId: string, personId: string, fyStart: number) {
  const [row, brand, statutory, settings] = await Promise.all([
    oneYear(organizationId, personId, fyStart), orgBrand(organizationId), statutoryFor(organizationId), settingsFor(organizationId),
  ]);
  const fy = financialYearFor(fyStart);
  return {
    html: reportShell(brand, settings.form12baName, `FY ${fy.label}`, form12baHtml(brand, statutory, settings.form12baName, row, fyStart)),
    title: `${settings.form12baName} — ${row.person.name} — FY ${fy.label}`,
  };
}

export const payrollReturnsController = {
  // ---- The year at a glance ---------------------------------------------------------
  async getOverview(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const [year, statutory, settings, filings] = await Promise.all([
      loadYear(organizationId, fyStart), statutoryFor(organizationId), settingsFor(organizationId),
      prisma.tdsReturnFiling.findMany({ where: { organizationId, fyStart: { in: [fyStart, fyStart - 1] } } }),
    ]);
    const filingOf = (fy: number, quarter: number) => filings.find(f => f.fyStart === fy && f.quarter === quarter);
    const names = new Map<string, string>();
    for (const run of year.runs) for (const e of run.entries) names.set(e.id, e.person.name);
    res.json({
      fyStart, financialYear: financialYearFor(fyStart).label, financialYears: yearOptions(),
      formName: settings.form24qName, form27aName: settings.form27aName,
      options: { tdsAnnexure1IncludeZero: settings.tdsAnnexure1IncludeZero, tdsAnnexure2SkipZero: settings.tdsAnnexure2SkipZero },
      months: year.months,
      challans: year.challans.map(c => ({
        ...challanRow(c),
        allocations: c.allocations.map(a => ({ name: names.get(a.entryId) || '', amount: a.amount }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      })),
      quarters: QUARTERS.map(q => {
        const months = year.months.filter(m => m.quarter === q.quarter);
        return {
          ...q,
          deducted: r2(months.reduce((s, m) => s + m.deducted, 0)),
          deposited: r2(months.reduce((s, m) => s + m.deposited, 0)),
          hasRuns: months.some(m => m.status),
          issues: months.some(m => m.status) ? issuesFor(year, statutory, fyStart, q.quarter) : [],
          receiptNo: filingOf(fyStart, q.quarter)?.receiptNo || '',
          filedOn: filingOf(fyStart, q.quarter)?.filedOn || '',
          previousReceiptNo: filingOf(previousQuarter(fyStart, q.quarter).fyStart, previousQuarter(fyStart, q.quarter).quarter)?.receiptNo || '',
        };
      }),
    });
  },

  // ---- Challans -------------------------------------------------------------------------
  // A challan is recorded against the salary month it deposits, and is
  // matched to that month's employees automatically.
  async createChallan(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const b = req.body;
    const period = str(b.period);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new AppError(400, 'Pick the salary month the challan is for');
    const bsrCode = str(b.bsrCode);
    if (!BSR_FORMAT.test(bsrCode)) throw new AppError(400, 'The BSR code is the 7-digit code of the bank branch');
    const challanSerial = str(b.challanSerial);
    if (!CHALLAN_SERIAL_FORMAT.test(challanSerial)) throw new AppError(400, 'The challan serial number has up to 5 digits');
    const depositedOn = str(b.depositedOn);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(depositedOn) || isNaN(Date.parse(depositedOn))) throw new AppError(400, 'Enter the date of deposit');
    const amounts: any = {};
    for (const f of CHALLAN_AMOUNTS) {
      const v = Number(b[f] || 0);
      if (!isFinite(v) || v < 0) throw new AppError(400, 'Amounts cannot be negative');
      amounts[f] = r2(v);
    }
    if (challanTotal(amounts) <= 0) throw new AppError(400, 'Enter the amount deposited');
    const minorHead = str(b.minorHead) || '200';
    if (!['200', '400'].includes(minorHead)) throw new AppError(400, 'Pick the minor head');
    const duplicate = await prisma.tdsChallan.findFirst({ where: { organizationId, bsrCode, challanSerial, depositedOn } });
    if (duplicate) throw new AppError(400, 'This challan (same bank branch, date and serial number) is already recorded');

    const run = await prisma.payrollRun.findUnique({
      where: { organizationId_period: { organizationId, period } },
      include: { entries: { where: { tds: { gt: 0 } }, include: { person: { select: { name: true } }, tdsAllocations: true } } },
    });
    if (!run || run.status !== 'FINALIZED') {
      throw new AppError(400, `There is no finalized payroll run for ${monthLabel(period)} to deposit tax for`);
    }
    const { fyStart, quarter } = quarterOf(period);
    const { allocations, unallocated } = allocateChallan(challanTax(amounts), run.entries.map(e => ({
      entryId: e.id, personId: e.personId, name: e.person.name, tds: e.tds,
      deposited: r2(e.tdsAllocations.reduce((s, a) => s + a.amount, 0)),
    })));
    const challan = await prisma.tdsChallan.create({
      data: {
        organizationId, period, fyStart, quarter, bsrCode, challanSerial, depositedOn, ...amounts, minorHead,
        remarks: str(b.remarks), createdByName: await actorName(req.user?.userId),
        allocations: { create: allocations },
      },
      include: { allocations: true },
    });
    await logPayrollAudit(req, [{
      action: 'TDS_CHALLAN_RECORDED', runId: run.id, period,
      field: `Challan ${challanSerial}, BSR ${bsrCode}`,
      newValue: `${challanTotal(amounts)} on ${depositedOn}; ${allocations.length} employees${unallocated > 0 ? `, ${unallocated} unmatched` : ''}`,
    }]);
    res.status(201).json({ ...challanRow(challan), unallocated });
  },

  async deleteChallan(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const challan = await prisma.tdsChallan.findFirst({ where: { id: req.params.challanId, organizationId } });
    if (!challan) throw new AppError(404, 'Challan not found');
    await prisma.tdsChallan.delete({ where: { id: challan.id } });
    await logPayrollAudit(req, [{
      action: 'TDS_CHALLAN_DELETED', period: challan.period,
      field: `Challan ${challan.challanSerial}, BSR ${challan.bsrCode}`, oldValue: `${challanTotal(challan)} on ${challan.depositedOn}`,
    }]);
    res.json({ message: 'Challan deleted' });
  },

  // ---- A quarter's return as filed ----------------------------------------------------------
  // The receipt number the tax department gave it; the next quarter's return quotes it.
  async saveFiling(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.body.fyStart);
    const quarter = quarterInput(req.body.quarter);
    const receiptNo = str(req.body.receiptNo);
    if (receiptNo && !RECEIPT_FORMAT.test(receiptNo)) throw new AppError(400, 'The receipt number has up to 15 digits');
    const filedOn = str(req.body.filedOn);
    if (filedOn && (!/^\d{4}-\d{2}-\d{2}$/.test(filedOn) || isNaN(Date.parse(filedOn)))) throw new AppError(400, 'Enter the date the return was filed');
    const key = { organizationId_fyStart_quarter: { organizationId, fyStart, quarter } };
    const before = await prisma.tdsReturnFiling.findUnique({ where: key });
    const filing = await prisma.tdsReturnFiling.upsert({
      where: key, create: { organizationId, fyStart, quarter, receiptNo, filedOn }, update: { receiptNo, filedOn },
    });
    await logPayrollAudit(req, [{
      action: 'TDS_RETURN_FILED', field: `FY ${financialYearFor(fyStart).label} · ${QUARTERS[quarter - 1].label}`,
      oldValue: before?.receiptNo || '', newValue: receiptNo ? `Receipt ${receiptNo}${filedOn ? `, filed ${filedOn}` : ''}` : 'cleared',
    }]);
    res.json({ receiptNo: filing.receiptNo, filedOn: filing.filedOn });
  },

  // ---- Perquisites of one employee for a year, by Form 12BA line ------------------------------
  async getPerquisites(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const person = await prisma.person.findFirst({ where: { id: req.params.personId, organizationId }, select: { id: true, name: true, employeeNo: true } });
    if (!person) throw new AppError(404, 'Person not found');
    const fy = financialYearFor(fyStart);
    const [values, loans] = await Promise.all([
      prisma.perquisiteValue.findMany({ where: { organizationId, personId: person.id, fyStart } }),
      loanPerquisites(organizationId, await settingsFor(organizationId), fyStart, fy.end),
    ]);
    res.json({
      person, fyStart, financialYear: fy.label, loanHead: LOAN_HEAD,
      ...perquisiteRows(values, loans.get(person.id) || 0),
    });
  },

  async savePerquisites(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.body.fyStart);
    const person = await prisma.person.findFirst({ where: { id: req.params.personId, organizationId }, select: { id: true, name: true } });
    if (!person) throw new AppError(404, 'Person not found');
    if (!Array.isArray(req.body.values)) throw new AppError(400, 'Values must be a list');
    const values: PerquisiteLike[] = [];
    for (const raw of req.body.values) {
      if (Number(raw?.head) === LOAN_HEAD) continue;
      const v = perquisiteInput(raw);
      if (typeof v === 'string') throw new AppError(400, v);
      if (v) values.push(v);
    }
    if (new Set(values.map(v => v.head)).size !== values.length) throw new AppError(400, 'A perquisite is listed twice');
    const before = await prisma.perquisiteValue.findMany({ where: { organizationId, personId: person.id, fyStart } });
    await prisma.$transaction([
      prisma.perquisiteValue.deleteMany({ where: { organizationId, personId: person.id, fyStart } }),
      prisma.perquisiteValue.createMany({ data: values.map(v => ({ organizationId, personId: person.id, fyStart, ...v })) }),
    ]);
    const taxable = (list: PerquisiteLike[]) => perquisiteRows(list, 0).total.taxable;
    await logPayrollAudit(req, [{
      action: 'PERQUISITES_SAVED', personId: person.id, personName: person.name,
      field: `FY ${financialYearFor(fyStart).label} · taxable perquisites`, oldValue: String(taxable(before)), newValue: String(taxable(values)),
    }]);
    res.json({ message: 'Perquisites saved', taxable: taxable(values) });
  },

  // Form 16 as one PDF: Part A (if uploaded), Part B and the perquisites statement.
  async form16File(req: any, res: Response) {
    const file = await form16File(req.user?.organizationId, req.params.personId, fyInput(req.query.fy));
    sendFile(res, file.filename, 'application/pdf', file.pdf);
  },

  // Form 27A: the control sheet filed with a quarter's return.
  async form27a(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const quarter = quarterInput(req.query.quarter);
    const fy = financialYearFor(fyStart);
    const before = previousQuarter(fyStart, quarter);
    const [year, statutory, settings, brand, previous] = await Promise.all([
      loadYear(organizationId, fyStart), statutoryFor(organizationId), settingsFor(organizationId), orgBrand(organizationId),
      prisma.tdsReturnFiling.findUnique({ where: { organizationId_fyStart_quarter: { organizationId, ...before } } }),
    ]);
    const { challans, rows } = deducteeRows(year, fyStart, quarter, settings.tdsAnnexure1IncludeZero);
    const sum = (f: string) => r2(rows.reduce((s, r) => s + Number(r[f] || 0), 0));
    const deductor = returnAddress(statutory, 'deductor', brand.addressLine);
    const responsible = returnAddress(statutory, 'responsible', statutory.responsibleAddress);
    const row = (label: string, value: string) => `<tr><td style="width:44%;">${label}</td><td>${value || dash}</td></tr>`;
    const address = (a: ReturnType<typeof returnAddress>) => (a.filled ? `
      ${row('Flat / door / block no.', esc(a.flat))}${row('Name of premises / building', esc(a.building))}
      ${row('Road / street / lane', esc(a.street))}${row('Area / location', esc(a.area))}
      ${row('Town / city / district', esc(a.city))}${row('State', esc(a.state))}${row('PIN code', esc(a.pin))}`
      : row('Address', esc(a.line))) + row('Has the address changed since the last return', a.changed ? 'Yes' : 'No');
    const html = reportShell(brand, settings.form27aName, `FY ${fy.label} · ${QUARTERS[quarter - 1].label} (${QUARTERS[quarter - 1].months})`, `${PORTRAIT}
  <div style="text-align:center;margin-bottom:10px;">
    <div style="font-size:16px;font-weight:700;">${esc(settings.form27aName)}</div>
    <div style="font-size:12px;color:#555;">Form for furnishing information with the statement of deduction of tax at source</div>
  </div>
  <table class="st-table">
    <tr><th colspan="2">1. The statement</th></tr>
    ${row('Tax Deduction Account Number (TAN)', esc(statutory.tanNumber))}
    ${row('Permanent Account Number (PAN)', esc(statutory.panNumber))}
    ${row('Form number', esc(settings.form24qName))}
    ${row('Financial year', esc(fy.label))}
    ${row('Assessment year', `${fyStart + 1}-${String((fyStart + 2) % 100).padStart(2, '0')}`)}
    ${row('Quarter', `${QUARTERS[quarter - 1].label} (${QUARTERS[quarter - 1].months})`)}
    ${row(`Receipt number of the previous statement (${QUARTERS[before.quarter - 1].label}, FY ${financialYearFor(before.fyStart).label})`, esc(previous?.receiptNo))}
  </table>
  <table class="st-table">
    <tr><th colspan="2">2. Particulars of the deductor</th></tr>
    ${row('Name', esc(brand.name))}
    ${row('Type of deductor', esc(statutory.deductorType))}
    ${address(deductor)}
    ${row('Telephone', esc(brand.phone))}
    ${row('Email', esc(brand.email))}
  </table>
  <table class="st-table">
    <tr><th colspan="2">3. Person responsible for deduction of tax</th></tr>
    ${row('Name', esc(statutory.responsibleName))}
    ${row('Designation', esc(statutory.responsibleDesignation))}
    ${row('PAN', esc(statutory.responsiblePan))}
    ${address(responsible)}
    ${row('Telephone', esc(statutory.responsiblePhone))}
    ${row('Email', esc(statutory.responsibleEmail))}
  </table>
  <table class="st-table">
    <tr><th colspan="2">4. Control totals</th></tr>
    <tr><td style="width:44%;">Number of deductee records</td><td class="amt">${rows.length}</td></tr>
    <tr><td>Amount paid</td><td class="amt">${inr(sum('amountPaid'))}</td></tr>
    <tr><td>Tax deducted</td><td class="amt">${inr(sum('deducted'))}</td></tr>
    <tr><td>Tax deposited (total of the challans)</td><td class="amt">${inr(r2(challans.reduce((s, c) => s + challanTotal(c), 0)))}</td></tr>
    <tr><td>Number of challans</td><td class="amt">${challans.length}</td></tr>
  </table>
  <div style="font-size:12.5px;margin-top:14px;">
    <p><strong>Verification</strong></p>
    <p>I, ${esc(statutory.responsibleName) || '____________________'}, hereby certify that all the particulars furnished above are correct and complete.</p>
    <div style="display:flex;justify-content:space-between;margin-top:34px;">
      <div>Place: ${esc(statutory.form16SigningPlace) || '____________________'}<br/>Date: ____________________</div>
      <div style="text-align:right;">____________________________<br/>Signature of the person responsible for deducting tax<br/>${esc(statutory.responsibleName)}${statutory.responsibleDesignation ? `, ${esc(statutory.responsibleDesignation)}` : ''}</div>
    </div>
  </div>`);
    res.json({ html, title: `${settings.form27aName} — FY ${fy.label} — ${QUARTERS[quarter - 1].label}` });
  },

  // ---- Reports ---------------------------------------------------------------------------
  // Challans of a quarter (or the whole year) with the employees each covers.
  async challanReport(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const quarter = req.query.quarter ? quarterInput(req.query.quarter) : null;
    const fy = financialYearFor(fyStart);
    const year = await loadYear(organizationId, fyStart);
    const people = new Map<string, any>();
    for (const run of year.runs) for (const e of run.entries) people.set(e.id, e.person);
    const challans = year.challans.filter(c => !quarter || c.quarter === quarter);
    const blocks = challans.map((c, i) => {
      const row = challanRow(c);
      const lines = c.allocations
        .map(a => ({ a, p: people.get(a.entryId) }))
        .sort((x, y) => (x.p?.name || '').localeCompare(y.p?.name || ''))
        .map(({ a, p }, n) => `<tr><td>${n + 1}</td><td class="nw">${esc(p?.employeeNo)}</td><td class="nw">${esc(p?.name)}</td>
          <td class="nw">${hasValidPan(p?.panNumber) ? esc(p.panNumber.toUpperCase()) : 'PANNOTAVBL'}</td><td class="amt">${inr(a.amount)}</td></tr>`).join('');
      return `<div class="st-h">${i + 1}. ${esc(monthLabel(c.period))} — challan ${esc(c.challanSerial)}, BSR ${esc(c.bsrCode)}, deposited ${esc(dateLabel(c.depositedOn))}${row.late ? ' <span style="color:#B42318;font-size:12px;">(after the due date)</span>' : ''}</div>
  <table class="st-table" style="width:auto;min-width:70%;">
    <tr><th class="amt">Income tax</th><th class="amt">Surcharge</th><th class="amt">Cess</th><th class="amt">Interest</th><th class="amt">Fee</th><th class="amt">Others</th><th class="amt">Total</th></tr>
    <tr><td class="amt">${amt(c.tds)}</td><td class="amt">${amt(c.surcharge)}</td><td class="amt">${amt(c.cess)}</td><td class="amt">${amt(c.interest)}</td>
      <td class="amt">${amt(c.fee)}</td><td class="amt">${amt(c.others)}</td><td class="amt"><strong>${inr(row.total)}</strong></td></tr>
  </table>
  <table class="st-table" style="width:auto;min-width:70%;">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>PAN</th><th class="amt">Tax covered</th></tr>
    ${lines || '<tr><td colspan="5">Not matched to any employee.</td></tr>'}
    <tr class="tot"><td colspan="4">Matched${row.unallocated > 0.5 ? ` (${inr(row.unallocated)} unmatched)` : ''}</td><td class="amt">${inr(row.allocated)}</td></tr>
  </table>`;
    }).join('');
    const scope = quarter ? `${QUARTERS[quarter - 1].label} (${QUARTERS[quarter - 1].months})` : 'Whole year';
    const html = reportShell(await orgBrand(organizationId), 'TDS Challan Report', `FY ${fy.label} · ${scope}`, `
  <table class="st-table" style="width:auto;min-width:50%;">
    <tr><th>Month</th><th class="amt">Tax deducted</th><th class="amt">Deposited</th><th class="amt">Balance</th></tr>
    ${year.months.filter(m => !quarter || m.quarter === quarter).filter(m => m.status || m.deposited)
      .map(m => `<tr><td>${esc(m.label)}</td><td class="amt">${amt(m.deducted)}</td><td class="amt">${amt(m.deposited)}</td><td class="amt">${amt(m.balance)}</td></tr>`).join('')
      || '<tr><td colspan="4">No payroll in this period.</td></tr>'}
  </table>
  ${blocks || '<p>No challans recorded for this period.</p>'}`);
    res.json({ html, title: `TDS Challan Report — FY ${fy.label}${quarter ? ` — ${QUARTERS[quarter - 1].label}` : ''}` });
  },

  // The quarter's return on paper: control totals, challans, deductee rows and what needs fixing.
  async returnSummary(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const quarter = quarterInput(req.query.quarter);
    const fy = financialYearFor(fyStart);
    const [year, statutory, settings, brand] = await Promise.all([
      loadYear(organizationId, fyStart), statutoryFor(organizationId), settingsFor(organizationId), orgBrand(organizationId),
    ]);
    const { challans, rows } = deducteeRows(year, fyStart, quarter, settings.tdsAnnexure1IncludeZero);
    const issues = issuesFor(year, statutory, fyStart, quarter);
    const code = sectionCode(statutory.deductorType);
    const sum = (list: any[], f: string) => r2(list.reduce((s, r) => s + Number(r[f] || 0), 0));
    const html = reportShell(brand, `${settings.form24qName} — Return Summary`, `FY ${fy.label} · ${QUARTERS[quarter - 1].label} (${QUARTERS[quarter - 1].months})`, `
  ${issues.length ? `<table class="st-table"><tr><th>Before filing</th></tr>
    ${issues.map(i => `<tr><td>${i.level === 'ERROR' ? '<strong style="color:#B42318;">Fix:</strong>' : '<strong style="color:#B54708;">Check:</strong>'} ${esc(i.message)}</td></tr>`).join('')}</table>` : ''}
  <table class="st-table" style="width:auto;min-width:60%;">
    <tr><th colspan="2">Deductor</th></tr>
    <tr><td>Name</td><td>${esc(brand.name)}</td></tr>
    <tr><td>TAN</td><td>${esc(statutory.tanNumber) || dash}</td></tr>
    <tr><td>PAN</td><td>${esc(statutory.panNumber) || dash}</td></tr>
    <tr><td>Type of deductor</td><td>${esc(statutory.deductorType) || dash}</td></tr>
    <tr><td>Person responsible</td><td>${esc(statutory.responsibleName) || dash}${statutory.responsibleDesignation ? `, ${esc(statutory.responsibleDesignation)}` : ''}</td></tr>
  </table>
  <table class="st-table" style="width:auto;min-width:60%;">
    <tr><th colspan="2">Control totals</th></tr>
    <tr><td>Challans</td><td class="amt">${challans.length}</td></tr>
    <tr><td>Deductee records</td><td class="amt">${rows.length}</td></tr>
    <tr><td>Amount paid</td><td class="amt">${inr(sum(rows, 'amountPaid'))}</td></tr>
    <tr><td>Tax deducted</td><td class="amt">${inr(sum(rows, 'deducted'))}</td></tr>
    <tr><td>Tax deposited as per challans</td><td class="amt">${inr(r2(challans.reduce((s, c) => s + challanTotal(c), 0)))}</td></tr>
  </table>
  <div class="st-h">Challans</div>
  <table class="st-table">
    <tr><th>No.</th><th>Section</th><th>Salary month</th><th>BSR code</th><th>Date of deposit</th><th>Challan serial</th>
      <th class="amt">Income tax</th><th class="amt">Surcharge</th><th class="amt">Cess</th><th class="amt">Interest</th><th class="amt">Fee</th><th class="amt">Others</th><th class="amt">Total</th></tr>
    ${challans.map((c, i) => `<tr><td>${i + 1}</td><td>${code}</td><td class="nw">${esc(monthLabel(c.period))}</td><td>${esc(c.bsrCode)}</td>
      <td class="nw">${esc(dmy(c.depositedOn))}</td><td>${esc(c.challanSerial)}</td>
      <td class="amt">${amt(c.tds)}</td><td class="amt">${amt(c.surcharge)}</td><td class="amt">${amt(c.cess)}</td><td class="amt">${amt(c.interest)}</td>
      <td class="amt">${amt(c.fee)}</td><td class="amt">${amt(c.others)}</td><td class="amt">${amt(challanTotal(c))}</td></tr>`).join('')
      || '<tr><td colspan="13">No challans recorded for this quarter.</td></tr>'}
  </table>
  <div class="st-h">Deductee details (Annexure I)</div>
  <table class="st-table">
    <tr><th>Challan</th><th>#</th><th>Employee ref.</th><th>PAN</th><th>Name</th><th>Date of payment</th>
      <th class="amt">Amount paid</th><th class="amt">Tax deducted</th><th class="amt">Tax deposited</th><th>Date of deduction</th><th>Remark</th></tr>
    ${rows.map((r, i) => `<tr><td class="ctr">${r.challanNo ?? (r.zero ? '—' : '<strong style="color:#B42318;">none</strong>')}</td><td>${i + 1}</td><td class="nw">${esc(r.employeeNo)}</td>
      <td class="nw">${esc(r.pan)}</td><td class="nw">${esc(r.name)}</td><td class="nw">${esc(dmy(r.paidOn))}</td>
      <td class="amt">${amt(r.amountPaid)}</td><td class="amt">${amt(r.deducted)}</td><td class="amt">${amt(r.deposited)}</td>
      <td class="nw">${esc(dmy(r.deductedOn))}</td><td class="ctr">${esc(r.remark) || ''}</td></tr>`).join('')
      || '<tr><td colspan="11">No tax was deducted in this quarter.</td></tr>'}
    <tr class="tot"><td colspan="6">Total</td><td class="amt">${amt(sum(rows, 'amountPaid'))}</td><td class="amt">${amt(sum(rows, 'deducted'))}</td><td class="amt">${amt(sum(rows, 'deposited'))}</td><td colspan="2"></td></tr>
  </table>
  <p style="font-size:11.5px;color:#6b7280;">Remark C: tax deducted at the higher rate because no valid PAN was given.
  The whole deduction is shown as income tax; surcharge and cess are not split per employee.
  ${settings.tdsAnnexure1IncludeZero ? 'Employees paid with no tax deducted are listed too.' : 'Employees with no tax deducted are left out.'}
  ${quarter === 4 ? 'The annual salary details (Annexure II) are in the return workbook.' : ''}</p>`);
    res.json({ html, title: `${settings.form24qName} — FY ${fy.label} — ${QUARTERS[quarter - 1].label}` });
  },

  // The quarter's return as a workbook, laid out for keying into the
  // government's return preparation utility.
  async returnWorkbook(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const quarter = quarterInput(req.query.quarter);
    const fy = financialYearFor(fyStart);
    const [year, statutory, settings, brand] = await Promise.all([
      loadYear(organizationId, fyStart), statutoryFor(organizationId), settingsFor(organizationId), orgBrand(organizationId),
    ]);
    const { challans, rows } = deducteeRows(year, fyStart, quarter, settings.tdsAnnexure1IncludeZero);
    const code = sectionCode(statutory.deductorType);
    const before = previousQuarter(fyStart, quarter);
    const previous = await prisma.tdsReturnFiling.findUnique({ where: { organizationId_fyStart_quarter: { organizationId, ...before } } });
    const deductor = returnAddress(statutory, 'deductor', brand.addressLine);
    const responsible = returnAddress(statutory, 'responsible', statutory.responsibleAddress);
    const addressRows = (who: string, a: ReturnType<typeof returnAddress>) => [
      ...(a.filled ? [
        [`${who} — flat / door / block no.`, a.flat], [`${who} — name of premises / building`, a.building],
        [`${who} — road / street / lane`, a.street], [`${who} — area / location`, a.area],
        [`${who} — town / city / district`, a.city], [`${who} — state`, a.state], [`${who} — PIN code`, a.pin],
      ] : [[`${who} — address`, a.line]]),
      [`${who} — address changed since the last return (Y/N)`, a.changed ? 'Y' : 'N'],
    ];
    const Excel = await import('exceljs');
    const wb = new Excel.Workbook();
    const sheet = (name: string, header: string[], data: any[][], widths: number[] = []) => {
      const ws = wb.addWorksheet(name);
      ws.addRow(header);
      ws.getRow(1).font = { bold: true };
      for (const r of data) ws.addRow(r);
      ws.columns.forEach((c: any, i: number) => { c.width = widths[i] || Math.max(14, Math.min(34, header[i].length + 4)); });
      return ws;
    };

    sheet('Deductor', ['Field', 'Value'], [
      ['Form', settings.form24qName], ['Financial year', fy.label], ['Quarter', `${QUARTERS[quarter - 1].label} (${QUARTERS[quarter - 1].months})`],
      ['Receipt number of the previous statement', previous?.receiptNo || ''],
      ['TAN', statutory.tanNumber || ''], ['PAN', statutory.panNumber || ''], ['Name of deductor', brand.name],
      ...addressRows('Deductor', deductor), ['Type of deductor', statutory.deductorType || ''],
      ['Phone', brand.phone], ['Email', brand.email],
      ['Person responsible — name', statutory.responsibleName || ''], ['Person responsible — designation', statutory.responsibleDesignation || ''],
      ['Person responsible — PAN', statutory.responsiblePan || ''], ...addressRows('Person responsible', responsible),
      ['Person responsible — email', statutory.responsibleEmail || ''], ['Person responsible — phone', statutory.responsiblePhone || ''],
    ], [48, 60]);

    sheet('Challans',
      ['Challan No.', 'Section Code', 'Income Tax', 'Surcharge', 'Health and Education Cess', 'Interest', 'Fee', 'Others', 'Total Deposited',
        'BSR Code', 'Date of Deposit (dd/mm/yyyy)', 'Challan Serial No.', 'Mode (C = challan)', 'Minor Head', 'Salary Month'],
      challans.map((c, i) => [i + 1, code, c.tds, c.surcharge, c.cess, c.interest, c.fee, c.others, challanTotal(c),
        c.bsrCode, dmy(c.depositedOn), c.challanSerial, 'C', c.minorHead, monthLabel(c.period)]));

    sheet('Deductees (Annexure I)',
      ['Challan No.', 'Sl. No.', 'Employee Reference No.', 'PAN', 'Name', 'Section Code', 'Date of Payment / Credit (dd/mm/yyyy)',
        'Amount Paid / Credited', 'TDS', 'Surcharge', 'Health and Education Cess', 'Total Tax Deducted', 'Total Tax Deposited',
        'Date of Deduction (dd/mm/yyyy)', 'Remark (C = higher rate, no PAN)'],
      rows.map((r, i) => [r.challanNo ?? '', i + 1, r.employeeNo, r.pan, r.name, code, dmy(r.paidOn),
        r.amountPaid, r.deducted, 0, 0, r.deducted, r.deposited, dmy(r.deductedOn), r.remark]));

    let annexure2 = 0;
    if (quarter === 4) {
      const annual = await annualTaxFor(organizationId, fyStart);
      // Employees with no tax for the year can be left out
      const listed = annual.rows.filter(a => !settings.tdsAnnexure2SkipZero || a.form.tax.net > 0 || a.form.deducted.total > 0);
      annexure2 = listed.length;
      const landlordNo = Array.from({ length: MAX_LANDLORDS }, (_, i) => i);
      const pick = (a: AnnualTax, key: string) => a.form.chapter6.rows.find(r => r.key === key)!;
      sheet('Salary details (Annexure II)',
        ['Sl. No.', 'Employee Reference No.', 'PAN', 'Name', 'Employed From (dd/mm/yyyy)', 'Employed To (dd/mm/yyyy)', 'Opting New Regime (Y/N)',
          'Salary u/s 17(1)', 'Perquisites u/s 17(2)', 'Profits in Lieu of Salary u/s 17(3)', 'Gross Salary — Current Employer',
          'Salary from Other Employers', 'HRA Exempt u/s 10(13A)', 'Other Allowances Exempt u/s 10', 'Total Exemption u/s 10', 'Salary from Current Employer after Exemptions',
          'Standard Deduction u/s 16(ia)', 'Entertainment Allowance u/s 16(ii)', 'Tax on Employment u/s 16(iii)', 'Total Deductions u/s 16',
          'Income Chargeable under Salaries', 'Income / Loss from House Property', 'Income from Other Sources', 'Gross Total Income',
          '80C — Gross', '80C — Deductible', '80CCC — Deductible', '80CCD(1) — Deductible', '80C + 80CCC + 80CCD(1) — Deductible',
          '80CCD(1B) — Deductible', '80CCD(2) — Deductible', '80D — Deductible', '80E — Deductible', '80G — Deductible', '80TTA — Deductible',
          'Other Chapter VI-A — Deductible', 'Total Chapter VI-A', 'Total Taxable Income', 'Tax on Total Income', 'Rebate u/s 87A', 'Surcharge',
          'Health and Education Cess', 'Relief u/s 89', 'Net Tax Payable', 'TDS — Current Employer', 'TDS — Other Employers',
          'TDS / TCS Elsewhere (reported by employee)', 'Total TDS',
          'Shortfall (+) / Excess (-)', 'Rent Paid (if above Rs 1,00,000)',
          ...landlordNo.flatMap(n => [`Landlord ${n + 1} Name`, `Landlord ${n + 1} PAN`, `Landlord ${n + 1} Rent`]),
          'Housing Loan Interest', 'Lender Name', 'Lender PAN'],
        listed.map((a, i) => {
          const f = a.form;
          const bigRent = a.landlord.rent > 100000 && !f.newRegime;
          const interest = f.newRegime ? 0 : a.lender.interest;
          return [i + 1, a.person.employeeNo, a.hasValidPan ? a.person.panNumber.toUpperCase() : 'PANNOTAVBL', a.person.name,
            dmy(a.employedFrom), dmy(a.employedTo), f.newRegime ? 'Y' : 'N',
            f.gross.salary171, f.gross.perquisites, f.gross.profitsInLieu, f.gross.total, f.gross.otherEmployers,
            f.exempt.hra, r2(f.exempt.total - f.exempt.hra), f.exempt.total, f.fromCurrent,
            f.section16.standard, f.section16.entertainment, f.section16.professionalTax, f.section16.total,
            f.chargeable, f.other.houseProperty, f.other.otherSources, f.grossTotalIncome,
            pick(a, 'a').gross, pick(a, 'a').deductible, pick(a, 'b').deductible, pick(a, 'c').deductible, pick(a, 'd').deductible,
            pick(a, 'e').deductible, pick(a, 'f').deductible, pick(a, 'g').deductible, pick(a, 'h').deductible, pick(a, 'i').deductible,
            pick(a, 'j').deductible, pick(a, 'k').deductible, f.chapter6.total, f.taxableIncome,
            f.tax.onIncome, f.tax.rebate, f.tax.surcharge, f.tax.cess, f.tax.relief89, f.tax.net,
            f.deducted.current, f.deducted.otherEmployers, f.deducted.elsewhere, f.deducted.total, f.balance,
            bigRent ? a.landlord.rent : '',
            ...landlordNo.flatMap(n => {
              const l = bigRent ? a.landlords[n] : undefined;
              return [l?.name || '', l?.pan || '', l ? l.rent : ''];
            }),
            interest > 0 ? interest : '', interest > 0 ? a.lender.name : '', interest > 0 ? a.lender.pan : ''];
        }));
    }

    const sum = (f: string) => r2(rows.reduce((s, r) => s + Number(r[f] || 0), 0));
    sheet('Control totals', ['Item', 'Value'], [
      ['Number of challans', challans.length], ['Number of deductee records', rows.length],
      ['Amount paid', sum('amountPaid')], ['Tax deducted', sum('deducted')],
      ['Tax deposited as per challans', r2(challans.reduce((s, c) => s + challanTotal(c), 0))],
      ...(quarter === 4 ? [['Salary detail records (Annexure II)', annexure2]] : []),
    ], [38, 22]);

    const buffer = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
    res.json({
      filename: `tds-return-${fy.label}-Q${quarter}.xlsx`, base64: buffer.toString('base64'),
      challans: challans.length, deductees: rows.length, salaryRecords: annexure2,
    });
  },

  // ---- Form 16 --------------------------------------------------------------------------
  async getForm16List(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const [annual, control, partA, settings, statutory] = await Promise.all([
      annualTaxFor(organizationId, fyStart), yearControlFor(organizationId, fyStart),
      prisma.form16PartA.findMany({ where: { organizationId, fyStart }, select: { id: true, personId: true, fileName: true } }),
      settingsFor(organizationId), statutoryFor(organizationId),
    ]);
    const partAByPerson = new Map(partA.map(p => [p.personId, p]));
    res.json({
      fyStart, financialYear: annual.fy.label, financialYears: yearOptions(),
      formNames: { form16: settings.form16Name, form12ba: settings.form12baName },
      released: control.form16Released,
      monthsRun: annual.monthsRun, draftMonths: annual.draftPeriods.map(monthLabel),
      signatoryMissing: !statutory.form16SignatoryName,
      rows: annual.rows.map(a => ({
        person: { id: a.person.id, name: a.person.name, employeeNo: a.person.employeeNo },
        hasValidPan: a.hasValidPan, regime: a.regime, months: a.working.monthsPaid,
        salary: a.form.gross.total, taxableIncome: a.form.taxableIncome, tax: a.form.tax.net,
        deducted: a.form.deducted.total, balance: a.form.balance, perquisites: a.form.gross.perquisites,
        partA: partAByPerson.get(a.person.id) || null,
      })),
    });
  },

  async form16(req: any, res: Response) {
    res.json(await buildForm16(req.user?.organizationId, str(req.query.personId), fyInput(req.query.fy)));
  },

  async form12ba(req: any, res: Response) {
    res.json(await buildForm12ba(req.user?.organizationId, str(req.query.personId), fyInput(req.query.fy)));
  },

  // Every employee's Part B on one printable page, a sheet each.
  async form16All(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const [annual, brand, statutory, settings] = await Promise.all([
      annualTaxFor(organizationId, fyStart), orgBrand(organizationId), statutoryFor(organizationId), settingsFor(organizationId),
    ]);
    if (annual.rows.length === 0) throw new AppError(404, `No finalized salary in FY ${annual.fy.label}.`);
    const html = annual.rows.map((a, i) => `<div style="${i ? 'page-break-before:always;margin-top:36px;' : ''}">
      ${reportShell(brand, `${settings.form16Name} — Part B`, `FY ${annual.fy.label}`, form16Html(brand, statutory, settings.form16Name, a, fyStart))}</div>`).join('');
    res.json({ html, title: `${settings.form16Name} — all employees — FY ${annual.fy.label}` });
  },

  // Employees see their Form 16 only once HR releases the year's.
  async setForm16Released(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.body.fyStart);
    await yearControlFor(organizationId, fyStart);
    const released = Boolean(req.body.released);
    await prisma.taxYearControl.update({ where: { organizationId_fyStart: { organizationId, fyStart } }, data: { form16Released: released } });
    await logPayrollAudit(req, [{
      action: 'FORM16_RELEASE_CHANGED', field: `FY ${financialYearFor(fyStart).label}`,
      newValue: released ? 'Released to employees' : 'Withdrawn',
    }]);
    res.json({ released });
  },

  // ---- Part A, from the tax department's portal --------------------------------------------
  async uploadPartA(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.body.fyStart);
    const person = await prisma.person.findFirst({ where: { id: req.params.personId, organizationId }, select: { id: true, name: true } });
    if (!person) throw new AppError(404, 'Person not found');
    const fileName = str(req.body.fileName).slice(0, 200);
    const fileData = String(req.body.fileData || '');
    if (!fileName || !/^data:application\/pdf;base64,/.test(fileData)) throw new AppError(400, 'Attach the Part A PDF');
    if (fileData.length > MAX_PART_A) throw new AppError(400, 'The file is too large. Keep it under 4 MB.');
    const uploadedBy = await actorName(req.user?.userId);
    await prisma.form16PartA.upsert({
      where: { personId_fyStart: { personId: person.id, fyStart } },
      create: { organizationId, personId: person.id, fyStart, fileName, fileData, uploadedBy },
      update: { fileName, fileData, uploadedBy },
    });
    await logPayrollAudit(req, [{
      action: 'FORM16_PART_A_SAVED', personId: person.id, personName: person.name,
      field: `FY ${financialYearFor(fyStart).label}`, newValue: fileName,
    }]);
    res.status(201).json({ fileName });
  },

  async getPartA(req: any, res: Response) {
    const doc = await prisma.form16PartA.findFirst({
      where: { personId: req.params.personId, organizationId: req.user?.organizationId, fyStart: fyInput(req.query.fy) },
    });
    if (!doc) throw new AppError(404, 'Part A has not been uploaded');
    res.json({ fileName: doc.fileName, fileData: doc.fileData });
  },

  async deletePartA(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const doc = await prisma.form16PartA.findFirst({
      where: { personId: req.params.personId, organizationId, fyStart }, include: { person: { select: { name: true } } },
    });
    if (!doc) throw new AppError(404, 'Part A has not been uploaded');
    await prisma.form16PartA.delete({ where: { id: doc.id } });
    await logPayrollAudit(req, [{
      action: 'FORM16_PART_A_SAVED', personId: doc.personId, personName: doc.person.name,
      field: `FY ${financialYearFor(fyStart).label}`, oldValue: doc.fileName, newValue: 'removed',
    }]);
    res.json({ message: 'Part A removed' });
  },
};
