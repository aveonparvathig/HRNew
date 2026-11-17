import { useId, useRef, type KeyboardEvent } from 'react';

export interface TabItem<K extends string> { key: K; label: string; count?: number }

// Accessible tab strip (roving focus with arrow keys). The caller renders the
// active panel; wrap it in <TabPanel> for the matching aria wiring.
export function Tabs<K extends string>({ items, value, onChange, label }: {
  items: TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  const base = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (i + d + items.length) % items.length;
    onChange(items[next].key);
    refs.current[next]?.focus();
  };
  return (
    <div className="tabs-ui" role="tablist" aria-label={label}>
      {items.map((t, i) => {
        const on = t.key === value;
        return (
          <button key={t.key} ref={el => { refs.current[i] = el; }} role="tab" type="button"
            id={`${base}-tab-${t.key}`} aria-selected={on} aria-controls={`${base}-panel`}
            tabIndex={on ? 0 : -1} onClick={() => onChange(t.key)} onKeyDown={e => onKey(e, i)}>
            {t.label}{t.count != null && <span className="tab-count num"> {t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
