// Ordering, grouping and month-over-month change pills for a payroll run's
// salary register. Pure functions over the entries the run detail already
// holds, so the register re-sorts instantly and the logic is testable.

export type RegisterOrder = 'desig' | 'doj_desc' | 'doj_asc' | 'net_desc' | 'name';

export const REGISTER_ORDERS: { value: RegisterOrder; label: string }[] = [
  { value: 'desig', label: 'Designation, then joining date' },
  { value: 'doj_desc', label: 'Joining date (newest)' },
  { value: 'doj_asc', label: 'Joining date (oldest)' },
  { value: 'net_desc', label: 'Net payable (high to low)' },
  { value: 'name', label: 'Name A–Z' },
];

export interface EntryLike {
  id: string;
  personId?: string;
  person: { id?: string; name: string; employeeNo?: string | null; designation?: string | null; department?: string | null; joinDate?: string | null };
  monthlyPackage: number;
  grossSalary: number;
  netPayable: number;
  totalDeductions: number;
  lopDays?: number;
  salaryAdvance?: number;
  loanDeduction?: number;
  pfEmployee?: number;
  esiEmployee?: number;
  tds?: number;
  professionalTax?: number;
}

// The previous month's figures for one person, as the API sends them
export interface PrevEntryLike {
  personId: string;
  netPayable: number;
  grossSalary: number;
  monthlyPackage: number;
  lopDays?: number;
}

const personIdOf = (e: EntryLike) => e.personId || e.person.id || '';
const desigOf = (e: EntryLike) => (e.person.designation || '').trim();
const byName = (a: EntryLike, b: EntryLike) => a.person.name.localeCompare(b.person.name);

function byDoj(a: EntryLike, b: EntryLike, dir: 'asc' | 'desc') {
  const da = a.person.joinDate || '', db = b.person.joinDate || '';
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return dir === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
}

const byDesignation = (a: EntryLike, b: EntryLike) => {
  const da = desigOf(a), db = desigOf(b);
  if (!da && db) return 1;
  if (da && !db) return -1;
  return da.localeCompare(db) || byDoj(a, b, 'asc') || byName(a, b);
};

function comparatorFor(order: RegisterOrder) {
  switch (order) {
    case 'desig': return byDesignation;
    case 'doj_desc': return (a: EntryLike, b: EntryLike) => byDoj(a, b, 'desc') || byName(a, b);
    case 'doj_asc': return (a: EntryLike, b: EntryLike) => byDoj(a, b, 'asc') || byName(a, b);
    case 'net_desc': return (a: EntryLike, b: EntryLike) => (b.netPayable - a.netPayable) || byName(a, b);
    default: return byName;
  }
}

const byDesignationOnly = (a: EntryLike, b: EntryLike) => {
  const da = desigOf(a), db = desigOf(b);
  if (!da && db) return 1;
  if (da && !db) return -1;
  return da.localeCompare(db);
};

// `grouped` keeps designations together (A to Z) and applies the order
// inside each one, so a grouped register ordered by net payable still
// reads designation by designation.
export function orderEntries<T extends EntryLike>(entries: T[], order: RegisterOrder, grouped = false): T[] {
  const inner = comparatorFor(order);
  const cmp = grouped && order !== 'desig' ? (a: T, b: T) => byDesignationOnly(a, b) || inner(a, b) : inner;
  return [...entries].sort(cmp);
}

export function filterByDepartment<T extends EntryLike>(entries: T[], department: string): T[] {
  if (!department) return entries;
  return entries.filter(e => (e.person.department || '').trim() === department);
}

