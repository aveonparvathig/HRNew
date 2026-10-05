import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { prisma } from '../config/database';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import {
  DEFAULT_POLICY, afterWrongPassword, expiryState, lockState, passwordProblem, tempPasswordExpired,
} from '../services/passwordPolicy';
import { policyFor, recordLogin, setPassword } from '../services/accountSecurity';
import { effectiveLimits, trialExpired } from '../services/planLimits';

// What the tenant frontend needs to gate modules and show its plan.
const orgPayload = (org: any) => {
  const limits = effectiveLimits(org || {});
  return {
    status: org?.status ?? 'ACTIVE',
    planName: org?.plan?.name ?? null,
    trialEndsOn: org?.trialEndsOn ?? null,
    modules: limits.modules,
    limits: { maxEmployees: limits.maxEmployees, maxUsers: limits.maxUsers },
  };
};

// Refresh tokens live in the database (hashed) - they survive restarts and
// can be revoked per-session.
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // matches the JWT's 7d expiry
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

async function storeRefreshToken(userId: string, token: string) {
  // Opportunistic cleanup of this user's expired sessions.
  await prisma.refreshToken.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
}

const userJSON = (user: any) => ({
  userId: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  organizationId: user.organizationId,
  role: user.role,
  personId: user.personId || null,
  mustChangePassword: user.mustChangePassword || false,
});

