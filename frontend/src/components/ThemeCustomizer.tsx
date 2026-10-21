import { useState } from 'react';
import { ACCENTS, useTheme, type Accent, type ThemeMode } from '../store/theme';
import { Icon } from './Layout/nav';

const THEME_OPTS: [ThemeMode, string, string][] = [
  ['light', 'sun', 'Light'],
  ['system', 'monitor', 'System'],
  ['dark', 'moon', 'Dark'],
];

// A floating "appearance" panel: theme, accent color and density — the kind
// of customizer modern admin templates ship with. State lives in the theme
// store and is applied live + persisted.
export default function ThemeCustomizer() {
  const [open, setOpen] = useState(false);
  const mode = useTheme(s => s.mode);
  const accent = useTheme(s => s.accent);
  const density = useTheme(s => s.density);
  const setMode = useTheme(s => s.setMode);
  const setAccent = useTheme(s => s.setAccent);
  const setDensity = useTheme(s => s.setDensity);

  return (
    <>
      <button className="customizer-fab no-print" onClick={() => setOpen(true)}
        title="Appearance" aria-label="Appearance settings">
        <Icon name="sliders" size={20} className="" />
      </button>

      {open && (
        <>
          <div className="customizer-backdrop no-print" onClick={() => setOpen(false)} />
          <aside className="customizer no-print" role="dialog" aria-label="Appearance settings">
            <div className="customizer-head">
              <div>
                <strong>Appearance</strong>
                <span>Personalize your workspace</span>
              </div>
              <button className="modal-close" onClick={() => setOpen(false)} aria-label="Close">✕</button>
            </div>

            <div className="customizer-body">
              <div className="customizer-group">
                <label>Theme</label>
                <div className="theme-row">
                  {THEME_OPTS.map(([m, icon, label]) => (
                    <button key={m} className={`theme-opt${mode === m ? ' active' : ''}`} onClick={() => setMode(m)}>
                      <Icon name={icon} size={16} className="" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="customizer-group">
                <label>Accent color</label>
                <div className="swatch-row">
                  {(Object.keys(ACCENTS) as Accent[]).map(a => (
                    <button key={a} className={`swatch${accent === a ? ' active' : ''}`}
                      style={{ background: ACCENTS[a].primary }}
                      onClick={() => setAccent(a)} title={ACCENTS[a].label} aria-label={ACCENTS[a].label}>
                      {accent === a && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff"
                          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5L20 7" /></svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="customizer-group">
                <label>Density</label>
                <div className="segmented" style={{ display: 'flex' }}>
                  <button className={density === 'comfortable' ? 'active' : ''} style={{ flex: 1 }}
                    onClick={() => setDensity('comfortable')}>Comfortable</button>
                  <button className={density === 'compact' ? 'active' : ''} style={{ flex: 1 }}
                    onClick={() => setDensity('compact')}>Compact</button>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
