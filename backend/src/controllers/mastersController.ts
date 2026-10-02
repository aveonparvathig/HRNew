import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { loadActor } from '../middleware/roles';
import { logPayrollAudit } from '../services/payroll/audit';
import {
  LIST_TYPES, STATES, cleanIfsc, isValidIfsc, labelKey, listType,
} from '../services/masters';
import {
  addListValue, deleteListValue, ensureListValues, listValuesFor, updateListValue, usageOf,
} from '../services/listValues';
import { DEFAULT_EMPLOYEE_SERIES, SERIES, formatNumber, isSeriesKey, seriesInput } from '../services/payroll/numberSeriesCalc';
import { nextEmployeeCode } from '../services/numberSeries';
import { todayIST } from '../services/payroll/loanLedger';

const str = (v: any) => String(v ?? '').trim();

// A series as the screen shows it: what is set, and the number it gives next
async function seriesList(organizationId: string) {
  const rows = await prisma.numberSeries.findMany({ where: { organizationId } });
  const today = todayIST();
  return Promise.all(SERIES.map(async s => {
    const row = rows.find(r => r.key === s.key);
    return {
      ...s, configured: Boolean(row),
      prefix: row?.prefix ?? (s.key === 'EMPLOYEE_CODE' ? DEFAULT_EMPLOYEE_SERIES.prefix : ''),
      suffix: row?.suffix ?? '', padding: row?.padding ?? DEFAULT_EMPLOYEE_SERIES.padding, nextNumber: row?.nextNumber ?? 1,
      // Employee codes skip any code already in use
      next: s.key === 'EMPLOYEE_CODE' ? await nextEmployeeCode(organizationId) : row ? formatNumber(row, row.nextNumber, today) : '',
    };
  }));
}

// An account number is shown in the audit log by its last four digits
const maskAccount = (number: string) => (number.length > 4 ? `…${number.slice(-4)}` : number);

const accountJSON = (a: any) => ({
  id: a.id, label: a.label, bankName: a.bankName, branch: a.branch,
  accountNumber: a.accountNumber, ifsc: a.ifsc, isDefault: a.isDefault, isActive: a.isActive,
  batchCount: a._count?.batches ?? 0,
});

const accountName = (a: any) => `${a.label || a.bankName} ${maskAccount(a.accountNumber)}`;

function accountInput(b: any) {
  const bankName = str(b.bankName);
  const accountNumber = str(b.accountNumber).replace(/\s+/g, '');
  if (!bankName) throw new AppError(400, 'Pick the bank');
  if (!/^[0-9A-Za-z]{6,34}$/.test(accountNumber)) throw new AppError(400, 'Enter the account number: 6 to 34 letters and digits, no spaces');
  const ifsc = cleanIfsc(b.ifsc);
  if (ifsc && !isValidIfsc(ifsc)) throw new AppError(400, 'IFSC must look like HDFC0001234: four letters, a zero, six characters');
  return { label: str(b.label), bankName, branch: str(b.branch), accountNumber, ifsc };
}

async function fetchAccount(id: string, organizationId: string) {
  const account = await prisma.companyBankAccount.findFirst({
    where: { id, organizationId }, include: { _count: { select: { batches: true } } },
  });
  if (!account) throw new AppError(404, 'Bank account not found');
  return account;
}

// There is always exactly one default among the active accounts, if any.
async function settleDefault(organizationId: string, preferId?: string) {
  const accounts = await prisma.companyBankAccount.findMany({
    where: { organizationId, isActive: true }, orderBy: { createdAt: 'asc' },
  });
  const chosen = accounts.find(a => a.id === preferId) || accounts.find(a => a.isDefault) || accounts[0];
  await prisma.companyBankAccount.updateMany({
    where: { organizationId, isDefault: true, ...(chosen ? { id: { not: chosen.id } } : {}) }, data: { isDefault: false },
  });
  if (chosen && !chosen.isDefault) {
    await prisma.companyBankAccount.update({ where: { id: chosen.id }, data: { isDefault: true } });
  }
}

