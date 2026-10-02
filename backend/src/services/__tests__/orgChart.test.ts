import { describe, it, expect } from 'vitest';
import {
  confirmationState, confirmationsDue, jobDetailsInput, managerProblem, managersOf, noticeDaysFor, orgTree,
  probationEnds, teamOf,
} from '../orgChart';

// ceo ── head ── lead ── dev
//    └── hr              (solo has no manager)
const people = [
  { id: 'ceo', name: 'Chitra', managerId: null },
  { id: 'head', name: 'Hari', managerId: 'ceo' },
  { id: 'hr', name: 'Anu', managerId: 'ceo' },
  { id: 'lead', name: 'Latha', managerId: 'head' },
  { id: 'dev', name: 'Dinesh', managerId: 'lead' },
  { id: 'solo', name: 'Bala', managerId: null },
];

describe('reporting lines', () => {
  it('lists everyone above and everyone below a person', () => {
    expect(managersOf('dev', people)).toEqual(['lead', 'head', 'ceo']);
    expect(managersOf('ceo', people)).toEqual([]);
    expect(teamOf('ceo', people).sort()).toEqual(['dev', 'head', 'hr', 'lead']);
    expect(teamOf('lead', people)).toEqual(['dev']);
    expect(teamOf('dev', people)).toEqual([]);
  });

  it('refuses a manager who would close a loop', () => {
    expect(managerProblem('dev', 'head', people)).toBeNull();
    expect(managerProblem('head', '', people)).toBeNull();
    expect(managerProblem('head', 'head', people)).toMatch(/themselves/);
    expect(managerProblem('head', 'dev', people)).toMatch(/reports to this employee/);
    expect(managerProblem('ceo', 'lead', people)).toMatch(/reports to this employee/);
    expect(managerProblem('head', 'ghost', people)).toMatch(/Pick the manager/);
  });

  it('survives records that already loop', () => {
    const loop = [{ id: 'a', managerId: 'b' }, { id: 'b', managerId: 'a' }];
    expect(managersOf('a', loop)).toEqual(['b']);
    expect(teamOf('a', loop)).toEqual(['b']);
  });
});

describe('organization tree', () => {
  it('puts people under their manager, by name, with counts', () => {
    const tree = orgTree(people);
    expect(tree.map(n => n.person.id)).toEqual(['solo', 'ceo']); // Bala, Chitra
    const ceo = tree[1];
    expect(ceo.reports.map(n => n.person.id)).toEqual(['hr', 'head']); // Anu, Hari
    expect(ceo).toMatchObject({ directCount: 2, teamCount: 4 });
    expect(ceo.reports[1].reports[0]).toMatchObject({ directCount: 1, teamCount: 1 });
  });

  it('keeps someone whose manager is not in the list at the top', () => {
    const tree = orgTree([{ id: 'x', name: 'Xavier', managerId: 'gone' }, { id: 'y', name: 'Yamini', managerId: 'x' }]);
    expect(tree).toHaveLength(1);
    expect(tree[0].person.id).toBe('x');
    expect(tree[0].reports[0].person.id).toBe('y');
  });

  it('loses nobody when records loop', () => {
    const tree = orgTree([{ id: 'a', name: 'A', managerId: 'b' }, { id: 'b', name: 'B', managerId: 'a' }, { id: 'c', name: 'C', managerId: null }]);
    const count = (nodes: any[]): number => nodes.reduce((s, n) => s + 1 + count(n.reports), 0);
    expect(count(tree)).toBe(3);
  });
});

describe('probation and confirmation', () => {
  it('ends probation so many months after joining', () => {
    expect(probationEnds('2026-04-15', 6)).toBe('2026-10-15');
    expect(probationEnds('2026-08-31', 6)).toBe('2027-02-28'); // no 31 February
    expect(probationEnds('2026-11-10', 3)).toBe('2027-02-10');
    expect(probationEnds('2026-04-15', 0)).toBeNull();
    expect(probationEnds(null, 6)).toBeNull();
  });

  it('says when confirmation is due, and when it is overdue', () => {
    const p = { joinDate: '2026-04-15', probationMonths: 6, confirmationDate: null, employmentStatus: 'PROBATION' };
    expect(confirmationState(p, '2026-10-02')).toEqual({ dueOn: '2026-10-15', daysLeft: 13, overdue: false });
    expect(confirmationState(p, '2026-10-20')).toMatchObject({ daysLeft: -5, overdue: true });
  });

  it('asks nothing of someone confirmed, gone, or with no probation', () => {
    const p = { joinDate: '2026-04-15', probationMonths: 6, confirmationDate: null, employmentStatus: 'ACTIVE' };
    expect(confirmationState({ ...p, confirmationDate: '2026-10-15' }, '2026-11-01')).toBeNull();
    expect(confirmationState({ ...p, employmentStatus: 'RESIGNED' }, '2026-11-01')).toBeNull();
    expect(confirmationState({ ...p, probationMonths: 0 }, '2026-11-01')).toBeNull();
  });

  it('lists those overdue or due within the window, soonest first', () => {
    const list = [
      { id: 'later', joinDate: '2026-08-01', probationMonths: 6, employmentStatus: 'PROBATION' },   // Feb 2027
      { id: 'soon', joinDate: '2026-04-20', probationMonths: 6, employmentStatus: 'PROBATION' },    // 20 Oct
      { id: 'overdue', joinDate: '2026-03-01', probationMonths: 6, employmentStatus: 'PROBATION' }, // 1 Sep
      { id: 'done', joinDate: '2026-03-01', probationMonths: 6, confirmationDate: '2026-09-01', employmentStatus: 'ACTIVE' },
    ];
    const due = confirmationsDue(list, '2026-10-02');
    expect(due.map(d => d.person.id)).toEqual(['overdue', 'soon']);
    expect(due[0].overdue).toBe(true);
    expect(confirmationsDue(list, '2026-10-02', 365).map(d => d.person.id)).toEqual(['overdue', 'soon', 'later']);
  });
});

describe('notice period and job details', () => {
  it('uses the employee’s own notice period, else the company’s', () => {
    expect(noticeDaysFor({ noticePeriodDays: 60 }, 30)).toBe(60);
    expect(noticeDaysFor({ noticePeriodDays: 0 }, 30)).toBe(0);
    expect(noticeDaysFor({ noticePeriodDays: null }, 30)).toBe(30);
    expect(noticeDaysFor({}, 30)).toBe(30);
  });

  it('checks job details as typed', () => {
    expect(jobDetailsInput({ probationMonths: '6', noticePeriodDays: '', confirmationDate: '', referredBy: ' Asha ', employmentType: 'Permanent', joinDate: '2026-04-15' }))
      .toEqual({ probationMonths: 6, confirmationDate: null, noticePeriodDays: null, firstHireDate: null, referredBy: 'Asha', employmentType: 'Permanent' });
    expect(jobDetailsInput({ probationMonths: 40 })).toMatch(/up to 36/);
    expect(jobDetailsInput({ probationMonths: 1.5 })).toMatch(/whole number/);
    expect(jobDetailsInput({ noticePeriodDays: 400 })).toMatch(/up to 365/);
    expect(jobDetailsInput({ confirmationDate: '2026-13-01' })).toMatch(/valid confirmation date/);
    expect(jobDetailsInput({ confirmationDate: '2026-04-01', joinDate: '2026-04-15' })).toMatch(/before the joining date/);
    expect(jobDetailsInput({ firstHireDate: '2026-05-01', joinDate: '2026-04-15' })).toMatch(/after the joining date/);
  });
});
