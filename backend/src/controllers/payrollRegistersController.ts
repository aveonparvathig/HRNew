// Labour-law registers: loads the data, builds each register with
// registerCalc, and renders it as a printable page or an Excel workbook.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { orgBrand, OrgBrand } from '../services/orgBrand';
import { financialYearFor, financialYearOf, periodsOfFinancialYear } from '../services/payroll/financialYear';
import { currentPeriodIST } from '../services/payroll/salaryStructure';
import { outstandingPrincipal } from '../services/payroll/loanCalc';
import { esc, inr, monthLabel, reportShell } from '../services/payroll/reportHtml';
import {
  Register, RegisterColumn, Establishment, WageEntry, LoanRow, BonusEmployee,
  tnFormU, tnFormV, tnFormW, tnFormX, formA, formB, formC, formD, bonusFormC, headcount, dmy,
} from '../services/payroll/registerCalc';

const str = (v: any) => String(v ?? '').trim();
const r2 = (n: number) => Math.round(n * 100) / 100;

export const REGISTER_CODES = [
  'tn-u', 'tn-v', 'tn-w', 'tn-x', 'form-a', 'form-b', 'form-c', 'form-d', 'bonus-c', 'bonus-d', 'gratuity-f',
] as const;
type RegisterCode = (typeof REGISTER_CODES)[number];

function fyInput(value: any): number {
  if (value === undefined || value === null || value === '') return financialYearOf(currentPeriodIST()).startYear;
  const year = Number(/^(\d{4})/.exec(String(value))?.[1]);
  if (!year || year < 2000 || year > 2100) throw new AppError(400, 'Pick a financial year');
  return year;
}

// ---- Data -------------------------------------------------------------------------
async function establishment(organizationId: string): Promise<{ est: Establishment; brand: OrgBrand; statutory: any }> {
  const [brand, statutory] = await Promise.all([
    orgBrand(organizationId),
    prisma.orgStatutoryProfile.findUnique({ where: { organizationId } }),
  ]);
  const s: any = statutory || {};
  return {
    brand, statutory: s,
    est: {
      name: brand.name, address: brand.addressLine,
      employer: s.responsibleName || brand.signatoryName || '', manager: s.managerName || '',
      registrationNo: s.shopsRegistrationNo || '', lin: s.labourIdNumber || '',
    },
  };
}

const PERSON_FIELDS = {
  id: true, name: true, employeeNo: true, gender: true, parentSpouseName: true, dateOfBirth: true, joinDate: true,
  leavingDate: true, reasonForLeaving: true, designation: true, department: true, address: true, phone: true, email: true,
  officialEmail: true, maritalStatus: true, aadharNo: true, panNumber: true, pfNumber: true, pfUan: true, esiNumber: true,
  bankName: true, bankAccountNumber: true, ifscCode: true, workLocation: { select: { name: true } },
};
const byCode = (a: any, b: any) =>
  String(a.employeeNo || '').localeCompare(String(b.employeeNo || ''), 'en', { numeric: true }) || a.name.localeCompare(b.name);

// Everyone on the employee record, those who have left included.
async function employees(organizationId: string) {
  const [people, withPhoto] = await Promise.all([
    prisma.person.findMany({ where: { organizationId, kind: 'CANDIDATE', isEmployee: true }, select: PERSON_FIELDS }),
    prisma.person.findMany({ where: { organizationId, isEmployee: true, photoData: { not: '' } }, select: { id: true } }),
  ]);
  const photos = new Set(withPhoto.map(p => p.id));
  return people.map(p => ({ ...p, hasPhoto: photos.has(p.id) })).sort(byCode);
}

