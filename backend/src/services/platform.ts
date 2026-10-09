import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '../config/database';
import { STANDARD_MODULES, effectiveLimits } from './planLimits';

// Default subscription tiers, seeded once on boot. The owner edits these in
// the console afterwards; re-seeding never overwrites an edited plan. Plans
// carry only STANDARD modules — custom modules (project/proposals) are granted
// per-tenant, never by a plan.
const DEFAULT_PLANS = [
  { code: 'TRIAL', name: 'Trial', maxEmployees: 10, maxUsers: 3, enabledModules: [...STANDARD_MODULES], trialDays: 14, price: 0, sortOrder: 0 },
  { code: 'STARTER', name: 'Starter', maxEmployees: 25, maxUsers: 5, enabledModules: ['payroll', 'expenses', 'leave'], trialDays: 0, price: 999, sortOrder: 1 },
  { code: 'GROWTH', name: 'Growth', maxEmployees: 100, maxUsers: 20, enabledModules: [...STANDARD_MODULES], trialDays: 0, price: 2999, sortOrder: 2 },
  { code: 'ENTERPRISE', name: 'Enterprise', maxEmployees: 0, maxUsers: 0, enabledModules: [...STANDARD_MODULES], trialDays: 0, price: 0, sortOrder: 3 },
];

// Seed the default plans once. Only inserts plans whose code does not exist yet,
// so an owner's edits (and removed tiers) are never clobbered.
export async function seedPlans(): Promise<void> {
  const existing = new Set((await prisma.plan.findMany({ select: { code: true } })).map(p => p.code));
  const missing = DEFAULT_PLANS.filter(p => !existing.has(p.code));
  if (missing.length === 0) return;
  await prisma.plan.createMany({ data: missing });
  console.log(`✓ Seeded ${missing.length} default plan(s)`);
}

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
  payrollRuns: number;
  storageBytes: number;
  // Plan & limits
  planId: string | null;
  planName: string | null;
  planCode: string | null;
  trialEndsOn: Date | null;
  maxEmployeesOverride: number | null;
  maxUsersOverride: number | null;
  customModules: string[]; // raw per-tenant custom-module grant (subset of CUSTOM_MODULES)
  limits: { maxEmployees: number; maxUsers: number; modules: string[] };
}

// Shape the plan-and-limit part of a tenant row from an org (with its plan).
function limitFields(o: any) {
  return {
    planId: o.planId ?? null,
    planName: o.plan?.name ?? null,
    planCode: o.plan?.code ?? null,
    trialEndsOn: o.trialEndsOn ?? null,
    maxEmployeesOverride: o.maxEmployeesOverride ?? null,
    maxUsersOverride: o.maxUsersOverride ?? null,
    customModules: o.customModules ?? [],
    limits: effectiveLimits(o),
  };
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
  const [orgs, userGroups, empGroups, peopleGroups, runGroups, storageGroups] = await Promise.all([
    prisma.organization.findMany({ orderBy: { createdAt: 'desc' }, include: { plan: true } }),
    prisma.user.groupBy({ by: ['organizationId'], _count: { _all: true }, _max: { lastLoginAt: true } }),
    prisma.person.groupBy({ by: ['organizationId'], where: { isEmployee: true }, _count: { _all: true } }),
    prisma.person.groupBy({ by: ['organizationId'], _count: { _all: true } }),
    prisma.payrollRun.groupBy({ by: ['organizationId'], _count: { _all: true } }),
    prisma.employeeDocument.groupBy({ by: ['organizationId'], _sum: { sizeBytes: true } }),
  ]);

  const userBy = new Map(userGroups.map(g => [g.organizationId, g]));
  const empBy = new Map(empGroups.map(g => [g.organizationId, g._count._all]));
  const peopleBy = new Map(peopleGroups.map(g => [g.organizationId, g._count._all]));
  const runBy = new Map(runGroups.map(g => [g.organizationId, g._count._all]));
  const storageBy = new Map(storageGroups.map(g => [g.organizationId, g._sum.sizeBytes ?? 0]));

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
    payrollRuns: runBy.get(o.id) ?? 0,
    storageBytes: storageBy.get(o.id) ?? 0,
    ...limitFields(o),
  }));
}

// 'YYYY-MM' for the last `months` calendar months, oldest first.
function recentMonths(months: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export interface PlatformOverview {
  totals: {
    tenants: number; active: number; suspended: number;
    users: number; employees: number; people: number; payrollRuns: number; storageBytes: number;
  };
  byPlan: { name: string; count: number }[];
  signups: { month: string; count: number }[];
  tenants: TenantUsage[];
}

// Platform-wide usage: totals, tenants-per-plan, a 12-month signup trend, and
// the full per-tenant table (for the on-screen list and CSV export).
export async function platformOverview(): Promise<PlatformOverview> {
  const tenants = await tenantsOverview();
  const sum = (f: (t: TenantUsage) => number) => tenants.reduce((s, t) => s + f(t), 0);

  const planCounts = new Map<string, number>();
  for (const t of tenants) {
    const key = t.planName || 'No plan';
    planCounts.set(key, (planCounts.get(key) ?? 0) + 1);
  }

  const months = recentMonths(12);
  const signupCounts = new Map(months.map(m => [m, 0]));
  for (const t of tenants) {
    const key = `${t.createdAt.getFullYear()}-${String(t.createdAt.getMonth() + 1).padStart(2, '0')}`;
    if (signupCounts.has(key)) signupCounts.set(key, (signupCounts.get(key) ?? 0) + 1);
  }

  return {
    totals: {
      tenants: tenants.length,
      active: tenants.filter(t => t.status === 'ACTIVE').length,
      suspended: tenants.filter(t => t.status === 'SUSPENDED').length,
      users: sum(t => t.users),
      employees: sum(t => t.employees),
      people: sum(t => t.people),
      payrollRuns: sum(t => t.payrollRuns),
      storageBytes: sum(t => t.storageBytes),
    },
    byPlan: [...planCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    signups: months.map(m => ({ month: m, count: signupCounts.get(m) ?? 0 })),
    tenants,
  };
}

// One tenant's usage, or null when it does not exist.
export async function tenantDetail(orgId: string): Promise<TenantUsage | null> {
  const o = await prisma.organization.findUnique({ where: { id: orgId }, include: { plan: true } });
  if (!o) return null;
  const [users, employees, people, lastUser, payrollRuns, storage] = await Promise.all([
    prisma.user.count({ where: { organizationId: orgId } }),
    prisma.person.count({ where: { organizationId: orgId, isEmployee: true } }),
    prisma.person.count({ where: { organizationId: orgId } }),
    prisma.user.findFirst({
      where: { organizationId: orgId, lastLoginAt: { not: null } },
      orderBy: { lastLoginAt: 'desc' }, select: { lastLoginAt: true },
    }),
    prisma.payrollRun.count({ where: { organizationId: orgId } }),
    prisma.employeeDocument.aggregate({ where: { organizationId: orgId }, _sum: { sizeBytes: true } }),
  ]);
  return {
    id: o.id, name: o.name, email: o.email, status: o.status, createdVia: o.createdVia,
    suspendedAt: o.suspendedAt, suspendedReason: o.suspendedReason, createdAt: o.createdAt,
    users, employees, people, lastLoginAt: lastUser?.lastLoginAt ?? null,
    payrollRuns, storageBytes: storage._sum.sizeBytes ?? 0,
    ...limitFields(o),
  };
}
