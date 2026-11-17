import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { incomeAPI } from '../../api/income';
import { PageHeader, StatCard, ErrorAlert, LoadingBlock, StatusBadge } from '../../components/ui';
import { ButtonLink } from '../../components/Button';
import { formatINR, formatDate, collectionTone } from '../../utils/format';

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
  const allBilled = data.fyRows.reduce((s: number, r: any) => s + r.billed, 0);
  const allReceived = data.fyRows.reduce((s: number, r: any) => s + r.received, 0);
  const allPct = allBilled > 0 ? Math.round((allReceived / allBilled) * 100) : 0;
  const maxTopBalance = Math.max(1, ...data.topClients.map((c: any) => c.balance));

  return (
    <>
      <PageHeader
        title="Income dashboard"
        subtitle="Client payment follow-up sheet — org-wide ledger."
        actions={
          <>
            <ButtonLink to="/income/analytics" icon="analytics">Analytics</ButtonLink>
            <ButtonLink to="/income/clients" variant="primary" icon="building">Clients</ButtonLink>
          </>
        }
      />

      <ErrorAlert message={error} />

      <div className="stat-grid">
        <StatCard label="Outstanding (all years)" value={formatINR(data.grandOutstanding)}
          trend={allBilled > 0 && (
            <span className={`trend-chip ${allPct >= 90 ? 'trend-good' : allPct >= 70 ? 'trend-flat' : 'trend-bad'}`}>
              {allPct}% collected overall
            </span>
          )}
          sub={`${data.clientCount} active clients`} icon="clock" tone="warning" />
        <StatCard label="Follow-ups due" value={data.followups.length}
          sub="Due today or overdue" icon="alert" tone={data.followups.length ? 'danger' : 'success'} />
        <StatCard label="Waiting on invoice" value={data.waiting.length}
          sub="Invoice status: waiting" icon="receipt" tone="info" />
        <StatCard label="Agreements expiring" value={data.expiringCount}
          sub={`${data.poPendingCount} clients missing PO`} icon="calendar" tone={data.expiringCount ? 'danger' : 'success'} />
      </div>

      <div className="grid-2 mb-24">
        {/* FY summary */}
        <div className="card card-pad">
          <h3 className="io-card-title io-spaced">Billed by financial year</h3>
          {data.fyRows.length === 0 ? (
            <p className="text-muted">No billing data yet.</p>
          ) : (
            <>
              <div className="chart-legend">
                <span className="chart-key"><span className="payout-dot io-key-received" />Received</span>
                <span className="chart-key"><span className="payout-dot io-key-outstanding" />Outstanding</span>
              </div>
              {data.fyRows.map((r: any) => {
                const pct = r.billed > 0 ? Math.round((r.received / r.billed) * 100) : 0;
                const outstanding = Math.max(0, r.billed - r.received);
                return (
                  <div key={r.year} className="fy-row">
                    <div className="fy-head">
                      <span className="io-strong">{r.year}</span>
                      <span className="text-muted num">
                        {formatINR(r.received)} of {formatINR(r.billed)}
                        {' · '}<span className={`pct-label ${collectionTone(pct)}`}>{pct}%</span>
                      </span>
                    </div>
                    {/* Bar length scales with this year's billing (data-driven) */}
                    <div style={{ width: `${Math.max((r.billed / maxFy) * 100, 6)}%` }}>
                      <div className="payout-bar io-fy-bar">
                        {/* Segment widths are the received / outstanding split (data-driven) */}
                        <span className="payout-seg io-key-received" style={{ width: `${r.billed > 0 ? (r.received / r.billed) * 100 : 0}%` }}
                          title={`Received ${formatINR(r.received)}`} />
                        {outstanding > 0.5 && (
                          <span className="payout-seg io-key-outstanding" style={{ width: `${(outstanding / r.billed) * 100}%` }}
                            title={`Outstanding ${formatINR(outstanding)}`} />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Top outstanding clients */}
        <div className="card card-pad">
          <h3 className="io-card-title">Top outstanding clients</h3>
          {data.topClients.length === 0 ? (
            <p className="text-muted">Nothing outstanding.</p>
          ) : (
            data.topClients.map((c: any) => (
              <div key={c.clientId} className="list-row io-rank-row">
                <div className="io-rank-head">
                  <div className="io-min0">
                    <Link to={`/income/clients/${c.clientId}`} className="io-strong">{c.name}</Link>
                    {c.engineer && <span className="io-meta"> · {c.engineer}</span>}
                  </div>
                  <strong className="text-warning num io-nowrap">{formatINR(c.balance)}</strong>
                </div>
                <div className="rank-track">
                  {/* Width is this client's share of the largest balance (data-driven) */}
                  <div className="rank-fill" style={{ width: `${(c.balance / maxTopBalance) * 100}%` }} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="grid-2 mb-24">
        {/* Follow-ups */}
        <div className="card card-pad">
          <h3 className="io-card-title">Follow-ups due</h3>
          {data.followups.length === 0 ? (
            <p className="text-muted">No pending follow-ups.</p>
          ) : (
            data.followups.slice(0, 8).map((b: any) => (
              <div key={b.id} className="list-row">
                <div className="io-min0">
                  <Link to={`/income/clients/${b.clientId}`} className="io-strong">{b.clientName}</Link>
                  <div className="io-meta">
                    {b.periodLabel || b.academicYear} · {formatDate(b.nextFollowupDate)}
                    {b.followupNote && ` — ${b.followupNote}`}
                  </div>
                </div>
                <span className="badge badge-danger num"><span className="dot" />{formatINR(b.balance)}</span>
              </div>
            ))
          )}
        </div>

        {/* Recent payments */}
        <div className="card card-pad">
          <h3 className="io-card-title">Recent payments</h3>
          {data.recentPayments.length === 0 ? (
            <p className="text-muted">No payments recorded yet.</p>
          ) : (
            data.recentPayments.map((p: any) => (
              <div key={p.id} className="list-row">
                <div className="io-min0">
                  <Link to={`/income/clients/${p.clientId}`} className="io-strong">{p.clientName}</Link>
                  <div className="io-meta">
                    {p.academicYear} · {p.receivedOn ? formatDate(p.receivedOn) : 'opening figure'}
                    {p.mode && ` · ${p.mode}`}
                  </div>
                </div>
                <strong className="num num-pos io-nowrap">+{formatINR(p.amount)}</strong>
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
                  <th className="num">Total due</th><th className="num">Balance</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.waiting.map((b: any) => (
                  <tr key={b.id}>
                    <td><Link to={`/income/clients/${b.clientId}`} className="io-strong">{b.clientName}</Link></td>
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
        <div className="card io-mt-24">
          <div className="card-header"><h3>By engineer</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Engineer</th><th className="num">Clients</th>
                  <th className="num">Billed</th><th className="num">Received</th><th className="num">Outstanding</th>
                  <th className="io-col-collection">Collection</th>
                </tr>
              </thead>
              <tbody>
                {data.engineerRows.map((r: any) => {
                  const pct = r.billed > 0 ? Math.round((r.received / r.billed) * 100) : 0;
                  return (
                    <tr key={r.engineer}>
                      <td className="io-strong">{r.engineer}</td>
                      <td className="num">{r.clientCount}</td>
                      <td className="num">{formatINR(r.billed)}</td>
                      <td className="num text-success">{formatINR(r.received)}</td>
                      <td className="num text-warning">{formatINR(r.outstanding)}</td>
                      <td>
                        <div className="io-collect">
                          <div className="bar-track">
                            {/* Width is the collection percentage (data-driven) */}
                            <div className={`bar-fill ${collectionTone(pct)}`} style={{ width: `${Math.min(Math.max(pct, 3), 100)}%` }} />
                          </div>
                          <span className={`pct-label num ${collectionTone(pct)}`}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
