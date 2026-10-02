// Sign-in security in the database: the organization's policy, setting a
// password under it, and the record of sign-in attempts.
import * as bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { LoginResult, PasswordPolicyLike, passwordProblem } from './passwordPolicy';

// Old hashes kept per user: enough for the longest reuse rule
const HISTORY_KEPT = 12;
// Sign-in attempts are kept for half a year
export const LOGIN_EVENT_DAYS = 180;

export const policyFor = (organizationId: string) =>
  prisma.passwordPolicy.upsert({ where: { organizationId }, create: { organizationId }, update: {} });

// Set a user's password under the policy. The outgoing password goes into
// the history; a password matching the current one or one of the last
// `historyCount` is refused. `temporary` marks one set by an admin, which
// the user must change at next sign-in.
export async function setPassword(
  user: { id: string; password: string }, newPassword: string, policy: PasswordPolicyLike, opts: { temporary: boolean },
) {
  const problem = passwordProblem(policy, newPassword);
  if (problem) throw new AppError(400, problem);
  if (await bcrypt.compare(newPassword, user.password)) {
    throw new AppError(400, 'The new password must be different from the current one');
  }
  if (policy.historyCount > 0) {
    const earlier = await prisma.passwordHistory.findMany({
      where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: policy.historyCount,
    });
    for (const old of earlier) {
      if (await bcrypt.compare(newPassword, old.hash)) {
        throw new AppError(400, `That password was used recently. Choose one that is not among the last ${policy.historyCount}.`);
      }
    }
  }
  await prisma.$transaction([
    prisma.passwordHistory.create({ data: { userId: user.id, hash: user.password } }),
    prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(newPassword, 10),
        passwordChangedAt: new Date(),
        mustChangePassword: opts.temporary,
        failedAttempts: 0,
        lockedUntil: null,
      },
    }),
  ]);
  const stale = await prisma.passwordHistory.findMany({
    where: { userId: user.id }, orderBy: { createdAt: 'desc' }, skip: HISTORY_KEPT, select: { id: true },
  });
  if (stale.length) await prisma.passwordHistory.deleteMany({ where: { id: { in: stale.map(h => h.id) } } });
}

export const clientAddress = (req: any) => String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');

export async function recordLogin(user: { id: string; organizationId: string; email: string }, result: LoginResult, req: any) {
  await prisma.loginEvent.create({
    data: {
      organizationId: user.organizationId, userId: user.id, email: user.email, result,
      ip: clientAddress(req), userAgent: String(req.headers?.['user-agent'] || '').slice(0, 200),
    },
  });
}
