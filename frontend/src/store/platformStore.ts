import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// The platform owner's session. Kept separate from the tenant auth store so the
// two logins never collide — a owner can be signed into the console while also
// signed into a tenant workspace in another tab.
interface PlatformAdmin {
  id: string;
  email: string;
  name: string;
}

interface PlatformStore {
  admin: PlatformAdmin | null;
  accessToken: string | null;
  refreshToken: string | null;

  setAdmin: (admin: PlatformAdmin) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setAccessToken: (accessToken: string) => void;
  logout: () => void;
}

export const usePlatformStore = create<PlatformStore>()(
  persist(
    (set) => ({
      admin: null,
      accessToken: null,
      refreshToken: null,
      setAdmin: (admin) => set({ admin }),
      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      setAccessToken: (accessToken) => set({ accessToken }),
      logout: () => set({ admin: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: 'platform-storage',
      partialize: (state) => ({
        admin: state.admin,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
);
