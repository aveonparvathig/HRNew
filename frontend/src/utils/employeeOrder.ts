// Ordering, grouping and summary figures for the Employees report.
// Pure functions over the rows the people list already holds, so the page
// re-sorts instantly and the logic can be tested on its own.

export type EmployeeSort = 'doj_desc' | 'doj_asc' | 'desig' | 'name';
export type EmployeeStatusFilter = 'active' | 'inactive' | 'all';

export const EMPLOYEE_SORTS: { value: EmployeeSort; label: string; description: string }[] = [
  { value: 'doj_desc', label: 'Newest joiners', description: 'newest joiners first' },
  { value: 'doj_asc', label: 'Longest serving', description: 'longest serving first' },
  { value: 'desig', label: 'Designation A–Z', description: 'designation A to Z' },
  { value: 'name', label: 'Name A–Z', description: 'name A to Z' },
];

export const INACTIVE_STATUSES = new Set(['RESIGNED', 'TERMINATED']);

export interface EmployeeLike {
  id?: string;
  name: string;
  designation?: string | null;
  department?: string | null;
  joinDate?: string | null;        // ISO date (YYYY-MM-DD) or blank
  employmentStatus?: string | null;
  isEsiEligible?: boolean;
  isPfApplicable?: boolean;
}

export const isActiveEmployee = (p: EmployeeLike) => !INACTIVE_STATUSES.has(p.employmentStatus || 'ACTIVE');

const byName = (a: EmployeeLike, b: EmployeeLike) => a.name.localeCompare(b.name);
const desigOf = (p: EmployeeLike) => (p.designation || '').trim();
const byDesignation = (a: EmployeeLike, b: EmployeeLike) => {
  const da = desigOf(a), db = desigOf(b);
  // People with no designation gather at the end
  if (!da && db) return 1;
  if (da && !db) return -1;
  return da.localeCompare(db) || byDoj(a, b, 'asc') || byName(a, b);
};

// Compare by date of joining. People with no date fall to the end
// whichever way the list runs.
function byDoj(a: EmployeeLike, b: EmployeeLike, dir: 'asc' | 'desc') {
  const da = a.joinDate || '', db = b.joinDate || '';
  if (!da && !db) return 0;
  if (!da) return 1;
  if (!db) return -1;
  return dir === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
}

export function filterByStatus<T extends EmployeeLike>(rows: T[], status: EmployeeStatusFilter): T[] {
  if (status === 'all') return rows;
  return rows.filter(p => (status === 'active' ? isActiveEmployee(p) : !isActiveEmployee(p)));
}

export function orderEmployees<T extends EmployeeLike>(rows: T[], sort: EmployeeSort): T[] {
  const list = [...rows];
  switch (sort) {
    case 'doj_desc': return list.sort((a, b) => byDoj(a, b, 'desc') || byName(a, b));
    case 'doj_asc': return list.sort((a, b) => byDoj(a, b, 'asc') || byName(a, b));
    case 'desig': return list.sort(byDesignation);
    default: return list.sort(byName);
  }
}

export type GroupedRow<T> =
  | { kind: 'group'; key: string; label: string; count: number }
  | { kind: 'row'; key: string; row: T };

// Designation header rows with counts, each followed by its people in the
// order given. Rows arrive already sorted by designation, so a designation
// appears once; people with none are grouped as "No designation" at the end.
export function groupByDesignation<T extends EmployeeLike>(rows: T[], keyOf: (row: T) => string): GroupedRow<T>[] {
  const sorted = orderEmployees(rows, 'desig');
  const out: GroupedRow<T>[] = [];
  let current: string | null = null;
  sorted.forEach(row => {
    const label = desigOf(row) || 'No designation';
    if (label !== current) {
      current = label;
      out.push({ kind: 'group', key: `group:${label}`, label, count: sorted.filter(r => (desigOf(r) || 'No designation') === label).length });
    }
    out.push({ kind: 'row', key: keyOf(row), row });
  });
  return out;
}

// Whole months between a date of joining and today (or a leaving date)
export function tenureMonths(joinDate: string, today: Date = new Date()): number | null {
  if (!joinDate) return null;
  const d = new Date(`${joinDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  let months = (today.getFullYear() - d.getFullYear()) * 12 + (today.getMonth() - d.getMonth());
  if (today.getDate() < d.getDate()) months -= 1;
  return Math.max(0, months);
}

// "3 yr 2 mo", "11 mo", "New" for under a month
export function tenureLabel(joinDate: string | null | undefined, today: Date = new Date()): string {
  const months = joinDate ? tenureMonths(joinDate, today) : null;
  if (months == null) return '—';
  if (months < 1) return 'New';
  const y = Math.floor(months / 12), m = months % 12;
  if (y === 0) return `${m} mo`;
  if (m === 0) return `${y} yr`;
  return `${y} yr ${m} mo`;
}

// The Indian financial year starts on 1 April
export function financialYearStart(today: Date = new Date()): string {
  const y = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
  return `${y}-04-01`;
}

export interface EmployeeKpis {
  active: number;
  inactive: number;
  joinedThisFY: number;
  designations: number;
  departments: number;
  esi: number;
  pf: number;
}

export function employeeKpis(rows: EmployeeLike[], today: Date = new Date()): EmployeeKpis {
  const active = rows.filter(isActiveEmployee);
  const fyStart = financialYearStart(today);
  return {
    active: active.length,
    inactive: rows.length - active.length,
    joinedThisFY: active.filter(p => (p.joinDate || '') >= fyStart).length,
    designations: new Set(active.map(desigOf).filter(Boolean)).size,
    departments: new Set(active.map(p => (p.department || '').trim()).filter(Boolean)).size,
    esi: active.filter(p => p.isEsiEligible).length,
    pf: active.filter(p => p.isPfApplicable).length,
  };
}

// Two initials for an avatar: first letters of the first two words
export const initialsOf = (name: string) =>
  (name || '').trim().split(/\s+/).map(w => w[0] || '').slice(0, 2).join('').toUpperCase() || '•';
