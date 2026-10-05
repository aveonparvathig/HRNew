import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { platformAPI, type PlatformOverview as Overview } from '../../api/platform';
import { StatCard, LoadingBlock, ErrorAlert } from '../../components/ui';

const fmtBytes = (b: number) => {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
};
const monthShort = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
};

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map(r => r.map(esc).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function PlatformOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    platformAPI.getOverview()
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load overview'));
  }, []);

  const maxSignup = useMemo(() => Math.max(1, ...(data?.signups || []).map(s => s.count)), [data]);
  const topTenants = useMemo(
    () => [...(data?.tenants || [])].sort((a, b) => b.employees - a.employees).slice(0, 8),
    [data],
  );

  const exportCsv = () => {
    if (!data) return;
    const header = ['Organization', 'Email', 'Status', 'Plan', 'Users', 'Employees', 'People', 'Payroll runs', 'Storage bytes', 'Created', 'Last sign-in', 'Source'];
    const rows = data.tenants.map(t => [
      t.name, t.email, t.status, t.planName || 'No plan', t.users, t.employees, t.people,
      t.payrollRuns, t.storageBytes, t.createdAt.slice(0, 10), t.lastLoginAt ? t.lastLoginAt.slice(0, 10) : '', t.createdVia,
    ]);
    downloadCsv(`tenants-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  };

  if (!data && !error) return <LoadingBlock label="Loading overview…" />;

  return (
    <>
      <div className="platform-head">
        <div>
          <h1>Overview</h1>
          <p className="text-muted">Usage across the whole platform.</p>
        </div>
        <button className="btn btn-secondary" onClick={exportCsv} disabled={!data}>Export tenants CSV</button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {data && (
        <>
          <div className="stat-grid">
            <StatCard label="Tenants" value={data.totals.tenants}
              sub={`${data.totals.active} active · ${data.totals.suspended} suspended`} icon="◆" tone="primary" />
            <StatCard label="Users" value={data.totals.users} icon="◴" tone="info" />
            <StatCard label="Employees" value={data.totals.employees} sub={`${data.totals.people} people total`} icon="◷" tone="success" />
            <StatCard label="Payroll runs" value={data.totals.payrollRuns} icon="▦" tone="warning" />
            <StatCard label="Document storage" value={fmtBytes(data.totals.storageBytes)} icon="▢" tone="info" />
          </div>

          <div className="platform-cards-2">
            <div className="card">
              <h3 style={{ fontSize: 15, marginBottom: 14 }}>New tenants, last 12 months</h3>
              <div className="signup-bars">
                {data.signups.map(s => (
                  <div key={s.month} className="signup-bar">
                    <div className="signup-bar-track">
                      <div className="signup-bar-fill" style={{ height: `${(s.count / maxSignup) * 100}%` }} />
                    </div>
                    <div className="signup-bar-count">{s.count || ''}</div>
                    <div className="signup-bar-label">{monthShort(s.month)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h3 style={{ fontSize: 15, marginBottom: 14 }}>Tenants by plan</h3>
              {data.byPlan.map(p => (
                <div key={p.name} className="plan-row">
                  <span className="plan-row-name">{p.name}</span>
                  <div className="plan-row-track">
                    <div className="plan-row-fill" style={{ width: `${(p.count / data.totals.tenants) * 100}%` }} />
                  </div>
                  <span className="plan-row-count">{p.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ fontSize: 15, margin: 0 }}>Largest tenants</h3>
              <Link to="/platform/tenants" className="btn btn-ghost btn-sm">All tenants →</Link>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Organization</th><th>Plan</th><th className="num">Employees</th><th className="num">Users</th><th className="num">Runs</th><th className="num">Storage</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {topTenants.map(t => (
                    <tr key={t.id}>
                      <td><Link to={`/platform/tenants/${t.id}`} style={{ fontWeight: 600 }}>{t.name}</Link></td>
                      <td className="text-muted" style={{ fontSize: 12.5 }}>{t.planName || 'No plan'}</td>
                      <td className="num">{t.employees}</td>
                      <td className="num">{t.users}</td>
                      <td className="num">{t.payrollRuns}</td>
                      <td className="num text-muted" style={{ fontSize: 12.5 }}>{fmtBytes(t.storageBytes)}</td>
                      <td><span className={`badge ${t.status === 'ACTIVE' ? 'badge-success' : 'badge-danger'}`}>{t.status.toLowerCase()}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
