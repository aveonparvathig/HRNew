import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  userId: string;
  email: string;
  organizationId: string;
  firstName?: string;
  lastName?: string;
  role: string;
  personId?: string | null;
  mustChangePassword?: boolean;
  passwordExpired?: boolean; // the forced change is for an expired password, not a temporary one
}

// The tenant's plan context, used to hide modules the plan does not include.
export interface OrgContext {
  status: string;
  planName: string | null;
  trialEndsOn: string | null;
  modules: string[]; // enabled gated-module keys
  limits: { maxEmployees: number; maxUsers: number };
}

// A platform-owner "log in as" support session, viewing this tenant read-only.
export interface Impersonation {
  by: string;        // platform owner email
  tenant: string;    // tenant name
  readOnly: boolean;
}

interface AuthStore {
  user: User | null;
  org: OrgContext | null;
  impersonation: Impersonation | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: User) => void;
  setOrg: (org: OrgContext | null) => void;
  setImpersonation: (imp: Impersonation | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      org: null,
      impersonation: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      error: null,

      setUser: (user) => set({ user }),
      setOrg: (org) => set({ org }),
      setImpersonation: (impersonation) => set({ impersonation }),
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      logout: () =>
        set({
          user: null,
          org: null,
          impersonation: null,
          accessToken: null,
          refreshToken: null,
          error: null,
        }),
    }),
    {
      name: 'auth-storage', // Name of the item in localStorage
      partialize: (state) => ({
        user: state.user,
        org: state.org,
        impersonation: state.impersonation,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

// All gated modules — the fallback when the plan context is unknown, so a
// tenant with no plan (or before /auth/me resolves) sees everything.
export const ALL_MODULES = ['project', 'recruitment', 'proposals', 'expenses', 'payroll', 'leave'];

export function useEnabledModules(): string[] {
  const org = useAuthStore(s => s.org);
  return org?.modules ?? ALL_MODULES;
}

// Convenience role selectors — the API enforces the same policy server-side
export function useRole() {
  const user = useAuthStore(s => s.user);
  const role = user?.role || 'SUPER_ADMIN';
  return {
    role,
    isSA: role === 'SUPER_ADMIN',
    isHR: role === 'HR',
    isEmployee: role === 'EMPLOYEE',
    isMarketing: role === 'MARKETING',
    canManagePeople: role === 'SUPER_ADMIN' || role === 'HR',
    isPayrollViewer: role === 'PAYROLL_VIEWER',
    personId: user?.personId || null,
  };
}
