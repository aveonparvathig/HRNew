import { describe, it, expect } from 'vitest';
import { approvalSteps, afterDecision, canApprove, isChainRouted } from '../expenseApproval';

describe('expense approval routing', () => {
  it('turns a chain into ordered steps (level 1 = direct manager)', () => {
    expect(approvalSteps([{ id: 'm', name: 'Manager' }, { id: 'h', name: 'Head' }, { id: 'c', name: 'CEO' }]))
      .toEqual([
        { level: 1, approverId: 'm', approverName: 'Manager' },
        { level: 2, approverId: 'h', approverName: 'Head' },
        { level: 3, approverId: 'c', approverName: 'CEO' },
      ]);
    expect(approvalSteps([])).toEqual([]);
    expect(isChainRouted(approvalSteps([]).length)).toBe(false);
    expect(isChainRouted(approvalSteps([{ id: 'm', name: 'M' }]).length)).toBe(true);
  });

  it('advances up the chain on approve, finishes at the top', () => {
    expect(afterDecision('approve', 1, 3)).toEqual({ status: 'SUBMITTED', nextLevel: 2 }); // manager approved -> head
    expect(afterDecision('approve', 2, 3)).toEqual({ status: 'SUBMITTED', nextLevel: 3 }); // head -> CEO
    expect(afterDecision('approve', 3, 3)).toEqual({ status: 'APPROVED', nextLevel: null }); // CEO signs -> done
    expect(afterDecision('approve', 1, 1)).toEqual({ status: 'APPROVED', nextLevel: null }); // single approver
  });

  it('rejects at any level', () => {
    expect(afterDecision('reject', 1, 3)).toEqual({ status: 'REJECTED', nextLevel: null });
    expect(afterDecision('reject', 3, 3)).toEqual({ status: 'REJECTED', nextLevel: null });
  });

  it('lets the current approver, Super Admin and HR act — nobody else', () => {
    const report = { currentApproverId: 'mgr1' };
    expect(canApprove(report, 'EMPLOYEE', 'mgr1')).toBe(true); // the current approver, even as an EMPLOYEE
    expect(canApprove(report, 'EMPLOYEE', 'someone')).toBe(false);
    expect(canApprove(report, 'HR', 'anyone')).toBe(true);
    expect(canApprove(report, 'SUPER_ADMIN', null)).toBe(true);
    expect(canApprove({ currentApproverId: null }, 'EMPLOYEE', 'mgr1')).toBe(false);
  });
});
