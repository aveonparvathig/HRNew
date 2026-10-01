import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { orgBrand } from '../services/orgBrand';
import { logPayrollAudit, diffFields } from '../services/payroll/audit';
import { financialYearFor, financialYearOf } from '../services/payroll/financialYear';
import { currentPeriodIST } from '../services/payroll/salaryStructure';
import { taxConfigsFor } from '../services/payroll/taxContext';
import { hasValidPan } from '../services/payroll/taxCalc';
import {
  esc, amt, inr, monthLabel, reportShell,
} from '../services/payroll/reportHtml';

const str = (v: any) => String(v ?? '').trim();
const REGIMES = ['NEW', 'OLD'];
const regimeLabel = (regime: string) => (regime === 'OLD' ? 'Old regime' : 'New regime');

const CONFIG_NUMBERS = [
  'standardDeduction', 'rebateIncomeLimit', 'rebateMaxAmount', 'cessPercent',
  'seniorExemption', 'superSeniorExemption', 'section80CLimit', 'housingInterestLimit',
];
const CONFIG_FLAGS = ['rebateMarginalRelief', 'allowsExemptions'];

function fyInput(value: any): number {
  const year = Number(/^(\d{4})/.exec(String(value || ''))?.[1]);
  if (!year || year < 2000 || year > 2100) throw new AppError(400, 'Pick a financial year');
  return year;
}

const currentFyStart = () => financialYearOf(currentPeriodIST()).startYear;

function slabsInput(raw: any) {
  if (!Array.isArray(raw) || raw.length === 0) throw new AppError(400, 'Add at least one slab');
  const slabs = raw.map((s: any) => {
    const incomeFrom = Number(s.incomeFrom);
    const incomeTo = s.incomeTo === '' || s.incomeTo == null ? null : Number(s.incomeTo);
    const ratePercent = Number(s.ratePercent);
    const surchargePercent = Number(s.surchargePercent || 0);
    if (!isFinite(incomeFrom) || incomeFrom < 0 || !isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100
      || !isFinite(surchargePercent) || surchargePercent < 0 || surchargePercent > 100
      || (incomeTo !== null && (!isFinite(incomeTo) || incomeTo < incomeFrom))) {
      throw new AppError(400, 'Each slab needs a valid income range and rate');
    }
    return { incomeFrom, incomeTo, ratePercent, surchargePercent };
  }).sort((a: any, b: any) => a.incomeFrom - b.incomeFrom);
  for (let i = 1; i < slabs.length; i++) {
    const previous = slabs[i - 1];
    if (previous.incomeTo === null || slabs[i].incomeFrom <= previous.incomeTo) {
      throw new AppError(400, 'Slabs must not overlap, and only the last one can be open-ended');
    }
  }
  if (slabs[slabs.length - 1].incomeTo !== null) throw new AppError(400, 'Leave "to" blank on the last slab so every income is covered');
  return slabs;
}

async function fetchEmployee(personId: string, organizationId: string) {
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: { id: true, name: true, employeeNo: true, designation: true, panNumber: true, dateOfBirth: true },
  });
  if (!person) throw new AppError(404, 'Person not found');
  return person;
}

// The latest stored working of each employee in a financial year.
// releasedOnly limits it to months whose payslips employees can see.
async function latestWorkings(organizationId: string, fyStart: number, personId?: string, releasedOnly = false) {
  const rows = await prisma.taxComputation.findMany({
    where: {
      organizationId, fyStart, ...(personId ? { personId } : {}),
      ...(releasedOnly ? { run: { releasedAt: { not: null } } } : {}),
    },
    orderBy: { period: 'asc' },
  });
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) latest.set(row.personId, row);
  return latest;
}

