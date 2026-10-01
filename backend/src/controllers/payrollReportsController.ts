import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { orgBrand } from '../services/orgBrand';
import {
  financialYearOf, financialYearFor, periodsOfFinancialYear,
} from '../services/payroll/financialYear';
import {
  allColumns, usedColumns, columnValue, columnTotal, ComponentColumn,
  FIXED_EARNINGS, FIXED_DEDUCTIONS, FIXED_EMPLOYER,
} from '../services/payroll/lines';
import { summaryByGroup, componentMatrix } from '../services/payroll/reportData';
import {
  salaryStructure, packageChangesFromEntries, sortRevisions,
} from '../services/payroll/salaryStructure';
import {
  esc, amt, inr, monthLabel, monthShort, reportShell,
} from '../services/payroll/reportHtml';

const days = (n: number) => { const v = Number(n || 0); return v % 1 === 0 ? String(v) : v.toFixed(1); };
const byName = (a: any, b: any) => a.person.name.localeCompare(b.person.name);
const pct = (from: number, to: number) =>
  (from > 0 ? `${(((to - from) / from) * 100).toFixed(1)}%`.replace('-', '−') : '—');

async function settingsFor(organizationId: string) {
  return prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });
}

async function fetchRun(runId: string, organizationId: string) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, organizationId },
    include: { entries: { include: {
      person: { select: { id: true, name: true, employeeNo: true, designation: true, department: true, workLocation: { select: { name: true } } } },
      lines: true,
    } } },
  });
  if (!run) throw new AppError(404, 'Payroll run not found');
  return run;
}

// "2026" or "2026-27" → 2026
function parseFinancialYear(value: any): number {
  const m = /^(\d{4})/.exec(String(value || ''));
  if (!m) throw new AppError(400, 'Pick a financial year');
  return Number(m[1]);
}

async function fetchEmployee(personId: any, organizationId: string) {
  const person = await prisma.person.findFirst({
    where: { id: String(personId || ''), organizationId },
    omit: { photoData: true },
  });
  if (!person) throw new AppError(400, 'Pick an employee');
  return person;
}

// Entries of a financial year, each tagged with its run's period.
// releasedOnly limits it to months whose payslips employees can see.
async function fetchYearEntries(organizationId: string, startYear: number, personId?: string, releasedOnly = false) {
  const fy = financialYearFor(startYear);
  const entries = await prisma.payslipEntry.findMany({
    where: {
      organizationId,
      ...(personId ? { personId } : {}),
      run: { period: { gte: fy.start, lte: fy.end }, ...(releasedOnly ? { releasedAt: { not: null } } : {}) },
    },
    include: {
      run: { select: { period: true, status: true } },
      person: { select: { id: true, name: true, employeeNo: true } },
      lines: true,
    },
  });
  return entries.map(e => ({ ...e, period: e.run.period }));
}

const headerCells = (cols: ComponentColumn[]) =>
  cols.map(c => `<th class="amt">${esc(c.short)}</th>`).join('');

