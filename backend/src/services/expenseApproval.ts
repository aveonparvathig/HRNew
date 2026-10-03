// Expense approval routing (phase 26): turning an employee's reporting
// chain into ordered sign-off steps, and advancing them. Pure.

export interface ChainMember { id: string; name: string }

// The approval steps for a report, from the submitter's chain. Level 1 is
// the direct manager, up to the top. Empty chain = no manager -> HR.
export function approvalSteps(chain: ChainMember[]) {
  return chain.map((m, i) => ({ level: i + 1, approverId: m.id, approverName: m.name }));
}

// What the report becomes after the current level decides. On approve it
// advances to the next level, or finishes (APPROVED) once the top signs.
// On reject it is REJECTED. nextLevel is the level now awaiting, or null.
export function afterDecision(decision: 'approve' | 'reject', level: number, total: number): { status: 'SUBMITTED' | 'APPROVED' | 'REJECTED'; nextLevel: number | null } {
  if (decision === 'reject') return { status: 'REJECTED', nextLevel: null };
  if (level >= total) return { status: 'APPROVED', nextLevel: null };
  return { status: 'SUBMITTED', nextLevel: level + 1 };
}

// Who may act on a chain-routed report's current step: the level's own
// approver, or Super Admin / HR (who can step in at any point).
export function canApprove(report: { currentApproverId?: string | null }, role: string, personId?: string | null): boolean {
  if (role === 'SUPER_ADMIN' || role === 'HR') return true;
  return Boolean(report.currentApproverId) && report.currentApproverId === personId;
}

// A report is routed through a chain when it has steps; otherwise (no
// manager) it is approved by HR directly, as before.
export const isChainRouted = (stepCount: number) => stepCount > 0;
