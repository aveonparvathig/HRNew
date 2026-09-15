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
}

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  setUser: (user: User) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isLoading: false,
      error: null,

      setUser: (user) => set({ user }),
      setTokens: (accessToken, refreshToken) =>
        set({ accessToken, refreshToken }),
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
      logout: () =>
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          error: null,
        }),
    }),
    {
      name: 'auth-storage', // Name of the item in localStorage
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    }
  )
);

// Convenience role selectors — the API enforces the same policy server-side
export function useRole() {
  const user = useAuthStore(s => s.user);
  const role = user?.role || 'SUPER_ADMIN';
  return {
    role,
    isSA: role === 'SUPER_ADMIN',
    isHR: role === 'HR',
    isEmployee: role === 'EMPLOYEE',
    canManagePeople: role === 'SUPER_ADMIN' || role === 'HR',
    personId: user?.personId || null,
  };
}
