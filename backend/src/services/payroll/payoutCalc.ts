// Run workflow, payout and control rules. Pure, DB-independent: callers
// pass runs, entries (with their person) and settings.
import { allColumns, columnTotal } from './lines';

const r2 = (n: number) => Math.round(n * 100) / 100;
const inr = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const PAYMENT_MODES = [
  { value: 'BANK', label: 'Bank transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CASH', label: 'Cash' },
];
export const modeLabel = (mode: string) => PAYMENT_MODES.find(m => m.value === mode)?.label || mode;

// What is actually handed over: net salary plus any expense claims paid with it.
export const payAmount = (entry: any) => r2(Number(entry.netPayable || 0) + Number(entry.reimbursement || 0));

// An entry's payment mode: fixed once it is in a batch, else the employee's.
export const paymentModeOf = (entry: any): string =>
  entry.payoutBatch?.mode || entry.person?.paymentMode || 'BANK';

export const hasBankDetails = (person: any) =>
  Boolean(String(person?.bankAccountNumber || '').trim() && String(person?.ifscCode || '').trim());

// Salaries that can be marked as paid outside the system: something to
// pay, not held, not paid, and not sitting in a payment batch.
export const payableOutside = (entries: any[]) =>
  entries.filter(e => !e.paidOn && e.payStatus !== 'HOLD' && !e.payoutBatchId && payAmount(e) > 0);

// Salaries already marked that way: paid, with no batch behind the payment.
export const paidOutside = (entries: any[]) => entries.filter(e => e.paidOn && !e.payoutBatchId);

// The date offered for a month paid outside the system: the month's last
// day once the month is over, today while it is still running.
export function outsidePayDate(period: string, today: string): string {
  const [y, m] = period.split('-').map(Number);
  const last = `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
  return last < today ? last : today;
}

// ---------------------------------------------------------------------------
// Stage of a run
// ---------------------------------------------------------------------------
export type RunStageKey = 'INPUTS_OPEN' | 'INPUTS_LOCKED' | 'FINALIZED' | 'RELEASED' | 'PAID';

export interface RunStage {
  key: RunStageKey;
  label: string;
  inputsLocked: boolean;
  finalized: boolean;
  released: boolean;
  paid: boolean;          // every salary that should be paid has been
  payable: number;        // entries to pay (not held, something to pay)
  paidCount: number;
  heldCount: number;
}

// Inputs open → inputs locked → payroll locked (finalized) → payslips
// released → paid. Releasing and paying can happen in either order; the
// stage shown is the furthest one reached.
export function runStage(run: any, entries: any[]): RunStage {
  const finalized = run.status === 'FINALIZED';
  const inputsLocked = finalized || Boolean(run.inputsLockedAt);
  const released = finalized && Boolean(run.releasedAt);
  const held = entries.filter(e => e.payStatus === 'HOLD');
  const toPay = entries.filter(e => e.payStatus !== 'HOLD' && payAmount(e) > 0);
  const paidCount = toPay.filter(e => e.paidOn).length;
  const paid = finalized && toPay.length > 0 && paidCount === toPay.length;
  const key: RunStageKey = paid ? 'PAID' : released ? 'RELEASED' : finalized ? 'FINALIZED'
    : inputsLocked ? 'INPUTS_LOCKED' : 'INPUTS_OPEN';
  const label = {
    INPUTS_OPEN: 'Inputs open', INPUTS_LOCKED: 'Inputs locked', FINALIZED: 'Payroll locked',
    RELEASED: 'Payslips released', PAID: 'Paid',
  }[key];
  return { key, label, inputsLocked, finalized, released, paid, payable: toPay.length, paidCount, heldCount: held.length };
}

// ---------------------------------------------------------------------------
// Automatic input cutoff
// ---------------------------------------------------------------------------
// The last day a month's inputs stay open: day `day` of the month itself,
// or the month's last day where it is shorter. Null when the cutoff is off.
export function cutoffDate(period: string, day: number): string | null {
  if (!(day > 0)) return null;
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${period}-${String(Math.min(Math.round(day), last)).padStart(2, '0')}`;
}

