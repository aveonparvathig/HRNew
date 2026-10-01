import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { renderPayslipHtml } from '../services/payrollCalc';
import { usedColumns, columnValue } from '../services/payroll/lines';
import {
  loadStatutoryContext, computeFullEntry, esiFlagFor, coveredEarlier,
} from '../services/payroll/entryCompute';
import { saveTaxWorkings } from '../services/payroll/taxContext';
import { packageForPeriod } from '../services/payroll/salaryStructure';
import { orgBrand } from '../services/orgBrand';
import { financialYearOf } from '../services/payroll/financialYear';
import {
  esiCeilingChecks, locationChecks, entryOverrides, standardWorkingDays,
} from '../services/payroll/checks';
import { diffFields, fieldLabel, logPayrollAudit, actorName } from '../services/payroll/audit';
import {
  postRunInstalments, reverseRunInstalments, overdueLoanChecks, loanBalanceAfter,
} from '../services/payroll/loanLedger';
import { esc as escHtml, monthLabel, reportShell } from '../services/payroll/reportHtml';
import { runStage, nextRunDefaults } from '../services/payroll/payoutCalc';
import { prePayrollChecksFor, setRunClaimStatus, claimsOfEntry } from '../services/payroll/payout';

// Entry inputs a user can change — the fields the audit trail tracks.
const ENTRY_INPUT_FIELDS = [
  'totalWorkingDays', 'empLeaveDays', 'lopDays', 'internetAllowance',
  'salaryArrearAllowance', 'salaryAdvance', 'tds', 'monthlyPackage',
  'isEsiEligible', 'isPfApplicable', 'remarks',
];
const SETTINGS_FIELDS = [
  'basicPercentOfPackage', 'daPercentOfBasic', 'hraPercentOfBasic',
  'transportPercentOfBasic', 'foodPercentOfBasic',
  'esiEmployeePercent', 'esiEmployerPercent', 'esiWageCeiling',
  'pfEmployeePercent', 'pfEmployerPercent', 'pfWageCap', 'pfWageFactor',
  'epsPercent', 'epsWageCap', 'edliPercent', 'edliWageCap', 'pfAdminPercent', 'pfAdminMinimum',
  'loanBenchmarkRate', 'loanPerquisiteExemptLimit',
];
const SETTINGS_FLAGS = ['pfEmployerMatchesEmployee', 'pfRoundToRupee', 'esiAutoCoverage'];

const num =(v: any, fallback = 0) => (v == null || v === '' || isNaN(Number(v)) ? fallback : Number(v));

async function settingsFor(organizationId: string) {
  return prisma.payrollSettings.upsert({
    where: { organizationId },
    create: { organizationId },
    update: {},
  });
}

async function fetchOrgRun(runId: string, organizationId: string, includeEntries = false) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, organizationId },
    include: includeEntries
      ? { entries: { include: {
        person: { select: {
          id: true, name: true, employeeNo: true, designation: true, department: true,
          workLocation: { select: { state: true } },
        } },
        lines: true,
      } } }
      : undefined,
  });
  if (!run) throw new AppError(404, 'Payroll run not found');
  return run as any;
}

function assertDraft(run: any) {
  if (run.status !== 'DRAFT') {
    throw new AppError(400, 'This run is finalized. Reopen it to make changes.');
  }
}

// Attendance and one-offs are frozen while a draft's inputs are locked.
function assertInputsOpen(run: any) {
  assertDraft(run);
  if (run.inputsLockedAt) {
    throw new AppError(400, 'Inputs for this run are locked. Unlock them to make changes.');
  }
}

const entryTotals = (entries: any[]) => ({
  employees: entries.length,
  gross: entries.reduce((s, e) => s + e.grossSalary, 0),
  deductions: entries.reduce((s, e) => s + e.totalDeductions, 0),
  net: entries.reduce((s, e) => s + e.netPayable, 0),
  employerContributions: entries.reduce((s, e) => s + e.employerContributions, 0),
  ctc: entries.reduce((s, e) => s + e.ctc, 0),
  esiCount: entries.filter(e => e.isEsiEligible).length,
  pfCount: entries.filter(e => e.isPfApplicable).length,
});

const sortEntries = (entries: any[]) =>
  [...entries].sort((a, b) => a.person.name.localeCompare(b.person.name));

async function activeEmployees(organizationId: string) {
  return prisma.person.findMany({
    where: {
      organizationId,
      kind: 'CANDIDATE',
      isEmployee: true,
      employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] },
      salaryStopped: false,
    },
    omit: { photoData: true },
    include: { salaryRevisions: true, workLocation: { select: { state: true } } },
  });
}

// Statutory inputs of an existing entry: its employee's state and any
// manually entered Professional Tax.
const statutoryOptions = (entry: any) => ({
  personId: entry.personId,
  state: entry.person?.workLocation?.state,
  ptOverride: entry.ptOverridden ? entry.professionalTax : null,
  tdsOverride: entry.tdsOverridden ? entry.tds : null,
});

// A new entry for an employee: package and statutory flags are snapshots.
function newEntryData(ctx: any, organizationId: string, runId: string, emp: any, totalWorkingDays: number) {
  const base = {
    monthlyPackage: packageForPeriod(emp.currentMonthlyPackage || 0, emp.salaryRevisions, ctx.period),
    totalWorkingDays,
    isPfApplicable: emp.isPfApplicable,
  };
  const inputs = { ...base, isEsiEligible: esiFlagFor(ctx, emp, base) };
  return {
    organizationId, runId, personId: emp.id,
    monthlyPackage: inputs.monthlyPackage,
    totalWorkingDays,
    isEsiEligible: inputs.isEsiEligible,
    isPfApplicable: emp.isPfApplicable,
    ...computeFullEntry(ctx, inputs, [], { personId: emp.id, state: emp.workLocation?.state }),
  };
}

