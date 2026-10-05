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

export const platformAPI = {
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

  getOwners: () => client.get<{ owners: PlatformOwner[] }>('/platform/owners'),
  addOwner: (data: { email: string; name: string; password: string }) =>
    client.post<{ owner: PlatformOwner }>('/platform/owners', data),
  setOwnerActive: (id: string, isActive: boolean) =>
    client.post<{ owner: PlatformOwner }>(`/platform/owners/${id}/active`, { isActive }),

  getAudit: () => client.get<{ audit: PlatformAuditEntry[] }>('/platform/audit'),
};