// A run's payslips shaped for the wage registers, with each employee's
// loan position for the month.
async function runEntries(organizationId: string, runId: string) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: str(runId), organizationId },
    include: { entries: { include: { person: { select: PERSON_FIELDS }, lines: { include: { component: { select: { code: true } } } } } } },
  });
  if (!run) throw new AppError(400, 'Pick a payroll month');
  const monthStart = `${run.period}-01`;
  const monthEnd = `${run.period}-31`;
  const loans = await prisma.loan.findMany({
    where: { organizationId, personId: { in: run.entries.map(e => e.personId) } },
    include: { transactions: true, schedule: { where: { period: run.period } } },
  });
  const advance = new Map<string, { paid: number; opening: number; principalRecovered: number }>();
  for (const loan of loans) {
    const a = advance.get(loan.personId) || { paid: 0, opening: 0, principalRecovered: 0 };
    a.opening = r2(a.opening + outstandingPrincipal(loan.transactions.filter(t => t.date < monthStart)));
    a.paid = r2(a.paid + loan.transactions.filter(t => t.principal > 0 && t.date >= monthStart && t.date <= monthEnd).reduce((s, t) => s + t.principal, 0));
    a.principalRecovered = r2(a.principalRecovered + loan.schedule.reduce((s, l) => s + l.principal, 0));
    advance.set(loan.personId, a);
  }
  const entries: WageEntry[] = run.entries
    .map(e => ({ ...e, lines: e.lines.map(l => ({ code: l.component.code, name: l.name, type: l.type, amount: l.amount })), advance: advance.get(e.personId) }))
    .sort((a, b) => byCode(a.person, b.person));
  return { run, entries };
}

async function loanRows(organizationId: string, fyStart: number): Promise<LoanRow[]> {
  const [from, to] = [`${fyStart}-04-01`, `${fyStart + 1}-03-31`];
  const loans = await prisma.loan.findMany({
    where: { organizationId, loanDate: { lte: to }, OR: [{ closedOn: null }, { closedOn: { gte: from } }] },
    include: { person: { select: { name: true, employeeNo: true } }, transactions: true, schedule: { orderBy: { seq: 'asc' } } },
  });
  return loans.map(l => ({
    employeeNo: l.person.employeeNo || '', name: l.person.name, loanNo: l.loanNo, title: l.title, annualRate: l.annualRate,
    loanDate: l.loanDate, totalLent: r2(l.transactions.filter(t => t.principal > 0).reduce((s, t) => s + t.principal, 0)),
    instalments: l.schedule.length, firstPeriod: l.schedule[0]?.period || '', lastPeriod: l.schedule[l.schedule.length - 1]?.period || '',
    closedOn: l.closedOn, outstanding: outstandingPrincipal(l.transactions),
  })).sort((a, b) => a.name.localeCompare(b.name) || a.loanNo.localeCompare(b.loanNo));
}

// Everyone paid in the year through finalized runs, month by month, with
// the bonus already paid to them through payroll.
async function bonusEmployees(organizationId: string, fyStart: number): Promise<BonusEmployee[]> {
  const entries = await prisma.payslipEntry.findMany({
    where: { organizationId, run: { status: 'FINALIZED', period: { in: periodsOfFinancialYear(fyStart) } } },
    include: {
      person: { select: { id: true, name: true, employeeNo: true, parentSpouseName: true, designation: true, dateOfBirth: true } },
      lines: { include: { component: { select: { code: true } } } },
    },
  });
  const map = new Map<string, BonusEmployee>();
  for (const e of entries) {
    const b = map.get(e.personId) || {
      name: e.person.name, employeeNo: e.person.employeeNo || '', fatherName: e.person.parentSpouseName || '',
      designation: e.person.designation || '', dateOfBirth: e.person.dateOfBirth, months: [], paidInYear: 0,
    };
    b.months.push({ basic: e.basic, da: e.da, payDays: e.payDays, totalWorkingDays: e.totalWorkingDays });
    b.paidInYear = r2(b.paidInYear + e.lines.filter(l => l.component.code === 'BONUS').reduce((s, l) => s + l.amount, 0));
    map.set(e.personId, b);
  }
  return [...map.values()].sort(byCode);
}

// ---- Rendering --------------------------------------------------------------------
const show = (value: any, column: RegisterColumn) => {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    if (column.kind === 'amount') return Math.abs(value) < 0.005 ? '—' : value.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    return String(value);
  }
  return esc(value);
};