export const authController = {
  async signup(req: Request, res: Response) {
    const { email, password, firstName, lastName, organizationName } = req.body;

    if (!email || !password || !organizationName) {
      throw new AppError(400, 'Email, password, and organization name are required');
    }
    // A new organization has no policy yet: the built-in rules apply
    const problem = passwordProblem(DEFAULT_POLICY, String(password));
    if (problem) throw new AppError(400, problem);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, 'User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const organization = await prisma.organization.create({
      data: {
        name: String(organizationName).trim(),
        users: {
          create: {
            email,
            password: hashedPassword,
            passwordChangedAt: new Date(),
            firstName: firstName || '',
            lastName: lastName || '',
          },
        },
      },
      include: { users: true },
    });
    const user = organization.users[0];

    const accessToken = generateAccessToken(user.id, email, organization.id);
    const refreshToken = generateRefreshToken(user.id, organization.id);
    await storeRefreshToken(user.id, refreshToken);

    res.status(201).json({ user: userJSON(user), accessToken, refreshToken });
  },

  async login(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }

    const found = await prisma.user.findUnique({ where: { email } });
    if (!found) {
      throw new AppError(401, 'Invalid email or password');
    }
    const policy = await policyFor(found.organizationId);
    const now = new Date();

    // A locked account refuses even the right password until the lock ends
    const lock = lockState(found.lockedUntil, now);
    if (lock.locked) {
      await recordLogin(found, 'LOCKED', req);
      const minutes = Math.max(1, Math.ceil((lock.until!.getTime() - now.getTime()) / 60000));
      throw new AppError(403, lock.indefinite
        ? 'This account is locked after too many wrong passwords. Ask an admin to unlock it.'
        : `This account is locked after too many wrong passwords. Try again in ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}, or ask an admin to unlock it.`);
    }

    const isPasswordValid = await bcrypt.compare(password, found.password);
    if (!isPasswordValid) {
      // A lock that has run out starts the count afresh
      const counted = found.lockedUntil ? 0 : found.failedAttempts;
      const next = afterWrongPassword(policy, counted, now, found.role === 'SUPER_ADMIN');
      await prisma.user.update({
        where: { id: found.id }, data: { failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil },
      });
      await recordLogin(found, 'WRONG_PASSWORD', req);
      if (next.lockedUntil) {
        throw new AppError(401, 'Invalid email or password. The account is now locked after too many wrong passwords.');
      }
      throw new AppError(401, next.attemptsLeft !== null && next.attemptsLeft <= 2
        ? `Invalid email or password. ${next.attemptsLeft} more wrong ${next.attemptsLeft === 1 ? 'attempt' : 'attempts'} will lock the account.`
        : 'Invalid email or password');
    }
    if (!found.isActive) {
      await recordLogin(found, 'DISABLED', req);
      throw new AppError(403, 'This account has been disabled. Contact your organization owner.');
    }
    // A suspended tenant — or one whose trial has run out — cannot sign in.
    let org = await prisma.organization.findUnique({
      where: { id: found.organizationId },
      select: {
        status: true, trialEndsOn: true, maxEmployeesOverride: true, maxUsersOverride: true,
        plan: { select: { name: true, maxEmployees: true, maxUsers: true, enabledModules: true } },
      },
    });
    if (org?.status === 'ACTIVE' && trialExpired(org)) {
      await prisma.organization.update({
        where: { id: found.organizationId },
        data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: 'Trial ended' },
      });
      await recordLogin(found, 'DISABLED', req);
      throw new AppError(403, 'Your trial has ended. Contact support to continue.');
    }
    if (org?.status === 'SUSPENDED') {
      await recordLogin(found, 'DISABLED', req);
      throw new AppError(403, 'This organization has been suspended. Contact support.');
    }
    if (tempPasswordExpired(policy, found.mustChangePassword, found.passwordChangedAt, now)) {
      await recordLogin(found, 'TEMP_EXPIRED', req);
      throw new AppError(403, 'Your temporary password has expired. Ask an admin to set a new one.');
    }

    // A password past its age must be changed before anything else
    const expiry = expiryState(policy, found.passwordChangedAt, now);
    const user = await prisma.user.update({
      where: { id: found.id },
      data: {
        failedAttempts: 0, lockedUntil: null, lastLoginAt: now,
        mustChangePassword: found.mustChangePassword || expiry.expired,
      },
    });
    await recordLogin(user, 'SUCCESS', req);

    const accessToken = generateAccessToken(user.id, email, user.organizationId);
    const refreshToken = generateRefreshToken(user.id, user.organizationId);
    await storeRefreshToken(user.id, refreshToken);

    res.json({
      user: { ...userJSON(user), passwordExpired: expiry.expired && !found.mustChangePassword },
      org: orgPayload(org),
      accessToken, refreshToken,
      // Set when the password is close to its expiry, for a reminder
      passwordExpiresInDays: expiry.remind ? expiry.daysLeft : null,
    });
  },

  // What a new password must satisfy, for the hint beside the field
  async passwordRules(req: any, res: Response) {
    const policy = await policyFor(req.user?.organizationId);
    res.json({ minLength: policy.minLength, historyCount: policy.historyCount, expiryDays: policy.expiryDays });
  },

  // Authenticated password change; clears the first-login force flag
  async changePassword(req: any, res: Response) {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      throw new AppError(400, 'Current and new password are required');
    }
    const user = await prisma.user.findUnique({ where: { id: req.user?.userId } });
    if (!user) throw new AppError(404, 'User not found');
    const ok = await bcrypt.compare(currentPassword, user.password);
    // 400, not 401: the session is fine, only the typed password is wrong
    if (!ok) throw new AppError(400, 'Current password is incorrect');
    await setPassword(user, String(newPassword), await policyFor(user.organizationId), { temporary: false });
    res.json({ message: 'Password changed' });
  },

  async refresh(req: Request, res: Response) {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError(400, 'Refresh token is required');
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      throw new AppError(401, 'Invalid or expired refresh token');
    }
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError(401, 'Refresh token has been revoked');
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { organization: { select: { status: true, trialEndsOn: true } } },
    });
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    if (!user.isActive) {
      throw new AppError(403, 'This account has been disabled. Contact your organization owner.');
    }
    if (user.organization?.status === 'ACTIVE' && trialExpired(user.organization)) {
      await prisma.organization.update({
        where: { id: user.organizationId },
        data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: 'Trial ended' },
      });
      throw new AppError(403, 'Your trial has ended. Contact support to continue.');
    }
    if (user.organization?.status === 'SUSPENDED') {
      throw new AppError(403, 'This organization has been suspended. Contact support.');
    }

    const newAccessToken = generateAccessToken(user.id, user.email, user.organizationId);
    res.json({ accessToken: newAccessToken, refreshToken });
  },

  async logout(req: Request, res: Response) {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { tokenHash: hashToken(refreshToken) },
      });
    }
    res.json({ message: 'Logged out successfully' });
  },

  async getCurrentUser(req: any, res: Response) {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      include: { organization: { include: { plan: true } } },
    });
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    res.json({
      user: { ...userJSON(user), organizationName: user.organization.name },
      org: orgPayload(user.organization),
    });
  },
};
