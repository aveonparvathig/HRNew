import { Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { AppError } from './errorHandler';

export type Role = 'SUPER_ADMIN' | 'HR' | 'EMPLOYEE';

// Fetch the caller's live role + person link once per request, so role
// changes and deactivation take effect immediately without re-login.
export async function loadActor(req: any) {
  if (req.actor) return req.actor;
  const user = await prisma.user.findUnique({
    where: { id: req.user?.userId },
    select: { id: true, role: true, isActive: true, personId: true, organizationId: true },
  });
  if (!user || !user.isActive) throw new AppError(401, 'Account is inactive');
  req.actor = user;
  return user;
}

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