// Runs of neighbouring columns under the same group heading.
function groupRuns(columns: RegisterColumn[]) {
  const runs: { group: string; from: number; count: number }[] = [];
  columns.forEach((c, i) => {
    const last = runs[runs.length - 1];
    if (last && last.group === (c.group || '') && c.group) last.count++;
    else runs.push({ group: c.group || '', from: i, count: 1 });
  });
  return runs;
}

function registerHtml(brand: OrgBrand, r: Register, subtitle: string): string {
  const runs = groupRuns(r.columns);
  const grouped = runs.some(run => run.group);
  const cls = (c: RegisterColumn) => (c.kind === 'amount' || c.kind === 'number' ? 'amt' : c.kind === 'narrow' ? 'ctr' : '');
  const top = runs.map(run => (run.group
    ? `<th colspan="${run.count}" class="ctr">${esc(run.group)}</th>`
    : `<th${grouped ? ' rowspan="2"' : ''} class="rg-h">${esc(r.columns[run.from].label)}</th>`)).join('');
  const second = grouped
    ? `<tr>${r.columns.filter(c => c.group).map(c => `<th class="rg-h">${esc(c.label)}</th>`).join('')}</tr>` : '';
  const numbers = r.columns.some(c => c.no)
    ? `<tr>${r.columns.map(c => `<th class="ctr rg-n">${esc(c.no)}</th>`).join('')}</tr>` : '';
  const body = r.rows.map(row => `<tr>${row.map((v, i) => `<td class="${cls(r.columns[i])}">${show(v, r.columns[i])}</td>`).join('')}</tr>`).join('');
  const totals = r.totals
    ? `<tr class="tot">${r.totals.map((v, i) => `<td class="${cls(r.columns[i])}">${show(v, r.columns[i])}</td>`).join('')}</tr>` : '';
  return reportShell(brand, `${r.form} — ${r.title}`, subtitle, `
  <style>
    .rg th, .rg td { font-size: 9.5px !important; padding: 3px 4px !important; }
    .rg .rg-h { white-space: normal; min-width: 46px; vertical-align: bottom; }
    .rg .rg-n { font-weight: 400; color: #6b7280; }
    @media print { .rg th, .rg td { font-size: 7.5px !important; padding: 2px 3px !important; } }
  </style>
  <p style="font-size:11.5px;color:#555;margin:0 0 8px;">${esc(r.rule)}</p>
  <table class="st-table" style="width:auto;min-width:60%;">
    ${r.header.map(([label, value]) => `<tr><td style="width:40%;">${esc(label)}</td><td>${esc(value) || '<span class="muted">not set</span>'}</td></tr>`).join('')}
  </table>
  <table class="st-table rg">
    <thead><tr>${top}</tr>${second}${numbers}</thead>
    <tbody>${body || `<tr><td colspan="${r.columns.length}">No entries.</td></tr>`}${totals}</tbody>
  </table>
  ${r.notes.map(n => `<p style="font-size:11px;color:#6b7280;margin:4px 0;">${esc(n)}</p>`).join('')}`);
}

async function registerWorkbook(r: Register, subtitle: string): Promise<Buffer> {
  const Excel = await import('exceljs');
  const wb = new Excel.Workbook();
  const ws = wb.addWorksheet(r.form);
  ws.addRow([`${r.form} — ${r.title}`]).font = { bold: true, size: 13 };
  ws.addRow([subtitle]);
  ws.addRow([r.rule]).font = { italic: true };
  for (const [label, value] of r.header) ws.addRow([label, value]);
  ws.addRow([]);
  const runs = groupRuns(r.columns);
  if (runs.some(run => run.group)) {
    const groupRow = ws.addRow(r.columns.map(c => c.group || ''));
    groupRow.font = { bold: true };
    for (const run of runs) {
      if (run.group && run.count > 1) ws.mergeCells(groupRow.number, run.from + 1, groupRow.number, run.from + run.count);
    }
  }
  const labels = ws.addRow(r.columns.map(c => c.label));
  labels.font = { bold: true };
  labels.alignment = { wrapText: true, vertical: 'bottom' };
  if (r.columns.some(c => c.no)) ws.addRow(r.columns.map(c => c.no));
  for (const row of r.rows) ws.addRow(row.map(v => (v === null ? '' : v)));
  if (r.totals) ws.addRow(r.totals.map(v => (v === null ? '' : v))).font = { bold: true };
  ws.addRow([]);
  for (const note of r.notes) ws.addRow([note]);
  ws.columns.forEach((c: any, i: number) => {
    const kind = r.columns[i]?.kind;
    c.width = kind === 'narrow' ? 5 : kind === 'amount' || kind === 'number' ? 13 : 22;
  });
  return Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
}

