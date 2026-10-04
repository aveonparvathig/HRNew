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
  detail: string;
  createdAt: string;
}

export const platformAPI = {
  login: (email: string, password: string) =>
    client.post<{ admin: { id: string; email: string; name: string }; accessToken: string; refreshToken: string }>(
      '/platform/auth/login', { email, password },
    ),
  me: () => client.get<{ admin: { id: string; email: string; name: string } }>('/platform/auth/me'),

  getTenants: () => client.get<{ tenants: Tenant[] }>('/platform/tenants'),
  getTenant: (id: string) =>
    client.get<{ tenant: Tenant; audit: PlatformAuditEntry[] }>(`/platform/tenants/${id}`),
  suspend: (id: string, reason: string) =>
    client.post<{ tenant: Tenant }>(`/platform/tenants/${id}/suspend`, { reason }),
  reactivate: (id: string) =>
    client.post<{ tenant: Tenant }>(`/platform/tenants/${id}/reactivate`, {}),

  getAudit: () => client.get<{ audit: PlatformAuditEntry[] }>('/platform/audit'),
};
