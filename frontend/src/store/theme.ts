import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Light / dark / follow-the-OS. 'system' leaves no data-theme attribute, so
// the stylesheet's prefers-color-scheme media query takes over.
export type ThemeMode = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';
export type Accent = 'indigo' | 'blue' | 'violet' | 'teal' | 'rose' | 'amber';

// primary, hover
export const ACCENTS: Record<Accent, { primary: string; hover: string; label: string }> = {
  indigo: { primary: '#5A5FE0', hover: '#4548C9', label: 'Indigo' },
  blue: { primary: '#1570EF', hover: '#0E5ACB', label: 'Blue' },
  violet: { primary: '#7A3DF5', hover: '#6227E0', label: 'Violet' },
  teal: { primary: '#0E9384', hover: '#0B7468', label: 'Teal' },
  rose: { primary: '#E31B54', hover: '#C01048', label: 'Rose' },
  amber: { primary: '#DC6803', hover: '#B45309', label: 'Amber' },
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
// default 'indigo' clears the overrides so the tuned base tokens apply.
function applyAccent(accent: Accent) {
  const root = document.documentElement;
  const vars = ['--primary', '--primary-hover', '--primary-soft', '--sidebar-rail', '--sidebar-active', '--ring', '--primary-border'];
  if (accent === 'indigo') {
    vars.forEach(v => root.style.removeProperty(v));
    return;
  }
  const { primary, hover } = ACCENTS[accent];
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-hover', hover);
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
      accent: 'indigo',
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
      // Re-apply once the persisted value is read back (the inline boot script
      // in index.html already set mode for the very first paint).
      onRehydrateStorage: () => (state) => state && applyAll(state),
    },
  ),
);
