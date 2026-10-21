import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Light / dark / follow-the-OS. 'system' leaves no data-theme attribute, so
// the stylesheet's prefers-color-scheme media query takes over.
export type ThemeMode = 'light' | 'dark' | 'system';

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return mode;
}

function apply(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}

interface ThemeStore {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: 'system',
      setMode: (mode) => {
        apply(mode);
        set({ mode });
      },
      // Flip to the opposite of whatever is on screen right now.
      toggle: () => {
        const next: ThemeMode = resolveTheme(get().mode) === 'dark' ? 'light' : 'dark';
        apply(next);
        set({ mode: next });
      },
    }),
    {
      name: 'aveon-theme',
      // Re-apply once the persisted value is read back (the inline boot script
      // in index.html already set it for the very first paint).
      onRehydrateStorage: () => (state) => state && apply(state.mode),
    },
  ),
);
