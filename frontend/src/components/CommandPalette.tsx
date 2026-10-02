import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { peopleAPI } from '../api/people';
import { payrollAPI } from '../api/payroll';
import { HOME_ITEM, Icon, navSectionsFor } from './Layout/nav';

// Quick search (Ctrl+K): jump to any page, person or payroll month by typing
// part of its name.

interface Result { key: string; group: string; label: string; hint?: string; icon: string; to: string }

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

// Every word typed must appear somewhere in the label or its hint
const matches = (r: Result, words: string[]) => {
  const text = `${r.label} ${r.hint || ''} ${r.group}`.toLowerCase();
  return words.every(w => text.includes(w));
};

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const user = useAuthStore(state => state.user);
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const [people, setPeople] = useState<Result[]>([]);
  const [runs, setRuns] = useState<Result[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const role = user?.role || 'SUPER_ADMIN';
  const staff = role === 'SUPER_ADMIN' || role === 'HR';

  const pages = useMemo<Result[]>(() => {
    const sections = navSectionsFor(user);
    const rows: Result[] = [{ key: HOME_ITEM.to, group: 'Pages', label: HOME_ITEM.label, icon: HOME_ITEM.icon, to: HOME_ITEM.to }];
    for (const section of sections) {
      for (const item of section.items) {
        rows.push({ key: item.to, group: 'Pages', label: item.label, hint: section.label, icon: item.icon, to: item.to });
      }
    }
    if (staff) {
      rows.push({ key: 'new-settlement', group: 'Actions', label: 'New final settlement', hint: 'Payroll', icon: 'plus', to: '/payroll/settlements/new' });
    }
    return rows;
  }, [user, staff]);

  // People and payroll months are loaded each time the search opens, so a
  // person added a minute ago is found.
  useEffect(() => {
    inputRef.current?.focus();
    let live = true;
    if (role !== 'MARKETING') {
      peopleAPI.getPeople().then(res => {
        if (!live) return;
        const kinds: [string, string][] = [['employees', 'Employee'], ['candidates', 'Candidate'], ['interns', 'Intern']];
        setPeople(kinds.flatMap(([list, kind]) => (res.data?.[list] || []).map((p: any) => ({
          key: `person-${p.id}`, group: 'People', label: p.name,
          hint: [p.employeeNo, p.designation || p.appliedForTitle, kind].filter(Boolean).join(' · '),
          icon: 'user', to: `/people/${p.id}`,
        }))));
      }).catch(() => { /* search still works for pages */ });
    }
    if (staff) {
      payrollAPI.getRuns().then(res => {
        if (!live) return;
        setRuns((res.data?.runs || []).map((r: any) => ({
          key: `run-${r.id}`, group: 'Payroll months', label: `Payroll — ${monthLabel(r.period)}`,
          hint: r.stage?.label || r.status, icon: 'banknote', to: `/payroll/runs/${r.id}`,
        })));
      }).catch(() => { /* as above */ });
    }
    return () => { live = false; };
  }, [role, staff]);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return pages;
    return [
      ...pages.filter(r => matches(r, words)),
      ...people.filter(r => matches(r, words)).slice(0, 8),
      ...runs.filter(r => matches(r, words)).slice(0, 6),
    ];
  }, [query, pages, people, runs]);

  // Keep the highlighted row in view while moving with the arrow keys
  useEffect(() => {
    listRef.current?.querySelector('.palette-row.active')?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const go = (r: Result | undefined) => {
    if (!r) return;
    onClose();
    navigate(r.to);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[cursor]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  return (
    <div className="modal-overlay palette-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Quick search" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Icon name="search" size={18} className="palette-search-icon" />
          <input ref={inputRef} value={query} onChange={e => { setQuery(e.target.value); setCursor(0); }}
            placeholder={role === 'MARKETING' ? 'Search pages…' : 'Search pages, people, payroll months…'}
            aria-label="Search" autoComplete="off" spellCheck={false} />
          <kbd>Esc</kbd>
        </div>
        <div className="palette-list" ref={listRef}>
          {results.length === 0 && <div className="palette-empty">Nothing matches “{query}”.</div>}
          {results.map((r, i) => (
            <div key={r.key}>
              {(i === 0 || results[i - 1].group !== r.group) && <div className="palette-group">{r.group}</div>}
              <button className={`palette-row${i === cursor ? ' active' : ''}`}
                onMouseMove={() => setCursor(i)} onClick={() => go(r)}>
                <Icon name={r.icon} size={16} />
                <span className="palette-label">{r.label}</span>
                {r.hint && <span className="palette-hint">{r.hint}</span>}
              </button>
            </div>
          ))}
        </div>
        <div className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>Enter</kbd> to open</span>
        </div>
      </div>
    </div>
  );
}