// What the cutoff asks of a draft run today. A run made after its own
// cutoff date (a month run late) is left open: MISSED, not LOCK.
export function cutoffDue(period: string, day: number, today: string, createdOn: string): 'OFF' | 'WAIT' | 'LOCK' | 'MISSED' {
  const date = cutoffDate(period, day);
  if (!date) return 'OFF';
  if (today <= date) return 'WAIT';
  return createdOn > date ? 'MISSED' : 'LOCK';
}

// ---------------------------------------------------------------------------
// Pre-payroll checks
// ---------------------------------------------------------------------------
export interface PayrollCheck {
  entryId: string;
  personName: string;
  code: 'NEGATIVE_NET' | 'NO_BANK_ACCOUNT' | 'NO_PAN' | 'LEFT_EARLIER' | 'LEFT_FULL_PAY'
    | 'JOINED_FULL_PAY' | 'NOT_IN_RUN' | 'SALARY_STOPPED' | 'SALARY_HELD';
  message: string;
  blocking?: boolean; // the run cannot be finalized until this is dealt with
}

const periodBounds = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${period}-01`, last: `${period}-${String(last).padStart(2, '0')}` };
};
const dateLabel = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export interface PrePayrollInput {
  period: string;
  entries: any[];              // with person: name, paymentMode, bank fields, panNumber, joinDate, leavingDate
  missing: { id: string; name: string }[];   // active, not stopped, but not in the run
  stopped: { id: string; name: string; salaryStopReason?: string }[];
  tdsComputed: boolean;        // payroll computes TDS, so PAN matters
  validPan: (pan: string) => boolean;
}

// What to look at before locking a month's payroll. Only negative net pay
// blocks; the rest are for HR to judge.
export function prePayrollChecks(inp: PrePayrollInput): PayrollCheck[] {
  const { first, last } = periodBounds(inp.period);
  const checks: PayrollCheck[] = [];
  for (const e of inp.entries) {
    const p = e.person || {};
    const base = { entryId: e.id, personName: p.name || '' };
    if (e.netPayable < 0) {
      checks.push({
        ...base, code: 'NEGATIVE_NET', blocking: true,
        message: `Net pay is ${inr(e.netPayable)}: deductions exceed earnings. Reduce a deduction or move it to a later month.`,
      });
    }
    if (e.payStatus === 'HOLD') {
      checks.push({ ...base, code: 'SALARY_HELD', message: `Salary is on hold${e.holdReason ? `: ${e.holdReason}` : ''}. It is computed but will not be paid.` });
    }
    if (payAmount(e) > 0 && (p.paymentMode || 'BANK') === 'BANK' && !hasBankDetails(p)) {
      checks.push({ ...base, code: 'NO_BANK_ACCOUNT', message: 'Paid by bank transfer but the account number or IFSC is missing.' });
    }
    if ((inp.tdsComputed || e.tds > 0) && !inp.validPan(p.panNumber || '')) {
      checks.push({ ...base, code: 'NO_PAN', message: 'No valid PAN on record. Tax is deducted at the higher rate without one.' });
    }
    const fullPay = e.payDays >= e.totalWorkingDays;
    if (p.leavingDate && p.leavingDate < first) {
      checks.push({ ...base, code: 'LEFT_EARLIER', message: `Left on ${dateLabel(p.leavingDate)}, before this month, but is in the run.` });
    } else if (p.leavingDate && p.leavingDate < last && fullPay) {
      checks.push({ ...base, code: 'LEFT_FULL_PAY', message: `Leaves on ${dateLabel(p.leavingDate)} but is paid for the full month.` });
    }
    if (p.joinDate && p.joinDate > first && p.joinDate <= last && fullPay) {
      checks.push({ ...base, code: 'JOINED_FULL_PAY', message: `Joined on ${dateLabel(p.joinDate)} but is paid for the full month.` });
    }
  }
  for (const p of inp.missing) {
    checks.push({ entryId: '', personName: p.name, code: 'NOT_IN_RUN', message: 'Active employee who is not in this run. Recalculate to add them.' });
  }
  for (const p of inp.stopped) {
    checks.push({
      entryId: '', personName: p.name, code: 'SALARY_STOPPED',
      message: `Salary is stopped${p.salaryStopReason ? `: ${p.salaryStopReason}` : ''}. Left out of payroll.`,
    });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Bank transfer file
// ---------------------------------------------------------------------------
const csvCell = (v: any) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// A plain transfer list every bank's bulk-upload template can be filled
// from: one row per employee, amount to two decimals. The account number
// is written as text so spreadsheets keep its leading zeros.
export function bankFileCsv(entries: any[], narration: string): string {
  const rows = [['Sl No', 'Employee Code', 'Beneficiary Name', 'Account Number', 'IFSC', 'Bank', 'Amount', 'Narration']];
  entries.forEach((e, i) => {
    const p = e.person || {};
    rows.push([
      String(i + 1), p.employeeNo || '', p.name || '', `'${String(p.bankAccountNumber || '').trim()}`,
      String(p.ifscCode || '').trim().toUpperCase(), p.bankName || '', payAmount(e).toFixed(2), narration,
    ]);
  });
  return rows.map(r => r.map(csvCell).join(',')).join('\n');
}