export const mastersController = {
  // ---- Value lists ---------------------------------------------------------
  // Everyone signed in may read the lists (forms pick from them); the
  // count of people on each value is for those who manage them.
  async getLists(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const actor = await loadActor(req);
    const manage = ['SUPER_ADMIN', 'HR'].includes(actor.role);
    const lists = await listValuesFor(organizationId);
    const out: any[] = [];
    for (const t of LIST_TYPES) {
      const usage = manage ? await usageOf(organizationId, t.type) : new Map<string, number>();
      out.push({
        type: t.type, label: t.label, usedFor: t.usedFor,
        values: lists[t.type]
          .filter(v => manage || v.isActive)
          .map(v => ({ id: v.id, label: v.label, isActive: v.isActive, sortOrder: v.sortOrder, inUse: usage.get(labelKey(v.label)) || 0 })),
      });
    }
    res.json({ lists: out, states: STATES, canManage: manage });
  },

  async createListValue(req: any, res: Response) {
    const type = str(req.params.type);
    const value = await addListValue(req.user?.organizationId, type, req.body.label);
    await logPayrollAudit(req, [{ action: 'LIST_VALUE_SAVED', field: listType(type)?.label || type, newValue: value.label }]);
    res.status(201).json(value);
  },

  async updateListValue(req: any, res: Response) {
    const result = await updateListValue(req.user?.organizationId, req.params.valueId, req.body);
    const list = listType(result.value.listType)?.label || result.value.listType;
    if (result.merged) {
      await logPayrollAudit(req, [{
        action: 'LIST_VALUE_SAVED', field: list, oldValue: result.from,
        newValue: `Merged into ${result.value.label} (${result.moved} ${result.moved === 1 ? 'record' : 'records'})`,
      }]);
    } else if (result.from !== result.value.label) {
      await logPayrollAudit(req, [{ action: 'LIST_VALUE_SAVED', field: list, oldValue: result.from, newValue: result.value.label }]);
    } else if (req.body.isActive !== undefined) {
      await logPayrollAudit(req, [{
        action: 'LIST_VALUE_SAVED', field: list, oldValue: result.value.label,
        newValue: result.value.isActive ? 'Switched on' : 'Switched off',
      }]);
    }
    res.json({
      ...result,
      message: result.merged
        ? `"${result.from}" merged into "${result.value.label}". ${result.moved} ${result.moved === 1 ? 'record' : 'records'} moved.`
        : result.moved > 0 ? `Renamed on ${result.moved} ${result.moved === 1 ? 'record' : 'records'} too.` : 'Saved.',
    });
  },

  async deleteListValue(req: any, res: Response) {
    const value = await deleteListValue(req.user?.organizationId, req.params.valueId);
    await logPayrollAudit(req, [{ action: 'LIST_VALUE_DELETED', field: listType(value.listType)?.label || value.listType, oldValue: value.label }]);
    res.json({ message: `Deleted "${value.label}"` });
  },

  // ---- Company bank accounts ------------------------------------------------
  async getBankAccounts(req: any, res: Response) {
    const accounts = await prisma.companyBankAccount.findMany({
      where: { organizationId: req.user?.organizationId },
      include: { _count: { select: { batches: true } } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ accounts: accounts.map(accountJSON) });
  },

  async createBankAccount(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const input = accountInput(req.body);
    const dup = await prisma.companyBankAccount.findFirst({ where: { organizationId, accountNumber: input.accountNumber } });
    if (dup) throw new AppError(400, 'An account with this number is already listed');
    const account = await prisma.companyBankAccount.create({ data: { organizationId, ...input } });
    await settleDefault(organizationId, req.body.isDefault ? account.id : undefined);
    await ensureListValues(organizationId, { BANK: input.bankName });
    await logPayrollAudit(req, [{ action: 'BANK_ACCOUNT_SAVED', field: accountName(account), newValue: 'Added' }]);
    res.status(201).json(accountJSON(await fetchAccount(account.id, organizationId)));
  },

  async updateBankAccount(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const before = await fetchAccount(req.params.accountId, organizationId);
    const input = accountInput({ ...before, ...req.body });
    const dup = await prisma.companyBankAccount.findFirst({
      where: { organizationId, accountNumber: input.accountNumber, id: { not: before.id } },
    });
    if (dup) throw new AppError(400, 'An account with this number is already listed');
    const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : before.isActive;
    await prisma.companyBankAccount.update({ where: { id: before.id }, data: { ...input, isActive } });
    await settleDefault(organizationId, req.body.isDefault && isActive ? before.id : undefined);
    await ensureListValues(organizationId, { BANK: input.bankName });
    const after = await fetchAccount(before.id, organizationId);
    const changed = (['label', 'bankName', 'branch', 'ifsc'] as const).filter(f => before[f] !== after[f]).map(f => f as string);
    if (before.accountNumber !== after.accountNumber) changed.push('account number');
    if (before.isActive !== after.isActive) changed.push(after.isActive ? 'switched on' : 'switched off');
    if (!before.isDefault && after.isDefault) changed.push('made the default');
    if (changed.length) {
      await logPayrollAudit(req, [{ action: 'BANK_ACCOUNT_SAVED', field: accountName(after), newValue: `Changed: ${changed.join(', ')}` }]);
    }
    res.json(accountJSON(after));
  },

  // An account that payment batches were paid from stays on record; it
  // can be switched off instead.
  async deleteBankAccount(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const account = await fetchAccount(req.params.accountId, organizationId);
    if (account._count.batches > 0) {
      throw new AppError(400, `${account._count.batches} payment ${account._count.batches === 1 ? 'batch was' : 'batches were'} paid from this account. Switch it off instead of deleting it.`);
    }
    await prisma.companyBankAccount.delete({ where: { id: account.id } });
    await settleDefault(organizationId);
    await logPayrollAudit(req, [{ action: 'BANK_ACCOUNT_DELETED', field: accountName(account) }]);
    res.json({ message: 'Account deleted' });
  },

  // ---- Number series: employee codes, letters, settlements, payment batches ------------
  async getNumberSeries(req: any, res: Response) {
    res.json({ series: await seriesList(req.user?.organizationId) });
  },

  async updateNumberSeries(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const key = str(req.params.key);
    if (!isSeriesKey(key)) throw new AppError(404, 'Unknown number series');
    const input = seriesInput(req.body);
    if (typeof input === 'string') throw new AppError(400, input);
    const today = todayIST();
    const before = await prisma.numberSeries.findUnique({ where: { organizationId_key: { organizationId, key } } });
    const saved = await prisma.numberSeries.upsert({
      where: { organizationId_key: { organizationId, key } }, create: { organizationId, key, ...input }, update: input,
    });
    const label = SERIES.find(s => s.key === key)!.label;
    await logPayrollAudit(req, [{
      action: 'NUMBER_SERIES_SAVED', field: label,
      oldValue: before ? formatNumber(before, before.nextNumber, today) : 'Not set', newValue: `Next: ${formatNumber(saved, saved.nextNumber, today)}`,
    }]);
    res.json({ series: await seriesList(organizationId) });
  },

  // Back to no series: employee codes return to EMP-0001 onward, the
  // others are no longer numbered.
  async deleteNumberSeries(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const key = str(req.params.key);
    if (!isSeriesKey(key)) throw new AppError(404, 'Unknown number series');
    const before = await prisma.numberSeries.findUnique({ where: { organizationId_key: { organizationId, key } } });
    if (before) {
      await prisma.numberSeries.delete({ where: { organizationId_key: { organizationId, key } } });
      await logPayrollAudit(req, [{
        action: 'NUMBER_SERIES_SAVED', field: SERIES.find(s => s.key === key)!.label,
        oldValue: formatNumber(before, before.nextNumber, todayIST()), newValue: 'Not set',
      }]);
    }
    res.json({ series: await seriesList(organizationId) });
  },
};
