import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { orgBrand } from '../services/orgBrand';
import { logPayrollAudit, actorName, diffFields } from '../services/payroll/audit';
import { financialYearFor, financialYearOf } from '../services/payroll/financialYear';
import { currentPeriodIST } from '../services/payroll/salaryStructure';
import { declarationTotals } from '../services/payroll/declarationCalc';
import { todayIST } from '../services/payroll/loanLedger';
import {
  declarationItemsFor, yearControlFor, loadDeclaration, saveDeclaration, saveApproval,
  addProof, fetchProof, removeProof, buildForm12bb,
} from '../services/payroll/declarations';
import { esc, amt, reportShell } from '../services/payroll/reportHtml';

const str = (v: any) => String(v ?? '').trim();
const GROUPS = ['SECTION_80C', 'OTHER'];
const regimeLabel = (regime: string) => (regime === 'OLD' ? 'Old regime' : 'New regime');
const currentFyStart = () => financialYearOf(currentPeriodIST()).startYear;

function fyInput(value: any): number {
  if (value === undefined || value === null || value === '') return currentFyStart();
  const year = Number(/^(\d{4})/.exec(String(value))?.[1]);
  if (!year || year < 2000 || year > 2100) throw new AppError(400, 'Pick a financial year');
  return year;
}

const yearOptions = () => {
  const now = currentFyStart();
  return [now + 1, now, now - 1].map(y => ({ startYear: y, label: financialYearFor(y).label }));
};

function itemInput(b: any, existing?: any) {
  const name = str(b.name ?? existing?.name);
  if (!name) throw new AppError(400, 'Item name is required');
  const section = str(b.section ?? existing?.section);
  if (!section) throw new AppError(400, 'Section is required');
  const group = str(b.group ?? existing?.group);
  if (!GROUPS.includes(group)) throw new AppError(400, 'Pick how the item counts');
  const rawMax = b.maxAmount !== undefined ? b.maxAmount : existing?.maxAmount;
  const maxAmount = rawMax === '' || rawMax == null ? null : Number(rawMax);
  if (maxAmount !== null && (!isFinite(maxAmount) || maxAmount < 0)) throw new AppError(400, 'Enter a valid limit');
  const deductPercent = Number(b.deductPercent ?? existing?.deductPercent ?? 100);
  if (!isFinite(deductPercent) || deductPercent <= 0 || deductPercent > 100) throw new AppError(400, 'Deductible share must be between 1 and 100%');
  return {
    name, section, sectionNew: str(b.sectionNew ?? existing?.sectionNew), group, maxAmount, deductPercent,
    proofRequired: Boolean(b.proofRequired ?? existing?.proofRequired ?? false),
  };
}