// ---------------------------------------------------------------------------
// Journal voucher
// ---------------------------------------------------------------------------
export interface JvAccount {
  key: string;
  label: string;        // what the amount is
  side: 'DEBIT' | 'CREDIT';
  defaultLedger: string;
}

const CONTROL_ACCOUNTS: JvAccount[] = [
  { key: 'esiEmployer', label: 'ESI — employer contribution', side: 'DEBIT', defaultLedger: 'ESI Employer Contribution' },
  { key: 'pfEmployer', label: 'PF — employer contribution', side: 'DEBIT', defaultLedger: 'PF Employer Contribution' },
  { key: 'lwfEmployer', label: 'LWF — employer contribution', side: 'DEBIT', defaultLedger: 'LWF Employer Contribution' },
  { key: 'npsEmployer', label: 'NPS — employer contribution', side: 'DEBIT', defaultLedger: 'NPS Employer Contribution' },
  { key: 'reimbursement', label: 'Expense claims paid with salary', side: 'DEBIT', defaultLedger: 'Staff Expense Reimbursements' },
  { key: 'esiPayable', label: 'ESI payable (employee + employer)', side: 'CREDIT', defaultLedger: 'ESI Payable' },
  { key: 'pfPayable', label: 'PF payable (employee + employer)', side: 'CREDIT', defaultLedger: 'PF Payable' },
  { key: 'lwfPayable', label: 'LWF payable (employee + employer)', side: 'CREDIT', defaultLedger: 'LWF Payable' },
  { key: 'npsPayable', label: 'NPS payable (employer contribution)', side: 'CREDIT', defaultLedger: 'NPS Payable' },
  { key: 'tds', label: 'TDS deducted', side: 'CREDIT', defaultLedger: 'TDS Payable' },
  { key: 'professionalTax', label: 'Professional Tax deducted', side: 'CREDIT', defaultLedger: 'Professional Tax Payable' },
  { key: 'salaryAdvance', label: 'Salary advance recovered', side: 'CREDIT', defaultLedger: 'Salary Advances' },
  { key: 'loanDeduction', label: 'Loan instalments recovered', side: 'CREDIT', defaultLedger: 'Staff Loans' },
  { key: 'netPayable', label: 'Net salary and claims payable', side: 'CREDIT', defaultLedger: 'Salaries Payable' },
];
// Deductions that are posted through a combined control account above
const COMBINED = new Set(['esiEmployee', 'pfEmployee', 'lwfEmployee']);

// Every account the voucher can post to for these entries: one per
// earning (salary expense), catalogue deductions, and the control accounts.
export function jvAccounts(entries: any[]): JvAccount[] {
  const columns = allColumns(entries);
  const earnings: JvAccount[] = columns.filter(c => c.group === 'EARNING')
    .map(c => ({ key: c.key, label: c.label, side: 'DEBIT', defaultLedger: 'Salaries and Wages' }));
  const lineDeductions: JvAccount[] = columns.filter(c => c.group === 'DEDUCTION' && c.key.startsWith('c:'))
    .map(c => ({ key: c.key, label: c.label, side: 'CREDIT', defaultLedger: 'Other Payroll Deductions' }));
  const control = (side: string) => CONTROL_ACCOUNTS.filter(a => a.side === side);
  return [...earnings, ...control('DEBIT'), ...lineDeductions, ...control('CREDIT')];
}