// One employee's tax working for the year, as of the latest payroll
// month — or, for the employee's own view, the latest released one.
export async function buildTaxStatement(organizationId: string, personId: string, fyStart: number, releasedOnly = false) {
  const person = await fetchEmployee(personId, organizationId);
  const fy = financialYearFor(fyStart);
  const row = (await latestWorkings(organizationId, fyStart, person.id, releasedOnly)).get(person.id);
  if (!row) {
    throw new AppError(404, releasedOnly
      ? `No tax statement is available yet for FY ${fy.label}.`
      : `No tax has been computed for ${person.name} in FY ${fy.label}. Computed TDS starts from the month set in Payroll Settings → Income Tax.`);
  }
  const w = row.working as any;
  const line = (label: string, value: number, cls = '') =>
    `<tr class="${cls}"><td>${esc(label)}</td><td class="amt">${inr(value)}</td></tr>`;
  const maybe = (label: string, value: number) => (value ? line(label, value) : '');
  const html = reportShell(await orgBrand(organizationId), 'Income Tax Statement', `FY ${fy.label} · as of ${monthLabel(row.period)}`, `
  <p style="margin:0 0 10px;"><strong>${esc(person.name)}</strong>${person.employeeNo ? ` · ${esc(person.employeeNo)}` : ''} · PAN ${esc(person.panNumber) || 'not on record'} · ${esc(regimeLabel(w.regime))}</p>
  <table class="st-table" style="width:auto;min-width:70%;">
    <tr><th>Income</th><th class="amt">Amount</th></tr>
    ${line('Salary paid in earlier months', w.income.paidEarlier)}
    ${line(`Salary for ${monthLabel(row.period)}`, w.income.thisMonth)}
    ${line(`Projected for the ${w.monthsLeft - 1} month${w.monthsLeft - 1 === 1 ? '' : 's'} to come`, w.income.projected)}
    ${maybe('Salary from previous employer', w.income.previousEmployer)}
    ${maybe('Perquisites', w.income.perquisites)}
    ${line('Gross salary', w.grossSalary, 'sub')}
    ${maybe('Less: House Rent Allowance exemption', w.exemptions.hra)}
    ${line('Less: Standard deduction', w.deductions.standard)}
    ${maybe('Less: Professional Tax', w.deductions.professionalTax)}
    ${line('Income from salary', w.incomeFromSalary, 'sub')}
    ${maybe('Add: Other income', w.otherIncome)}
    ${maybe('Less: Interest on housing loan', w.housingLoanInterest)}
    ${line('Gross total income', w.grossTotalIncome, 'sub')}
    ${w.chapter6.total ? `${line(`Less: Section 80C (PF ${inr(w.chapter6.pf)} + investments ${inr(w.chapter6.declared80C)})`, w.chapter6.section80C)}
    ${maybe('Less: Other Chapter VI-A deductions', w.chapter6.other)}` : ''}
    ${line('Taxable income', w.taxableIncome, 'tot')}
  </table>
  <table class="st-table" style="width:auto;min-width:70%;">
    <tr><th>Tax</th><th class="amt">Amount</th></tr>
    ${line('Tax on income', w.tax.taxOnIncome)}
    ${maybe('Less: Rebate', w.tax.rebate)}
    ${maybe('Add: Surcharge', w.tax.surcharge)}
    ${line('Add: Health and education cess', w.tax.cess)}
    ${w.tax.higherRateForPan ? '<tr><td colspan="2" class="muted">No valid PAN on record: tax is taken at 20% of taxable income.</td></tr>' : ''}
    ${line('Tax for the year', w.tax.total, 'tot')}
    ${line('Less: Deducted in earlier months', w.paid.payroll)}
    ${maybe('Less: Deducted by previous employer', w.paid.previousEmployer)}
    ${line('Balance', w.balance, 'sub')}
    ${maybe('Of which due now on one-off payments', w.oneTimeTax)}
    ${line(`TDS for ${monthLabel(row.period)}${w.overridden ? ' (entered by hand)' : ''}`, w.tdsThisMonth, 'tot')}
  </table>
  <p style="font-size:11.5px;color:#6b7280;">The balance is spread over the ${w.monthsLeft} payroll month${w.monthsLeft === 1 ? '' : 's'} left in the year, this one included. Figures change as salary, attendance and declarations change.</p>`);
  return { html, title: `Income Tax Statement — ${person.name} — FY ${fy.label}` };
}