// Validates the catalogue lines sent for an entry. Zero amounts drop the
// line; a component already on the entry may stay even if since deactivated.
async function resolveLines(organizationId: string, input: any, existing: any[]) {
  if (!Array.isArray(input)) throw new AppError(400, 'Lines must be a list');
  const components = await prisma.payComponent.findMany({ where: { organizationId } });
  const byId = new Map(components.map(c => [c.id, c]));
  const onEntry = new Set(existing.map(l => l.componentId));
  const seen = new Set<string>();
  const lines: any[] = [];
  for (const raw of input) {
    const component = byId.get(String(raw?.componentId || ''));
    if (!component) throw new AppError(400, 'Pick a pay component for every line');
    if (seen.has(component.id)) throw new AppError(400, `${component.name} is listed twice`);
    seen.add(component.id);
    const amount = num(raw.amount, NaN);
    if (isNaN(amount) || amount < 0) throw new AppError(400, `Enter a valid amount for ${component.name}`);
    if (amount === 0) continue;
    if (!component.isActive && !onEntry.has(component.id)) {
      throw new AppError(400, `${component.name} is inactive`);
    }
    const kept = existing.find(l => l.componentId === component.id);
    lines.push({
      componentId: component.id,
      // Keep the snapshot of a line that was already there
      name: kept?.name || component.name,
      type: kept?.type || component.type,
      amount: Math.round(amount * 100) / 100,
      remarks: String(raw.remarks || ''),
    });
  }
  return lines;
}

// Audit rows for added, changed and removed catalogue lines.
function lineChanges(before: any[], after: any[]) {
  const changes: { field: string; oldValue: string; newValue: string }[] = [];
  const names = new Map<string, string>();
  for (const l of [...before, ...after]) names.set(l.componentId, l.name);
  for (const [componentId, name] of names) {
    const a = before.find(l => l.componentId === componentId)?.amount ?? 0;
    const b = after.find(l => l.componentId === componentId)?.amount ?? 0;
    if (a !== b) changes.push({ field: name, oldValue: String(a), newValue: String(b) });
  }
  return changes;
}

// A draft run for a month with an entry for every active employee.
async function createRunFor(req: any, organizationId: string, period: string, totalWorkingDays: number, notes: string, automatic = false) {
  const employees = await activeEmployees(organizationId);
  if (employees.length === 0) {
    throw new AppError(400, 'No active employees found. Add employees in People first.');
  }
  const ctx = await loadStatutoryContext(organizationId, period);
  const run = await prisma.payrollRun.create({ data: { organizationId, period, notes } });
  // Snapshot each employee's package & statutory flags, compute the row
  await prisma.payslipEntry.createMany({
    data: employees.map(emp => newEntryData(ctx, organizationId, run.id, emp, totalWorkingDays)),
  });
  await saveTaxWorkings(ctx.tax, organizationId, run.id);
  await logPayrollAudit(req, [{
    action: 'RUN_CREATED', runId: run.id, period,
    newValue: `${employees.length} employees, ${totalWorkingDays} working days${automatic ? ' (opened automatically)' : ''}`,
  }]);
  return { run, employees: employees.length };
}

