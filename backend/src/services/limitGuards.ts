import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { effectiveLimits, atCapacity } from './planLimits';

// The plan limits in force for a tenant (override beats plan; no plan = none).
async function limitsFor(orgId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      maxEmployeesOverride: true, maxUsersOverride: true,
      plan: { select: { maxEmployees: true, maxUsers: true, enabledModules: true } },
    },
  });
  return effectiveLimits(org || {});
}

// Refuse creating another login once the plan's user cap is reached.
export async function assertUserCapacity(orgId: string, adding = 1): Promise<void> {
  const { maxUsers } = await limitsFor(orgId);
  if (maxUsers <= 0) return; // unlimited / no plan
  const current = await prisma.user.count({ where: { organizationId: orgId } });
  if (current + adding > maxUsers) {
    throw new AppError(403, `Your plan allows ${maxUsers} login${maxUsers === 1 ? '' : 's'}. Remove one or ask the platform owner to raise the limit.`);
  }
}

// Refuse turning another person into an employee once the cap is reached.
// `adding` lets bulk callers (import) check the whole batch at once.
export async function assertEmployeeCapacity(orgId: string, adding = 1): Promise<void> {
  const { maxEmployees } = await limitsFor(orgId);
  if (maxEmployees <= 0) return;
  const current = await prisma.person.count({ where: { organizationId: orgId, isEmployee: true } });
  if (atCapacity(current, maxEmployees) || current + adding > maxEmployees) {
    throw new AppError(403, `Your plan allows ${maxEmployees} employees. Ask the platform owner to raise the limit to add more.`);
  }
}