// One employee, every component, month by month.
export async function buildYtdStatement(orgId: string, personId: string, startYear: number, releasedOnly = false) {
  const person = await fetchEmployee(personId, orgId);
  const fy = financialYearFor(startYear);
  const periods = periodsOfFinancialYear(startYear);
  const entries = await fetchYearEntries(orgId, startYear, person.id, releasedOnly);
  const entryOf = (period: string) => entries.find(e => e.period === period);
  const cols = usedColumns(entries);
  const row = (label: string, value: (e: any) => string, cls = '') => `<tr class="${cls}"><td class="nw">${esc(label)}</td>
    ${periods.map(p => { const e = entryOf(p); return `<td class="amt">${e ? value(e) : '—'}</td>`; }).join('')}`;
  const lopTotal = entries.reduce((s, e) => s + e.lopDays, 0);
  const body = [
    row('Pay days', e => `${days(e.payDays)}/${e.totalWorkingDays}`) + '<td class="amt">—</td></tr>',
    row('LOP days', e => (e.lopDays ? days(e.lopDays) : '—'))
      + `<td class="amt">${lopTotal ? days(lopTotal) : '—'}</td></tr>`,
    ...cols.map(c => {
      const total = ['GROSS', 'TOTAL_DEDUCTIONS', 'NET', 'CTC'].includes(c.group);
      return row(c.label, e => amt(columnValue(e, c.key)), total ? 'sub' : '')
        + `<td class="amt">${amt(columnTotal(entries, c.key))}</td></tr>`;
    }),
  ].join('');
  const html = reportShell(await orgBrand(orgId), 'Year-to-Date Statement', `FY ${fy.label}`, `
  <p style="margin:0 0 10px;"><strong>${esc(person.name)}</strong>${person.employeeNo ? ` · ${esc(person.employeeNo)}` : ''}${person.designation ? ` · ${esc(person.designation)}` : ''}</p>
  <table class="st-table">
  <tr><th>Component</th>${periods.map(p => `<th class="amt">${esc(monthShort(p))}</th>`).join('')}<th class="amt">Total</th></tr>
  ${entries.length ? body : `<tr><td colspan="14">No payslips for this employee in FY ${fy.label}.</td></tr>`}
  </table>`);
  return { html, title: `Year-to-Date Statement — ${person.name} — FY ${fy.label}` };
}

