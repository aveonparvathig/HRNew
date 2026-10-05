// Pure plan/limit rules — no DB, no Prisma. The gated add-on modules a plan can
// switch on or off; the core HR directory (people, org settings, self-service)
// is always available and is never listed here.
export const GATED_MODULES = ['project', 'recruitment', 'proposals', 'expenses', 'payroll'] as const;
export type ModuleKey = typeof GATED_MODULES[number];

export const MODULE_LABELS: Record<string, string> = {
  project: 'Project (income & clients)',
  recruitment: 'Recruitment',
  proposals: 'Proposals',
  expenses: 'Expenses',
  payroll: 'Payroll',
};

export interface PlanLike {
  maxEmployees: number;
  maxUsers: number;
  enabledModules: string[];
}

export interface OrgLike {
  plan?: PlanLike | null;
  maxEmployeesOverride?: number | null;
  maxUsersOverride?: number | null;
  trialEndsOn?: Date | string | null;
}

export interface EffectiveLimits {
  maxEmployees: number; // 0 = unlimited
  maxUsers: number;     // 0 = unlimited
  modules: string[];
}

// The limits actually in force: a per-tenant override beats the plan, and with
// no plan at all there are no caps and every module is on — so a tenant without
// a plan behaves exactly as before plans existed.
export function effectiveLimits(org: OrgLike): EffectiveLimits {
  const plan = org.plan || null;
  const maxEmployees = org.maxEmployeesOverride ?? plan?.maxEmployees ?? 0;
  const maxUsers = org.maxUsersOverride ?? plan?.maxUsers ?? 0;
  const modules = plan && plan.enabledModules.length ? [...plan.enabledModules] : [...GATED_MODULES];
  return { maxEmployees, maxUsers, modules };
}

export function moduleEnabled(org: OrgLike, key: string): boolean {
  return effectiveLimits(org).modules.includes(key);
}

// A cap of 0 means unlimited. "At capacity" = adding one more is not allowed.
export function atCapacity(current: number, max: number): boolean {
  return max > 0 && current >= max;
}

// A trial that has a date and whose date has passed.
export function trialExpired(org: OrgLike, now: Date = new Date()): boolean {
  if (!org.trialEndsOn) return false;
  return now.getTime() > new Date(org.trialEndsOn).getTime();
}
