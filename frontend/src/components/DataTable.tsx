import { type ReactNode, useMemo, useState } from 'react';
import { EmptyState, Pagination } from './ui';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  align?: 'right' | 'center';
  width?: number | string;
  className?: string;
}

// A self-contained, themed table card: optional toolbar (title / search /
// actions), sticky header, hover rows, loading skeletons, an empty state and
// client-side search + pagination. Drop-in for any list page.
export function DataTable<T>({
  columns, rows, rowKey, loading,
  searchable, searchText, searchPlaceholder = 'Search…',
  onRowClick, title, actions,
  emptyIcon = '◍', emptyTitle = 'Nothing here yet', emptyMessage,
  pageSize, sticky,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  searchable?: boolean;
  searchText?: (row: T) => string;
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  title?: ReactNode;
  actions?: ReactNode;
  emptyIcon?: string;
  emptyTitle?: string;
  emptyMessage?: string;
  pageSize?: number;
  sticky?: boolean;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    if (!searchable || !q.trim() || !searchText) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter(r => searchText(r).toLowerCase().includes(needle));
  }, [rows, q, searchable, searchText]);

  const paged = pageSize ? filtered.slice(page * pageSize, page * pageSize + pageSize) : filtered;
  const showToolbar = Boolean(title || actions || searchable);

  return (
    <div className="table-card">
      {showToolbar && (
        <div className="table-toolbar">
          {title && <span className="table-title">{title}</span>}
          {searchable && (
            <div className="search-input" style={{ minWidth: 200, flex: 'initial' }}>
              <input className="input" placeholder={searchPlaceholder} value={q}
                onChange={e => { setQ(e.target.value); setPage(0); }} aria-label="Search" />
            </div>
          )}
          <span className="spacer" />
          {actions}
        </div>
      )}

      <div className="table-wrap">
        <table className={`table${sticky ? ' table-sticky' : ''}`}>
          <thead>
            <tr>
              {columns.map(c => (
                <th key={c.key} className={c.align === 'right' ? 'num' : c.className}
                  style={c.width ? { width: c.width } : undefined}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading
              ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="table-skel-row">
                  {columns.map(c => <td key={c.key}><div className="skeleton skeleton-line" /></td>)}
                </tr>
              ))
              : paged.map(row => (
                <tr key={rowKey(row)} className={onRowClick ? 'row-link' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}>
                  {columns.map(c => (
                    <td key={c.key} className={c.align === 'right' ? 'num' : c.className}
                      style={c.align === 'center' ? { textAlign: 'center' } : undefined}>{c.render(row)}</td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length === 0 && (
        <EmptyState icon={emptyIcon} title={emptyTitle} message={emptyMessage} />
      )}
      {pageSize ? <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} /> : null}
    </div>
  );
}

// Avatar + name/sub cell, matching the sidebar/org-chart avatar styling.
export function UserCell({ name, sub, photo }: { name: ReactNode; sub?: ReactNode; photo?: string | null }) {
  const initial = typeof name === 'string' && name ? name[0].toUpperCase() : '•';
  return (
    <div className="cell-user">
      <span className="cell-avatar">{photo ? <img src={photo} alt="" /> : initial}</span>
      <span className="cell-main">
        <span className="cell-name">{name}</span>
        {sub && <span className="cell-sub">{sub}</span>}
      </span>
    </div>
  );
}
