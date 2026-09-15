import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { incomeAPI } from '../../api/income';
import { PageHeader, ErrorAlert, LoadingBlock, StatCard } from '../../components/ui';
import { formatINR, collectionTone } from '../../utils/format';

export default function IncomeAnalytics() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    incomeAPI.getAnalytics()
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load analytics'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock label="Crunching numbers…" />;
  if (!data) return <ErrorAlert message={error || 'No data'} />;

  const { fyRows, clientOutstanding, engineerRows, monthlyTrend, forecast, undatedReceived } = data;
  const maxMonthly = Math.max(1, ...monthlyTrend.map((m: any) => m.amount));
  const owing = clientOutstanding.filter((r: any) => r.balance > 0);

  return (
    <>
      <PageHeader
        title="Income Analytics"
        subtitle="Trends, rankings and next-year revenue forecast."
        actions={<Link to="/income" className="btn btn-secondary">← Dashboard</Link>}
      />

      <ErrorAlert message={error} />

      {/* Forecast summary */}
      {forecast.targetYear && (
        <div className="stat-grid">
          <StatCard label={`Billed ${forecast.currentYear}`} value={formatINR(forecast.currentBilled)}
            sub="Current year net" icon="▤" tone="primary" />
          <StatCard label={`Forecast ${forecast.targetYear} (conservative)`} value={formatINR(forecast.conservativeTotal)}
            sub="Every active client renews as-is" icon="→" tone="info" />
          <StatCard label={`Forecast ${forecast.targetYear} (growth)`} value={formatINR(forecast.growthTotal)}
            sub="Student counts projected by YoY trend" icon="↗" tone="success" />
          <StatCard label="Grand Outstanding" value={formatINR(data.grandOutstanding)}
            sub={undatedReceived > 0 ? `${formatINR(undatedReceived)} received undated` : 'Across all years'}
            icon="◷" tone="warning" />
        </div>
      )}

      {/* FY table */}
      <div className="card mb-24">
        <div className="card-header"><h3>Financial year summary</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Year</th><th className="num">Billed</th><th className="num">Received</th>
                <th className="num">Outstanding</th><th style={{ width: 180 }}>Collection</th>
              </tr>
            </thead>
            <tbody>
              {fyRows.map((r: any) => (
                <tr key={r.year}>
                  <td style={{ fontWeight: 600 }}>{r.year}</td>
                  <td className="num">{formatINR(r.billed)}</td>
                  <td className="num text-success">{formatINR(r.received)}</td>
                  <td className="num text-warning">{formatINR(r.outstanding)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="bar-track" style={{ flex: 1 }}>
                        <div className={`bar-fill ${collectionTone(r.collectionPct)}`}
                          style={{ width: `${Math.max(r.collectionPct, 3)}%` }} />
                      </div>
                      <span className={`pct-label ${collectionTone(r.collectionPct)}`}>{r.collectionPct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2 mb-24">
        {/* Client outstanding ranking */}
        <div className="card">
          <div className="card-header"><h3>Outstanding by client</h3></div>
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Client</th><th className="num">Balance</th><th className="num">Share</th></tr>
              </thead>
              <tbody>
                {owing.length === 0 ? (
                  <tr><td colSpan={3} className="text-muted">Nothing outstanding.</td></tr>
                ) : owing.map((r: any) => (
                  <tr key={r.clientId}>
                    <td>
                      <Link to={`/income/clients/${r.clientId}`} style={{ fontWeight: 600 }}>{r.name}</Link>
                      {r.engineer && <span className="text-muted" style={{ fontSize: 11.5 }}> · {r.engineer}</span>}
                      {!r.isActive && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>inactive</span>}
                    </td>
                    <td className="num text-warning" style={{ fontWeight: 600 }}>{formatINR(r.balance)}</td>
                    <td className="num text-muted">{r.sharePct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Monthly trend */}
        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Monthly collections</h3>
          {monthlyTrend.length === 0 ? (
            <p className="text-muted">No dated payments yet.</p>
          ) : (
            <div className="bar-chart">
              {monthlyTrend.slice(-12).map((m: any) => (
                <div key={m.month} className="bar-row">
                  <span className="bar-label">{m.month}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${(m.amount / maxMonthly) * 100}%` }} />
                  </div>
                  <span className="bar-value">{formatINR(m.amount)}</span>
                </div>
              ))}
            </div>
          )}
          {undatedReceived > 0 && (
            <p className="text-muted" style={{ marginTop: 12, fontSize: 12 }}>
              + {formatINR(undatedReceived)} received without a date (imported opening figures).
            </p>
          )}
        </div>
      </div>

      {/* Engineer table */}
      {engineerRows.length > 0 && (
        <div className="card mb-24">
          <div className="card-header"><h3>Engineer performance</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Engineer</th><th className="num">Clients</th><th className="num">Billed</th>
                  <th className="num">Received</th><th className="num">Outstanding</th>
                </tr>
              </thead>
              <tbody>
                {engineerRows.map((r: any) => (
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

      {/* Forecast detail */}
      {forecast.rows.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Revenue forecast — {forecast.targetYear}</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              Growth scenario re-prices projected student counts at the latest rate + 18% GST
            </span>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th><th>Engineer</th><th className="num">Current Net</th>
                  <th className="num">Students</th><th className="num">Projected</th>
                  <th className="num">Conservative</th><th className="num">Growth</th><th>Note</th>
                </tr>
              </thead>
              <tbody>
                {forecast.rows.map((r: any) => (
                  <tr key={r.clientId}>
                    <td><Link to={`/income/clients/${r.clientId}`} style={{ fontWeight: 600 }}>{r.name}</Link></td>
                    <td className="text-muted">{r.engineer || '—'}</td>
                    <td className="num">{formatINR(r.currentNet)}</td>
                    <td className="num">{r.currentCount ?? '—'}</td>
                    <td className="num">{r.projectedCount ?? '—'}</td>
                    <td className="num">{formatINR(r.conservative)}</td>
                    <td className="num text-success" style={{ fontWeight: 600 }}>{formatINR(r.growth)}</td>
                    <td className="text-muted" style={{ fontSize: 12 }}>{r.note || ''}</td>
                  </tr>
                ))}
                <tr className="totals-row">
                  <td colSpan={5}>Total</td>
                  <td className="num">{formatINR(forecast.conservativeTotal)}</td>
                  <td className="num">{formatINR(forecast.growthTotal)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