export const payrollController = {
  // ---- Settings ----------------------------------------------------------
  async getSettings(req: any, res: Response) {
    res.json(await settingsFor(req.user?.organizationId));
  },

  async updateSettings(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const before = await settingsFor(orgId);
    const b = req.body;
    const data: any = {};
    for (const f of SETTINGS_FIELDS) {
      if (b[f] !== undefined) {
        const v = num(b[f], NaN);
        if (isNaN(v) || v < 0) throw new AppError(400, `Invalid value for ${f}`);
        data[f] = v;
      }
    }
    for (const f of SETTINGS_FLAGS) {
      if (b[f] !== undefined) data[f] = Boolean(b[f]);
    }
    const updated = await prisma.payrollSettings.update({
      where: { organizationId: orgId },
      data,
    });
    await logPayrollAudit(req, diffFields(before, updated, [...SETTINGS_FIELDS, ...SETTINGS_FLAGS])
      .map(c => ({ action: 'SETTINGS_UPDATED' as const, ...c })));
    res.json(updated);
  },

  // ---- Runs --------------------------------------------------------------
  async getRuns(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const runs = await prisma.payrollRun.findMany({
      where: { organizationId: orgId },
      include: { entries: true },
      orderBy: { period: 'desc' },
    });
    res.json({
      runs: runs.map(r => ({
        id: r.id, period: r.period, status: r.status, releasedAt: r.releasedAt,
        stage: runStage(r, r.entries),
        financialYear: financialYearOf(r.period).label,
        finalizedAt: r.finalizedAt, notes: r.notes, createdAt: r.createdAt,
        totals: entryTotals(r.entries),
      })),
      activeEmployeeCount: (await activeEmployees(orgId)).length,
    });
  },

  async createRun(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const period = String(req.body.period || '').trim(); // "YYYY-MM"
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new AppError(400, 'Pick a valid month');
    }
    const totalWorkingDays = parseInt(req.body.totalWorkingDays);
    if (!totalWorkingDays || totalWorkingDays < 1 || totalWorkingDays > 31) {
      throw new AppError(400, 'Total working days must be between 1 and 31');
    }
    const dup = await prisma.payrollRun.findUnique({
      where: { organizationId_period: { organizationId: orgId, period } },
    });
    if (dup) throw new AppError(400, `A payroll run for ${period} already exists`);

    const { run, employees } = await createRunFor(req, orgId, period, totalWorkingDays, String(req.body.notes || ''));
    res.status(201).json({ id: run.id, period: run.period, employees });
  },

  async getRunDetail(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId, true);
    // Latest earlier run so the UI can show month-over-month trends
    const prev = await prisma.payrollRun.findFirst({
      where: { organizationId: orgId, period: { lt: run.period } },
      orderBy: { period: 'desc' },
      include: { entries: true },
    });
    const profile = await prisma.orgStatutoryProfile.findUnique({ where: { organizationId: orgId } });
    const orgUsesEsi = Boolean(profile?.esiCode) || run.entries.some((e: any) => e.isEsiEligible);
    const ctx = await loadStatutoryContext(orgId, run.period);
    const sorted = sortEntries(run.entries);
    const stillCovered = new Set<string>(sorted.filter((e: any) => coveredEarlier(ctx, e.personId)).map((e: any) => e.personId));
    res.json({
      ...run,
      financialYear: financialYearOf(run.period).label,
      tdsAuto: Boolean(ctx.tax),
      stage: runStage(run, run.entries),
      entries: sortEntries(run.entries),
      checks: [
        // Pay, bank and roster checks matter only while the month is still open
        ...(run.status === 'DRAFT' ? await prePayrollChecksFor(orgId, run, Boolean(ctx.tax)) : []),
        ...esiCeilingChecks(sorted, ctx.settings, orgUsesEsi, stillCovered),
        ...locationChecks(sorted, ctx.ptPolicies.length + ctx.lwfPolicies.length > 0),
        ...(run.status === 'DRAFT' ? await overdueLoanChecks(orgId, sorted, run.period) : []),
      ],
      totals: entryTotals(run.entries),
      prev: prev ? { id: prev.id, period: prev.period, totals: entryTotals(prev.entries) } : null,
    });
  },

  async deleteRun(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId);
    assertDraft(run);
    await prisma.payrollRun.delete({ where: { id: run.id } });
    await logPayrollAudit(req, [{ action: 'RUN_DELETED', runId: run.id, period: run.period }]);
    res.json({ message: `Deleted the ${run.period} draft run` });
  },

  async finalizeRun(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId, true);
    assertDraft(run);
    const negative = sortEntries(run.entries).filter((e: any) => e.netPayable < 0);
    if (negative.length) {
      throw new AppError(400, `Net pay is negative for ${negative.map((e: any) => e.person.name).join(', ')}. Reduce a deduction or move it to a later month before finalizing.`);
    }
    const settings = await settingsFor(orgId);
    // Loan instalments this run deducted become repayments in the ledger
    await postRunInstalments(run, await actorName(req.user?.userId));
    const now = new Date();
    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        status: 'FINALIZED', finalizedAt: now,
        ...(settings.autoReleaseOnFinalize ? { releasedAt: now } : {}),
      },
    });
    // Expense claims attached to this run are now being paid
    await setRunClaimStatus(run.id, 'REIMBURSED');
    await logPayrollAudit(req, [
      { action: 'RUN_FINALIZED', runId: run.id, period: run.period },
      ...(settings.autoReleaseOnFinalize ? [{ action: 'RUN_RELEASED' as const, runId: run.id, period: run.period, newValue: 'On finalizing' }] : []),
    ]);

    // Open next month's run, if asked to and it is not there yet
    let nextRun: { id: string; period: string } | null = null;
    if (settings.autoCreateNextRun) {
      const next = nextRunDefaults(run.period, standardWorkingDays(run.entries));
      const exists = await prisma.payrollRun.findUnique({
        where: { organizationId_period: { organizationId: orgId, period: next.period } },
      });
      if (!exists) {
        const created = await createRunFor(req, orgId, next.period, next.totalWorkingDays, '', true);
        nextRun = { id: created.run.id, period: created.run.period };
      }
    }
    res.json({ ...updated, nextRun });
  },

  async reopenRun(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId);
    if (run.status !== 'FINALIZED') throw new AppError(400, 'Only finalized runs can be reopened');
    const batches = await prisma.payoutBatch.count({ where: { runId: run.id } });
    if (batches > 0) {
      throw new AppError(400, 'Salaries of this run are in a payment batch. Delete its payment batches before reopening.');
    }
    const deposited = await prisma.tdsChallanAllocation.count({ where: { entry: { runId: run.id } } });
    if (deposited > 0) {
      throw new AppError(400, 'Tax deducted in this run is matched to a TDS challan. Delete the challan before reopening.');
    }
    await reverseRunInstalments(run);
    await setRunClaimStatus(run.id, 'APPROVED');
    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'DRAFT', finalizedAt: null, releasedAt: null, inputsLockedAt: null },
    });
    await logPayrollAudit(req, [{ action: 'RUN_REOPENED', runId: run.id, period: run.period }]);
    res.json(updated);
  },

  // Release: employees can now see their payslip and tax statement for
  // this month. Hold takes that back.
  async releaseRun(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId);
    if (run.status !== 'FINALIZED') throw new AppError(400, 'Finalize the run before releasing its payslips');
    const updated = await prisma.payrollRun.update({ where: { id: run.id }, data: { releasedAt: new Date() } });
    await logPayrollAudit(req, [{ action: 'RUN_RELEASED', runId: run.id, period: run.period }]);
    res.json(updated);
  },

  async holdRun(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId);
    const updated = await prisma.payrollRun.update({ where: { id: run.id }, data: { releasedAt: null } });
    await logPayrollAudit(req, [{ action: 'RUN_HELD', runId: run.id, period: run.period }]);
    res.json(updated);
  },

  // Recompute every entry with current settings; add any active employees
  // missing from the roster (joined after the run was created).
  async recalculateRun(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId, true);
    assertDraft(run);
    const ctx = await loadStatutoryContext(orgId, run.period);

    for (const entry of run.entries) {
      const computed = computeFullEntry(ctx, entry, entry.lines, statutoryOptions(entry));
      await prisma.payslipEntry.update({ where: { id: entry.id }, data: computed });
    }

    const existingIds = new Set(run.entries.map((e: any) => e.personId));
    const missing = (await activeEmployees(orgId)).filter(e => !existingIds.has(e.id));
    if (missing.length) {
      const twd = run.entries[0]?.totalWorkingDays || 26;
      await prisma.payslipEntry.createMany({
        data: missing.map(emp => newEntryData(ctx, orgId, run.id, emp, twd)),
      });
    }
    await saveTaxWorkings(ctx.tax, orgId, run.id);
    await logPayrollAudit(req, [{
      action: 'RUN_RECALCULATED', runId: run.id, period: run.period,
      newValue: `${run.entries.length} entries${missing.length ? `, ${missing.length} added` : ''}`,
    }]);
    res.json({ message: `Recalculated ${run.entries.length} entries${missing.length ? `, added ${missing.length} new employee(s)` : ''}` });
  },

  // ---- Entries -----------------------------------------------------------
  async updateEntry(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const entry = await prisma.payslipEntry.findFirst({
      where: { id: req.params.entryId, organizationId: orgId },
      include: {
        run: true, lines: true,
        person: { select: { workLocation: { select: { state: true } } } },
      },
    });
    if (!entry) throw new AppError(404, 'Payslip entry not found');
    assertInputsOpen(entry.run);

    const b = req.body;
    const merged: any = { ...entry };
    // Professional Tax: a number overrides the computed amount; blank
    // returns the entry to the computed one.
    const ptBefore = entry.ptOverridden ? entry.professionalTax : null;
    let ptOverride: number | null = ptBefore;
    if (b.professionalTax !== undefined) {
      ptOverride = b.professionalTax === '' || b.professionalTax === null ? null : num(b.professionalTax, NaN);
      if (ptOverride !== null && (isNaN(ptOverride) || ptOverride < 0)) {
        throw new AppError(400, 'Enter a valid Professional Tax amount');
      }
    }
    if (b.totalWorkingDays !== undefined) {
      const twd = parseInt(b.totalWorkingDays);
      if (!twd || twd < 1 || twd > 31) throw new AppError(400, 'Working days must be 1-31');
      merged.totalWorkingDays = twd;
    }
    for (const f of ['empLeaveDays', 'lopDays', 'internetAllowance',
      'salaryArrearAllowance', 'salaryAdvance', 'tds', 'monthlyPackage']) {
      if (b[f] !== undefined) merged[f] = num(b[f]);
    }
    if (b.isEsiEligible !== undefined) merged.isEsiEligible = Boolean(b.isEsiEligible);
    if (b.isPfApplicable !== undefined) merged.isPfApplicable = Boolean(b.isPfApplicable);
    if (b.remarks !== undefined) merged.remarks = String(b.remarks);

    const lines = b.lines !== undefined
      ? await resolveLines(orgId, b.lines, entry.lines)
      : entry.lines;
    const ctx = await loadStatutoryContext(orgId, entry.run.period);
    // Under computed TDS a typed amount overrides the calculation and a
    // blank returns to it; otherwise TDS is simply what was typed.
    const tdsBefore = ctx.tax && entry.tdsOverridden ? entry.tds : null;
    let tdsOverride: number | null = tdsBefore;
    if (ctx.tax && b.tds !== undefined) {
      tdsOverride = b.tds === '' || b.tds === null ? null : num(b.tds, NaN);
      if (tdsOverride !== null && (isNaN(tdsOverride) || tdsOverride < 0)) {
        throw new AppError(400, 'Enter a valid TDS amount');
      }
    }
    const computed = computeFullEntry(ctx, merged, lines, {
      personId: entry.personId, state: entry.person.workLocation?.state, ptOverride, tdsOverride,
    });
    if (b.lines !== undefined) {
      await prisma.$transaction([
        prisma.payslipLine.deleteMany({ where: { entryId: entry.id } }),
        prisma.payslipLine.createMany({
          data: lines.map((l: any) => ({
            organizationId: orgId, entryId: entry.id, componentId: l.componentId,
            name: l.name, type: l.type, amount: l.amount, remarks: l.remarks || '',
          })),
        }),
      ]);
    }
    const updated = await prisma.payslipEntry.update({
      where: { id: entry.id },
      data: {
        monthlyPackage: merged.monthlyPackage,
        totalWorkingDays: merged.totalWorkingDays,
        empLeaveDays: merged.empLeaveDays,
        lopDays: merged.lopDays,
        internetAllowance: merged.internetAllowance,
        salaryArrearAllowance: merged.salaryArrearAllowance,
        salaryAdvance: merged.salaryAdvance,
        tds: merged.tds,
        isEsiEligible: merged.isEsiEligible,
        isPfApplicable: merged.isPfApplicable,
        remarks: merged.remarks,
        ptOverridden: ptOverride !== null,
        tdsOverridden: Boolean(ctx.tax) && tdsOverride !== null,
        ...computed,
      },
      include: {
        person: { select: { id: true, name: true, employeeNo: true, designation: true, department: true } },
        lines: true,
      },
    });
    await saveTaxWorkings(ctx.tax, orgId, entry.runId);
    await logPayrollAudit(req, [
      // Under computed TDS only an override or its removal is a change by hand
      ...diffFields(entry, merged, ENTRY_INPUT_FIELDS.filter(f => f !== 'tds' || !ctx.tax)),
      ...(ctx.tax && tdsOverride !== tdsBefore ? [{
        field: 'tds',
        oldValue: tdsBefore === null ? 'Computed' : String(tdsBefore),
        newValue: tdsOverride === null ? 'Computed' : String(tdsOverride),
      }] : []),
      ...(b.lines !== undefined ? lineChanges(entry.lines, lines) : []),
      ...(ptOverride !== ptBefore ? [{
        field: 'professionalTax',
        oldValue: ptBefore === null ? 'Computed' : String(ptBefore),
        newValue: ptOverride === null ? 'Computed' : String(ptOverride),
      }] : []),
    ].map(c => ({
      action: 'ENTRY_UPDATED' as const, runId: entry.runId, entryId: entry.id,
      personId: entry.personId, period: entry.run.period, personName: updated.person.name, ...c,
    })));
    res.json(updated);
  },

  // ---- Reports -------------------------------------------------------------
  // PF & ESI statement for statutory filing: employee-wise contributions
  // with PF/UAN/ESI numbers and remittance totals.
  async pfEsiStatement(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.runId, organizationId: orgId },
      include: { entries: { include: { person: { select: { name: true, employeeNo: true, pfNumber: true, pfUan: true, esiNumber: true } } } } },
    });
    if (!run) throw new AppError(404, 'Payroll run not found');
    const brand = await orgBrand(orgId);
    const primary = brand.brandPrimary || '#4f46e5';
    const accent = brand.brandAccent || '#312e81';
    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const monthName = (() => { const [y, m] = run.period.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); })();

    const entries = sortEntries(run.entries);
    const pfRows = entries.filter((e: any) => e.isPfApplicable || e.pfEmployee > 0);
    const esiRows = entries.filter((e: any) => e.isEsiEligible || e.esiEmployee > 0);
    const sum = (rows: any[], f: string) => r2(rows.reduce((s, e) => s + (e[f] || 0), 0));
    const pfEE = sum(pfRows, 'pfEmployee'), pfER = sum(pfRows, 'pfEmployer');
    const esiEE = sum(esiRows, 'esiEmployee'), esiER = sum(esiRows, 'esiEmployer');

    const days = (n: number) => { const v = Number(n || 0); return v % 1 === 0 ? String(v) : v.toFixed(1); };
    const dayCells = (e: any) => `<td class="dy">${days(e.payDays)}</td><td class="dy">${days(e.presentDays)}</td><td class="dy">${days(e.lopDays)}</td>`;
    const pfBody = pfRows.map((e: any, i: number) => `<tr>
      <td>${i + 1}</td><td>${esc(e.person.employeeNo)}</td><td class="nm">${esc(e.person.name)}</td>
      <td>${esc(e.person.pfNumber) || '—'}</td><td>${esc(e.person.pfUan) || '—'}</td>
      ${dayCells(e)}
      <td class="amt">${inr(e.basic + e.da)}</td>
      <td class="amt">${inr(e.pfEmployee)}</td><td class="amt">${inr(e.pfEmployer)}</td>
      <td class="amt">${inr(r2(e.pfEmployee + e.pfEmployer))}</td></tr>`).join('');
    const esiBody = esiRows.map((e: any, i: number) => `<tr>
      <td>${i + 1}</td><td>${esc(e.person.employeeNo)}</td><td class="nm">${esc(e.person.name)}</td>
      <td>${esc(e.person.esiNumber) || '—'}</td>
      ${dayCells(e)}
      <td class="amt">${inr(e.grossSalary)}</td>
      <td class="amt">${inr(e.esiEmployee)}</td><td class="amt">${inr(e.esiEmployer)}</td>
      <td class="amt">${inr(r2(e.esiEmployee + e.esiEmployer))}</td></tr>`).join('');

    const html = `
<div style="font-family:'Segoe UI',-apple-system,sans-serif;color:#1a1a2e;font-size:13.5px;line-height:1.6;">
  <style>
    .st-table { width:100%; border-collapse:collapse; margin-bottom:22px; }
    .st-table th, .st-table td { border:1px solid #d6dbe3; padding:5px 8px; font-size:12px; }
    .st-table th { background:#eef2ff; color:${accent}; text-align:left; white-space:nowrap; }
    .st-table .nm { white-space:nowrap; }
    .st-table .dy { text-align:center; white-space:nowrap; }
    .st-table .amt { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .st-table .tot td { font-weight:700; background:#f8fafc; }
    .st-h { font-size:15px; font-weight:700; color:${accent}; margin:18px 0 8px; }
    @media print { @page { size: A4 landscape; margin: 10mm; } .st-table th, .st-table td { font-size: 10.5px; padding: 4px 7px; } }
  </style>
  <div style="border-bottom:3px solid ${primary};padding-bottom:12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div style="display:flex;align-items:center;gap:14px;">
      ${brand.logoData ? `<img src="${brand.logoData}" alt="" style="height:48px;max-width:140px;object-fit:contain;"/>` : ''}
      <div>
        <div style="font-size:22px;font-weight:bold;color:${accent};">${esc(brand.name)}</div>
        ${brand.addressLine ? `<div style="font-size:11.5px;color:#666;">${esc(brand.addressLine)}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:16px;font-weight:700;">PF &amp; ESI Statement</div>
      <div style="font-size:12.5px;color:#555;">${monthName}</div>
    </div>
  </div>

  <div class="st-h">Provident Fund — ${pfRows.length} employee${pfRows.length !== 1 ? 's' : ''}</div>
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Name</th><th>PF No.</th><th>UAN</th><th class="dy">Pay Days</th><th class="dy">Present</th><th class="dy">LOP</th><th class="amt">Basic + DA</th><th class="amt">Employee</th><th class="amt">Employer</th><th class="amt">Total</th></tr>
    ${pfBody || '<tr><td colspan="12">No PF-applicable employees in this run.</td></tr>'}
    <tr class="tot"><td colspan="9">Total</td><td class="amt">${inr(pfEE)}</td><td class="amt">${inr(pfER)}</td><td class="amt">${inr(r2(pfEE + pfER))}</td></tr>
  </table>

  <div class="st-h">ESI — ${esiRows.length} employee${esiRows.length !== 1 ? 's' : ''}</div>
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Name</th><th>ESI Number</th><th class="dy">Pay Days</th><th class="dy">Present</th><th class="dy">LOP</th><th class="amt">Gross Wages</th><th class="amt">Employee</th><th class="amt">Employer</th><th class="amt">Total</th></tr>
    ${esiBody || '<tr><td colspan="11">No ESI-covered employees in this run.</td></tr>'}
    <tr class="tot"><td colspan="8">Total</td><td class="amt">${inr(esiEE)}</td><td class="amt">${inr(esiER)}</td><td class="amt">${inr(r2(esiEE + esiER))}</td></tr>
  </table>

  <table class="st-table" style="width:auto;min-width:50%;">
    <tr><th colspan="2">Remittance summary — ${monthName}</th></tr>
    <tr><td>PF payable (employee + employer)</td><td class="amt">${inr(r2(pfEE + pfER))}</td></tr>
    <tr><td>ESI payable (employee + employer)</td><td class="amt">${inr(r2(esiEE + esiER))}</td></tr>
    <tr class="tot"><td>Total statutory remittance</td><td class="amt">${inr(r2(pfEE + pfER + esiEE + esiER))}</td></tr>
  </table>
