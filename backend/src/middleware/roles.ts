import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError } from './errorHandler';
import { effectiveLimits, trialExpired } from '../services/planLimits';

export type Role = 'SUPER_ADMIN' | 'HR' | 'PAYROLL_VIEWER' | 'EMPLOYEE' | 'MARKETING';

// Fetch the caller's live role + person link once per request, so role
// changes and deactivation take effect immediately without re-login. Also
// resolves the tenant's plan limits and enforces suspension / trial expiry.
export async function loadActor(req: any) {
  if (req.actor) return req.actor;
  const user = await prisma.user.findUnique({
    where: { id: req.user?.userId },
    select: {
      id: true, role: true, isActive: true, personId: true, organizationId: true,
      organization: {
        select: {
          status: true, trialEndsOn: true, maxEmployeesOverride: true, maxUsersOverride: true,
          plan: { select: { maxEmployees: true, maxUsers: true, enabledModules: true } },
        },
      },
    },
  });
  if (!user || !user.isActive) throw new AppError(401, 'Account is inactive');
  const org = user.organization;
  // A platform-owner support session may view a suspended or trial-ended
  // tenant; everyone else is blocked.
  if (!req.user?.support) {
    // A trial that has run out suspends the tenant on first touch after expiry.
    if (org?.status === 'ACTIVE' && trialExpired(org)) {
      await prisma.organization.update({
        where: { id: user.organizationId },
        data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: 'Trial ended' },
      });
      throw new AppError(403, 'Your trial has ended. Contact support to continue.');
    }
    // A suspended tenant is frozen even for already-issued sessions.
    if (org?.status === 'SUSPENDED') {
      throw new AppError(403, 'This organization has been suspended. Contact support.');
    }
  }
  (user as any).orgLimits = effectiveLimits(org || {});
  req.actor = user;
  return user;
}

// Refuse a request when the tenant's plan does not include this module.
export const requireModule = (key: string) =>
  (req: any, _res: Response, next: NextFunction) => {
    loadActor(req)
      .then(actor => {
        if (!actor.orgLimits.modules.includes(key)) {
          throw new AppError(403, 'This module is not included in your plan');
        }
        next();
      })
      .catch(next);
  };

export const requireRole = (...roles: Role[]) =>
  (req: any, _res: Response, next: NextFunction) => {
    loadActor(req)
      .then(actor => {
        if (!roles.includes(actor.role)) {
          throw new AppError(403, 'You do not have access to this section');
        }
        next();
      })
      .catch(next);
  };

// A role that may open a section but change nothing in it: anything other
// than reading is refused.
export const readOnlyFor = (...roles: Role[]) =>
  (req: any, _res: Response, next: NextFunction) => {
    loadActor(req)
      .then(actor => {
        if (roles.includes(actor.role) && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
          throw new AppError(403, 'Your login can view payroll but not change it');
        }
        next();
      })
      .catch(next);
  };

// The Person record behind an EMPLOYEE login — the "own data" key.
export async function actorPerson(req: any) {
  const actor = await loadActor(req);
  if (!actor.personId) throw new AppError(403, 'Your login is not linked to an employee record — ask an admin');
  const person = await prisma.person.findUnique({ where: { id: actor.personId } });
  if (!person) throw new AppError(403, 'Linked employee record not found');
  return person;
}

export async function actorIsEmployee(req: any): Promise<boolean> {
  return (await loadActor(req)).role === 'EMPLOYEE';
}