export const payrollDeclarationsController = {
  // ---- Catalogue ------------------------------------------------------------
  async getItems(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const items = await declarationItemsFor(organizationId);
    const used = await prisma.declarationLine.groupBy({ by: ['itemId'], _count: { itemId: true } });
    const count = new Map(used.map(u => [u.itemId, u._count.itemId]));
    res.json({ items: items.map(i => ({ ...i, usedCount: count.get(i.id) || 0 })) });
  },

  async createItem(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const items = await declarationItemsFor(organizationId);
    const input = itemInput(req.body);
    const code = input.name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!code || items.some(i => i.code === code || i.name.toLowerCase() === input.name.toLowerCase())) {
      throw new AppError(400, `An item named "${input.name}" already exists`);
    }
    const item = await prisma.declarationItem.create({
      data: { organizationId, code, ...input, sortOrder: Math.max(-1, ...items.map(i => i.sortOrder)) + 1 },
    });
    await logPayrollAudit(req, [{ action: 'DECLARATION_ITEM_SAVED', field: item.name, newValue: `Section ${item.section}` }]);
    res.status(201).json(item);
  },

  async updateItem(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const before = await prisma.declarationItem.findFirst({ where: { id: req.params.itemId, organizationId } });
    if (!before) throw new AppError(404, 'Item not found');
    const input = itemInput(req.body, before);
    const item = await prisma.declarationItem.update({
      where: { id: before.id },
      data: { ...input, ...(req.body.isActive !== undefined ? { isActive: Boolean(req.body.isActive) } : {}) },
    });
    await logPayrollAudit(req, diffFields(before, item, ['name', 'section', 'sectionNew', 'group', 'maxAmount', 'deductPercent', 'proofRequired', 'isActive'])
      .map(c => ({ action: 'DECLARATION_ITEM_SAVED' as const, field: `${before.name} · ${c.field}`, oldValue: c.oldValue, newValue: c.newValue })));
    res.json(item);
  },

  async deleteItem(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const item = await prisma.declarationItem.findFirst({ where: { id: req.params.itemId, organizationId } });
    if (!item) throw new AppError(404, 'Item not found');
    const used = await prisma.declarationLine.count({ where: { itemId: item.id } });
    if (used > 0) throw new AppError(400, `${item.name} is on ${used} declaration${used === 1 ? '' : 's'}. Mark it inactive instead.`);
    await prisma.declarationItem.delete({ where: { id: item.id } });
    await logPayrollAudit(req, [{ action: 'DECLARATION_ITEM_SAVED', field: item.name, oldValue: `Section ${item.section}`, newValue: 'deleted' }]);
    res.json({ message: `Deleted ${item.name}` });
  },

  // ---- The year: who has declared what, and the windows ---------------------
  async getOverview(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const [people, profiles, items, control, settings] = await Promise.all([
      prisma.person.findMany({
        where: { organizationId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } },
        select: { id: true, name: true, employeeNo: true },
        orderBy: { name: 'asc' },
      }),
      prisma.employeeTaxProfile.findMany({
        where: { organizationId, fyStart },
        include: { lines: true, _count: { select: { proofs: true } } },
      }),
      declarationItemsFor(organizationId),
      yearControlFor(organizationId, fyStart),
      prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} }),
    ]);
    const byPerson = new Map(profiles.map(p => [p.personId, p]));
    res.json({
      fyStart, financialYear: financialYearFor(fyStart).label, financialYears: yearOptions(),
      control, defaultTaxRegime: settings.defaultTaxRegime,
      rows: people.map(person => {
        const p = byPerson.get(person.id);
        const declared = p ? declarationTotals(p.lines, items, false) : { section80C: 0, otherDeductions: 0 };
        const approved = p ? declarationTotals(p.lines, items, true) : { section80C: 0, otherDeductions: 0 };
        return {
          person,
          regime: p?.regime || settings.defaultTaxRegime, regimeIsDefault: !p?.regime,
          declared: declared.section80C + declared.otherDeductions,
          approved: approved.section80C + approved.otherDeductions,
          rent: p?.annualRentPaid || 0,
          housingLoanInterest: p?.housingLoanInterest || 0,
          proofs: p?._count.proofs || 0,
          poiConsidered: p?.poiConsidered || false,
          submittedAt: p?.submittedAt || null,
        };
      }),
    });
  },

  async updateControl(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.body.fyStart);
    const before = await yearControlFor(organizationId, fyStart);
    const data: any = {};
    for (const f of ['declarationOpen', 'proofOpen', 'employeeCanChooseRegime', 'employeeTaxEstimate']) {
      if (req.body[f] !== undefined) data[f] = Boolean(req.body[f]);
    }
    const today = todayIST();
    // The date the window closes by itself: today or later, while it is open
    if (req.body.declarationLockOn !== undefined) {
      const date = str(req.body.declarationLockOn);
      if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)))) throw new AppError(400, 'Enter a valid date');
      if (date && date < today) throw new AppError(400, 'The closing date must be today or later');
      data.declarationLockOn = date || null;
    }
    // The month proof submission opens by itself
    if (req.body.proofOpenFrom !== undefined) {
      const month = str(req.body.proofOpenFrom);
      if (month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new AppError(400, 'Pick a valid month');
      if (month && month <= today.slice(0, 7)) throw new AppError(400, 'Pick a month still to come, or open proof submission now');
      data.proofOpenFrom = month || null;
    }
    const after = { ...before, ...data };
    if (after.declarationLockOn && !after.declarationOpen) throw new AppError(400, 'Open the declaration window before giving it a closing date');
    if (after.proofOpenFrom && after.proofOpen) throw new AppError(400, 'Proof submission is already open');
    const control = await prisma.taxYearControl.update({
      where: { organizationId_fyStart: { organizationId, fyStart } }, data,
    });
    const label = `FY ${financialYearFor(fyStart).label}`;
    await logPayrollAudit(req, diffFields(before, control, ['declarationOpen', 'proofOpen', 'employeeCanChooseRegime', 'employeeTaxEstimate', 'declarationLockOn', 'proofOpenFrom'])
      .map(c => ({ action: 'DECLARATION_WINDOW_CHANGED' as const, field: `${label} · ${c.field}`, oldValue: c.oldValue, newValue: c.newValue })));
    res.json(control);
  },

  // ---- One employee -----------------------------------------------------------
  async getDeclaration(req: any, res: Response) {
    const d = await loadDeclaration(req.user?.organizationId, req.params.personId, fyInput(req.query.fy));
    res.json({ ...d, financialYears: yearOptions() });
  },

  async saveDeclaration(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.body.fyStart);
    await saveDeclaration(organizationId, req.params.personId, fyStart, req.body, { bySelf: false });
    const d = await loadDeclaration(organizationId, req.params.personId, fyStart);
    await logPayrollAudit(req, [{
      action: 'DECLARATION_SAVED', personId: d.person.id, personName: d.person.name,
      field: `FY ${d.financialYear}`, newValue: `${regimeLabel(d.regime)}; 80C ${d.totals.section80C}, other ${d.totals.otherDeductions}, rent ${d.profile.annualRentPaid}`,
    }]);
    res.json({ ...d, financialYears: yearOptions() });
  },

  async saveApproval(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.body.fyStart);
    await saveApproval(organizationId, req.params.personId, fyStart, req.body);
    const d = await loadDeclaration(organizationId, req.params.personId, fyStart);
    await logPayrollAudit(req, [{
      action: 'DECLARATION_APPROVED', personId: d.person.id, personName: d.person.name,
      field: `FY ${d.financialYear}`,
      newValue: `${d.profile.poiConsidered ? 'Tax uses approved amounts' : 'Tax uses declared amounts'}; 80C ${d.totals.section80C}, other ${d.totals.otherDeductions}`,
    }]);
    res.json({ ...d, financialYears: yearOptions() });
  },

  async addProof(req: any, res: Response) {
    const proof = await addProof(req.user?.organizationId, req.params.personId, fyInput(req.body.fyStart), req.body, {
      bySelf: false, uploadedBy: await actorName(req.user?.userId),
    });
    res.status(201).json(proof);
  },

  async getProof(req: any, res: Response) {
    const proof = await fetchProof(req.user?.organizationId, req.params.proofId);
    res.json({ fileName: proof.fileName, fileData: proof.fileData });
  },

  async deleteProof(req: any, res: Response) {
    await removeProof(req.user?.organizationId, req.params.proofId, { bySelf: false });
    res.json({ message: 'Proof removed' });
  },

  // ---- Reports ----------------------------------------------------------------
  async form12bb(req: any, res: Response) {
    res.json(await buildForm12bb(req.user?.organizationId, str(req.query.personId), fyInput(req.query.fy)));
  },

  // Every employee's declaration for the year: regime, rent and landlord,
  // deductions declared against approved, other income, previous employer.
  async declarationsReport(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const fyStart = fyInput(req.query.fy);
    const fy = financialYearFor(fyStart);
    const [profiles, items, settings] = await Promise.all([
      prisma.employeeTaxProfile.findMany({
        where: { organizationId, fyStart },
        include: { lines: true, person: { select: { name: true, employeeNo: true } }, _count: { select: { proofs: true } } },
      }),
      declarationItemsFor(organizationId),
      prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} }),
    ]);
    // Opening a declaration creates an empty one; only those with something on them are listed
    const filled = profiles.filter(p => p.regime || p.lines.length || p._count.proofs || p.annualRentPaid
      || p.housingLoanInterest || p.otherIncome || p.prevEmployerIncome || p.prevEmployerTds);
    const rows = filled.sort((a, b) => a.person.name.localeCompare(b.person.name)).map(p => ({
      p, declared: declarationTotals(p.lines, items, false), approved: declarationTotals(p.lines, items, true),
    }));
    const sum = (f: (r: typeof rows[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
    const body = rows.map(({ p, declared, approved }, i) => `<tr>
      <td>${i + 1}</td><td class="nw">${esc(p.person.employeeNo)}</td><td class="nw">${esc(p.person.name)}</td>
      <td class="nw">${esc(regimeLabel(p.regime || settings.defaultTaxRegime))}${p.regime ? '' : ' <span class="muted">(default)</span>'}</td>
      <td class="amt">${amt(declared.section80C)}</td><td class="amt">${amt(approved.section80C)}</td>
      <td class="amt">${amt(declared.otherDeductions)}</td><td class="amt">${amt(approved.otherDeductions)}</td>
      <td class="amt">${amt(p.annualRentPaid)}</td>
      <td>${esc(p.landlordName) || '<span class="muted">—</span>'}${p.landlordPan ? `<div class="muted" style="font-size:10.5px;">${esc(p.landlordPan)}</div>` : ''}</td>
      <td class="amt">${amt(p.housingLoanInterest)}</td><td class="amt">${amt(p.otherIncome)}</td>
      <td class="amt">${amt(p.prevEmployerIncome)}</td><td class="amt">${amt(p.prevEmployerTds)}</td>
      <td class="ctr">${p._count.proofs || '—'}</td><td class="ctr">${p.poiConsidered ? 'Approved' : 'Declared'}</td></tr>`).join('');
    const html = reportShell(await orgBrand(organizationId), 'Income Tax Declarations', `FY ${fy.label}`, `
  <table class="st-table">
    <tr><th>#</th><th>Code</th><th>Employee</th><th>Regime</th>
      <th class="amt">80C declared</th><th class="amt">80C approved</th><th class="amt">Other declared</th><th class="amt">Other approved</th>
      <th class="amt">Rent</th><th>Landlord</th><th class="amt">Housing interest</th><th class="amt">Other income</th>
      <th class="amt">Prev. employer income</th><th class="amt">Prev. employer tax</th><th class="ctr">Proofs</th><th class="ctr">Tax uses</th></tr>
    ${body || `<tr><td colspan="16">No declarations for FY ${fy.label}.</td></tr>`}
    <tr class="tot"><td colspan="4">Total (${rows.length} employees)</td>
      <td class="amt">${amt(sum(r => r.declared.section80C))}</td><td class="amt">${amt(sum(r => r.approved.section80C))}</td>
      <td class="amt">${amt(sum(r => r.declared.otherDeductions))}</td><td class="amt">${amt(sum(r => r.approved.otherDeductions))}</td>
      <td class="amt">${amt(sum(r => r.p.annualRentPaid))}</td><td></td>
      <td class="amt">${amt(sum(r => r.p.housingLoanInterest))}</td><td class="amt">${amt(sum(r => r.p.otherIncome))}</td>
      <td class="amt">${amt(sum(r => r.p.prevEmployerIncome))}</td><td class="amt">${amt(sum(r => r.p.prevEmployerTds))}</td><td colspan="2"></td></tr>
  </table>
  <p style="font-size:11.5px;color:#6b7280;">80C amounts are after each item's own limit and before the overall Section 80C limit, which the tax computation applies together with PF. Old-regime reliefs have no effect for employees on the new regime.</p>`);
    res.json({ html, title: `Income Tax Declarations — FY ${fy.label}` });
  },
};
