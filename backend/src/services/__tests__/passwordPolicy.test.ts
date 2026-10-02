import { describe, it, expect } from 'vitest';
import {
  DEFAULT_POLICY, PasswordPolicyLike, passwordProblem, lockState, isIndefinite, afterWrongPassword,
  expiryState, tempPasswordExpired, policyInput, ROLES, PAYROLL_EDIT_ROLES, PAYROLL_READ_ROLES,
} from '../passwordPolicy';

const at = (iso: string) => new Date(iso);
const NOW = at('2026-10-02T10:00:00.000Z');
const policy = (over: Partial<PasswordPolicyLike> = {}): PasswordPolicyLike => ({ ...DEFAULT_POLICY, ...over });

describe('the built-in policy', () => {
  it('is what the app did before: eight characters and nothing else', () => {
    expect(DEFAULT_POLICY).toMatchObject({ minLength: 8, lockoutAttempts: 0, expiryDays: 0, historyCount: 0, tempPasswordDays: 0 });
    expect(passwordProblem(DEFAULT_POLICY, 'abcdefgh')).toBeNull();
    expect(afterWrongPassword(DEFAULT_POLICY, 50, NOW, false).lockedUntil).toBeNull();
    expect(expiryState(DEFAULT_POLICY, at('2020-01-01T00:00:00Z'), NOW).expired).toBe(false);
  });
});

describe('a new password', () => {
  it('must reach the minimum length', () => {
    expect(passwordProblem(policy({ minLength: 10 }), 'abcdefghi')).toMatch(/at least 10/);
    expect(passwordProblem(policy({ minLength: 10 }), 'abcdefghij')).toBeNull();
  });

  it('cannot be endless or only spaces', () => {
    expect(passwordProblem(policy(), 'x'.repeat(129))).toMatch(/at most 128/);
    expect(passwordProblem(policy(), '         ')).toMatch(/only spaces/);
  });
});

describe('locking after wrong passwords', () => {
  const p = policy({ lockoutAttempts: 3, lockoutMinutes: 15 });

  it('counts up and says how many attempts are left', () => {
    expect(afterWrongPassword(p, 0, NOW, false)).toEqual({ failedAttempts: 1, lockedUntil: null, attemptsLeft: 2 });
    expect(afterWrongPassword(p, 1, NOW, false)).toEqual({ failedAttempts: 2, lockedUntil: null, attemptsLeft: 1 });
  });

  it('locks for the set time when the limit is reached', () => {
    const r = afterWrongPassword(p, 2, NOW, false);
    expect(r.failedAttempts).toBe(3);
    expect(r.lockedUntil).toEqual(at('2026-10-02T10:15:00.000Z'));
    expect(lockState(r.lockedUntil, NOW)).toMatchObject({ locked: true, indefinite: false });
    expect(lockState(r.lockedUntil, at('2026-10-02T10:15:01.000Z')).locked).toBe(false);
  });

  it('locks until an admin unlocks when no time is set', () => {
    const r = afterWrongPassword(policy({ lockoutAttempts: 3, lockoutMinutes: 0 }), 2, NOW, false);
    expect(isIndefinite(r.lockedUntil)).toBe(true);
    expect(lockState(r.lockedUntil, at('2090-01-01T00:00:00Z'))).toMatchObject({ locked: true, indefinite: true });
  });

  it('never locks a Super Admin without an end', () => {
    const r = afterWrongPassword(policy({ lockoutAttempts: 3, lockoutMinutes: 0 }), 2, NOW, true);
    expect(isIndefinite(r.lockedUntil)).toBe(false);
    expect(r.lockedUntil).toEqual(at('2026-10-02T10:30:00.000Z'));
  });

  it('reports no lock for an account that was never locked', () => {
    expect(lockState(null, NOW)).toEqual({ locked: false, indefinite: false, until: null });
  });
});

describe('password expiry', () => {
  const p = policy({ expiryDays: 90, expiryReminderDays: 7 });

  it('is quiet while the password is young', () => {
    expect(expiryState(p, at('2026-09-01T10:00:00Z'), NOW)).toEqual({ expired: false, daysLeft: 59, remind: false });
  });

  it('reminds in the last days', () => {
    expect(expiryState(p, at('2026-07-10T10:00:00Z'), NOW)).toEqual({ expired: false, daysLeft: 6, remind: true });
  });

  it('expires on the day and after', () => {
    expect(expiryState(p, at('2026-07-04T10:00:00Z'), NOW).expired).toBe(true);
    expect(expiryState(p, at('2026-01-01T00:00:00Z'), NOW).expired).toBe(true);
  });

  it('does nothing when the date the password was set is unknown', () => {
    expect(expiryState(p, null, NOW).expired).toBe(false);
  });
});

describe('temporary passwords', () => {
  const p = policy({ tempPasswordDays: 4 });

  it('stop working after the set days if never changed', () => {
    expect(tempPasswordExpired(p, true, at('2026-09-29T10:00:00Z'), NOW)).toBe(false);
    expect(tempPasswordExpired(p, true, at('2026-09-28T09:59:00Z'), NOW)).toBe(true);
  });

  it('do not apply to a password the user chose, or when the rule is off', () => {
    expect(tempPasswordExpired(p, false, at('2026-01-01T00:00:00Z'), NOW)).toBe(false);
    expect(tempPasswordExpired(policy(), true, at('2026-01-01T00:00:00Z'), NOW)).toBe(false);
  });
});

describe('policy settings', () => {
  it('takes whole numbers within limits', () => {
    const r = policyInput({ minLength: '12', lockoutAttempts: 5 }, DEFAULT_POLICY);
    expect(r.error).toBeNull();
    expect(r.policy).toMatchObject({ minLength: 12, lockoutAttempts: 5, lockoutMinutes: 30 });
  });

  it('refuses a length under eight, fractions and out-of-range values', () => {
    expect(policyInput({ minLength: 6 }, DEFAULT_POLICY).error).toMatch(/Minimum password length/);
    expect(policyInput({ lockoutAttempts: 2.5 }, DEFAULT_POLICY).error).toMatch(/whole number/);
    expect(policyInput({ historyCount: 99 }, DEFAULT_POLICY).error).toMatch(/0 to 12/);
  });

  it('wants the reminder to start inside the expiry period', () => {
    expect(policyInput({ expiryDays: 5, expiryReminderDays: 7 }, DEFAULT_POLICY).error).toMatch(/reminder/);
    expect(policyInput({ expiryDays: 30, expiryReminderDays: 7 }, DEFAULT_POLICY).error).toBeNull();
  });
});

describe('roles', () => {
  it('lets the payroll viewer read payroll and not edit it', () => {
    expect(ROLES).toContain('PAYROLL_VIEWER');
    expect(PAYROLL_READ_ROLES).toContain('PAYROLL_VIEWER');
    expect(PAYROLL_EDIT_ROLES).not.toContain('PAYROLL_VIEWER');
  });
});
