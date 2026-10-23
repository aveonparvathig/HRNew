import type { ReactNode } from 'react';

// Shared pieces of the forms-and-reports design: flat KPI tiles, sort
// chips, a segmented control, a table card with sortable headers and
// group rows, change pills, and a notice. Styles live under
// "Forms & reports kit" in index.css and follow the theme tokens, so they
// pick up dark mode and the accent colour like everything else.

// ---- KPI tiles ------------------------------------------------------------

export function KpiGrid({ children, columns }: { children: ReactNode; columns?: number }) {
  return <section className="kpi-grid" style={columns ? { ['--kpi-cols' as any]: columns } : undefined}>{children}</section>;
}

// `tone` "primary" draws the tile the design highlights (net payable)
export function KpiTile({ label, value, sub, tone, title }: {
  label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'primary'; title?: string;
}) {
  return (
    <div className={`kpi${tone ? ` kpi-${tone}` : ''}`} title={title}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );
}

// ---- Sort chips and segmented control -------------------------------------

export function SortChip({ active, onClick, children, icon }: {
  active: boolean; onClick: () => void; children: ReactNode; icon?: ReactNode;
}) {
  return (
    <button type="button" className={`sort-chip${active ? ' active' : ''}`} aria-pressed={active} onClick={onClick}>
      {icon}
      {children}
    </button>
  );
}

export function ChipRow({ label, children }: { label?: ReactNode; children: ReactNode }) {
  return (
    <div className="chip-group" role="group">
      {label && <span className="chip-group-label">{label}</span>}
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (value: T) => void; label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.value} type="button" aria-pressed={value === o.value}
          className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---- Table pieces ---------------------------------------------------------

// A card with a toolbar strip, the table and a footer line
export function TableCard({ toolbar, children, footer, title }: {
  toolbar?: ReactNode; children: ReactNode; footer?: ReactNode; title?: ReactNode;
}) {
  return (
    <section className="report-card">
      {(toolbar || title) && (
        <div className="report-toolbar">
          {title && <h2 className="report-title">{title}</h2>}
          {toolbar}
        </div>
      )}
      <div className="table-wrap">{children}</div>
      {footer && <div className="report-foot">{footer}</div>}
    </section>
  );
}

// A column header that sorts; the active one carries an arrow
export function SortableTh({ children, active, direction, onClick, align, width }: {
  children: ReactNode; active: boolean; direction?: 'asc' | 'desc'; onClick: () => void;
  align?: 'right' | 'center'; width?: number | string;
}) {
  return (
    <th className={align === 'right' ? 'num' : undefined} style={{ width, textAlign: align === 'center' ? 'center' : undefined }}
      aria-sort={active ? (direction === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button type="button" className={`th-sort${active ? ' active' : ''}`} onClick={onClick}>
        {children}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="th-arrow">
          {active && direction === 'desc' ? <path d="M12 5v14m-6-6 6 6 6-6" /> : <path d="M12 19V5m-6 6 6-6 6 6" />}
        </svg>
      </button>
    </th>
  );
}

// A group header row: the designation and how many people it holds
export function GroupRow({ label, count, colSpan }: { label: ReactNode; count: number; colSpan: number }) {
  return (
    <tr className="group-row">
      <td colSpan={colSpan}>{label} <span className="group-count">· {count}</span></td>
    </tr>
  );
}

export function YesNoPill({ yes }: { yes: boolean }) {
  return <span className={`yn-pill${yes ? ' yes' : ''}`}>{yes ? 'Yes' : 'No'}</span>;
}

export function ChangePill({ tone, children, title }: { tone: string; children: ReactNode; title?: string }) {
  return <span className={`badge badge-${tone}`} title={title}>{children}</span>;
}

// A row of change pills with the overflow counted
export function ChangePills({ pills, max = 2 }: { pills: { label: string; tone: string }[]; max?: number }) {
  if (pills.length === 0) return <span className="text-muted">—</span>;
  const shown = pills.slice(0, max);
  const rest = pills.slice(max);
  return (
    <span className="pill-row">
      {shown.map(p => <ChangePill key={p.label} tone={p.tone}>{p.label}</ChangePill>)}
      {rest.length > 0 && <span className="badge badge-neutral" title={rest.map(p => p.label).join(', ')}>+{rest.length}</span>}
    </span>
  );
}

// ---- Strips and notices ---------------------------------------------------

// A single-line strip of facts (the comparison with the previous month)
export function FactStrip({ children, action, title }: { title: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="fact-strip">
      <span className="fact-title">{title}</span>
      {children}
      <span className="spacer" />
      {action}
    </section>
  );
}

export function Notice({ tone = 'warning', children, action }: { tone?: 'warning' | 'info' | 'success' | 'neutral'; children: ReactNode; action?: ReactNode }) {
  return (
    <section className={`notice notice-${tone}`} role="note">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {tone === 'warning'
          ? <path d="M12 9v4M12 17h.01M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
          : tone === 'success' ? <><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.4 2.4 4.6-5" /></>
            : <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>}
      </svg>
      <span className="notice-text">{children}</span>
      {action}
    </section>
  );
}

// ---- Icons used by the kit (inline stroke SVGs, no emoji) -----------------

export const KitIcon = {
  group: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h6" /></svg>,
  download: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12M6 11l6 6 6-6M4 21h16" /></svg>,
  plus: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>,
  search: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  check: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5L20 7" /></svg>,
  file: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>,
  upload: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21V9M6 13l6-6 6 6M4 3h16" /></svg>,
  refresh: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></svg>,
  eye: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>,
  eyeOff: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.1M6.6 6.6A16.7 16.7 0 0 0 2 12s3.5 7 10 7c1.5 0 2.9-.4 4.1-1" /><path d="m3 3 18 18" /></svg>,
};
