import { describe, it, expect } from 'vitest';
import {
  orderEmployees, groupByDesignation, filterByStatus, tenureLabel, tenureMonths,
  financialYearStart, employeeKpis, initialsOf,
} from '../employeeOrder';

const people = [
  { id: 'a', name: 'Priya Natarajan', designation: 'Project Manager', department: 'Implementation', joinDate: '2019-06-10', employmentStatus: 'ACTIVE', isPfApplicable: true, isEsiEligible: false },
  { id: 'b', name: 'Arjun Mehta', designation: 'Software Engineer', department: 'Engineering', joinDate: '2020-02-03', employmentStatus: 'PROBATION', isPfApplicable: true, isEsiEligible: false },
  { id: 'c', name: 'Meera Iyer', designation: 'Software Engineer', department: 'Engineering', joinDate: '2023-07-03', employmentStatus: 'ACTIVE', isPfApplicable: true, isEsiEligible: true },
  { id: 'd', name: 'Farhan Ali', designation: 'Software Engineer', department: 'Engineering', joinDate: '2026-09-01', employmentStatus: 'ACTIVE', isPfApplicable: false, isEsiEligible: true },
  { id: 'e', name: 'Zara Khan', designation: '', department: '', joinDate: '', employmentStatus: 'ACTIVE' },
  { id: 'f', name: 'Deepak Nair', designation: 'Sales Executive', department: 'Sales', joinDate: '2023-08-14', employmentStatus: 'RESIGNED', isEsiEligible: true },
];
const ids = (rows: { id: string }[]) => rows.map(r => r.id);

describe('orderEmployees', () => {
  it('puts the newest joiners first by default, people without a date last', () => {
    expect(ids(orderEmployees(people, 'doj_desc'))).toEqual(['d', 'f', 'c', 'b', 'a', 'e']);
  });

  it('puts the longest serving first, people without a date still last', () => {
    expect(ids(orderEmployees(people, 'doj_asc'))).toEqual(['a', 'b', 'c', 'f', 'd', 'e']);
  });

  it('orders by designation A to Z, then by date of joining within one', () => {
    expect(ids(orderEmployees(people, 'desig'))).toEqual(['a', 'f', 'b', 'c', 'd', 'e']);
  });

  it('orders by name', () => {
    expect(ids(orderEmployees(people, 'name'))).toEqual(['b', 'f', 'd', 'c', 'a', 'e']);
  });

  it('does not change the list it is given', () => {
    const copy = [...people];
    orderEmployees(people, 'name');
    expect(people).toEqual(copy);
  });
});

describe('groupByDesignation', () => {
  it('inserts one header per designation with its count, in A to Z order', () => {
    const rows = groupByDesignation(people, p => p.id);
    expect(rows.map(r => (r.kind === 'group' ? `${r.label}:${r.count}` : r.key))).toEqual([
      'Project Manager:1', 'a',
      'Sales Executive:1', 'f',
      'Software Engineer:3', 'b', 'c', 'd',
      'No designation:1', 'e',
    ]);
  });
});

describe('filterByStatus', () => {
  it('splits active from inactive and keeps everyone for all', () => {
    expect(ids(filterByStatus(people, 'active'))).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids(filterByStatus(people, 'inactive'))).toEqual(['f']);
    expect(filterByStatus(people, 'all')).toHaveLength(6);
  });
});

describe('tenure', () => {
  const today = new Date(2026, 9, 22); // 22 Oct 2026
  it('counts whole months, ignoring the day until it is reached', () => {
    expect(tenureMonths('2026-09-01', today)).toBe(1);
    expect(tenureMonths('2026-09-23', today)).toBe(0);
    expect(tenureMonths('2019-06-10', today)).toBe(88);
  });
  it('words it as years and months', () => {
    expect(tenureLabel('2019-06-10', today)).toBe('7 yr 4 mo');
    expect(tenureLabel('2025-10-22', today)).toBe('1 yr');
    expect(tenureLabel('2026-04-07', today)).toBe('6 mo');
    expect(tenureLabel('2026-10-10', today)).toBe('New');
    expect(tenureLabel('', today)).toBe('—');
    expect(tenureLabel(null, today)).toBe('—');
  });
});

describe('employeeKpis', () => {
  it('starts the financial year on 1 April', () => {
    expect(financialYearStart(new Date(2026, 9, 22))).toBe('2026-04-01');
    expect(financialYearStart(new Date(2026, 1, 3))).toBe('2025-04-01');
  });
  it('counts active people, joiners this year, distinct designations and departments, ESI and PF', () => {
    expect(employeeKpis(people, new Date(2026, 9, 22))).toEqual({
      active: 5, inactive: 1, joinedThisFY: 1, designations: 2, departments: 2, esi: 2, pf: 3,
    });
  });
});

describe('initialsOf', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsOf('Priya Natarajan')).toBe('PN');
    expect(initialsOf('Cher')).toBe('C');
    expect(initialsOf('')).toBe('•');
  });
});
