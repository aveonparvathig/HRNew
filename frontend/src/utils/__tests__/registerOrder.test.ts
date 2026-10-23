import { describe, it, expect } from 'vitest';
import {
  orderEntries, groupEntries, filterByDepartment, departmentsOf, changesOf,
  compareWithPrevious, describeChanges, registerTotals,
} from '../registerOrder';

const entry = (id: string, name: string, designation: string, joinDate: string, net: number, extra: any = {}) => ({
  id, personId: `p-${id}`,
  person: { id: `p-${id}`, name, employeeNo: `AV-${id}`, designation, department: extra.department || 'Engineering', joinDate },
  monthlyPackage: extra.monthlyPackage ?? extra.gross ?? net, grossSalary: extra.gross ?? net, netPayable: net,
  totalDeductions: (extra.gross ?? net) - net,
  lopDays: extra.lopDays || 0, salaryAdvance: extra.salaryAdvance || 0, loanDeduction: extra.loanDeduction || 0,
  pfEmployee: extra.pf || 0, esiEmployee: extra.esi || 0, tds: extra.tds || 0,
});

const entries = [
  entry('1', 'Priya Natarajan', 'Project Manager', '2019-06-10', 86950, { department: 'Implementation', pf: 1800, tds: 6250, gross: 95000 }),
  entry('2', 'Karthik Raj', 'Software Engineer', '2025-03-10', 42640, { lopDays: 2, pf: 1800, gross: 44440 }),
  entry('3', 'Meera Iyer', 'Software Engineer', '2023-07-03', 54750, { pf: 1800, gross: 58000 }),
  entry('4', 'Rahul Verma', 'Implementation Engineer', '2021-09-06', 44300, { department: 'Implementation', salaryAdvance: 5000, gross: 52000 }),
  entry('5', 'Farhan Ali', 'Software Engineer', '2026-09-01', 38200, { gross: 40000 }),
];
const ids = (rows: { id: string }[]) => rows.map(r => r.id);

describe('orderEntries', () => {
  it('groups by designation A to Z with the longest serving first inside each', () => {
    expect(ids(orderEntries(entries, 'desig'))).toEqual(['4', '1', '3', '2', '5']);
  });
  it('orders by joining date both ways', () => {
    expect(ids(orderEntries(entries, 'doj_desc'))).toEqual(['5', '2', '3', '4', '1']);
    expect(ids(orderEntries(entries, 'doj_asc'))).toEqual(['1', '4', '3', '2', '5']);
  });
  it('orders by net payable, highest first', () => {
    expect(ids(orderEntries(entries, 'net_desc'))).toEqual(['1', '3', '4', '2', '5']);
  });
  it('orders by name', () => {
    expect(ids(orderEntries(entries, 'name'))).toEqual(['5', '2', '3', '1', '4']);
  });
  it('keeps designations together when grouped and applies the order inside each', () => {
    expect(ids(orderEntries(entries, 'net_desc', true))).toEqual(['4', '1', '3', '2', '5']);
    expect(ids(orderEntries(entries, 'doj_desc', true))).toEqual(['4', '1', '5', '2', '3']);
    expect(ids(orderEntries(entries, 'name', true))).toEqual(['4', '1', '5', '2', '3']);
  });
});

describe('groupEntries', () => {
  it('adds a header with a count before each designation', () => {
    const rows = groupEntries(orderEntries(entries, 'desig'), true);
    expect(rows.map(r => (r.kind === 'group' ? `${r.label}:${r.count}` : r.key))).toEqual([
      'Implementation Engineer:1', '4', 'Project Manager:1', '1', 'Software Engineer:3', '3', '2', '5',
    ]);
  });
  it('returns plain rows when not grouping', () => {
    expect(groupEntries(entries, false).every(r => r.kind === 'row')).toBe(true);
  });
});

describe('department filter', () => {
  it('lists the departments in use and filters to one', () => {
    expect(departmentsOf(entries)).toEqual(['Engineering', 'Implementation']);
    expect(ids(filterByDepartment(entries, 'Implementation'))).toEqual(['1', '4']);
    expect(filterByDepartment(entries, '')).toHaveLength(5);
  });
});

describe('changesOf', () => {
  const prev = { personId: 'p-1', netPayable: 80000, grossSalary: 88000, monthlyPackage: 88000 };
  it('spots an increment against the previous month', () => {
    const pills = changesOf(entries[0], { ...prev, monthlyPackage: 88000 }, true);
    expect(pills.map(p => p.label)).toEqual(['Increment +₹7,000']);
    expect(pills[0].tone).toBe('success');
  });
  it('marks someone missing from the previous run as a new joiner', () => {
    expect(changesOf(entries[4], undefined, true).map(p => p.kind)).toEqual(['new']);
  });
  it('reports LOP days and advance recoveries from the month itself', () => {
    expect(changesOf(entries[1], { personId: 'p-2', netPayable: 42640, grossSalary: 44440, monthlyPackage: 44440 }, true).map(p => p.label)).toEqual(['2 LOP days']);
    expect(changesOf(entries[3], { personId: 'p-4', netPayable: 44300, grossSalary: 52000, monthlyPackage: 52000 }, true).map(p => p.kind)).toEqual(['advance']);
  });
  it('says no change when nothing moved, and nothing at all without a previous run', () => {
    expect(changesOf(entries[2], { personId: 'p-3', netPayable: 54750, grossSalary: 58000, monthlyPackage: 58000 }, true).map(p => p.kind)).toEqual(['same']);
    expect(changesOf(entries[2], undefined, false)).toEqual([]);
  });
  it('falls back to the net movement when the package is the same', () => {
    expect(changesOf(entries[2], { personId: 'p-3', netPayable: 54000, grossSalary: 58000, monthlyPackage: 58000 }, true).map(p => p.label)).toEqual(['Net +₹750']);
  });
});

describe('compareWithPrevious', () => {
  it('sums the net movement and counts changed rows by kind', () => {
    const summary = compareWithPrevious(entries, {
      net: 250000,
      entries: [
        { personId: 'p-1', netPayable: 80000, grossSalary: 88000, monthlyPackage: 88000 },
        { personId: 'p-2', netPayable: 42640, grossSalary: 44440, monthlyPackage: 44440 },
        { personId: 'p-3', netPayable: 54750, grossSalary: 58000, monthlyPackage: 58000 },
        { personId: 'p-4', netPayable: 44300, grossSalary: 52000, monthlyPackage: 52000 },
      ],
    })!;
    expect(summary.netDelta).toBe(266840 - 250000);
    expect(summary.employeesBefore).toBe(4);
    expect(summary.employeesNow).toBe(5);
    expect(summary.changed).toBe(4);
    expect(describeChanges(summary.counts)).toBe('1 new, 1 increment, 1 LOP, 1 advance recovery');
  });
  it('is nothing without a previous run', () => {
    expect(compareWithPrevious(entries, null)).toBeNull();
  });
});

describe('registerTotals', () => {
  it('adds up the visible rows', () => {
    const t = registerTotals(entries);
    expect(t.employees).toBe(5);
    expect(t.gross).toBe(95000 + 44440 + 58000 + 52000 + 40000);
    expect(t.net).toBe(266840);
    expect(t.pf).toBe(5400);
    expect(t.tds).toBe(6250);
    expect(t.advance).toBe(5000);
  });
});
