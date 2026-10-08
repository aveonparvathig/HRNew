// Pure plan/limit rules — no DB, no Prisma. The gated add-on modules a plan can
// switch on or off; the core HR directory (people, org settings, self-service)
// is always available and is never listed here.
export const GATED_MODULES = ['project', 'recruitment', 'proposals', 'expenses', 'payroll', 'leave'] as const;
export type ModuleKey = typeof GATED_MODULES[number];

// Custom / internal modules: never part of a standard plan and never on by
// default. They are granted per-tenant (Organization.customModules) from the
// platform console — e.g. Aveon Infotech's own Project (billing) & Sales
// (proposals) modules, which other tenants must never see.
export const CUSTOM_MODULES = ['project', 'proposals'] as const;
export type CustomModuleKey = typeof CUSTOM_MODULES[number];

// The modules a plan may switch on (everything gateable except the custom ones).
export const STANDARD_MODULES = GATED_MODULES.filter(
  m => !(CUSTOM_MODULES as readonly string[]).includes(m),
) as Exclude<ModuleKey, CustomModuleKey>[];

export const MODULE_LABELS: Record<string, string> = {
  project: 'Project (income & clients)',
  recruitment: 'Recruitment',
  proposals: 'Proposals (Sales)',
  expenses: 'Expenses',
  payroll: 'Payroll',
  leave: 'Leave & Attendance',
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
  customModules?: string[] | null; // platform-granted custom modules (subset of CUSTOM_MODULES)
}

export interface EffectiveLimits {
  maxEmployees: number; // 0 = unlimited
  maxUsers: number;     // 0 = unlimited
  modules: string[];
}

// The limits actually in force: a per-tenant override beats the plan, and with
// no plan at all there are no caps and every STANDARD module is on. Custom
// modules (project/proposals) are NEVER granted by a plan or the no-plan
// default — only by an explicit per-tenant grant (org.customModules), so other
// tenants never see them.
export function effectiveLimits(org: OrgLike): EffectiveLimits {
  const plan = org.plan || null;
  const maxEmployees = org.maxEmployeesOverride ?? plan?.maxEmployees ?? 0;
  const maxUsers = org.maxUsersOverride ?? plan?.maxUsers ?? 0;
  const planModules = plan && plan.enabledModules.length ? plan.enabledModules : STANDARD_MODULES;
  // Strip any custom module that leaked into a plan; they come only from the grant.
  const standard = planModules.filter(m => (STANDARD_MODULES as readonly string[]).includes(m));
  const custom = (org.customModules || []).filter(m => (CUSTOM_MODULES as readonly string[]).includes(m));
  return { maxEmployees, maxUsers, modules: [...standard, ...custom] };
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