// ---- The registers ----------------------------------------------------------------
// One register built for the request: its table, a subtitle and a file name.
async function build(organizationId: string, code: RegisterCode, q: any) {
  const { est, brand } = await establishment(organizationId);
  const forRun = async (make: (period: string, entries: WageEntry[]) => Register) => {
    const { run, entries } = await runEntries(organizationId, q.runId);
    return { brand, register: make(run.period, entries), subtitle: monthLabel(run.period), file: run.period };
  };
  switch (code) {
    case 'tn-u': { const people = await employees(organizationId); return { brand, register: tnFormU(est, people), subtitle: `${people.length} employees on record`, file: 'employees' }; }
    case 'form-a': { const people = await employees(organizationId); return { brand, register: formA(est, people), subtitle: `${people.length} employees on record`, file: 'employees' }; }
    case 'tn-v': return forRun((period, entries) => tnFormV(est, period, entries));
    case 'tn-w': return forRun((period, entries) => tnFormW(est, period, entries, headcount(entries.map(e => e.person), `${period}-28`)));
    case 'tn-x': return forRun((period, entries) => tnFormX(est, period, entries));
    case 'form-b': return forRun((period, entries) => formB(est, period, entries));
    case 'form-d': return forRun((period, entries) => formD(est, period, entries));
    case 'form-c': {
      const fy = financialYearFor(fyInput(q.fy));
      return { brand, register: formC(est, fy.label, await loanRows(organizationId, fy.startYear)), subtitle: `FY ${fy.label}`, file: fy.label };
    }
    case 'bonus-c': {
      const fy = financialYearFor(fyInput(q.fy));
      const settings = await prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });
      const { register } = bonusFormC(est, fy.startYear, await bonusEmployees(organizationId, fy.startYear), settings);
      return { brand, register, subtitle: `Accounting year ${fy.label}`, file: fy.label };
    }
    default: throw new AppError(404, 'Register not found');
  }
}

// Bonus Form D: the annual return, from the same figures as Form C.
async function bonusFormD(organizationId: string, q: any) {
  const { est, brand, statutory } = await establishment(organizationId);
  const fy = financialYearFor(fyInput(q.fy));
  const settings = await prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });
  const { summary } = bonusFormC(est, fy.startYear, await bonusEmployees(organizationId, fy.startYear), settings);
  const blank = '<span class="muted">to be filled in</span>';
  const html = reportShell(brand, 'Form D — Annual Return', `Bonus paid to employees for the accounting year ending on 31/03/${fy.startYear + 1}`, `
  <style>@media print { @page { size: A4 portrait; margin: 12mm; } }</style>
  <p style="font-size:11.5px;color:#555;margin:0 0 8px;">Payment of Bonus Rules, 1975 — see rule 5</p>
  <table class="st-table">
    <tr><td style="width:6%;" class="ctr">1</td><td style="width:44%;">Name of the establishment and its complete postal address</td><td>${esc([est.name, est.address].filter(Boolean).join(', '))}</td></tr>
    <tr><td class="ctr">2</td><td>Nature of industry</td><td>${esc(statutory.natureOfBusiness) || '<span class="muted">not set</span>'}</td></tr>
    <tr><td class="ctr">3</td><td>Name of the employer</td><td>${esc(est.employer) || '<span class="muted">not set</span>'}</td></tr>
    <tr><td class="ctr">4</td><td>Total number of employees</td><td>${summary.employees}</td></tr>
    <tr><td class="ctr">5</td><td>Number of employees benefited by bonus payments</td><td>${summary.benefited}</td></tr>
  </table>
  <table class="st-table">
    <tr><th>Total amount payable as bonus under section 10 or 11 of the Payment of Bonus Act, 1965, as the case may be</th>
      <th>Settlement, if any, reached under section 18(1) or 12(3) of the Industrial Disputes Act, 1947, with date</th>
      <th>Percentage of bonus declared to be paid</th><th>Total amount of bonus actually paid</th><th>Date on which payment made</th>
      <th>Whether bonus has been paid to all the employees; if not, reasons for non-payment</th><th>Remarks</th></tr>
    <tr><td class="ctr">1</td><td class="ctr">2</td><td class="ctr">3</td><td class="ctr">4</td><td class="ctr">5</td><td class="ctr">6</td><td class="ctr">7</td></tr>
    <tr><td class="amt">${inr(summary.payable)}</td><td>${blank}</td><td class="ctr">${settings.bonusPercent}%</td><td>${blank}</td><td>${blank}</td><td>${blank}</td>
      <td>${summary.paidInYear ? `${inr(summary.paidInYear)} of bonus was paid through payroll during the year.` : ''}</td></tr>
  </table>
  <div style="display:flex;justify-content:space-between;margin-top:44px;font-size:12.5px;">
    <div>Date: ____________________</div>
    <div style="text-align:right;">____________________________<br/>Signature of the employer or his agent</div>
  </div>
  <p style="font-size:11px;color:#6b7280;margin-top:14px;">Counts and the amount payable come from Form C for the same year. The amount actually paid, its date and any settlement are filled in by hand.</p>`);
  return { html, title: `Bonus Form D — FY ${fy.label}` };
}

