import client from './platformClient';

export interface Tenant {
  id: string;
  name: string;
  email: string;
  status: string;        // ACTIVE | SUSPENDED
  createdVia: string;    // SIGNUP | OWNER
  suspendedAt: string | null;
  suspendedReason: string;
  createdAt: string;
  users: number;
  employees: number;
  people: number;
  lastLoginAt: string | null;
  payrollRuns: number;
  storageBytes: number;
  planId: string | null;
  planName: string | null;
  planCode: string | null;
  trialEndsOn: string | null;
  maxEmployeesOverride: number | null;
  maxUsersOverride: number | null;
  limits: { maxEmployees: number; maxUsers: number; modules: string[] };
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  maxEmployees: number;
  maxUsers: number;
  enabledModules: string[];
  trialDays: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
}

export interface PlatformAuditEntry {
  id: string;
  actorEmail: string;
  action: string;
  organizationId: string | null;
  orgName?: string | null;
  detail: string;
  createdAt: string;
}

export interface PlatformOwner {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreateTenantInput {
  organizationName: string;
  adminEmail: string;
  adminFirstName?: string;
  adminLastName?: string;
  adminPassword?: string;
}

export interface PlatformOverview {
  totals: {
    tenants: number; active: number; suspended: number;
    users: number; employees: number; people: number; payrollRuns: number; storageBytes: number;
  };
  byPlan: { name: string; count: number }[];
  signups: { month: string; count: number }[];
  tenants: Tenant[];
}

export const platformAPI = {
  getOverview: () => client.get<PlatformOverview>('/platform/overview'),

  login: (email: string, password: string) =>
    client.post<{ admin: { id: string; email: string; name: string }; accessToken: string; refreshToken: string }>(
      '/platform/auth/login', { email, password },
    ),
  me: () => client.get<{ admin: { id: string; email: string; name: string } }>('/platform/auth/me'),

  getTenants: () => client.get<{ tenants: Tenant[] }>('/platform/tenants'),
  createTenant: (data: CreateTenantInput) =>
    client.post<{ tenant: Tenant; adminEmail: string; tempPassword: string }>('/platform/tenants', data),
  getTenant: (id: string) =>
    client.get<{ tenant: Tenant; audit: PlatformAuditEntry[] }>(`/platform/tenants/${id}`),
  suspend: (id: string, reason: string) =>
    client.post<{ tenant: Tenant }>(`/platform/tenants/${id}/suspend`, { reason }),
  reactivate: (id: string) =>
    client.post<{ tenant: Tenant }>(`/platform/tenants/${id}/reactivate`, {}),
  deleteTenant: (id: string, confirmName: string) =>
    client.delete<{ ok: boolean }>(`/platform/tenants/${id}`, { data: { confirmName } }),
  impersonate: (id: string) =>
    client.post<{
      accessToken: string; readOnly: boolean; impersonatedBy: string; tenantName: string;
      user: any; org: any;
    }>(`/platform/tenants/${id}/impersonate`, {}),

  getPlans: () => client.get<{ plans: Plan[]; modules: string[] }>('/platform/plans'),
  updatePlan: (id: string, data: Partial<Plan>) =>
    client.put<{ plan: Plan }>(`/platform/plans/${id}`, data),
  setTenantPlan: (id: string, data: {
    planId?: string | null; maxEmployeesOverride?: number | null;
    maxUsersOverride?: number | null; trialEndsOn?: string | null;
  }) => client.post<{ tenant: Tenant }>(`/platform/tenants/${id}/plan`, data),

  getOwners: () => client.get<{ owners: PlatformOwner[] }>('/platform/owners'),
  addOwner: (data: { email: string; name: string; password: string }) =>
    client.post<{ owner: PlatformOwner }>('/platform/owners', data),
  setOwnerActive: (id: string, isActive: boolean) =>
    client.post<{ owner: PlatformOwner }>(`/platform/owners/${id}/active`, { isActive }),

  getAudit: () => client.get<{ audit: PlatformAuditEntry[] }>('/platform/audit'),
};
