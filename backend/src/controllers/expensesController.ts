import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { loadActor } from '../middleware/roles';
import { orgBrand } from '../services/orgBrand';
import { amountInWords } from '../services/payrollCalc';

export const EXPENSE_CATEGORIES = [
  { value: 'TRAVEL', label: 'Travel / Fuel', icon: '⛟' },
  { value: 'LODGING', label: 'Lodging', icon: '⌂' },
  { value: 'FOOD', label: 'Food & Meals', icon: '✚' },
  { value: 'LOCAL', label: 'Local Transport', icon: '➜' },
  { value: 'TOLL', label: 'Toll / Parking', icon: '▣' },
  { value: 'OTHER', label: 'Other', icon: '◌' },
];

export const EXPENSE_STATUSES = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'REIMBURSED', label: 'Reimbursed' },
];

// status -> allowed actions
const TRANSITIONS: Record<string, Record<string, string>> = {
  DRAFT: { submit: 'SUBMITTED' },
  SUBMITTED: { approve: 'APPROVED', reject: 'REJECTED' },
  APPROVED: { reimburse: 'REIMBURSED' },
  REJECTED: { submit: 'SUBMITTED' },
  REIMBURSED: {},
};
const OWNER_ACTIONS = new Set(['approve', 'reject', 'reimburse']);
const EDITABLE_STATUSES = new Set(['DRAFT', 'REJECTED']);

