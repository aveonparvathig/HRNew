// Reporting lines and confirmation dates. Pure, DB-independent.

export interface ReportLike {
  id: string;
  managerId?: string | null;
}

// Everyone above a person, nearest first. Stops if the records loop.
export function managersOf(personId: string, people: ReportLike[]): string[] {
  const managerOf = new Map(people.map(p => [p.id, p.managerId || null]));
  const chain: string[] = [];
  let current = managerOf.get(personId) || null;
  while (current && !chain.includes(current) && current !== personId) {
    chain.push(current);
    current = managerOf.get(current) || null;
  }
  return chain;
}

// Everyone below a person, at any depth.
export function teamOf(personId: string, people: ReportLike[]): string[] {
  const reports = new Map<string, string[]>();
  for (const p of people) {
    if (p.managerId) reports.set(p.managerId, [...(reports.get(p.managerId) || []), p.id]);
  }
  const team: string[] = [];
  const queue = [...(reports.get(personId) || [])];
  while (queue.length) {
    const id = queue.shift()!;
    if (team.includes(id) || id === personId) continue;
    team.push(id);
    queue.push(...(reports.get(id) || []));
  }
  return team;
}

// Why someone cannot be this person's manager, or null when they can:
// not themselves, and nobody who reports to them, directly or further down.
export function managerProblem(personId: string, managerId: string | null | undefined, people: ReportLike[]): string | null {
  if (!managerId) return null;
  if (managerId === personId) return 'Someone cannot report to themselves';
  if (!people.some(p => p.id === managerId)) return 'Pick the manager from the employees of the company';
  if (teamOf(personId, people).includes(managerId)) return 'That person reports to this employee, directly or through others. Change their manager first.';
  return null;
}

export interface OrgPerson extends ReportLike {
  name: string;
  [key: string]: any;
}
export interface OrgNode<T extends OrgPerson = OrgPerson> {
  person: T;
  reports: OrgNode<T>[];
  directCount: number;
  teamCount: number; // everyone below, at any depth
}

// The reporting tree. People with no manager — or whose manager is not in
// the list (left, or in a loop) — stand at the top.
export function orgTree<T extends OrgPerson>(people: T[]): OrgNode<T>[] {
  const ids = new Set(people.map(p => p.id));
  const byManager = new Map<string, T[]>();
  for (const p of people) {
    if (p.managerId && ids.has(p.managerId) && p.managerId !== p.id) {
      byManager.set(p.managerId, [...(byManager.get(p.managerId) || []), p]);
    }
  }
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const placed = new Set<string>();
  const build = (person: T): OrgNode<T> => {
    placed.add(person.id);
    const reports = (byManager.get(person.id) || []).filter(r => !placed.has(r.id)).sort(byName).map(build);
    return { person, reports, directCount: reports.length, teamCount: reports.reduce((s, r) => s + 1 + r.teamCount, 0) };
  };
  const top = people.filter(p => !p.managerId || !ids.has(p.managerId) || p.managerId === p.id).sort(byName).map(build);
  // A closed loop has no top: its members are put at the top rather than lost
  const stranded = people.filter(p => !placed.has(p.id)).sort(byName);
  for (const p of stranded) if (!placed.has(p.id)) top.push(build(p));
  return top;
}

// ---------------------------------------------------------------------------
// Probation and confirmation
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The day probation ends: so many months after joining, on the same day
// of the month, or that month's last day where it has no such day.
export function probationEnds(joinDate: string | null | undefined, months: number): string | null {
  if (!joinDate || !DATE.test(joinDate) || !(months > 0)) return null;
  const [y, m, d] = joinDate.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + Math.round(months), 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(d, last))}`;
}

const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

export interface ConfirmationLike {
  joinDate?: string | null;
  probationMonths: number;
  confirmationDate?: string | null;
  employmentStatus?: string;
}

// Where an employee stands on confirmation: null when they are confirmed,
// have left, or have no probation to finish.
export function confirmationState(person: ConfirmationLike, today: string) {
  if (person.confirmationDate) return null;
  if (['RESIGNED', 'TERMINATED'].includes(person.employmentStatus || '')) return null;
  const dueOn = probationEnds(person.joinDate, person.probationMonths);
  if (!dueOn) return null;
  const days = daysBetween(today, dueOn);
  return { dueOn, daysLeft: days, overdue: days < 0 };
}

// Employees whose confirmation is overdue or falls due within some days,
// the most pressing first.
export function confirmationsDue<T extends ConfirmationLike>(people: T[], today: string, withinDays = 30) {
  return people
    .map(person => ({ person, ...(confirmationState(person, today) || { dueOn: '', daysLeft: 0, overdue: false }) }))
    .filter(r => r.dueOn && r.daysLeft <= withinDays)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

// The notice an employee must give: their own, else the company's.
export const noticeDaysFor = (person: { noticePeriodDays?: number | null }, companyDays: number) =>
  (person.noticePeriodDays != null && person.noticePeriodDays >= 0 ? person.noticePeriodDays : companyDays);

// Job details as typed, checked. Returns what is wrong, or the fields.
export function jobDetailsInput(b: any): string | {
  probationMonths: number; confirmationDate: string | null; noticePeriodDays: number | null;
  firstHireDate: string | null; referredBy: string; employmentType: string;
} {
  const date = (v: any, label: string): string | null | { error: string } => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    if (!DATE.test(s) || isNaN(Date.parse(s))) return { error: `Enter a valid ${label}` };
    return s;
  };
  const probation = b?.probationMonths === '' || b?.probationMonths == null ? 0 : Number(b.probationMonths);
  if (!Number.isInteger(probation) || probation < 0 || probation > 36) return 'Probation is a whole number of months, up to 36';
  const notice = b?.noticePeriodDays === '' || b?.noticePeriodDays == null ? null : Number(b.noticePeriodDays);
  if (notice !== null && (!Number.isInteger(notice) || notice < 0 || notice > 365)) return 'The notice period is a number of days, up to 365';
  const confirmationDate = date(b?.confirmationDate, 'confirmation date');
  if (confirmationDate && typeof confirmationDate === 'object') return confirmationDate.error;
  const firstHireDate = date(b?.firstHireDate, 'first hire date');
  if (firstHireDate && typeof firstHireDate === 'object') return firstHireDate.error;
  const joinDate = String(b?.joinDate ?? '').trim();
  if (confirmationDate && joinDate && confirmationDate < joinDate) return 'The confirmation date cannot be before the joining date';
  if (firstHireDate && joinDate && firstHireDate > joinDate) return 'The first hire date cannot be after the joining date';
  return {
    probationMonths: probation, confirmationDate: confirmationDate as string | null, noticePeriodDays: notice,
    firstHireDate: firstHireDate as string | null, referredBy: String(b?.referredBy ?? '').trim().slice(0, 120),
    employmentType: String(b?.employmentType ?? '').trim().replace(/\s+/g, ' ').slice(0, 60),
  };
}
