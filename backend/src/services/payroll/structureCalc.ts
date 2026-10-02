// Salary structure templates: a split of its own for some employees, who
// it applies to, and working a package back from an annual figure.
// Pure, DB-independent.
import { computeEntry } from '../payrollCalc';

const r2 = (n: number) => Math.round(n * 100) / 100;

// The percentages that make a salary split. Payroll Settings holds the
// company's; a template holds its own.
export const SPLIT_FIELDS = [
  'basicPercentOfPackage', 'daPercentOfBasic', 'hraPercentOfBasic', 'transportPercentOfBasic', 'foodPercentOfBasic',
] as const;
export type Split = Record<typeof SPLIT_FIELDS[number], number>;
export const SPLIT_LABELS: Record<string, string> = {
  basicPercentOfPackage: 'Basic, % of package', daPercentOfBasic: 'DA, % of Basic', hraPercentOfBasic: 'HRA, % of Basic',
  transportPercentOfBasic: 'Transport, % of Basic', foodPercentOfBasic: 'Food, % of Basic',
};

export const splitOf = (source: any): Split =>
  Object.fromEntries(SPLIT_FIELDS.map(f => [f, Number(source?.[f] || 0)])) as Split;

// Settings with a template's split in place of the company's.
export const withSplit = (settings: any, split?: Split | null) => (split ? { ...settings, ...split } : settings);

// A split as kept on a payslip entry, and read back. Blank or unreadable
// text means the company's split.
export const splitText = (split: Split) => JSON.stringify(splitOf(split));
export function parseSplit(text?: string | null): Split | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    if (!raw || typeof raw !== 'object') return null;
    const split = splitOf(raw);
    return SPLIT_FIELDS.every(f => isFinite(split[f]) && split[f] >= 0) && split.basicPercentOfPackage > 0 ? split : null;
  } catch {
    return null;
  }
}

// The settings a payslip entry was computed with: its own snapshot of the
// split, over today's settings.
export const entrySettings = (settings: any, entry: { structureSplit?: string | null }) =>
  withSplit(settings, parseSplit(entry?.structureSplit));

// Gross for a full month as a share of the package. 100 means the
// components add up to the package exactly.
export const grossPercent = (split: Split) =>
  r2(split.basicPercentOfPackage * (100 + split.daPercentOfBasic + split.hraPercentOfBasic
    + split.transportPercentOfBasic + split.foodPercentOfBasic) / 100);

// A split as typed, checked. Returns what is wrong, or the split.
export function splitInput(raw: any): string | Split {
  const split = {} as Split;
  for (const f of SPLIT_FIELDS) {
    const v = Number(raw?.[f]);
    if (raw?.[f] === '' || raw?.[f] == null || !isFinite(v) || v < 0) return `Enter ${SPLIT_LABELS[f]}`;
    if (v > 1000) return `${SPLIT_LABELS[f]} is too large`;
    split[f] = v;
  }
  if (split.basicPercentOfPackage <= 0 || split.basicPercentOfPackage > 100) return 'Basic must be between 1% and 100% of the package';
  if (grossPercent(split) > 100.005) {
    return `With these percentages the components add up to ${grossPercent(split)}% of the package. Bring them to 100% or less.`;
  }
  return split;
}

export const SCOPES = ['EMPLOYEE', 'DESIGNATION', 'DEPARTMENT'] as const;
export const SCOPE_LABELS: Record<string, string> = { EMPLOYEE: 'employee', DESIGNATION: 'designation', DEPARTMENT: 'department' };

export interface AssignmentLike {
  scope: string;
  target: string;
  templateId: string;
}
export interface TemplateLike extends Split {
  id: string;
  name: string;
  isActive: boolean;
}

const same = (a?: string | null, b?: string | null) =>
  String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase() && String(a ?? '').trim() !== '';

// The template that applies to one employee: their own, else their
// designation's, else their department's. Null = the company's split. A
// template switched off applies to nobody.
export function templateFor(
  person: { id: string; designation?: string | null; department?: string | null },
  assignments: AssignmentLike[], templates: TemplateLike[],
): { template: TemplateLike; scope: string } | null {
  const active = new Map(templates.filter(t => t.isActive).map(t => [t.id, t]));
  const pick = (scope: string, matches: (target: string) => boolean) => {
    const a = assignments.find(x => x.scope === scope && matches(x.target) && active.has(x.templateId));
    return a ? { template: active.get(a.templateId)!, scope } : null;
  };
  return pick('EMPLOYEE', t => t === person.id)
    || pick('DESIGNATION', t => same(t, person.designation))
    || pick('DEPARTMENT', t => same(t, person.department));
}

// Yearly cost to the company of a monthly package: gross plus the
// employer's PF and ESI, twelve times.
export function annualCtcOf(
  monthlyPackage: number, flags: { isEsiEligible?: boolean; isPfApplicable?: boolean; npsEmployerPercent?: number }, settings: any,
) {
  const month = computeEntry({
    monthlyPackage, totalWorkingDays: 1, isEsiEligible: flags.isEsiEligible, isPfApplicable: flags.isPfApplicable,
  }, settings);
  // The employer's NPS contribution is part of the cost too
  const nps = flags.npsEmployerPercent ? Math.round((month.basic + month.da) * flags.npsEmployerPercent / 100) : 0;
  return r2((month.ctc + nps) * 12);
}

// The monthly package (whole rupees) whose yearly cost comes closest to
// an annual CTC without going over it.
export function packageFromAnnualCtc(
  annualCtc: number, flags: { isEsiEligible?: boolean; isPfApplicable?: boolean; npsEmployerPercent?: number }, settings: any,
): number {
  if (!(annualCtc > 0)) return 0;
  let low = 0;
  let high = Math.ceil(annualCtc / 12);
  // Cost never falls as the package rises, so the answer can be closed in on
  while (annualCtcOf(high, flags, settings) < annualCtc && high < 1e9) high *= 2;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (annualCtcOf(mid, flags, settings) <= annualCtc) low = mid; else high = mid;
  }
  return annualCtcOf(high, flags, settings) <= annualCtc ? high : low;
}

// A package as typed, in one of three ways, as the monthly package payroll keeps.
export const PACKAGE_MODES = ['MONTHLY', 'ANNUAL', 'ANNUAL_CTC'] as const;
export function monthlyPackageFrom(
  mode: string, amount: number, flags: { isEsiEligible?: boolean; isPfApplicable?: boolean; npsEmployerPercent?: number }, settings: any,
): number {
  if (!(amount > 0)) return 0;
  if (mode === 'ANNUAL') return r2(amount / 12);
  if (mode === 'ANNUAL_CTC') return packageFromAnnualCtc(amount, flags, settings);
  return r2(amount);
}