function jvAmount(entries: any[], key: string): number {
  const sum = (f: string) => r2(entries.reduce((s, e) => s + Number(e[f] || 0), 0));
  switch (key) {
    case 'esiPayable': return r2(sum('esiEmployee') + sum('esiEmployer'));
    case 'pfPayable': return r2(sum('pfEmployee') + sum('pfEmployer'));
    case 'lwfPayable': return r2(sum('lwfEmployee') + sum('lwfEmployer'));
    case 'npsPayable': return sum('npsEmployer');
    case 'netPayable': return r2(sum('netPayable') + sum('reimbursement'));
    case 'reimbursement': return sum('reimbursement');
    default: return columnTotal(entries, key);
  }
}

export interface JvLine {
  ledger: string;
  debit: number;
  credit: number;
  detail: string; // what was added up into the ledger
}

// The month's payroll as one balanced journal voucher. Amounts mapped to
// the same ledger are merged. Any paise left by rounding goes to a
// "Rounding Off" line so the voucher always balances.
export function journalVoucher(entries: any[], mapping: Record<string, string> = {}) {
  const byLedger = new Map<string, JvLine & { parts: string[] }>();
  for (const account of jvAccounts(entries)) {
    if (COMBINED.has(account.key)) continue;
    const amount = jvAmount(entries, account.key);
    if (!amount) continue;
    const ledger = (mapping[account.key] || '').trim() || account.defaultLedger;
    const id = `${account.side}:${ledger.toLowerCase()}`;
    const line = byLedger.get(id) || { ledger, debit: 0, credit: 0, detail: '', parts: [] };
    if (account.side === 'DEBIT') line.debit = r2(line.debit + amount);
    else line.credit = r2(line.credit + amount);
    line.parts.push(account.label);
    byLedger.set(id, line);
  }
  const lines: JvLine[] = [...byLedger.values()].map(({ parts, ...l }) => ({ ...l, detail: parts.join(', ') }));
  let totalDebit = r2(lines.reduce((s, l) => s + l.debit, 0));
  let totalCredit = r2(lines.reduce((s, l) => s + l.credit, 0));
  const gap = r2(totalDebit - totalCredit);
  if (gap !== 0) {
    lines.push({ ledger: 'Rounding Off', debit: gap < 0 ? -gap : 0, credit: gap > 0 ? gap : 0, detail: 'Difference from rounding' });
    totalDebit = r2(totalDebit + (gap < 0 ? -gap : 0));
    totalCredit = r2(totalCredit + (gap > 0 ? gap : 0));
  }
  return {
    lines: [...lines.filter(l => l.debit), ...lines.filter(l => !l.debit)],
    totalDebit, totalCredit,
  };
}

// How the journal voucher can be split
export const JV_SPLITS = [
  { value: '', label: 'One voucher for the company' },
  { value: 'DEPARTMENT', label: 'One voucher for each department' },
  { value: 'LOCATION', label: 'One voucher for each work location' },
];
export const isJvSplit = (value: any) => JV_SPLITS.some(s => s.value === value);
export const NO_GROUP = 'Not assigned';

// The department or work location an entry belongs to.
export const jvGroupOf = (entry: any, dimension: string): string =>
  String((dimension === 'LOCATION' ? entry.person?.workLocation?.name : entry.person?.department) || '').trim() || NO_GROUP;

export interface LedgerOverrideLike {
  dimension: string;
  groupName: string;
  key: string;
  ledgerName: string;
}

// The payroll as one voucher per department or work location, each
// balanced on its own. A group posts to its own ledger where one is set
// for it, else to the company's mapping.
export function journalVoucherBy(
  entries: any[], mapping: Record<string, string>, dimension: string, overrides: LedgerOverrideLike[] = [],
) {
  const groups = new Map<string, any[]>();
  for (const e of entries) {
    const name = jvGroupOf(e, dimension);
    groups.set(name, [...(groups.get(name) || []), e]);
  }
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const vouchers = [...groups.entries()]
    .sort((a, b) => (a[0] === NO_GROUP ? 1 : b[0] === NO_GROUP ? -1 : a[0].localeCompare(b[0])))
    .map(([name, list]) => {
      const own = Object.fromEntries(overrides
        .filter(o => o.dimension === dimension && same(o.groupName, name) && o.ledgerName.trim())
        .map(o => [o.key, o.ledgerName]));
      return { name, employees: list.length, ...journalVoucher(list, { ...mapping, ...own }) };
    });
  return {
    vouchers,
    totalDebit: r2(vouchers.reduce((s, v) => s + v.totalDebit, 0)),
    totalCredit: r2(vouchers.reduce((s, v) => s + v.totalCredit, 0)),
  };
}