export const payrollTaxController = {
  // ---- Tax rules ------------------------------------------------------------
  async getTaxConfig(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = req.query.fy ? fyInput(req.query.fy) : currentFyStart();
    const [configs, settings] = await Promise.all([
      taxConfigsFor(organizationId, fyStart),
      prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} }),
    ]);
    const now = currentFyStart();
    res.json({
      fyStart, financialYear: financialYearFor(fyStart).label,
      financialYears: [now + 1, now, now - 1].map(y => ({ startYear: y, label: financialYearFor(y).label })),
      configs: [...configs].sort((a, b) => (a.regime === 'NEW' ? -1 : 1) - (b.regime === 'NEW' ? -1 : 1)),
      tdsAutoFrom: settings.tdsAutoFrom, defaultTaxRegime: settings.defaultTaxRegime,
    });
  },

  async updateTaxConfig(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const before = await prisma.taxRegimeConfig.findFirst({ where: { id: req.params.configId, organizationId } });
    if (!before) throw new AppError(404, 'Tax configuration not found');
    const b = req.body;
    const data: any = {};
    for (const f of CONFIG_NUMBERS) {
      if (b[f] === undefined) continue;
      const v = Number(b[f]);
      if (!isFinite(v) || v < 0) throw new AppError(400, `Invalid value for ${f}`);
      data[f] = v;
    }
    for (const f of CONFIG_FLAGS) if (b[f] !== undefined) data[f] = Boolean(b[f]);
    if (b.slabs !== undefined) data.slabs = { deleteMany: {}, create: slabsInput(b.slabs) };
    const config = await prisma.taxRegimeConfig.update({
      where: { id: before.id }, data, include: { slabs: { orderBy: { incomeFrom: 'asc' } } },
    });
    const tag = `${regimeLabel(before.regime)}, FY ${financialYearFor(before.fyStart).label}`;
    await logPayrollAudit(req, [
      ...diffFields(before, config, [...CONFIG_NUMBERS, ...CONFIG_FLAGS]).map(c => ({
        action: 'TAX_CONFIG_UPDATED' as const, field: `${tag} · ${c.field}`, oldValue: c.oldValue, newValue: c.newValue,
      })),
      ...(b.slabs !== undefined ? [{ action: 'TAX_CONFIG_UPDATED' as const, field: `${tag} · slabs`, newValue: `${config.slabs.length} slabs` }] : []),
    ]);
    res.json(config);
  },

  // When computed TDS starts, and the regime used for employees who have
  // not been given one.
  async updateTaxSettings(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const before = await prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });
    const data: any = {};
    if (req.body.tdsAutoFrom !== undefined) {
      const month = str(req.body.tdsAutoFrom);
      if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError(400, 'Pick a valid month');
      data.tdsAutoFrom = month;
    }
    if (req.body.defaultTaxRegime !== undefined) {
      if (!REGIMES.includes(req.body.defaultTaxRegime)) throw new AppError(400, 'Pick the old or the new regime');
      data.defaultTaxRegime = req.body.defaultTaxRegime;
    }
    const settings = await prisma.payrollSettings.update({ where: { organizationId }, data });
    await logPayrollAudit(req, diffFields(before, settings, ['tdsAutoFrom', 'defaultTaxRegime'])
      .map(c => ({ action: 'SETTINGS_UPDATED' as const, ...c })));
    res.json({ tdsAutoFrom: settings.tdsAutoFrom, defaultTaxRegime: settings.defaultTaxRegime });
  },

  // ---- Employee tax details ---------------------------------------------------
  async getTaxProfile(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const person = await fetchEmployee(req.params.personId, organizationId);
    const fyStart = req.query.fy ? fyInput(req.query.fy) : currentFyStart();
    const [profile, settings, working] = await Promise.all([
      prisma.employeeTaxProfile.findUnique({ where: { personId_fyStart: { personId: person.id, fyStart } } }),
      prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} }),
      latestWorkings(organizationId, fyStart, person.id),
    ]);
    const now = currentFyStart();
    const latest = working.get(person.id);
    res.json({
      fyStart, financialYear: financialYearFor(fyStart).label,
      financialYears: [now + 1, now, now - 1].map(y => ({ startYear: y, label: financialYearFor(y).label })),
      regime: profile?.regime || '',
      poiConsidered: profile?.poiConsidered || false,
      defaultTaxRegime: settings.defaultTaxRegime,
      tdsAutoFrom: settings.tdsAutoFrom,
      hasValidPan: hasValidPan(person.panNumber),
      summary: latest ? {
        period: latest.period,
        taxableIncome: (latest.working as any).taxableIncome,
        totalTax: (latest.working as any).tax?.total,
        paid: (latest.working as any).paid?.total,
        tdsThisMonth: (latest.working as any).tdsThisMonth,
        regime: (latest.working as any).regime,
      } : null,
    });
  },

  // ---- Reports ----------------------------------------------------------------
  async taxStatement(req: any, res: Response) {
    res.json(await buildTaxStatement(req.user?.organizationId, str(req.query.personId), fyInput(req.query.fy)));
  },


  // TDS deducted from each employee in one payroll month.
  async tdsStatement(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.runId, organizationId },
      include: {
        entries: { include: { person: { select: { name: true, employeeNo: true, panNumber: true } } } },
        taxComputations: true,
      },
    });
    if (!run) throw new AppError(404, 'Payroll run not found');
    const workings = new Map(run.taxComputations.map(t => [t.personId, t.working as any]));
    const rows = [...run.entries].sort((a, b) => a.person.name.localeCompare(b.person.name))
      .filter(e => e.tds > 0 || workings.has(e.personId));
    const body = rows.map((e, i) => {
      const w = workings.get(e.personId);
      return `<tr>
      <td>${i + 1}</td><td class="nw">${esc(e.person.employeeNo)}</td><td class="nw">${esc(e.person.name)}</td>
      <td class="nw">${hasValidPan(e.person.panNumber) ? esc(e.person.panNumber.toUpperCase()) : '<span class="muted">missing</span>'}</td>
      <td>${w ? esc(regimeLabel(w.regime)) : '<span class="muted">—</span>'}</td>
      <td class="amt">${w ? amt(w.taxableIncome) : '—'}</td><td class="amt">${w ? amt(w.tax.total) : '—'}</td>
      <td class="amt">${w ? amt(w.paid.total) : '—'}</td>
      <td class="amt"><strong>${amt(e.tds)}</strong>${e.tdsOverridden ? ' <span class="muted">(manual)</span>' : ''}</td></tr>`;
    }).join('');
    const total = rows.reduce((s, e) => s + e.tds, 0);
    const html = reportShell(await orgBrand(organizationId), 'TDS Statement', monthLabel(run.period), `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>PAN</th><th>Regime</th><th class="amt">Taxable income (year)</th><th class="amt">Tax for the year</th><th class="amt">Deducted earlier</th><th class="amt">TDS this month</th></tr>
    ${body || '<tr><td colspan="9">No TDS in this run.</td></tr>'}
    <tr class="tot"><td colspan="8">Total (${rows.filter(e => e.tds > 0).length} employees with TDS)</td><td class="amt">${inr(total)}</td></tr>
  </table>`);
    res.json({ html, title: `TDS Statement — ${monthLabel(run.period)}` });
  },

  // Every employee's position for the year: income, tax, deducted, balance.
  async taxConsolidated(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const fy = financialYearFor(fyStart);
    const latest = await latestWorkings(organizationId, fyStart);
    const people = await prisma.person.findMany({
      where: { id: { in: [...latest.keys()] } }, select: { id: true, name: true, employeeNo: true, panNumber: true },
    });
    const rows = people.sort((a, b) => a.name.localeCompare(b.name)).map(p => ({ p, row: latest.get(p.id)!, w: latest.get(p.id)!.working as any }));
    const sum = (f: (w: any) => number) => rows.reduce((s, r) => s + (f(r.w) || 0), 0);
    const body = rows.map(({ p, row, w }, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(p.employeeNo)}</td><td class="nw">${esc(p.name)}</td>
      <td>${esc(regimeLabel(w.regime))}</td>
      <td class="amt">${amt(w.grossSalary)}</td><td class="amt">${amt(w.grossSalary - w.incomeFromSalary)}</td>
      <td class="amt">${amt(w.chapter6.total)}</td><td class="amt">${amt(w.taxableIncome)}</td>
      <td class="amt"><strong>${amt(w.tax.total)}</strong></td>
      <td class="amt">${amt(w.paid.total + w.tdsThisMonth)}</td>
      <td class="amt">${amt(Math.max(0, w.tax.total - w.paid.total - w.tdsThisMonth))}</td>
      <td class="nw">${esc(monthLabel(row.period))}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Income Tax — Consolidated', `FY ${fy.label}`, `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>Regime</th><th class="amt">Gross salary</th><th class="amt">Exemptions &amp; deductions u/s 16</th>
      <th class="amt">Chapter VI-A</th><th class="amt">Taxable income</th><th class="amt">Tax for the year</th><th class="amt">Deducted so far</th><th class="amt">Still to deduct</th><th>As of</th></tr>
    ${body || `<tr><td colspan="12">No tax has been computed in FY ${fy.label}.</td></tr>`}
    <tr class="tot"><td colspan="4">Total (${rows.length} employees)</td>
      <td class="amt">${amt(sum(w => w.grossSalary))}</td><td class="amt">${amt(sum(w => w.grossSalary - w.incomeFromSalary))}</td>
      <td class="amt">${amt(sum(w => w.chapter6.total))}</td><td class="amt">${amt(sum(w => w.taxableIncome))}</td>
      <td class="amt">${amt(sum(w => w.tax.total))}</td><td class="amt">${amt(sum(w => w.paid.total + w.tdsThisMonth))}</td>
      <td class="amt">${amt(sum(w => Math.max(0, w.tax.total - w.paid.total - w.tdsThisMonth)))}</td><td></td></tr>
  </table>
  <p style="font-size:11.5px;color:#6b7280;">Each row is the employee's position as of their latest payroll month, with the rest of the year projected at their current salary.</p>`);
    res.json({ html, title: `Income Tax — Consolidated — FY ${fy.label}` });
  },

  // Active employees whose PAN is missing or malformed.
  async panStatus(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const people = await prisma.person.findMany({
      where: { organizationId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } },
      select: { name: true, employeeNo: true, designation: true, panNumber: true },
      orderBy: { name: 'asc' },
    });
    const bad = people.filter(p => !hasValidPan(p.panNumber));
    const body = bad.map((p, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(p.employeeNo)}</td><td class="nw">${esc(p.name)}</td><td>${esc(p.designation) || '<span class="muted">—</span>'}</td>
      <td>${p.panNumber ? `${esc(p.panNumber)} <span class="muted">(not a valid PAN)</span>` : '<span class="muted">not on record</span>'}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'PAN Status', `${bad.length} of ${people.length} active employees need attention`, `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>Designation</th><th>PAN</th></tr>
    ${body || '<tr><td colspan="5">Every active employee has a valid PAN on record.</td></tr>'}
  </table>
  <p style="font-size:11.5px;color:#6b7280;">Without a valid PAN, tax is deducted at 20% of taxable income when that is higher than the normal tax. The check here is on the format only.</p>`);
    res.json({ html, title: 'PAN Status' });
  },
};
