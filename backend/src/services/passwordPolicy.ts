// Sign-in security rules: what a password must be, when an account locks,
// and when a password runs out. Pure, DB-independent; every limit comes
// from the organization's policy.

export interface PasswordPolicyLike {
  minLength: number;
  lockoutAttempts: number;    // wrong passwords in a row before the account locks (0 = never)
  lockoutMinutes: number;     // how long it stays locked (0 = until an admin unlocks it)
  expiryDays: number;         // a password must be changed after this many days (0 = never)
  expiryReminderDays: number; // days before expiry the user is reminded
  historyCount: number;       // earlier passwords that cannot be used again (0 = any)
  tempPasswordDays: number;   // a password set by an admin must be changed within this many days (0 = no limit)
}

// What the app did before a policy existed: eight characters, nothing else.
export const DEFAULT_POLICY: PasswordPolicyLike = {
  minLength: 8, lockoutAttempts: 0, lockoutMinutes: 30,
  expiryDays: 0, expiryReminderDays: 7, historyCount: 0, tempPasswordDays: 0,
};

export const POLICY_LIMITS: Record<keyof PasswordPolicyLike, [number, number]> = {
  minLength: [8, 64],
  lockoutAttempts: [0, 20],
  lockoutMinutes: [0, 1440],
  expiryDays: [0, 730],
  expiryReminderDays: [0, 60],
  historyCount: [0, 12],
  tempPasswordDays: [0, 90],
};

export const POLICY_LABELS: Record<keyof PasswordPolicyLike, string> = {
  minLength: 'Minimum password length',
  lockoutAttempts: 'Wrong passwords before locking',
  lockoutMinutes: 'Minutes an account stays locked',
  expiryDays: 'Days before a password must be changed',
  expiryReminderDays: 'Days of reminder before expiry',
  historyCount: 'Earlier passwords that cannot be reused',
  tempPasswordDays: 'Days a temporary password stays usable',
};

export const MAX_PASSWORD_LENGTH = 128;
const DAY = 24 * 60 * 60 * 1000;

// Why a new password is not acceptable, or null when it is. Reuse of an
// earlier password is checked separately, against the stored hashes.
export function passwordProblem(policy: PasswordPolicyLike, password: string): string | null {
  if (password.length < policy.minLength) return `The password must be at least ${policy.minLength} characters`;
  if (password.length > MAX_PASSWORD_LENGTH) return `The password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  if (!password.trim()) return 'The password cannot be only spaces';
  return null;
}

// A lock with no end stays until an admin lifts it.
const INDEFINITE = new Date('9999-12-31T00:00:00.000Z');
export const isIndefinite = (until: Date | null | undefined) => Boolean(until && until.getUTCFullYear() >= 9999);

export function lockState(lockedUntil: Date | null | undefined, now: Date) {
  const locked = Boolean(lockedUntil && lockedUntil > now);
  return { locked, indefinite: locked && isIndefinite(lockedUntil), until: locked ? lockedUntil! : null };
}

// One more wrong password: the new count, and the lock if the limit is
// reached. A Super Admin is never locked without an end, so the people
// who can unlock accounts cannot all be shut out.
export function afterWrongPassword(
  policy: PasswordPolicyLike, failedAttempts: number, now: Date, isSuperAdmin: boolean,
): { failedAttempts: number; lockedUntil: Date | null; attemptsLeft: number | null } {
  const count = failedAttempts + 1;
  if (policy.lockoutAttempts <= 0) return { failedAttempts: count, lockedUntil: null, attemptsLeft: null };
  if (count < policy.lockoutAttempts) {
    return { failedAttempts: count, lockedUntil: null, attemptsLeft: policy.lockoutAttempts - count };
  }
  const minutes = policy.lockoutMinutes > 0 ? policy.lockoutMinutes : isSuperAdmin ? 30 : 0;
  return {
    failedAttempts: count,
    lockedUntil: minutes > 0 ? new Date(now.getTime() + minutes * 60 * 1000) : INDEFINITE,
    attemptsLeft: 0,
  };
}

// Whether the password has run out, and how many days it has left when
// that is close enough to remind about.
export function expiryState(policy: PasswordPolicyLike, passwordChangedAt: Date | null | undefined, now: Date) {
  if (policy.expiryDays <= 0 || !passwordChangedAt) return { expired: false, daysLeft: null as number | null, remind: false };
  const expiresAt = passwordChangedAt.getTime() + policy.expiryDays * DAY;
  const daysLeft = Math.ceil((expiresAt - now.getTime()) / DAY);
  return { expired: daysLeft <= 0, daysLeft, remind: daysLeft > 0 && daysLeft <= policy.expiryReminderDays };
}

// A password set by an admin and never changed stops working after the
// policy's number of days.
export function tempPasswordExpired(
  policy: PasswordPolicyLike, mustChangePassword: boolean, passwordChangedAt: Date | null | undefined, now: Date,
): boolean {
  if (!mustChangePassword || policy.tempPasswordDays <= 0 || !passwordChangedAt) return false;
  return now.getTime() > passwordChangedAt.getTime() + policy.tempPasswordDays * DAY;
}

// A policy as typed on the settings screen: whole numbers within limits.
export function policyInput(b: any, current: PasswordPolicyLike): { policy: PasswordPolicyLike; error: string | null } {
  const policy = { ...current };
  for (const key of Object.keys(POLICY_LIMITS) as (keyof PasswordPolicyLike)[]) {
    if (b[key] === undefined) continue;
    const value = Number(b[key]);
    const [min, max] = POLICY_LIMITS[key];
    if (!Number.isInteger(value) || value < min || value > max) {
      return { policy: current, error: `${POLICY_LABELS[key]} must be a whole number from ${min} to ${max}` };
    }
    policy[key] = value;
  }
  if (policy.expiryDays > 0 && policy.expiryReminderDays >= policy.expiryDays) {
    return { policy: current, error: 'The reminder must start fewer days ahead than the expiry itself' };
  }
  return { policy, error: null };
}

// How a sign-in attempt ended
export type LoginResult = 'SUCCESS' | 'WRONG_PASSWORD' | 'LOCKED' | 'DISABLED' | 'TEMP_EXPIRED';

export const LOGIN_RESULT_LABELS: Record<LoginResult, string> = {
  SUCCESS: 'Signed in',
  WRONG_PASSWORD: 'Wrong password',
  LOCKED: 'Refused: account locked',
  DISABLED: 'Refused: account disabled',
  TEMP_EXPIRED: 'Refused: temporary password expired',
};

// Roles and what each may do with payroll
export const ROLES = ['SUPER_ADMIN', 'HR', 'PAYROLL_VIEWER', 'EMPLOYEE', 'MARKETING'];
export const PAYROLL_EDIT_ROLES = ['SUPER_ADMIN', 'HR'];
export const PAYROLL_READ_ROLES = ['SUPER_ADMIN', 'HR', 'PAYROLL_VIEWER'];
