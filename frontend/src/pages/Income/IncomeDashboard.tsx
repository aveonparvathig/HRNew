import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { incomeAPI } from '../../api/income';
import { PageHeader, StatCard, ErrorAlert, LoadingBlock, StatusBadge } from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';

export default function IncomeDashboard() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    incomeAPI.getDashboard()
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock label="Loading income dashboard…" />;
  if (!data) return <ErrorAlert message={error || 'No data'} />;

  const maxFy = Math.max(1, ...data.fyRows.map((r: any) => r.billed));

  return (
    <>
      <PageHeader
        title="Income Dashboard"
        subtitle="Client payment follow-up sheet — org-wide ledger."
        actions={
          <>
            <Link to="/income/analytics" className="btn btn-secondary">Analytics</Link>
            <Link to="/income/clients" className="btn btn-primary">Clients</Link>
          </>
        }
      />

      <ErrorAlert message={error} />

      <div className="stat-grid">
        <StatCard label="Outstanding (all years)" value={formatINR(data.grandOutstanding)}
          sub={`${data.clientCount} active clients`} icon="◷" tone="warning" />
        <StatCard label="Follow-ups Due" value={data.followups.length}
          sub="Due today or overdue" icon="⚑" tone={data.followups.length ? 'danger' : 'success'} />
        <StatCard label="Waiting on Invoice" value={data.waiting.length}
          sub="Invoice status: waiting" icon="▤" tone="info" />
        <StatCard label="Agreements Expiring" value={data.expiringCount}
          sub={`${data.poPendingCount} clients missing PO`} icon="✎" tone={data.expiringCount ? 'danger' : 'success'} />
      </div>

      <div className="grid-2 mb-24">
        {/* FY summary */}
        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Billed by financial year</h3>
          {data.fyRows.length === 0 ? (
            <p className="text-muted">No billing data yet.</p>
          ) : (
            <div className="bar-chart">
              {data.fyRows.map((r: any) => (
                <div key={r.year}>
                  <div className="bar-row">
                    <span className="bar-label">{r.year}</span>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${(r.billed / maxFy) * 100}%` }} />
                    </div>
                    <span className="bar-value">{formatINR(r.billed)}</span>
                  </div>
                  <div className="bar-row" style={{ marginTop: 3 }}>
                    <span className="bar-label text-muted" style={{ fontSize: 11 }}>received</span>
                    <div className="bar-track" style={{ height: 6 }}>
                      <div className="bar-fill green" style={{ width: `${(r.received / maxFy) * 100}%` }} />
                    </div>
                    <span className="bar-value text-success" style={{ fontSize: 11.5 }}>{formatINR(r.received)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top outstanding clients */}
        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Top outstanding clients</h3>
          {data.topClients.length === 0 ? (
            <p className="text-muted">Nothing outstanding. 🎉</p>
          ) : (
            data.topClients.map((c: any) => (
              <div key={c.clientId} className="list-row">
                <div style={{ minWidth: 0 }}>
                  <Link to={`/income/clients/${c.clientId}`} style={{ fontWeight: 600 }}>{c.name}</Link>
                  {c.engineer && <div className="text-muted" style={{ fontSize: 11.5 }}>{c.engineer}</div>}
                </div>
                <strong className="text-warning">{formatINR(c.balance)}</strong>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid-2 mb-24">
        {/* Follow-ups */}
        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Follow-ups due</h3>
          {data.followups.length === 0 ? (
            <p className="text-muted">No pending follow-ups.</p>
          ) : (
            data.followups.slice(0, 8).map((b: any) => (
              <div key={b.id} className="list-row">
                <div style={{ minWidth: 0 }}>
                  <Link to={`/income/clients/${b.clientId}`} style={{ fontWeight: 600 }}>{b.clientName}</Link>
                  <div className="text-muted" style={{ fontSize: 11.5 }}>
                    {b.periodLabel || b.academicYear} · {formatDate(b.nextFollowupDate)}
                    {b.followupNote && ` — ${b.followupNote}`}
                  </div>
                </div>
                <span className="badge badge-danger"><span className="dot" />{formatINR(b.balance)}</span>
              </div>
            ))
          )}
        </div>

        {/* Recent payments */}
        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Recent payments</h3>
          {data.recentPayments.length === 0 ? (
            <p className="text-muted">No payments recorded yet.</p>
          ) : (
            data.recentPayments.map((p: any) => (
              <div key={p.id} className="list-row">
                <div style={{ minWidth: 0 }}>
                  <Link to={`/income/clients/${p.clientId}`} style={{ fontWeight: 600 }}>{p.clientName}</Link>
                  <div className="text-muted" style={{ fontSize: 11.5 }}>
                    {p.academicYear} · {p.receivedOn ? formatDate(p.receivedOn) : 'opening figure'}
                    {p.mode && ` · ${p.mode}`}
                  </div>
                </div>
                <strong className="text-success">+{formatINR(p.amount)}</strong>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Waiting invoices */}
      {data.waiting.length > 0 && (
        <div className="card">
          <div className="card-header"><h3>Waiting on invoice ({data.waiting.length})</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th><th>Year</th><th>Engineer</th>
                  <th className="num">Total Due</th><th className="num">Balance</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.waiting.map((b: any) => (
                  <tr key={b.id}>
                    <td><Link to={`/income/clients/${b.clientId}`} style={{ fontWeight: 600 }}>{b.clientName}</Link></td>
                    <td>{b.periodLabel || b.academicYear}</td>
                    <td className="text-muted">{b.engineer || '—'}</td>
                    <td className="num">{formatINR(b.totalDue)}</td>
                    <td className="num text-warning">{formatINR(b.balance)}</td>
                    <td><StatusBadge status="Waiting" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Engineer summary */}
      {data.engineerRows.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-header"><h3>By engineer</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Engineer</th><th className="num">Clients</th>
                  <th className="num">Billed</th><th className="num">Received</th><th className="num">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {data.engineerRows.map((r: any) => (
                  <tr key={r.engineer}>
                    <td style={{ fontWeight: 600 }}>{r.engineer}</td>
                    <td className="num">{r.clientCount}</td>
                    <td className="num">{formatINR(r.billed)}</td>
                    <td className="num text-success">{formatINR(r.received)}</td>
                    <td className="num text-warning">{formatINR(r.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