export const departmentsOf = (entries: EntryLike[]) =>
  Array.from(new Set(entries.map(e => (e.person.department || '').trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

export type RegisterRow<T> =
  | { kind: 'group'; key: string; label: string; count: number }
  | { kind: 'row'; key: string; entry: T };

// Header rows per designation (in the order given) when grouping; the
// entries themselves keep the order they arrive in, so "Designation, then
// joining date" groups cleanly while other orders group by first appearance.
export function groupEntries<T extends EntryLike>(entries: T[], grouped: boolean): RegisterRow<T>[] {
  if (!grouped) return entries.map(e => ({ kind: 'row', key: e.id, entry: e }));
  const counts = new Map<string, number>();
  entries.forEach(e => {
    const label = desigOf(e) || 'No designation';
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  const seen = new Set<string>();
  const out: RegisterRow<T>[] = [];
  entries.forEach(e => {
    const label = desigOf(e) || 'No designation';
    if (!seen.has(label)) {
      seen.add(label);
      out.push({ kind: 'group', key: `group:${label}`, label, count: counts.get(label) || 0 });
    }
    out.push({ kind: 'row', key: e.id, entry: e });
  });
  return out;
}

export type ChangeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';
export interface ChangePill { kind: 'new' | 'increment' | 'cut' | 'lop' | 'advance' | 'loan' | 'net' | 'same'; label: string; tone: ChangeTone }

const rupees = (n: number) => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

// What changed for one employee against the previous month. Several pills
// can apply (an increment and a LOP in the same month); "No change" only
// when nothing did. Without a previous run there is nothing to compare, so
// only the month's own events (LOP, advance, loan) are reported.
export function changesOf(entry: EntryLike, prev: PrevEntryLike | undefined, hasPrevRun: boolean): ChangePill[] {
  const pills: ChangePill[] = [];
  if (hasPrevRun && !prev) pills.push({ kind: 'new', label: 'New joiner', tone: 'info' });
  if (prev) {
    const delta = (entry.monthlyPackage || 0) - (prev.monthlyPackage || 0);
    if (delta >= 1) pills.push({ kind: 'increment', label: `Increment +${rupees(delta)}`, tone: 'success' });
    else if (delta <= -1) pills.push({ kind: 'cut', label: `Package −${rupees(delta)}`, tone: 'warning' });
  }
  if ((entry.lopDays || 0) > 0) {
    const d = entry.lopDays || 0;
    pills.push({ kind: 'lop', label: `${d} LOP day${d === 1 ? '' : 's'}`, tone: 'warning' });
  }
  if ((entry.salaryAdvance || 0) > 0) pills.push({ kind: 'advance', label: 'Advance recovery', tone: 'danger' });
  if ((entry.loanDeduction || 0) > 0) pills.push({ kind: 'loan', label: 'Loan instalment', tone: 'neutral' });
  if (pills.length === 0 && prev) {
    const netDelta = (entry.netPayable || 0) - (prev.netPayable || 0);
    if (Math.abs(netDelta) >= 1) pills.push({ kind: 'net', label: `Net ${netDelta > 0 ? '+' : '−'}${rupees(netDelta)}`, tone: 'neutral' });
  }
  if (pills.length === 0 && hasPrevRun) pills.push({ kind: 'same', label: 'No change', tone: 'neutral' });
  return pills;
}

export const hasChange = (pills: ChangePill[]) => pills.some(p => p.kind !== 'same');

export interface ComparisonSummary {
  netDelta: number;
  employeesBefore: number;
  employeesNow: number;
  changed: number;
  counts: Record<ChangePill['kind'], number>;
}

// The strip above the register: net movement, headcount and how many rows changed
export function compareWithPrevious(entries: EntryLike[], prev: { entries: PrevEntryLike[]; net: number } | null): ComparisonSummary | null {
  if (!prev) return null;
  const byPerson = indexPrev(prev.entries);
  const counts: Record<ChangePill['kind'], number> = { new: 0, increment: 0, cut: 0, lop: 0, advance: 0, loan: 0, net: 0, same: 0 };
  let changed = 0;
  entries.forEach(e => {
    const pills = changesOf(e, byPerson.get(personIdOf(e)), true);
    if (hasChange(pills)) changed += 1;
    pills.forEach(p => { counts[p.kind] += 1; });
  });
  return {
    netDelta: entries.reduce((s, e) => s + (e.netPayable || 0), 0) - prev.net,
    employeesBefore: prev.entries.length,
    employeesNow: entries.length,
    changed,
    counts,
  };
}

export const indexPrev = (entries: PrevEntryLike[] = []) => new Map(entries.map(p => [p.personId, p]));

// Words for the counts: "1 increment, 2 LOP, 1 advance recovery"
export function describeChanges(counts: ComparisonSummary['counts']): string {
  const parts: string[] = [];
  if (counts.new) parts.push(`${counts.new} new`);
  if (counts.increment) parts.push(`${counts.increment} increment${counts.increment === 1 ? '' : 's'}`);
  if (counts.cut) parts.push(`${counts.cut} package cut${counts.cut === 1 ? '' : 's'}`);
  if (counts.lop) parts.push(`${counts.lop} LOP`);
  if (counts.advance) parts.push(`${counts.advance} advance recover${counts.advance === 1 ? 'y' : 'ies'}`);
  if (counts.loan) parts.push(`${counts.loan} loan instalment${counts.loan === 1 ? '' : 's'}`);
  if (counts.net) parts.push(`${counts.net} other`);
  return parts.join(', ');
}

export interface RegisterTotals {
  employees: number; monthlyPackage: number; gross: number; pf: number; esi: number; tds: number;
  advance: number; deductions: number; net: number;
}

export function registerTotals(entries: EntryLike[]): RegisterTotals {
  const sum = (f: (e: EntryLike) => number | undefined) => entries.reduce((s, e) => s + (f(e) || 0), 0);
  return {
    employees: entries.length,
    monthlyPackage: sum(e => e.monthlyPackage),
    gross: sum(e => e.grossSalary),
    pf: sum(e => e.pfEmployee),
    esi: sum(e => e.esiEmployee),
    tds: sum(e => e.tds),
    advance: sum(e => e.salaryAdvance),
    deductions: sum(e => e.totalDeductions),
    net: sum(e => e.netPayable),
  };
}