// Gratuity Form F: one employee's nomination, with their particulars filled in.
async function gratuityFormF(organizationId: string, q: any) {
  const { est, brand } = await establishment(organizationId);
  const p = await prisma.person.findFirst({ where: { id: str(q.personId), organizationId }, select: PERSON_FIELDS });
  if (!p) throw new AppError(400, 'Pick an employee');
  const line = '____________________';
  const nominee = Array.from({ length: 4 }, (_, i) => `<tr style="height:34px;"><td class="ctr">${i + 1}</td><td></td><td></td><td></td><td></td></tr>`).join('');
  const html = reportShell(brand, 'Form F — Nomination', `Payment of Gratuity Act, 1972 · ${p.name}`, `
  <style>@media print { @page { size: A4 portrait; margin: 12mm; } }</style>
  <p style="font-size:11.5px;color:#555;margin:0 0 8px;">Payment of Gratuity (Central) Rules, 1972 — see sub-rule (1) of rule 6</p>
  <div style="font-size:12.5px;line-height:1.7;">
    <p>To<br/><strong>${esc(est.name)}</strong><br/>${esc(est.address)}</p>
    <p>I, <strong>${esc(p.name)}</strong>, whose particulars are given in the statement below, hereby nominate the person(s) mentioned below to
      receive the gratuity payable after my death as also the gratuity standing to my credit in the event of my death before that amount
      has become payable, or having become payable has not been paid, and direct that the said amount of gratuity shall be paid in
      proportion indicated against the name(s) of the nominee(s).</p>
    <p>2. I hereby certify that the person(s) mentioned is/are a member(s) of my family within the meaning of clause (h) of section 2 of the Payment of Gratuity Act, 1972.</p>
    <p>3. I hereby declare that I have no family within the meaning of clause (h) of section 2 of the said Act.</p>
    <p>4. (a) My father / mother / parents is / are not dependent on me. (b) My husband's father / mother / parents is / are not dependent on my husband.</p>
    <p>5. I have excluded my husband from my family by a notice dated ${line} to the controlling authority in terms of the proviso to clause (h) of section 2 of the said Act.</p>
    <p>6. Nomination made herein invalidates my previous nomination.</p>
  </div>
  <div class="st-h">Nominee(s)</div>
  <table class="st-table">
    <tr><th class="ctr">No.</th><th>Name in full with full address of nominee(s)</th><th>Relationship with the employee</th><th>Age of nominee</th><th>Proportion by which the gratuity will be shared</th></tr>
    ${nominee}
  </table>
  <div class="st-h">Statement</div>
  <table class="st-table">
    <tr><td style="width:6%;" class="ctr">1</td><td style="width:44%;">Name of employee in full</td><td>${esc(p.name)}</td></tr>
    <tr><td class="ctr">2</td><td>Sex</td><td>${esc(p.gender)}</td></tr>
    <tr><td class="ctr">3</td><td>Religion</td><td></td></tr>
    <tr><td class="ctr">4</td><td>Whether unmarried / married / widow / widower</td><td>${esc(p.maritalStatus)}</td></tr>
    <tr><td class="ctr">5</td><td>Department / Branch / Section where employed</td><td>${esc([p.department, p.workLocation?.name].filter(Boolean).join(', '))}</td></tr>
    <tr><td class="ctr">6</td><td>Post held with Ticket No. or Serial No., if any</td><td>${esc([p.designation, p.employeeNo].filter(Boolean).join(', '))}</td></tr>
    <tr><td class="ctr">7</td><td>Date of appointment</td><td>${esc(dmy(p.joinDate))}</td></tr>
    <tr><td class="ctr">8</td><td>Permanent address</td><td>${esc(p.address)}</td></tr>
  </table>
  <div style="display:flex;justify-content:space-between;margin:30px 0 18px;font-size:12.5px;">
    <div>Place: ${line}<br/>Date: ${line}</div>
    <div style="text-align:right;">____________________________<br/>Signature / thumb impression of the employee</div>
  </div>
  <div class="st-h">Declaration by witnesses</div>
  <p style="font-size:12.5px;">Nomination signed / thumb-impressed before me.</p>
  <table class="st-table">
    <tr><th>Name in full and full address of witnesses</th><th style="width:34%;">Signature of witnesses</th></tr>
    <tr style="height:34px;"><td>1.</td><td>1.</td></tr><tr style="height:34px;"><td>2.</td><td>2.</td></tr>
  </table>
  <p style="font-size:12.5px;">Place: ${line} &nbsp; Date: ${line}</p>
  <div class="st-h">Certificate by the employer</div>
  <p style="font-size:12.5px;">Certified that the particulars of the above nomination have been verified and recorded in this establishment.</p>
  <div style="display:flex;justify-content:space-between;margin-top:26px;font-size:12.5px;">
    <div>Employer's reference no., if any: ${line}<br/>Date: ${line}</div>
    <div style="text-align:right;">____________________________<br/>Signature of the employer / officer authorised<br/>Designation: ${line}<br/>${esc(est.name)}</div>
  </div>
  <div class="st-h">Acknowledgement by the employee</div>
  <p style="font-size:12.5px;">Received the duplicate copy of nomination in Form F filed by me and duly certified by the employer.</p>
  <div style="display:flex;justify-content:space-between;margin-top:26px;font-size:12.5px;">
    <div>Date: ${line}</div><div style="text-align:right;">____________________________<br/>Signature of the employee</div>
  </div>
  <p style="font-size:11px;color:#6b7280;margin-top:14px;">Strike out the paragraphs that do not apply. Nominees are not recorded in the system: the employee fills them in.</p>`);
  return { html, title: `Gratuity Form F — ${p.name}` };
}

export const payrollRegistersController = {
  // The register as a printable page.
  report: (code: RegisterCode) => async (req: any, res: Response) => {
    const organizationId = req.user?.organizationId;
    if (code === 'bonus-d') return res.json(await bonusFormD(organizationId, req.query));
    if (code === 'gratuity-f') return res.json(await gratuityFormF(organizationId, req.query));
    const { brand, register, subtitle } = await build(organizationId, code, req.query);
    res.json({ html: registerHtml(brand, register, subtitle), title: `${register.form} — ${register.title} — ${subtitle}`, register: code });
  },

  // The same register as an Excel workbook.
  async workbook(req: any, res: Response) {
    const code = req.params.code as RegisterCode;
    if (!REGISTER_CODES.includes(code) || code === 'bonus-d' || code === 'gratuity-f') throw new AppError(404, 'This register has no workbook');
    const { register, subtitle, file } = await build(req.user?.organizationId, code, req.query);
    const buffer = await registerWorkbook(register, subtitle);
    res.json({ filename: `${code}-${file}.xlsx`, base64: buffer.toString('base64'), rows: register.rows.length });
  },
};
