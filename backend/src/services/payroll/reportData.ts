// Data shaping for payroll reports. Pure, DB-independent.
import { columnValue } from './lines';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface GroupSummary {
  group: string;
  employees: number;
  gross: number;
  deductions: number;
  net: number;
  ctc: number;
}

// Headcount and pay totals per group (department, location, ...), largest
// gross first. Entries with no group fall under "Unassigned".
export function summaryByGroup(entries: any[], groupOf: (entry: any) => string): GroupSummary[] {
  const groups = new Map<string, GroupSummary>();
  for (const e of entries) {
    const group = groupOf(e) || 'Unassigned';
    const g = groups.get(group) || { group, employees: 0, gross: 0, deductions: 0, net: 0, ctc: 0 };
    g.employees += 1;
    g.gross = r2(g.gross + e.grossSalary);
    g.deductions = r2(g.deductions + e.totalDeductions);
    g.net = r2(g.net + e.netPayable);
    g.ctc = r2(g.ctc + e.ctc);
    groups.set(group, g);
  }
  return [...groups.values()].sort((a, b) => b.gross - a.gross || a.group.localeCompare(b.group));
}

export interface MatrixRow {
  id: string;
  label: string;
  sub: string;
  values: number[]; // one per period
  total: number;
}

// One column's amount for every employee across periods. `entries` carry
// `period` and `person`; employees with no entry in a period show 0.
export function componentMatrix(entries: any[], periods: string[], key: string): { rows: MatrixRow[]; totals: number[]; grandTotal: number } {
  const byPerson = new Map<string, MatrixRow>();
  for (const e of entries) {
    const index = periods.indexOf(e.period);
    if (index < 0) continue;
    const row = byPerson.get(e.personId) || {
      id: e.personId, label: e.person?.name || '', sub: e.person?.employeeNo || '',
      values: periods.map(() => 0), total: 0,
    };
    row.values[index] = r2(row.values[index] + columnValue(e, key));
    byPerson.set(e.personId, row);
  }
  const rows = [...byPerson.values()]
    .map(r => ({ ...r, total: r2(r.values.reduce((s, v) => s + v, 0)) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const totals = periods.map((_, i) => r2(rows.reduce((s, r) => s + r.values[i], 0)));
  return { rows, totals, grandTotal: r2(totals.reduce((s, v) => s + v, 0)) };
}
