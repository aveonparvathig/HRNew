import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Light / dark / follow-the-OS. 'system' leaves no data-theme attribute, so
// the stylesheet's prefers-color-scheme media query takes over.
export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';
export type Accent = 'purple' | 'blue' | 'violet' | 'teal' | 'rose' | 'amber';

// primary, hover (keep in step with the boot script in index.html)
export const ACCENTS: Record<Accent, { primary: string; hover: string; label: string }> = {
  purple: { primary: '#BB33AA', hover: '#962987', label: 'Orchid' },
  blue: { primary: '#2B6FD4', hover: '#1F58AD', label: 'Blue' },
  violet: { primary: '#8A4FD9', hover: '#7339C2', label: 'Violet' },
  teal: { primary: '#278B86', hover: '#1D6E6A', label: 'Teal' },
  rose: { primary: '#D33558', hover: '#B0284A', label: 'Rose' },
  amber: { primary: '#C2571A', hover: '#9E4614', label: 'Orange' },
};

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return mode;
}

function applyMode(mode: ThemeMode) {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}

// Accent re-paints the action color across both themes via inline vars. The
// default 'purple' (or any unknown saved value, such as the old 'slate') clears the overrides so the tuned base tokens apply.
function applyAccent(accent: Accent) {
  const root = document.documentElement;
  const vars = ['--primary', '--primary-hover', '--primary-ink', '--primary-soft', '--sidebar-rail', '--sidebar-active', '--ring', '--primary-border'];
  if (accent === 'purple' || !ACCENTS[accent]) {
    vars.forEach(v => root.style.removeProperty(v));
    return;
  }
  const { primary, hover } = ACCENTS[accent];
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-hover', hover);
  root.style.setProperty('--primary-ink', '#ffffff');
  root.style.setProperty('--primary-soft', `color-mix(in srgb, ${primary} 13%, transparent)`);
  root.style.setProperty('--sidebar-rail', primary);
  root.style.setProperty('--sidebar-active', `color-mix(in srgb, ${primary} 13%, transparent)`);
  root.style.setProperty('--ring', `0 0 0 3px color-mix(in srgb, ${primary} 32%, transparent)`);
  root.style.setProperty('--primary-border', `color-mix(in srgb, ${primary} 45%, var(--surface))`);
}

function applyDensity(density: Density) {
  const root = document.documentElement;
  if (density === 'compact') root.setAttribute('data-density', 'compact');
  else root.removeAttribute('data-density');
}

function applyAll(s: { mode: ThemeMode; accent: Accent; density: Density }) {
  applyMode(s.mode);
  applyAccent(s.accent);
  applyDensity(s.density);
}

interface ThemeStore {
  mode: ThemeMode;
  accent: Accent;
  density: Density;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: Accent) => void;
  setDensity: (density: Density) => void;
  toggle: () => void;
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: 'system',
      accent: 'purple',
      density: 'comfortable',
      setMode: (mode) => { applyMode(mode); set({ mode }); },
      setAccent: (accent) => { applyAccent(accent); set({ accent }); },
      setDensity: (density) => { applyDensity(density); set({ density }); },
      // Flip to the opposite of whatever is on screen right now.
      toggle: () => {
        const next: ThemeMode = resolveTheme(get().mode) === 'dark' ? 'light' : 'dark';
        applyMode(next);
        set({ mode: next });
      },
    }),
    {
      name: 'aveon-theme',
      // A saved accent that no longer exists (the old 'slate') falls back to the default
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<ThemeStore>;
        return { ...current, ...p, accent: p.accent && ACCENTS[p.accent] ? p.accent : 'purple' };
      },
      // Re-apply once the persisted value is read back (the inline boot script
      // in index.html already set mode for the very first paint).
      onRehydrateStorage: () => (state) => state && applyAll(state),
    },
  ),
);