export const payrollReportsController = {
  // What the report hub can offer: years with payroll, employees, components.
  async getOptions(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const [runs, employees, lines] = await Promise.all([
      prisma.payrollRun.findMany({ where: { organizationId: orgId }, select: { period: true } }),
      prisma.person.findMany({
        where: { organizationId: orgId, kind: 'CANDIDATE', isEmployee: true },
        select: { id: true, name: true, employeeNo: true, employmentStatus: true },
        orderBy: { name: 'asc' },
      }),
      prisma.payslipLine.findMany({
        where: { organizationId: orgId },
        distinct: ['componentId'],
        select: { componentId: true, name: true, type: true },
      }),
    ]);
    const years = [...new Set(runs.map(r => financialYearOf(r.period).startYear))].sort((a, b) => b - a);
    res.json({
      financialYears: years.map(y => ({ startYear: y, label: financialYearFor(y).label })),
      employees,
      components: allColumns([{ lines }]).map(c => ({ key: c.key, label: c.label })),
    });
  },

  // ---- Run-level ----------------------------------------------------------
  // One line per employee with every component used in the run.
  async salaryRegister(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, orgId);
    const entries = [...run.entries].sort(byName);
    const cols = usedColumns(entries);
    const body = entries.map((e, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(e.person.employeeNo)}</td><td class="nw">${esc(e.person.name)}</td>
      <td class="ctr">${days(e.payDays)}/${e.totalWorkingDays}</td><td class="ctr">${e.lopDays ? days(e.lopDays) : '—'}</td>
      ${cols.map(c => `<td class="amt">${amt(columnValue(e, c.key))}</td>`).join('')}</tr>`).join('');
    const html = reportShell(await orgBrand(orgId), 'Salary Register', monthLabel(run.period), `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th class="ctr">Pay Days</th><th class="ctr">LOP</th>${headerCells(cols)}</tr>
    ${body || `<tr><td colspan="${cols.length + 5}">No employees in this run.</td></tr>`}
    <tr class="tot"><td colspan="5">Total (${entries.length} employees)</td>
      ${cols.map(c => `<td class="amt">${amt(columnTotal(entries, c.key))}</td>`).join('')}</tr>
  </table>`);
    res.json({ html, title: `Salary Register — ${monthLabel(run.period)}` });
  },

  // Component totals for the month, plus pay by department and location.
  async salarySummary(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, orgId);
    const entries = run.entries;
    const cols = usedColumns(entries);
    const componentRows = cols.map(c => {
      const total = c.group === 'GROSS' || c.group === 'TOTAL_DEDUCTIONS' || c.group === 'NET' || c.group === 'CTC';
      return `<tr class="${total ? 'sub' : ''}"><td>${esc(c.label)}</td><td class="amt">${inr(columnTotal(entries, c.key))}</td></tr>`;
    }).join('');
    const showCtc = columnTotal(entries, 'ctc') !== 0;
    const ctcCell = (value: number) => (showCtc ? `<td class="amt">${inr(value)}</td>` : '');
    const groupTable = (title: string, groups: ReturnType<typeof summaryByGroup>) => `
  <div class="st-h">${esc(title)}</div>
  <table class="st-table">
    <tr><th>${esc(title.replace('By ', ''))}</th><th class="amt">Employees</th><th class="amt">Gross</th><th class="amt">Deductions</th><th class="amt">Net</th>${showCtc ? '<th class="amt">CTC</th>' : ''}</tr>
    ${groups.map(g => `<tr><td>${esc(g.group)}</td><td class="amt">${g.employees}</td><td class="amt">${inr(g.gross)}</td><td class="amt">${inr(g.deductions)}</td><td class="amt">${inr(g.net)}</td>${ctcCell(g.ctc)}</tr>`).join('')}
    <tr class="tot"><td>Total</td><td class="amt">${entries.length}</td><td class="amt">${inr(columnTotal(entries, 'grossSalary'))}</td><td class="amt">${inr(columnTotal(entries, 'totalDeductions'))}</td><td class="amt">${inr(columnTotal(entries, 'netPayable'))}</td>${ctcCell(columnTotal(entries, 'ctc'))}</tr>
  </table>`;
    const hasLocations = entries.some(e => e.person.workLocation);
    const html = reportShell(await orgBrand(orgId), 'Salary Summary', monthLabel(run.period), `
  <div class="st-h">Components — ${entries.length} employees</div>
  <table class="st-table" style="width:auto;min-width:50%;">
    <tr><th>Component</th><th class="amt">Amount</th></tr>
    ${componentRows}
  </table>
  ${groupTable('By Department', summaryByGroup(entries, e => e.person.department))}
  ${hasLocations ? groupTable('By Location', summaryByGroup(entries, e => e.person.workLocation?.name || '')) : ''}`);
    res.json({ html, title: `Salary Summary — ${monthLabel(run.period)}` });
  },

  // ---- Financial-year level -------------------------------------------------
  async ytdStatement(req: any, res: Response) {
    res.json(await buildYtdStatement(req.user?.organizationId, String(req.query.personId || ''), parseFinancialYear(req.query.fy)));
  },

  // One component (or gross / net / CTC) for every employee, month by month.
  async componentStatement(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const startYear = parseFinancialYear(req.query.fy);
    const key = String(req.query.component || 'netPayable');
    const fy = financialYearFor(startYear);
    const periods = periodsOfFinancialYear(startYear);
    const entries = await fetchYearEntries(orgId, startYear);
    const column = allColumns(entries).find(c => c.key === key);
    if (!column) throw new AppError(400, 'That component has no payslips in this financial year');
    const matrix = componentMatrix(entries, periods, key);
    const body = matrix.rows.map((r, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(r.sub)}</td><td class="nw">${esc(r.label)}</td>
      ${r.values.map(v => `<td class="amt">${amt(v)}</td>`).join('')}<td class="amt"><strong>${amt(r.total)}</strong></td></tr>`).join('');
    const html = reportShell(await orgBrand(orgId), `${column.label} Statement`, `FY ${fy.label}`, `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th>${periods.map(p => `<th class="amt">${esc(monthShort(p))}</th>`).join('')}<th class="amt">Total</th></tr>
    ${body || `<tr><td colspan="16">No payslips in FY ${fy.label}.</td></tr>`}
    <tr class="tot"><td colspan="3">Total (${matrix.rows.length} employees)</td>
      ${matrix.totals.map(v => `<td class="amt">${amt(v)}</td>`).join('')}<td class="amt">${amt(matrix.grandTotal)}</td></tr>
  </table>`);
    res.json({ html, title: `${column.label} Statement — FY ${fy.label}` });
  },

  // ---- Structure ------------------------------------------------------------
  // Current full-month structure of every active employee.
  async salaryStructureReport(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const settings = await settingsFor(orgId);
    const people = await prisma.person.findMany({
      where: {
        organizationId: orgId, kind: 'CANDIDATE', isEmployee: true,
        employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] },
      },
      select: {
        name: true, employeeNo: true, designation: true, currentMonthlyPackage: true,
        isEsiEligible: true, isPfApplicable: true,
      },
      orderBy: { name: 'asc' },
    });
    const rows = people.map(p => ({ p, s: salaryStructure(p.currentMonthlyPackage, p, settings) }));
    const keys: [string, string][] = [
      ['basic', 'Basic'], ['da', 'DA'], ['hra', 'HRA'], ['transportAllowance', 'Transport'],
      ['foodAllowance', 'Food'], ['grossSalary', 'Gross'], ['esiEmployee', 'ESI'], ['pfEmployee', 'PF'],
      ['netPayable', 'Net'], ['employerContributions', 'Employer ESI + PF'], ['ctc', 'Monthly CTC'],
    ];
    const sum = (f: (r: typeof rows[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
    const body = rows.map(({ p, s }, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(p.employeeNo)}</td>
      <td class="nw">${esc(p.name)}${p.designation ? `<div class="muted" style="font-size:10.5px;">${esc(p.designation)}</div>` : ''}</td>
      ${keys.map(([k]) => `<td class="amt">${amt((s.monthly as any)[k])}</td>`).join('')}
      <td class="amt"><strong>${amt(s.annual.ctc)}</strong></td></tr>`).join('');
    const html = reportShell(await orgBrand(orgId), 'Salary Structure', 'Current, full month', `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th>${keys.map(([, label]) => `<th class="amt">${esc(label)}</th>`).join('')}<th class="amt">Annual CTC</th></tr>
    ${body || '<tr><td colspan="15">No active employees.</td></tr>'}
    <tr class="tot"><td colspan="3">Total (${rows.length} employees)</td>
      ${keys.map(([k]) => `<td class="amt">${amt(sum(r => (r.s.monthly as any)[k]))}</td>`).join('')}
      <td class="amt">${amt(sum(r => r.s.annual.ctc))}</td></tr>
  </table>
  <p style="font-size:11.5px;color:#6b7280;">Full-month figures from each employee's current package, with no loss of pay and no one-off items.</p>`);
    res.json({ html, title: 'Salary Structure' });
  },

  // One employee's cost to company, monthly and annual.
  async ctcBreakup(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchEmployee(req.query.personId, orgId);
    const s = salaryStructure(person.currentMonthlyPackage, person, await settingsFor(orgId));
    const line = (label: string, key: string, cls = '') =>
      `<tr class="${cls}"><td>${esc(label)}</td><td class="amt">${inr((s.monthly as any)[key])}</td><td class="amt">${inr(s.annual[key])}</td></tr>`;
    const optional = (cols: ComponentColumn[]) => cols
      .filter(c => (s.monthly as any)[c.key] > 0)
      .map(c => line(c.label, c.key)).join('');
    const html = reportShell(await orgBrand(orgId), 'CTC Breakup', new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }), `
  <p style="margin:0 0 10px;"><strong>${esc(person.name)}</strong>${person.employeeNo ? ` · ${esc(person.employeeNo)}` : ''}${person.designation ? ` · ${esc(person.designation)}` : ''}</p>
  <table class="st-table" style="width:auto;min-width:60%;">
    <tr><th>Component</th><th class="amt">Monthly</th><th class="amt">Annual</th></tr>
    ${FIXED_EARNINGS.filter(c => (s.monthly as any)[c.key] !== undefined).map(c => line(c.label, c.key)).join('')}
    ${line('Gross Salary', 'grossSalary', 'sub')}
    ${optional(FIXED_EMPLOYER)}
    ${line('Cost to Company (CTC)', 'ctc', 'tot')}
  </table>
  <table class="st-table" style="width:auto;min-width:60%;">
    <tr><th>Take-home</th><th class="amt">Monthly</th><th class="amt">Annual</th></tr>
    ${line('Gross Salary', 'grossSalary')}
    ${optional(FIXED_DEDUCTIONS) || '<tr><td class="muted">No statutory deductions</td><td class="amt">—</td><td class="amt">—</td></tr>'}
    ${line('Net Pay', 'netPayable', 'tot')}
  </table>
  <p style="font-size:11.5px;color:#6b7280;">Full-month figures before income tax, loss of pay and one-off items.</p>`);
    res.json({ html, title: `CTC Breakup — ${person.name}` });
  },

  // Recorded revisions, plus package changes seen in payslips from before
  // revisions were being recorded.
  async revisionHistory(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const personId = req.query.personId ? String(req.query.personId) : undefined;
    const person = personId ? await fetchEmployee(personId, orgId) : null;
    const [revisions, entries] = await Promise.all([
      prisma.salaryRevision.findMany({
        where: { organizationId: orgId, ...(personId ? { personId } : {}) },
        include: { person: { select: { name: true, employeeNo: true } } },
      }),
      prisma.payslipEntry.findMany({
        where: { organizationId: orgId, ...(personId ? { personId } : {}) },
        select: { personId: true, monthlyPackage: true, run: { select: { period: true } }, person: { select: { name: true, employeeNo: true } } },
      }),
    ]);

    type Row = { period: string; name: string; code: string; from: number; to: number; note: string; by: string };
    const rows: Row[] = sortRevisions(revisions).map(r => ({
      period: r.effectiveFrom.slice(0, 7), name: r.person.name, code: r.person.employeeNo,
      from: r.oldMonthlyPackage, to: r.newMonthlyPackage, note: r.reason, by: r.createdByName,
    }));
    const firstRecorded = new Map<string, string>();
    for (const r of sortRevisions(revisions)) {
      if (!firstRecorded.has(r.personId)) firstRecorded.set(r.personId, r.effectiveFrom.slice(0, 7));
    }
    const byPerson = new Map<string, typeof entries>();
    for (const e of entries) byPerson.set(e.personId, [...(byPerson.get(e.personId) || []), e]);
    for (const [id, list] of byPerson) {
      const cutoff = firstRecorded.get(id);
      for (const c of packageChangesFromEntries(list.map(e => ({ period: e.run.period, monthlyPackage: e.monthlyPackage })))) {
        if (cutoff && c.period >= cutoff) continue;
        rows.push({
          period: c.period, name: list[0].person.name, code: list[0].person.employeeNo,
          from: c.oldMonthlyPackage, to: c.newMonthlyPackage, note: 'Seen in payslips', by: '',
        });
      }
    }
    rows.sort((a, b) => b.period.localeCompare(a.period) || a.name.localeCompare(b.name));

    const body = rows.map(r => `<tr>
      <td class="nw">${esc(monthLabel(r.period))}</td><td class="nw">${esc(r.code)}</td><td class="nw">${esc(r.name)}</td>
      <td class="amt">${inr(r.from)}</td><td class="amt">${inr(r.to)}</td>
      <td class="amt">${r.to >= r.from ? '+' : '−'}${inr(Math.abs(r.to - r.from)).slice(1)}</td><td class="amt">${pct(r.from, r.to)}</td>
      <td>${esc(r.note) || '<span class="muted">—</span>'}</td><td class="nw">${esc(r.by) || '<span class="muted">—</span>'}</td></tr>`).join('');
    const html = reportShell(await orgBrand(orgId), 'Salary Revision History', person ? person.name : 'All employees', `
  <table class="st-table">
    <tr><th>Effective from</th><th>Code</th><th>Employee</th><th class="amt">Old package</th><th class="amt">New package</th><th class="amt">Change</th><th class="amt">%</th><th>Reason</th><th>Recorded by</th></tr>
    ${body || '<tr><td colspan="9">No salary revisions found.</td></tr>'}
  </table>
  <p style="font-size:11.5px;color:#6b7280;">"Seen in payslips" rows are package changes between consecutive payroll months from before revisions were recorded.</p>`);
    res.json({ html, title: `Salary Revision History${person ? ` — ${person.name}` : ''}` });
  },
};