// ---------------------------------------------------------------------------
// Month-on-month reconciliation
// ---------------------------------------------------------------------------
export interface ReconCause {
  cause: 'JOINERS' | 'LEAVERS' | 'REVISIONS' | 'ATTENDANCE' | 'OTHER';
  label: string;
  employees: number;
  gross: number;
  net: number;
  people: { name: string; gross: number; net: number; note: string }[];
}

const CAUSE_LABELS: Record<ReconCause['cause'], string> = {
  JOINERS: 'New in this month',
  LEAVERS: 'Not in this month',
  REVISIONS: 'Salary revisions',
  ATTENDANCE: 'Attendance (pay days and LOP)',
  OTHER: 'One-off earnings, deductions and statutory changes',
};

// Why this month's payroll differs from the previous one. Each employee's
// change is put under one cause: joined, left, package changed, pay days
// changed, or anything else.
export function payrollReconciliation(prev: any[], cur: any[]) {
  const prevBy = new Map(prev.map(e => [e.personId, e]));
  const curBy = new Map(cur.map(e => [e.personId, e]));
  const causes = new Map<ReconCause['cause'], ReconCause>();
  const add = (cause: ReconCause['cause'], name: string, gross: number, net: number, note: string) => {
    if (!gross && !net) return;
    const c = causes.get(cause) || { cause, label: CAUSE_LABELS[cause], employees: 0, gross: 0, net: 0, people: [] };
    c.employees += 1;
    c.gross = r2(c.gross + gross);
    c.net = r2(c.net + net);
    c.people.push({ name, gross: r2(gross), net: r2(net), note });
    causes.set(cause, c);
  };
  for (const e of cur) {
    const p = prevBy.get(e.personId);
    const name = e.person?.name || '';
    if (!p) { add('JOINERS', name, e.grossSalary, e.netPayable, 'not in the previous run'); continue; }
    const gross = e.grossSalary - p.grossSalary;
    const net = e.netPayable - p.netPayable;
    if (p.monthlyPackage !== e.monthlyPackage) {
      add('REVISIONS', name, gross, net, `package ${inr(p.monthlyPackage)} → ${inr(e.monthlyPackage)}`);
    } else if (p.payDays !== e.payDays || p.totalWorkingDays !== e.totalWorkingDays) {
      add('ATTENDANCE', name, gross, net, `pay days ${p.payDays}/${p.totalWorkingDays} → ${e.payDays}/${e.totalWorkingDays}`);
    } else {
      add('OTHER', name, gross, net, '');
    }
  }
  for (const p of prev) {
    if (!curBy.has(p.personId)) add('LEAVERS', p.person?.name || '', -p.grossSalary, -p.netPayable, 'was in the previous run');
  }
  const order: ReconCause['cause'][] = ['JOINERS', 'LEAVERS', 'REVISIONS', 'ATTENDANCE', 'OTHER'];
  const rows = order.map(c => causes.get(c)).filter(Boolean) as ReconCause[];
  for (const r of rows) r.people.sort((a, b) => a.name.localeCompare(b.name));
  const total = (list: any[], f: string) => r2(list.reduce((s, e) => s + Number(e[f] || 0), 0));

  // Component-wise movement
  const columns = allColumns([...prev, ...cur]).filter(c => c.group !== 'CTC');
  const components = columns
    .map(c => ({ key: c.key, label: c.label, group: c.group, previous: columnTotal(prev, c.key), current: columnTotal(cur, c.key) }))
    .map(c => ({ ...c, change: r2(c.current - c.previous) }))
    .filter(c => c.previous || c.current);

  return {
    causes: rows,
    previous: { employees: prev.length, gross: total(prev, 'grossSalary'), net: total(prev, 'netPayable') },
    current: { employees: cur.length, gross: total(cur, 'grossSalary'), net: total(cur, 'netPayable') },
    components,
  };
}

