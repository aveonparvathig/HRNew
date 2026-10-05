import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../config/database';

// A temporary password for an owner-created tenant admin: random, with a fixed
// tail so it always clears the default policy (length + mixed classes). The
// owner relays it once; the admin must change it at first sign-in.
export function genTempPassword(): string {
  return randomBytes(9).toString('base64url') + 'aA1!';
}

// One tenant's headline usage, for the console list and detail.
export interface TenantUsage {
  id: string;
  name: string;
  email: string;
  status: string;
  createdVia: string;
  suspendedAt: Date | null;
  suspendedReason: string;
  createdAt: Date;
  users: number;
  employees: number;
  people: number;
  lastLoginAt: Date | null;
}

// Seed the very first platform owner from env, once, on boot. Never creates a
// second owner (further owners are added in-console) and never overwrites one.
export async function seedPlatformOwner(): Promise<void> {
  const email = process.env.PLATFORM_OWNER_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_OWNER_PASSWORD;
  if (!email || !password) return;

  const count = await prisma.platformAdmin.count();
  if (count > 0) return;

  await prisma.platformAdmin.create({
    data: {
      email,
      password: await bcrypt.hash(password, 10),
      name: process.env.PLATFORM_OWNER_NAME?.trim() || 'Platform Owner',
    },
  });
  console.log(`✓ Seeded first platform owner: ${email}`);
}

// Record a platform-owner action. Only what changed is kept — never a tenant's
// own data values.
export async function logPlatform(
  actorEmail: string,
  action: string,
  organizationId?: string | null,
  detail = '',
): Promise<void> {
  await prisma.platformAuditLog.create({
    data: { actorEmail, action, organizationId: organizationId || null, detail },
  });
}

// Every tenant with its headline usage, newest first. Counts are gathered with
// grouped queries so the number of round-trips does not grow with tenant count.
export async function tenantsOverview(): Promise<TenantUsage[]> {
  const [orgs, userGroups, empGroups, peopleGroups] = await Promise.all([
    prisma.organization.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.user.groupBy({ by: ['organizationId'], _count: { _all: true }, _max: { lastLoginAt: true } }),
    prisma.person.groupBy({ by: ['organizationId'], where: { isEmployee: true }, _count: { _all: true } }),
    prisma.person.groupBy({ by: ['organizationId'], _count: { _all: true } }),
  ]);

  const userBy = new Map(userGroups.map(g => [g.organizationId, g]));
  const empBy = new Map(empGroups.map(g => [g.organizationId, g._count._all]));
  const peopleBy = new Map(peopleGroups.map(g => [g.organizationId, g._count._all]));

  return orgs.map(o => ({
    id: o.id,
    name: o.name,
    email: o.email,
    status: o.status,
    createdVia: o.createdVia,
    suspendedAt: o.suspendedAt,
    suspendedReason: o.suspendedReason,
    createdAt: o.createdAt,
    users: userBy.get(o.id)?._count._all ?? 0,
    employees: empBy.get(o.id) ?? 0,
    people: peopleBy.get(o.id) ?? 0,
    lastLoginAt: userBy.get(o.id)?._max.lastLoginAt ?? null,
  }));
}

// One tenant's usage, or null when it does not exist.
export async function tenantDetail(orgId: string): Promise<TenantUsage | null> {
  const o = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!o) return null;
  const [users, employees, people, lastUser] = await Promise.all([
    prisma.user.count({ where: { organizationId: orgId } }),
    prisma.person.count({ where: { organizationId: orgId, isEmployee: true } }),
    prisma.person.count({ where: { organizationId: orgId } }),
    prisma.user.findFirst({
      where: { organizationId: orgId, lastLoginAt: { not: null } },
      orderBy: { lastLoginAt: 'desc' }, select: { lastLoginAt: true },
    }),
  ]);
  return {
    id: o.id, name: o.name, email: o.email, status: o.status, createdVia: o.createdVia,
    suspendedAt: o.suspendedAt, suspendedReason: o.suspendedReason, createdAt: o.createdAt,
    users, employees, people, lastLoginAt: lastUser?.lastLoginAt ?? null,
  };
}
