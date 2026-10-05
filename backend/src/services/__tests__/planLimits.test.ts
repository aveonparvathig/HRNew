import { describe, it, expect } from 'vitest';
import {
  effectiveLimits, moduleEnabled, atCapacity, trialExpired, GATED_MODULES,
} from '../planLimits';

const plan = { maxEmployees: 25, maxUsers: 5, enabledModules: ['payroll', 'expenses'] };

describe('planLimits.effectiveLimits', () => {
  it('no plan → unlimited and all modules (unchanged from before plans)', () => {
    const l = effectiveLimits({});
    expect(l.maxEmployees).toBe(0);
    expect(l.maxUsers).toBe(0);
    expect(l.modules).toEqual([...GATED_MODULES]);
  });

  it('uses the plan caps and module list', () => {
    const l = effectiveLimits({ plan });
    expect(l.maxEmployees).toBe(25);
    expect(l.maxUsers).toBe(5);
    expect(l.modules).toEqual(['payroll', 'expenses']);
  });

  it('a plan with no module list means all modules', () => {
    expect(effectiveLimits({ plan: { ...plan, enabledModules: [] } }).modules).toEqual([...GATED_MODULES]);
  });

  it('overrides beat the plan, and an explicit 0 override is unlimited', () => {
    expect(effectiveLimits({ plan, maxEmployeesOverride: 50 }).maxEmployees).toBe(50);
    expect(effectiveLimits({ plan, maxEmployeesOverride: 0 }).maxEmployees).toBe(0);
    // null override falls back to the plan
    expect(effectiveLimits({ plan, maxUsersOverride: null }).maxUsers).toBe(5);
  });
});

describe('planLimits.moduleEnabled', () => {
  it('reflects the effective module list', () => {
    expect(moduleEnabled({ plan }, 'payroll')).toBe(true);
    expect(moduleEnabled({ plan }, 'recruitment')).toBe(false);
    expect(moduleEnabled({}, 'recruitment')).toBe(true); // no plan = all on
  });
});

describe('planLimits.atCapacity', () => {
  it('0 max is unlimited', () => {
    expect(atCapacity(1000, 0)).toBe(false);
  });
  it('blocks only when current reaches the cap', () => {
    expect(atCapacity(24, 25)).toBe(false);
    expect(atCapacity(25, 25)).toBe(true);
    expect(atCapacity(26, 25)).toBe(true);
  });
});

describe('planLimits.trialExpired', () => {
  const now = new Date('2026-10-05T00:00:00Z');
  it('no trial date → never expired', () => {
    expect(trialExpired({}, now)).toBe(false);
  });
  it('future date → not expired, past date → expired', () => {
    expect(trialExpired({ trialEndsOn: '2026-10-10' }, now)).toBe(false);
    expect(trialExpired({ trialEndsOn: '2026-10-01' }, now)).toBe(true);
  });
});