// Headcount movement between two runs.
export function headcountMovement(prev: any[], cur: any[]) {
  const prevIds = new Set(prev.map(e => e.personId));
  const curIds = new Set(cur.map(e => e.personId));
  const byName = (a: any, b: any) => (a.person?.name || '').localeCompare(b.person?.name || '');
  return {
    opening: prev.length,
    joiners: cur.filter(e => !prevIds.has(e.personId)).sort(byName),
    leavers: prev.filter(e => !curIds.has(e.personId)).sort(byName),
    closing: cur.length,
  };
}

// ---------------------------------------------------------------------------
// Anomalies and duplicates
// ---------------------------------------------------------------------------
export interface Anomaly {
  entryId: string;
  personName: string;
  employeeNo: string;
  kind: string;
  detail: string;
}

// Things worth a second look before a month is paid. `swingPercent` is the
// change in net pay against the previous run that counts as sudden.
export function payrollAnomalies(prev: any[], cur: any[], swingPercent = 25): Anomaly[] {
  const prevBy = new Map(prev.map(e => [e.personId, e]));
  const out: Anomaly[] = [];
  for (const e of [...cur].sort((a, b) => (a.person?.name || '').localeCompare(b.person?.name || ''))) {
    const p = e.person || {};
    const add = (kind: string, detail: string) =>
      out.push({ entryId: e.id, personName: p.name || '', employeeNo: p.employeeNo || '', kind, detail });
    if (e.netPayable < 0) add('Negative net pay', `Net pay ${inr(e.netPayable)}`);
    else if (e.netPayable === 0) add('Zero net pay', e.payDays === 0 ? 'No pay days' : `Gross ${inr(e.grossSalary)} fully deducted`);
    const before = prevBy.get(e.personId);
    if (before && before.netPayable > 0 && e.netPayable > 0) {
      const change = ((e.netPayable - before.netPayable) / before.netPayable) * 100;
      if (Math.abs(change) >= swingPercent) {
        add(change > 0 ? 'Sudden rise in net pay' : 'Sudden fall in net pay',
          `${inr(before.netPayable)} → ${inr(e.netPayable)} (${change > 0 ? '+' : '−'}${Math.abs(change).toFixed(0)}%)`);
      }
    }
    if (e.totalDeductions > e.grossSalary * 0.5 && e.grossSalary > 0 && e.netPayable >= 0) {
      add('Deductions above half of gross', `${inr(e.totalDeductions)} deducted from ${inr(e.grossSalary)}`);
    }
    if (e.pfEmployee > 0 && !String(p.pfUan || '').trim()) add('PF deducted without UAN', `PF ${inr(e.pfEmployee)}`);
    if (e.esiEmployee > 0 && !String(p.esiNumber || '').trim()) add('ESI deducted without ESI number', `ESI ${inr(e.esiEmployee)}`);
    if (e.lopDays > e.totalWorkingDays / 2) add('LOP above half the month', `${e.lopDays} of ${e.totalWorkingDays} days`);
  }
  return out;
}

export interface DuplicateGroup {
  value: string;
  people: { id: string; name: string; employeeNo: string }[];
}

// Employees sharing the same value of a field (bank account, PAN). Blank
// values are ignored; comparison ignores case, spaces and punctuation.
export function duplicateGroups(people: any[], field: string): DuplicateGroup[] {
  const groups = new Map<string, DuplicateGroup>();
  for (const p of people) {
    const raw = String(p[field] || '').trim();
    const key = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!key) continue;
    const g = groups.get(key) || { value: raw, people: [] };
    g.people.push({ id: p.id, name: p.name, employeeNo: p.employeeNo || '' });
    groups.set(key, g);
  }
  return [...groups.values()].filter(g => g.people.length > 1)
    .sort((a, b) => b.people.length - a.people.length || a.value.localeCompare(b.value));
}

// Next month's period and a sensible working-days default for it: the same
// as this run, unless this run used the full calendar month.
export function nextRunDefaults(period: string, standardDays: number) {
  const [y, m] = period.split('-').map(Number);
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
  const daysIn = (p: string) => { const [yy, mm] = p.split('-').map(Number); return new Date(Date.UTC(yy, mm, 0)).getUTCDate(); };
  const totalWorkingDays = standardDays === daysIn(period) ? daysIn(next) : Math.min(standardDays || 26, daysIn(next));
  return { period: next, totalWorkingDays };
}
