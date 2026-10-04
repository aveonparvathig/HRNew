import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { platformAPI, type Tenant } from '../../api/platform';
import { StatCard, EmptyState, LoadingBlock, ErrorAlert } from '../../components/ui';
import { formatDate } from '../../utils/format';

const STATUS_TONE: Record<string, string> = { ACTIVE: 'badge-success', SUSPENDED: 'badge-danger' };

export default function PlatformTenants() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    platformAPI.getTenants()
      .then(res => setTenants(res.data.tenants))
      .catch(err => setError(err.response?.data?.error || 'Failed to load tenants'));
  }, []);

  const filtered = useMemo(() => {
    if (!tenants) return [];
    const needle = q.trim().toLowerCase();
    return tenants.filter(t =>
      (!status || t.status === status) &&
      (!needle || t.name.toLowerCase().includes(needle) || t.email.toLowerCase().includes(needle)),
    );
  }, [tenants, q, status]);

  const stats = useMemo(() => {
    const list = tenants || [];
    return {
      total: list.length,
      active: list.filter(t => t.status === 'ACTIVE').length,
      suspended: list.filter(t => t.status === 'SUSPENDED').length,
      employees: list.reduce((s, t) => s + t.employees, 0),
    };
  }, [tenants]);

  if (!tenants && !error) return <LoadingBlock label="Loading tenants…" />;

  return (
    <>
      <div className="platform-head">
        <div>
          <h1>Tenants</h1>
          <p className="text-muted">Every organization on the platform.</p>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="stat-grid">
        <StatCard label="Tenants" value={stats.total} icon="◆" tone="primary" />
        <StatCard label="Active" value={stats.active} icon="✓" tone="success" />
        <StatCard label="Suspended" value={stats.suspended} icon="⊘" tone="danger" />
        <StatCard label="Employees (all tenants)" value={stats.employees} icon="◷" tone="info" />
      </div>

      <div className="toolbar">
        <div className="search-input">
          <input className="input" placeholder="Search by name or email…" value={q}
            onChange={e => setQ(e.target.value)} />
        </div>
        <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState icon="◆" title={q || status ? 'No matching tenants' : 'No tenants yet'}
            message={q || status ? 'Try a different search or filter.' : 'Organizations appear here once they sign up.'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Organization</th><th className="num">Users</th><th className="num">Employees</th>
                  <th>Created</th><th>Last sign-in</th><th>Source</th><th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/platform/tenants/${t.id}`} style={{ fontWeight: 600 }}>{t.name}</Link>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>{t.email || '—'}</div>
                    </td>
                    <td className="num">{t.users}</td>
                    <td className="num">{t.employees}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{formatDate(t.createdAt)}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>
                      {t.lastLoginAt ? formatDate(t.lastLoginAt) : '—'}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>
                      {t.createdVia === 'OWNER' ? 'Owner-created' : 'Self-signup'}
                    </td>
                    <td><span className={`badge ${STATUS_TONE[t.status] || 'badge-neutral'}`}>{t.status.toLowerCase()}</span></td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/platform/tenants/${t.id}`} className="btn btn-secondary btn-sm">Open</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