</div>`;
    res.json({ html, period: run.period, title: `PF & ESI Statement — ${monthName}` });
  },

  // Month-over-month comparison against the previous period's run.
  async runComparison(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.runId, organizationId: orgId },
      include: { entries: { include: { person: { select: { id: true, name: true, employeeNo: true } } } } },
    });
    if (!run) throw new AppError(404, 'Payroll run not found');
    // Latest run before this one (handles gaps in the run history)
    const prev = await prisma.payrollRun.findFirst({
      where: { organizationId: orgId, period: { lt: run.period } },
      orderBy: { period: 'desc' },
      include: { entries: { include: { person: { select: { id: true, name: true, employeeNo: true } } } } },
    });
    if (!prev) throw new AppError(404, 'No earlier run found to compare against');

    const brand = await orgBrand(orgId);
    const primary = brand.brandPrimary || '#4f46e5';
    const accent = brand.brandAccent || '#312e81';
    const esc = (v: any) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const label = (p: string) => { const [yy, mm] = p.split('-').map(Number); return new Date(yy, mm - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };
    const diffCell = (d: number) => d === 0
      ? '<td class="amt" style="color:#6b7280;">—</td>'
      : `<td class="amt" style="color:${d > 0 ? '#067647' : '#B42318'};font-weight:600;">${d > 0 ? '▲' : '▼'} ${inr(Math.abs(d))}</td>`;

    const prevBy = new Map(prev.entries.map((e: any) => [e.person.id, e]));
    const curBy = new Map(run.entries.map((e: any) => [e.person.id, e]));
    const rows: string[] = [];
    for (const e of sortEntries(run.entries) as any[]) {
      const p = prevBy.get(e.person.id);
      const notes: string[] = [];
      if (!p) notes.push('joined this month');
      else {
        if (p.monthlyPackage !== e.monthlyPackage) notes.push(`package ${inr(p.monthlyPackage)} → ${inr(e.monthlyPackage)}`);
        if (p.payDays !== e.payDays) notes.push(`pay days ${p.payDays} → ${e.payDays}`);
      }
      const d = r2(e.netPayable - (p?.netPayable || 0));
      rows.push(`<tr>
        <td>${esc(e.person.name)}<div style="font-size:10.5px;color:#6b7280;">${esc(e.person.employeeNo)}${notes.length ? ' · ' + esc(notes.join(', ')) : ''}</div></td>
        <td class="amt">${p ? inr(p.grossSalary) : '—'}</td><td class="amt">${inr(e.grossSalary)}</td>
        <td class="amt">${p ? inr(p.netPayable) : '—'}</td><td class="amt">${inr(e.netPayable)}</td>
        ${diffCell(d)}</tr>`);
    }
    const leavers = (prev.entries as any[]).filter(e => !curBy.has(e.person.id));
    for (const e of leavers) {
      rows.push(`<tr style="opacity:.7;">
        <td>${esc(e.person.name)}<div style="font-size:10.5px;color:#B42318;">not in ${label(run.period)}</div></td>
        <td class="amt">${inr(e.grossSalary)}</td><td class="amt">—</td>
        <td class="amt">${inr(e.netPayable)}</td><td class="amt">—</td>
        ${diffCell(r2(-e.netPayable))}</tr>`);
    }
    const tot = (es: any[], f: string) => r2(es.reduce((s, e) => s + (e[f] || 0), 0));
    const pg = tot(prev.entries, 'grossSalary'), cg = tot(run.entries, 'grossSalary');
    const pn = tot(prev.entries, 'netPayable'), cn = tot(run.entries, 'netPayable');

    const html = `