const str = (v: any) => String(v ?? '');
const round2 = (n: number) => Math.round(n * 100) / 100;
const esc = (v: any) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: any) => d
  ? new Date(String(d) + 'T00:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—';

const categoryLabel = (v: string) => EXPENSE_CATEGORIES.find(c => c.value === v)?.label || v;

async function nextReportNumber(organizationId: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.expenseReport.count({
    where: { organizationId, reportNumber: { startsWith: `ER-${year}-` } },
  });
  let n = count + 1;
  for (;;) {
    const num = `ER-${year}-${String(n).padStart(4, '0')}`;
    const exists = await prisma.expenseReport.findUnique({
      where: { organizationId_reportNumber: { organizationId, reportNumber: num } },
    });
    if (!exists) return num;
    n++;
  }
}

// 'summary' skips the base64 receiptData column — only the print view ('full')
// actually needs the blobs; everything else works from the light columns.
async function fetchOrgReport(id: string, organizationId: string, withLines: false | 'summary' | 'full' = false) {
  const report = await prisma.expenseReport.findFirst({
    where: { id, organizationId },
    include: {
      person: { select: { id: true, name: true, employeeNo: true, designation: true, department: true } },
      ...(withLines ? {
        lines: {
          orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
          ...(withLines === 'summary' ? { omit: { receiptData: true } } : {}),
        },
      } : {}),
    },
  });
  if (!report) throw new AppError(404, 'Expense report not found');
  return report as any;
}

function assertEditable(report: any) {
  if (!EDITABLE_STATUSES.has(report.status)) {
    throw new AppError(400, `A ${report.status.toLowerCase()} report is locked — reject or reopen it first`);
  }
}

async function requireApprover(req: any) {
  const actor = await loadActor(req);
  if (!['SUPER_ADMIN', 'HR'].includes(actor.role)) {
    throw new AppError(403, 'Only admins and HR can approve, reject or reimburse');
  }
}

// EMPLOYEE role only ever sees / edits reports belonging to their Person
async function assertReportAccess(req: any, reportPersonId: string) {
  const actor = await loadActor(req);
  if (actor.role === 'EMPLOYEE' && actor.personId !== reportPersonId) {
    throw new AppError(404, 'Expense report not found');
  }
}

// receiptFilename is kept in sync with receiptData on every write, so it can
// answer hasReceipt even when the blob column wasn't fetched.
const lineJSON = (l: any) => ({
  ...l,
  receiptData: undefined,
  hasReceipt: Boolean(l.receiptData || l.receiptFilename),
});

const totalOf = (lines: any[]) => round2(lines.reduce((s, l) => s + (l.amount || 0), 0));

export const expensesController = {
  async getMeta(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const actor = await loadActor(req);
    const employees = await prisma.person.findMany({
      where: {
        organizationId: orgId, kind: 'CANDIDATE', isEmployee: true,
        // Employees file reports only for themselves
        ...(actor.role === 'EMPLOYEE' ? { id: actor.personId || '' } : {}),
      },
      select: { id: true, name: true, employeeNo: true, designation: true },
      orderBy: { name: 'asc' },
    });
    res.json({
      categories: EXPENSE_CATEGORIES,
      statuses: EXPENSE_STATUSES,
      employees,
    });
  },

  async getReports(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const status = str(req.query.status);
    const actor = await loadActor(req);
    const personId = actor.role === 'EMPLOYEE'
      ? (actor.personId || 'none') // own reports only
      : str(req.query.personId);
    const q = str(req.query.q).trim();
    const reports = await prisma.expenseReport.findMany({
      where: {
        organizationId: orgId,
        ...(status ? { status } : {}),
        ...(personId ? { personId } : {}),
        ...(q ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' as const } },
            { reportNumber: { contains: q, mode: 'insensitive' as const } },
            { person: { name: { contains: q, mode: 'insensitive' as const } } },
          ],
        } : {}),
      },
      include: {
        person: { select: { id: true, name: true, employeeNo: true } },
        lines: { select: { amount: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const rows = reports.map(r => ({
      ...r,
      lines: undefined,
      total: totalOf(r.lines),
      lineCount: r.lines.length,
    }));
    res.json({
      reports: rows,
      pendingTotal: round2(rows
        .filter(r => ['SUBMITTED', 'APPROVED'].includes(r.status))
        .reduce((s, r) => s + r.total, 0)),
      reimbursedTotal: round2(rows
        .filter(r => r.status === 'REIMBURSED')
        .reduce((s, r) => s + r.total, 0)),
    });
  },

  async createReport(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const title = str(b.title).trim();
    if (!title) throw new AppError(400, 'Report title is required');
    const actor = await loadActor(req);
    const targetPersonId = actor.role === 'EMPLOYEE' ? (actor.personId || '') : str(b.personId);
    const person = await prisma.person.findFirst({
      where: { id: targetPersonId, organizationId: orgId, isEmployee: true },
    });
    if (!person) throw new AppError(400, 'Pick the employee this report belongs to');
    const report = await prisma.expenseReport.create({
      data: {
        organizationId: orgId,
        personId: person.id,
        reportNumber: await nextReportNumber(orgId),
        title,
        businessPurpose: str(b.businessPurpose),
        reportTo: str(b.reportTo),
        periodStart: b.periodStart || null,
        periodEnd: b.periodEnd || null,
        currency: str(b.currency) || 'INR',
      },
    });
    res.status(201).json(report);
  },

  async getReportDetail(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const report = await fetchOrgReport(req.params.reportId, orgId, 'summary');
    await assertReportAccess(req, report.personId);
    res.json({
      ...report,
      lines: report.lines.map(lineJSON),
      total: totalOf(report.lines),
      editable: EDITABLE_STATUSES.has(report.status),
      actions: Object.keys(TRANSITIONS[report.status] || {}).filter(a =>
        !OWNER_ACTIONS.has(a) || ['SUPER_ADMIN', 'HR'].includes((req as any).actor?.role)),
    });
  },

  async updateReport(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const report = await fetchOrgReport(req.params.reportId, orgId);
    await assertReportAccess(req, report.personId);
    assertEditable(report);
    const b = req.body;
    const data: any = {};
    if (b.title !== undefined) {
      const title = str(b.title).trim();
      if (!title) throw new AppError(400, 'Report title is required');
      data.title = title;
    }
    for (const f of ['businessPurpose', 'reportTo', 'currency']) {
      if (b[f] !== undefined) data[f] = str(b[f]);
    }
    for (const f of ['periodStart', 'periodEnd']) {
      if (b[f] !== undefined) data[f] = b[f] || null;
    }
    if (b.personId !== undefined) {
      const person = await prisma.person.findFirst({
        where: { id: str(b.personId), organizationId: orgId, isEmployee: true },
      });
      if (!person) throw new AppError(400, 'Pick a valid employee');
      data.personId = person.id;
    }
    const updated = await prisma.expenseReport.update({ where: { id: report.id }, data });
    res.json(updated);
  },

  async deleteReport(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const report = await fetchOrgReport(req.params.reportId, orgId);
    await assertReportAccess(req, report.personId);
    if (report.status !== 'DRAFT') {
      throw new AppError(400, 'Only draft reports can be deleted');
    }
    await prisma.expenseReport.delete({ where: { id: report.id } });
    res.json({ message: `Deleted ${report.reportNumber}` });
  },

  async changeStatus(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const report = await fetchOrgReport(req.params.reportId, orgId);
    await assertReportAccess(req, report.personId);
    const action = str(req.body.action);
    const next = TRANSITIONS[report.status]?.[action];
    if (!next) {
      throw new AppError(400, `Cannot ${action} a ${report.status.toLowerCase()} report`);
    }
    if (OWNER_ACTIONS.has(action)) await requireApprover(req);
    if (action === 'submit') {
      const lineCount = await prisma.expenseLine.count({ where: { reportId: report.id } });
      if (lineCount === 0) throw new AppError(400, 'Add at least one expense line before submitting');
    }
    const updated = await prisma.expenseReport.update({
      where: { id: report.id },
      data: {
        status: next,
        ...(action === 'submit' ? { submittedOn: new Date().toISOString().split('T')[0] } : {}),
      },
    });
    res.json({ ...updated, message: `Report ${next.toLowerCase()}` });
  },

  // ---- Lines -------------------------------------------------------------
  async addLine(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const report = await fetchOrgReport(req.params.reportId, orgId);
    await assertReportAccess(req, report.personId);
    assertEditable(report);
    const b = req.body;
    const amount = Number(b.amount);
    if (!amount || amount <= 0) throw new AppError(400, 'A positive amount is required');
    if (b.receiptData && b.receiptData.length > 11_000_000) {
      throw new AppError(400, 'Receipts must be under 8 MB');
    }
    const line = await prisma.expenseLine.create({
      data: {
        organizationId: orgId,
        reportId: report.id,
        date: b.date || null,
        category: EXPENSE_CATEGORIES.some(c => c.value === b.category) ? b.category : 'OTHER',
        description: str(b.description),
        merchant: str(b.merchant),
        amount: round2(amount),
        receiptData: str(b.receiptData),
        receiptFilename: b.receiptData ? (str(b.receiptFilename) || 'receipt.jpg') : '',
        ocrText: str(b.ocrText).slice(0, 20000),
      },
    });
    res.status(201).json(lineJSON(line));
  },

  async updateLine(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const line = await prisma.expenseLine.findFirst({
      where: { id: req.params.lineId, organizationId: orgId },
      include: { report: true },
    });
    if (!line) throw new AppError(404, 'Expense line not found');
    await assertReportAccess(req, line.report.personId);
    assertEditable(line.report);
    const b = req.body;
    const data: any = {};
    if (b.amount !== undefined) {
      const amount = Number(b.amount);
      if (!amount || amount <= 0) throw new AppError(400, 'A positive amount is required');
      data.amount = round2(amount);
    }
    if (b.date !== undefined) data.date = b.date || null;
    if (b.category !== undefined) {
      data.category = EXPENSE_CATEGORIES.some(c => c.value === b.category) ? b.category : 'OTHER';
    }
    for (const f of ['description', 'merchant', 'receiptFilename']) {
      if (b[f] !== undefined) data[f] = str(b[f]);
    }
    if (b.receiptData !== undefined) {
      if (b.receiptData && b.receiptData.length > 11_000_000) {
        throw new AppError(400, 'Receipts must be under 8 MB');
      }
      data.receiptData = str(b.receiptData);
      data.receiptFilename = b.receiptData
        ? (str(b.receiptFilename ?? line.receiptFilename) || 'receipt.jpg')
        : '';
    }
    const updated = await prisma.expenseLine.update({ where: { id: line.id }, data });
    res.json(lineJSON(updated));
  },

  async deleteLine(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const line = await prisma.expenseLine.findFirst({
      where: { id: req.params.lineId, organizationId: orgId },
      include: { report: true },
    });
    if (!line) throw new AppError(404, 'Expense line not found');
    await assertReportAccess(req, line.report.personId);
    assertEditable(line.report);
    await prisma.expenseLine.delete({ where: { id: line.id } });
    res.json({ message: 'Line removed' });
  },

  async getReceipt(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const line = await prisma.expenseLine.findFirst({
      where: { id: req.params.lineId, organizationId: orgId },
      include: { report: { select: { personId: true } } },
    });
    if (!line || !line.receiptData) throw new AppError(404, 'No receipt attached');
    await assertReportAccess(req, line.report.personId);
    res.json({ filename: line.receiptFilename || 'receipt', dataUri: line.receiptData, ocrText: line.ocrText });
  },

  // ---- Branded print view ------------------------------------------------
  async printReport(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const report = await fetchOrgReport(req.params.reportId, orgId, 'full');
    await assertReportAccess(req, report.personId);
    const brand = await orgBrand(orgId);
    const total = totalOf(report.lines);
    const primary = brand.brandPrimary || '#4f46e5';
    const accent = brand.brandAccent || '#312e81';

    const rows = report.lines.map((l: any) => `
      <tr>
        <td>${fmtDate(l.date)}</td>
        <td>${esc(categoryLabel(l.category))}</td>
        <td>${esc(l.description || '—')}</td>
        <td>${esc(l.merchant || '—')}</td>
        <td style="text-align:center;">${l.receiptData ? '📎' : ''}</td>
        <td class="amt">${inr(l.amount)}</td>
      </tr>`).join('');

    const receipts = report.lines
      .filter((l: any) => l.receiptData && l.receiptData.startsWith('data:image/'))
      .map((l: any, i: number) => `
        <div style="break-inside:avoid;margin-bottom:18px;">
          <div style="font-size:12px;color:#555;margin-bottom:6px;">
            Receipt ${i + 1}: ${esc(l.merchant || l.description || '')} — ${inr(l.amount)} (${fmtDate(l.date)})
          </div>
          <img src="${l.receiptData}" style="max-width:100%;max-height:430px;border:1px solid #ddd;border-radius:6px;"/>
        </div>`).join('');

    const html = `
<div style="font-family:'Segoe UI',-apple-system,sans-serif;color:#1a1a2e;font-size:13.5px;line-height:1.6;">
  <style>
    .er-table { width:100%; border-collapse:collapse; margin-top:6px; }
    .er-table th, .er-table td { border:1px solid #d6dbe3; padding:8px 12px; font-size:12.5px; }
    .er-table th { background:#eef2ff; color:${accent}; text-align:left; }
    .er-table .amt { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .er-info td { border:1px solid #e2e8f0; padding:6px 12px; font-size:12.5px; }
    .er-info td:nth-child(odd) { background:#f8fafc; color:#475569; width:18%; font-weight:600; }
  </style>
  <div style="border-bottom:3px solid ${primary};padding-bottom:12px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div style="display:flex;align-items:center;gap:14px;">
      ${brand.logoData ? `<img src="${brand.logoData}" alt="" style="height:48px;max-width:140px;object-fit:contain;"/>` : ''}
      <div>
        <div style="font-size:24px;font-weight:bold;color:${accent};">${esc(brand.name)}</div>
        ${brand.addressLine ? `<div style="font-size:11.5px;color:#666;">${esc(brand.addressLine)}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right;font-size:12.5px;color:#555;">
      <div style="font-size:16px;font-weight:700;color:${accent};">EXPENSE REPORT</div>
      <div>${esc(report.reportNumber)}</div>
    </div>
  </div>

  <table class="er-info" style="width:100%;border-collapse:collapse;margin:14px 0 16px;">
    <tr>
      <td>Report Title</td><td><strong>${esc(report.title)}</strong></td>
      <td>Status</td><td>${esc(report.status)}</td>
    </tr>
    <tr>
      <td>Submitted By</td><td>${esc(report.person.name)}${report.person.employeeNo ? ` (${esc(report.person.employeeNo)})` : ''}</td>
      <td>Submitted On</td><td>${fmtDate(report.submittedOn)}</td>
    </tr>
    <tr>
      <td>Report To</td><td>${esc(report.reportTo || '—')}</td>
      <td>Period</td><td>${fmtDate(report.periodStart)} – ${fmtDate(report.periodEnd)}</td>
    </tr>
    ${report.businessPurpose ? `<tr><td>Business Purpose</td><td colspan="3">${esc(report.businessPurpose)}</td></tr>` : ''}
  </table>

  <table class="er-table">
    <tr><th>Date</th><th>Category</th><th>Description</th><th>Merchant</th><th>📎</th><th style="text-align:right;">Amount</th></tr>
    ${rows || '<tr><td colspan="6" style="color:#888;">No expense lines</td></tr>'}
    <tr>
      <td colspan="5" style="background:#eef2ff;font-weight:700;">Total (${esc(report.currency)})</td>
      <td class="amt" style="background:#eef2ff;font-weight:700;font-size:14px;">${inr(total)}</td>
    </tr>
  </table>
  <p style="font-size:12px;color:#475569;margin-top:6px;">${esc(amountInWords(total))}</p>

  <table style="width:100%;margin-top:44px;"><tr>
    <td style="width:50%;">
      <div style="border-top:1.5px solid #9ca3af;display:inline-block;padding-top:6px;min-width:200px;font-size:12.5px;">
        <strong>${esc(report.person.name)}</strong><br/>Claimant
      </div>
    </td>
    <td style="text-align:right;">
      <div style="border-top:1.5px solid #9ca3af;display:inline-block;padding-top:6px;min-width:200px;font-size:12.5px;text-align:left;">
        <strong>${esc(brand.signatoryName || '')}</strong><br/>${esc(brand.signatoryDesignation || 'Approved By')}
      </div>
    </td>
  </tr></table>

  ${receipts ? `
    <div style="break-before:page;margin-top:36px;">
      <div style="font-size:15px;font-weight:700;color:${accent};border-bottom:2px solid ${primary};padding-bottom:6px;margin-bottom:14px;">
        Attached Receipts (${report.lines.filter((l: any) => l.receiptData).length})
      </div>
      ${receipts}
    </div>` : ''}
</div>`;

    res.json({
      id: report.id,
      reportNumber: report.reportNumber,
      title: report.title,
      personName: report.person.name,
      status: report.status,
      html,
    });
  },
};
