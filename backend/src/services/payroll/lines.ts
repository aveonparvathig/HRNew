// Catalogue components on a payslip, layered over the fixed salary engine.
// Pure, DB-independent.
import { computeEntry, EntryInputs } from '../payrollCalc';

export interface LineAmount {
  type: string; // EARNING | DEDUCTION
  amount: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function lineTotals(lines: LineAmount[] = []) {
  let earnings = 0;
  let deductions = 0;
  for (const l of lines) {
    if (l.type === 'DEDUCTION') deductions += Number(l.amount || 0);
    else earnings += Number(l.amount || 0);
  }
  return { earnings: r2(earnings), deductions: r2(deductions) };
}

// computeEntry plus catalogue lines: earnings raise gross, deductions raise
// total deductions; net and CTC follow. PF and ESI are computed on the fixed
// components only, so lines never change them. With no lines the result is
// exactly computeEntry's.
export function computeEntryWithLines(inp: EntryInputs, settings: any, lines: LineAmount[] = []) {
  const base = computeEntry(inp, settings);
  const extra = lineTotals(lines);
  if (!extra.earnings && !extra.deductions) return base;
  const grossSalary = r2(base.grossSalary + extra.earnings);
  const totalDeductions = r2(base.totalDeductions + extra.deductions);
  return {
    ...base,
    grossSalary,
    totalDeductions,
    netPayable: r2(grossSalary - totalDeductions),
    ctc: r2(grossSalary + base.employerContributions),
  };
}

// ---------------------------------------------------------------------------
// Column model shared by payslips and reports: the fixed components in
// payslip order, with catalogue components slotted in after them.
// ---------------------------------------------------------------------------
export interface ComponentColumn {
  key: string;          // PayslipEntry field, or "c:<componentId>" for a catalogue component
  label: string;
  short: string;
  group: 'EARNING' | 'GROSS' | 'DEDUCTION' | 'TOTAL_DEDUCTIONS' | 'NET' | 'EMPLOYER' | 'CTC';
}

const col = (key: string, label: string, short: string, group: ComponentColumn['group']): ComponentColumn =>
  ({ key, label, short, group });

export const FIXED_EARNINGS: ComponentColumn[] = [
  col('basic', 'Basic', 'Basic', 'EARNING'),
  col('da', 'Dearness Allowance', 'DA', 'EARNING'),
  col('hra', 'House Rent Allowance', 'HRA', 'EARNING'),
  col('transportAllowance', 'Transport Allowance', 'Transport', 'EARNING'),
  col('foodAllowance', 'Food Allowance', 'Food', 'EARNING'),
  col('internetAllowance', 'Internet Allowance', 'Internet', 'EARNING'),
  col('salaryArrearAllowance', 'Salary Arrear', 'Arrear', 'EARNING'),
];
export const FIXED_DEDUCTIONS: ComponentColumn[] = [
  col('esiEmployee', 'ESI (Employee)', 'ESI', 'DEDUCTION'),
  col('pfEmployee', 'PF (Employee)', 'PF', 'DEDUCTION'),
  col('salaryAdvance', 'Salary Advance', 'Advance', 'DEDUCTION'),
  col('tds', 'TDS', 'TDS', 'DEDUCTION'),
];
export const FIXED_EMPLOYER: ComponentColumn[] = [
  col('esiEmployer', 'ESI (Employer)', 'ESI Er', 'EMPLOYER'),
  col('pfEmployer', 'PF (Employer)', 'PF Er', 'EMPLOYER'),
];
const GROSS = col('grossSalary', 'Gross Salary', 'Gross', 'GROSS');
const TOTAL_DEDUCTIONS = col('totalDeductions', 'Total Deductions', 'Deductions', 'TOTAL_DEDUCTIONS');
const NET = col('netPayable', 'Net Payable', 'Net', 'NET');
const CTC = col('ctc', 'CTC', 'CTC', 'CTC');

export const lineKey = (componentId: string) => `c:${componentId}`;

// Amount an entry carries for a column.
export function columnValue(entry: any, key: string): number {
  if (key.startsWith('c:')) {
    const line = (entry.lines || []).find((l: any) => lineKey(l.componentId) === key);
    return Number(line?.amount || 0);
  }
  return Number(entry[key] || 0);
}

// Catalogue components appearing on any of the entries, by name.
function lineColumns(entries: any[], type: string): ComponentColumn[] {
  const seen = new Map<string, string>();
  for (const e of entries) {
    for (const l of e.lines || []) {
      if (l.type === type) seen.set(lineKey(l.componentId), l.name);
    }
  }
  return [...seen.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([key, name]) => col(key, name, name, type === 'DEDUCTION' ? 'DEDUCTION' : 'EARNING'));
}

// Every column for a set of entries, in register order.
export function allColumns(entries: any[]): ComponentColumn[] {
  return [
    ...FIXED_EARNINGS, ...lineColumns(entries, 'EARNING'), GROSS,
    ...FIXED_DEDUCTIONS, ...lineColumns(entries, 'DEDUCTION'), TOTAL_DEDUCTIONS,
    NET, ...FIXED_EMPLOYER, CTC,
  ];
}

// CTC is optional: runs imported from the salary sheet do not track it.
const ALWAYS_SHOWN = new Set(['basic', 'da', 'hra', 'transportAllowance', 'foodAllowance',
  'grossSalary', 'totalDeductions', 'netPayable']);

// allColumns minus the optional ones that are zero for every entry.
export function usedColumns(entries: any[]): ComponentColumn[] {
  return allColumns(entries).filter(c =>
    ALWAYS_SHOWN.has(c.key) || entries.some(e => columnValue(e, c.key) !== 0));
}

export const columnTotal = (entries: any[], key: string) =>
  r2(entries.reduce((s, e) => s + columnValue(e, key), 0));