<div style="font-family:'Segoe UI',-apple-system,sans-serif;color:#1a1a2e;font-size:13.5px;line-height:1.6;">
  <style>
    .st-table { width:100%; border-collapse:collapse; }
    .st-table th, .st-table td { border:1px solid #d6dbe3; padding:5px 8px; font-size:12px; }
    .st-table th { background:#eef2ff; color:${accent}; text-align:left; white-space:nowrap; }
    .st-table .amt { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .st-table .tot td { font-weight:700; background:#f8fafc; }
    @media print { @page { size: A4 landscape; margin: 10mm; } .st-table th, .st-table td { font-size: 10.5px; padding: 4px 7px; } }
  </style>
  <div style="border-bottom:3px solid ${primary};padding-bottom:12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div style="display:flex;align-items:center;gap:14px;">
      ${brand.logoData ? `<img src="${brand.logoData}" alt="" style="height:48px;max-width:140px;object-fit:contain;"/>` : ''}
      <div>
        <div style="font-size:22px;font-weight:bold;color:${accent};">${esc(brand.name)}</div>
        ${brand.addressLine ? `<div style="font-size:11.5px;color:#666;">${esc(brand.addressLine)}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:16px;font-weight:700;">Salary Comparison</div>
      <div style="font-size:12.5px;color:#555;">${label(prev.period)} vs ${label(run.period)}</div>
    </div>
  </div>
  <table class="st-table">
    <tr><th>Employee</th><th class="amt">Gross (${label(prev.period)})</th><th class="amt">Gross (${label(run.period)})</th><th class="amt">Net (${label(prev.period)})</th><th class="amt">Net (${label(run.period)})</th><th class="amt">Net Change</th></tr>
    ${rows.join('')}
    <tr class="tot"><td>Total (${prev.entries.length} → ${run.entries.length} employees)</td>
      <td class="amt">${inr(pg)}</td><td class="amt">${inr(cg)}</td>
      <td class="amt">${inr(pn)}</td><td class="amt">${inr(cn)}</td>
      ${diffCell(r2(cn - pn))}</tr>
  </table>
</div>`;
    res.json({ html, title: `Salary Comparison — ${label(prev.period)} vs ${label(run.period)}` });
  },

  // Manual inputs and overrides in a run, employee-wise: one-off amounts,
  // non-standard working days, and packages / statutory flags that differ
  // from the employee record.
  async overridesReport(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.runId, organizationId: orgId },
      include: { entries: { include: {
        person: { select: {
          name: true, employeeNo: true, currentMonthlyPackage: true,
          isEsiEligible: true, isPfApplicable: true,
        } },
        lines: true,
      } } },
    });
    if (!run) throw new AppError(404, 'Payroll run not found');
    const standard = standardWorkingDays(run.entries);
    const rows = sortEntries(run.entries)
      .map((e: any) => ({ e, items: entryOverrides(e, e.person, standard) }))
      .filter(r => r.items.length > 0 || r.e.remarks);
    const body = rows.map(({ e, items }, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${escHtml(e.person.employeeNo)}</td><td class="nw">${escHtml(e.person.name)}</td>
      <td>${items.map(it => `<div><strong>${escHtml(it.label)}:</strong> ${escHtml(it.value)}${it.note ? ` <span class="muted">(${escHtml(it.note)})</span>` : ''}</div>`).join('') || '<span class="muted">—</span>'}</td>
      <td>${escHtml(e.remarks) || '<span class="muted">—</span>'}</td></tr>`).join('');
    const html = reportShell(await orgBrand(orgId), 'Overrides Report', monthLabel(run.period), `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>Manual inputs and overrides</th><th>Remarks</th></tr>
    ${body || '<tr><td colspan="5">No manual inputs or overrides in this run.</td></tr>'}
  </table>
  <p style="font-size:11.5px;color:#6b7280;">${rows.length} of ${run.entries.length} employees. Run standard: ${standard} working days.
  Package and PF / ESI differences compare against the employee record as it stands today.</p>`);
    res.json({ html, title: `Overrides Report — ${monthLabel(run.period)}` });
  },

  // Every recorded change to a run's inputs, oldest first.
  async inputHistoryReport(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId);
    const logs = await prisma.payrollAuditLog.findMany({
      where: { organizationId: orgId, runId: run.id },
      orderBy: { createdAt: 'asc' },
    });
    const when = (d: Date) => d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
    });
    const body = logs.map(l => `<tr>
      <td class="nw">${escHtml(when(l.createdAt))}</td><td class="nw">${escHtml(l.userName) || '<span class="muted">—</span>'}</td>
      <td class="nw">${escHtml(l.action.replace(/_/g, ' ').toLowerCase())}${l.source !== 'MANUAL' ? ` <span class="muted">(${escHtml(l.source.toLowerCase())})</span>` : ''}</td>
      <td class="nw">${escHtml(l.personName) || '<span class="muted">—</span>'}</td>
      <td>${escHtml(fieldLabel(l.field)) || '<span class="muted">—</span>'}</td>
      <td>${escHtml(l.oldValue) || '<span class="muted">—</span>'}</td>
      <td>${escHtml(l.newValue) || '<span class="muted">—</span>'}</td></tr>`).join('');
    const html = reportShell(await orgBrand(orgId), 'Salary Input History', monthLabel(run.period), `
  <table class="st-table">
    <tr><th>When</th><th>User</th><th>Action</th><th>Employee</th><th>Field</th><th>Old value</th><th>New value</th></tr>
    ${body || '<tr><td colspan="7">No changes recorded for this run. Changes made before the audit log was introduced are not listed.</td></tr>'}
  </table>`);
    res.json({ html, title: `Salary Input History — ${monthLabel(run.period)}` });
  },

  // ---- Attendance import ---------------------------------------------------
  // Template: current attendance values for every entry in the run, ready to
  // edit in Excel and upload back.
  async attendanceTemplate(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.runId, organizationId: orgId },
      include: { entries: { include: { person: { select: { name: true, employeeNo: true } } } } },
    });
    if (!run) throw new AppError(404, 'Payroll run not found');
    const Excel = await import('exceljs');
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('Attendance');
    ws.addRow(['Employee Code', 'Name', 'Total Working Days', 'Leave Days', 'LOP Days', 'Salary Advance', 'TDS']);
    ws.getRow(1).font = { bold: true };
    for (const e of sortEntries(run.entries)) {
      ws.addRow([
        e.person.employeeNo || '', e.person.name,
        e.totalWorkingDays, e.empLeaveDays, e.lopDays, e.salaryAdvance, e.tds,
      ]);
    }
    ws.columns.forEach((c: any, i: number) => { c.width = i === 1 ? 28 : 18; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-${run.period}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  },

  // Upload the edited template: matches rows by employee code (name as
  // fallback), recomputes every touched entry with the salary engine.
  async importAttendance(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const { fileBase64, dryRun = true } = req.body;
    if (!fileBase64 || typeof fileBase64 !== 'string') {
      throw new AppError(400, 'File content is required');
    }
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.runId, organizationId: orgId },
      include: { entries: { include: {
        person: { select: { name: true, employeeNo: true, workLocation: { select: { state: true } } } },
        lines: true,
      } } },
    });
    if (!run) throw new AppError(404, 'Payroll run not found');
    assertInputsOpen(run);

    const Excel = await import('exceljs');
    const buffer = Buffer.from(fileBase64.replace(/^data:[^,]+,/, ''), 'base64');
    const wb = new Excel.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new AppError(400, 'Could not read the workbook — please upload a valid .xlsx file');
    }
    const ws = wb.worksheets[0];
    const norm = (s: any) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const byCode = new Map(run.entries.filter(e => e.person.employeeNo).map(e => [norm(e.person.employeeNo), e]));
    const byName = new Map(run.entries.map(e => [norm(e.person.name), e]));

    // Header positions (tolerant to reordered columns)
    const head: Record<string, number> = {};
    ws.getRow(1).eachCell((cell: any, i: number) => { head[norm(cell.text)] = i; });
    const col = (row: any, key: string) => {
      const i = head[key];
      if (!i) return undefined;
      const v = row.getCell(i).value;
      const n = Number(typeof v === 'object' && v ? (v as any).result ?? NaN : v);
      return isNaN(n) ? undefined : n;
    };

    const ctx = await loadStatutoryContext(orgId, run.period);
    const results: any[] = [];
    let updated = 0, skipped = 0, errors = 0;
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const code = String(row.getCell(head['employeecode'] || 1).text || '').trim();
      const name = String(row.getCell(head['name'] || 2).text || '').trim();
      if (!code && !name) continue;
      const entry = byCode.get(norm(code)) || byName.get(norm(name));
      if (!entry) { results.push({ row: r, name: name || code, action: 'error: not in this run' }); errors++; continue; }

      const merged: any = { ...entry };
      const twd = col(row, 'totalworkingdays');
      if (twd !== undefined) {
        if (twd < 1 || twd > 31) { results.push({ row: r, name: entry.person.name, action: 'error: working days must be 1-31' }); errors++; continue; }
        merged.totalWorkingDays = Math.round(twd);
      }
      const leave = col(row, 'leavedays');
      const lop = col(row, 'lopdays');
      const advance = col(row, 'salaryadvance');
      const tds = col(row, 'tds');
      if (leave !== undefined) merged.empLeaveDays = leave;
      if (lop !== undefined) merged.lopDays = lop;
      if (advance !== undefined) merged.salaryAdvance = advance;
      if (tds !== undefined && !ctx.tax) merged.tds = tds;

      const changed = ['totalWorkingDays', 'empLeaveDays', 'lopDays', 'salaryAdvance', 'tds']
        .some(f => (merged as any)[f] !== (entry as any)[f]);
      if (!changed) { results.push({ row: r, name: entry.person.name, action: 'skip: no changes' }); skipped++; continue; }

      const computed = computeFullEntry(ctx, merged, entry.lines, statutoryOptions(entry));
      if (!dryRun) {
        await prisma.payslipEntry.update({
          where: { id: entry.id },
          data: {
            totalWorkingDays: merged.totalWorkingDays,
            empLeaveDays: merged.empLeaveDays,
            lopDays: merged.lopDays,
            salaryAdvance: merged.salaryAdvance,
            tds: merged.tds,
            ...computed,
          },
        });
        await logPayrollAudit(req, diffFields(entry, merged, ENTRY_INPUT_FIELDS).map(c => ({
          action: 'ENTRY_UPDATED' as const, runId: run.id, entryId: entry.id,
          personId: entry.personId, period: run.period, personName: entry.person.name,
          source: 'IMPORT' as const, ...c,
        })));
      }
      results.push({
        row: r, name: entry.person.name,
        action: dryRun ? 'will update' : 'updated',
        leave: merged.empLeaveDays, lop: merged.lopDays,
        net: (computed as any).netPayable,
      });
      updated++;
    }
    if (!dryRun) await saveTaxWorkings(ctx.tax, orgId, run.id);
    res.json({ dryRun: Boolean(dryRun), summary: { updated, skipped, errors }, results });
  },

  async removeEntry(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const entry = await prisma.payslipEntry.findFirst({
      where: { id: req.params.entryId, organizationId: orgId },
      include: { run: true, person: { select: { name: true } } },
    });
    if (!entry) throw new AppError(404, 'Payslip entry not found');
    assertInputsOpen(entry.run);
    await prisma.payslipEntry.delete({ where: { id: entry.id } });
    await prisma.taxComputation.deleteMany({ where: { runId: entry.runId, personId: entry.personId } });
    await logPayrollAudit(req, [{
      action: 'ENTRY_REMOVED', runId: entry.runId, entryId: entry.id, personId: entry.personId,
      period: entry.run.period, personName: entry.person.name,
    }]);
    res.json({ message: 'Entry removed from this run' });
  },

  // ---- Payslip -----------------------------------------------------------
  async getPayslip(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const entry = await prisma.payslipEntry.findFirst({
      where: { id: req.params.entryId, organizationId: orgId },
      include: { run: true, person: true, lines: true },
    });
    if (!entry) throw new AppError(404, 'Payslip entry not found');
    const brand = await orgBrand(orgId);
    const withLoan = {
      ...entry,
      loanBalanceAfter: await loanBalanceAfter(orgId, entry, entry.run.period),
      claims: entry.reimbursement > 0 ? await claimsOfEntry(entry.id) : [],
    };
    res.json({
      id: entry.id,
      runId: entry.runId,
      period: entry.run.period,
      status: entry.run.status,
      personName: entry.person.name,
      html: renderPayslipHtml(brand, entry.run, withLoan, entry.person),
    });
  },

  // Payslip history for one employee (the People profile card)
  async getPersonEntries(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const entries = await prisma.payslipEntry.findMany({
      where: { organizationId: orgId, personId: req.params.personId },
      include: { run: { select: { period: true, status: true } } },
      orderBy: { run: { period: 'desc' } },
    });
    res.json({
      entries: entries.map(e => ({
        id: e.id,
        period: e.run.period,
        runStatus: e.run.status,
        payDays: e.payDays,
        totalWorkingDays: e.totalWorkingDays,
        grossSalary: e.grossSalary,
        totalDeductions: e.totalDeductions,
        netPayable: e.netPayable,
      })),
    });
  },

  // All payslips of a run on one printable page
  async getRunPayslips(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.runId, organizationId: orgId },
      include: { entries: { include: { person: true, lines: true } } },
    });
    if (!run) throw new AppError(404, 'Payroll run not found');
    const brand = await orgBrand(orgId);
    const slips = [];
    for (const e of sortEntries(run.entries) as any[]) {
      slips.push({
        id: e.id,
        personName: e.person.name,
        html: renderPayslipHtml(brand, run,
          {
            ...e,
            loanBalanceAfter: await loanBalanceAfter(orgId, e, run.period),
            claims: e.reimbursement > 0 ? await claimsOfEntry(e.id) : [],
          }, e.person),
      });
    }
    res.json({ runId: run.id, period: run.period, status: run.status, slips });
  },

  // ---- Register export (Excel-compatible CSV) ----------------------------
  async exportRunCsv(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId, true);
    const esc = (v: any) => {
      const s = v == null ? '' : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    // Catalogue components used in this run slot in before Gross / Total Deductions
    const lineCols = usedColumns(run.entries).filter(c => c.key.startsWith('c:'));
    const earningCols = lineCols.filter(c => c.group === 'EARNING');
    const deductionCols = lineCols.filter(c => c.group === 'DEDUCTION');
    const hasPt = run.entries.some((e: any) => e.professionalTax);
    const hasLwf = run.entries.some((e: any) => e.lwfEmployee || e.lwfEmployer);
    const hasLoan = run.entries.some((e: any) => e.loanDeduction);
    const header = [
      'Employee Code', 'Name', 'Designation', 'Department', 'Monthly Package',
      'Working Days', 'Leave Days', 'LOP Days', 'Present Days', 'Pay Days',
      'Basic', 'DA', 'HRA', 'Transport', 'Food', 'Internet', 'Arrear',
      ...earningCols.map(c => esc(c.label)), 'Gross',
      'ESI Employee', 'PF Employee', 'Advance', 'TDS',
      ...(hasPt ? ['Professional Tax'] : []), ...(hasLwf ? ['LWF Employee'] : []),
      ...(hasLoan ? ['Loan Instalment'] : []),
      ...deductionCols.map(c => esc(c.label)), 'Total Deductions',
      'Net Payable', 'ESI Employer', 'PF Employer', ...(hasLwf ? ['LWF Employer'] : []), 'CTC', 'Remarks',
    ];
    const lines = [header.join(',')];
    for (const e of sortEntries(run.entries)) {
      lines.push([
        esc(e.person.employeeNo), esc(e.person.name), esc(e.person.designation),
        esc(e.person.department), e.monthlyPackage,
        e.totalWorkingDays, e.empLeaveDays, e.lopDays, e.presentDays, e.payDays,
        e.basic, e.da, e.hra, e.transportAllowance, e.foodAllowance,
        e.internetAllowance, e.salaryArrearAllowance,
        ...earningCols.map(c => columnValue(e, c.key)), e.grossSalary,
        e.esiEmployee, e.pfEmployee, e.salaryAdvance, e.tds,
        ...(hasPt ? [e.professionalTax] : []), ...(hasLwf ? [e.lwfEmployee] : []),
        ...(hasLoan ? [e.loanDeduction] : []),
        ...deductionCols.map(c => columnValue(e, c.key)), e.totalDeductions,
        e.netPayable, e.esiEmployer, e.pfEmployer, ...(hasLwf ? [e.lwfEmployer] : []), e.ctc, esc(e.remarks),
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-${run.period}.csv"`);
    res.send('﻿' + lines.join('\n'));
  },
};
