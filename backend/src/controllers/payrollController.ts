import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { computeEntry, renderPayslipHtml } from '../services/payrollCalc';
import { orgBrand } from '../services/orgBrand';

const num = (v: any, fallback = 0) => (v == null || v === '' || isNaN(Number(v)) ? fallback : Number(v));

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
      ? { entries: { include: { person: { select: { id: true, name: true, employeeNo: true, designation: true, department: true } } } } }
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
    },
    omit: { photoData: true },
  });
}

export const payrollController = {
  // ---- Settings ----------------------------------------------------------
  async getSettings(req: any, res: Response) {
    res.json(await settingsFor(req.user?.organizationId));
  },

  async updateSettings(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    await settingsFor(orgId);
    const b = req.body;
    const fields = [
      'basicPercentOfPackage', 'daPercentOfBasic', 'hraPercentOfBasic',
      'transportPercentOfBasic', 'foodPercentOfBasic',
      'esiEmployeePercent', 'esiEmployerPercent', 'esiWageCeiling',
      'pfEmployeePercent', 'pfEmployerPercent', 'pfWageCap', 'pfWageFactor',
    ];
    const data: any = {};
    for (const f of fields) {
      if (b[f] !== undefined) {
        const v = num(b[f], NaN);
        if (isNaN(v) || v < 0) throw new AppError(400, `Invalid value for ${f}`);
        data[f] = v;
      }
    }
    if (b.pfEmployerMatchesEmployee !== undefined) {
      data.pfEmployerMatchesEmployee = Boolean(b.pfEmployerMatchesEmployee);
    }
    const updated = await prisma.payrollSettings.update({
      where: { organizationId: orgId },
      data,
    });
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
        id: r.id, period: r.period, status: r.status,
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

    const employees = await activeEmployees(orgId);
    if (employees.length === 0) {
      throw new AppError(400, 'No active employees found. Add employees in People first.');
    }

    const settings = await settingsFor(orgId);
    const run = await prisma.payrollRun.create({
      data: { organizationId: orgId, period, notes: String(req.body.notes || '') },
    });
    // Snapshot each employee's package & statutory flags, compute the row
    await prisma.payslipEntry.createMany({
      data: employees.map(emp => {
        const inputs = {
          monthlyPackage: emp.currentMonthlyPackage || 0,
          totalWorkingDays,
          isEsiEligible: emp.isEsiEligible,
          isPfApplicable: emp.isPfApplicable,
        };
        return {
          organizationId: orgId,
          runId: run.id,
          personId: emp.id,
          monthlyPackage: inputs.monthlyPackage,
          totalWorkingDays,
          isEsiEligible: emp.isEsiEligible,
          isPfApplicable: emp.isPfApplicable,
          ...computeEntry(inputs, settings),
        };
      }),
    });
    res.status(201).json({ id: run.id, period: run.period, employees: employees.length });
  },

  async getRunDetail(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId, true);
    res.json({
      ...run,
      entries: sortEntries(run.entries),
      totals: entryTotals(run.entries),
    });
  },

  async deleteRun(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId);
    assertDraft(run);
    await prisma.payrollRun.delete({ where: { id: run.id } });
    res.json({ message: `Deleted the ${run.period} draft run` });
  },

  async finalizeRun(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId);
    assertDraft(run);
    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'FINALIZED', finalizedAt: new Date() },
    });
    res.json(updated);
  },

  async reopenRun(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId);
    if (run.status !== 'FINALIZED') throw new AppError(400, 'Only finalized runs can be reopened');
    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'DRAFT', finalizedAt: null },
    });
    res.json(updated);
  },

  // Recompute every entry with current settings; add any active employees
  // missing from the roster (joined after the run was created).
  async recalculateRun(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const run = await fetchOrgRun(req.params.runId, orgId, true);
    assertDraft(run);
    const settings = await settingsFor(orgId);

    for (const entry of run.entries) {
      const computed = computeEntry(entry, settings);
      await prisma.payslipEntry.update({ where: { id: entry.id }, data: computed });
    }

    const existingIds = new Set(run.entries.map((e: any) => e.personId));
    const missing = (await activeEmployees(orgId)).filter(e => !existingIds.has(e.id));
    if (missing.length) {
      const twd = run.entries[0]?.totalWorkingDays || 26;
      await prisma.payslipEntry.createMany({
        data: missing.map(emp => {
          const inputs = {
            monthlyPackage: emp.currentMonthlyPackage || 0,
            totalWorkingDays: twd,
            isEsiEligible: emp.isEsiEligible,
            isPfApplicable: emp.isPfApplicable,
          };
          return {
            organizationId: orgId, runId: run.id, personId: emp.id,
            monthlyPackage: inputs.monthlyPackage, totalWorkingDays: twd,
            isEsiEligible: emp.isEsiEligible, isPfApplicable: emp.isPfApplicable,
            ...computeEntry(inputs, settings),
          };
        }),
      });
    }
    res.json({ message: `Recalculated ${run.entries.length} entries${missing.length ? `, added ${missing.length} new employee(s)` : ''}` });
  },

  // ---- Entries -----------------------------------------------------------
  async updateEntry(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const entry = await prisma.payslipEntry.findFirst({
      where: { id: req.params.entryId, organizationId: orgId },
      include: { run: true },
    });
    if (!entry) throw new AppError(404, 'Payslip entry not found');
    assertDraft(entry.run);

    const b = req.body;
    const merged: any = { ...entry };
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

    const settings = await settingsFor(orgId);
    const computed = computeEntry(merged, settings);
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
        ...computed,
      },
      include: { person: { select: { id: true, name: true, employeeNo: true, designation: true, department: true } } },
    });
    res.json(updated);
  },

  async removeEntry(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const entry = await prisma.payslipEntry.findFirst({
      where: { id: req.params.entryId, organizationId: orgId },
      include: { run: true },
    });
    if (!entry) throw new AppError(404, 'Payslip entry not found');
    assertDraft(entry.run);
    await prisma.payslipEntry.delete({ where: { id: entry.id } });
    res.json({ message: 'Entry removed from this run' });
  },

  // ---- Payslip -----------------------------------------------------------
  async getPayslip(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const entry = await prisma.payslipEntry.findFirst({
      where: { id: req.params.entryId, organizationId: orgId },
      include: { run: true, person: true },
    });
    if (!entry) throw new AppError(404, 'Payslip entry not found');
    const brand = await orgBrand(orgId);
    res.json({
      id: entry.id,
      runId: entry.runId,
      period: entry.run.period,
      status: entry.run.status,
      personName: entry.person.name,
      html: renderPayslipHtml(brand, entry.run, entry, entry.person),
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
      include: { entries: { include: { person: true } } },
    });
    if (!run) throw new AppError(404, 'Payroll run not found');
    const brand = await orgBrand(orgId);
    const slips = sortEntries(run.entries).map((e: any) => ({
      id: e.id,
      personName: e.person.name,
      html: renderPayslipHtml(brand, run, e, e.person),
    }));
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
    const header = [
      'Employee Code', 'Name', 'Designation', 'Department', 'Monthly Package',
      'Working Days', 'Leave Days', 'LOP Days', 'Present Days', 'Pay Days',
      'Basic', 'DA', 'HRA', 'Transport', 'Food', 'Internet', 'Arrear', 'Gross',
      'ESI Employee', 'PF Employee', 'Advance', 'TDS', 'Total Deductions',
      'Net Payable', 'ESI Employer', 'PF Employer', 'CTC', 'Remarks',
    ];
    const lines = [header.join(',')];
    for (const e of sortEntries(run.entries)) {
      lines.push([
        esc(e.person.employeeNo), esc(e.person.name), esc(e.person.designation),
        esc(e.person.department), e.monthlyPackage,
        e.totalWorkingDays, e.empLeaveDays, e.lopDays, e.presentDays, e.payDays,
        e.basic, e.da, e.hra, e.transportAllowance, e.foodAllowance,
        e.internetAllowance, e.salaryArrearAllowance, e.grossSalary,
        e.esiEmployee, e.pfEmployee, e.salaryAdvance, e.tds, e.totalDeductions,
        e.netPayable, e.esiEmployer, e.pfEmployer, e.ctc, esc(e.remarks),
      ].join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="payroll-${run.period}.csv"`);
    res.send('﻿' + lines.join('\n'));
  },
};
