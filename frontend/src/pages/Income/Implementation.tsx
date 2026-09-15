import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { incomeAPI } from '../../api/income';
import { PageHeader, ErrorAlert, LoadingBlock, EmptyState, StatCard } from '../../components/ui';

const STAGE_TONES: Record<string, string> = {
  ONBOARDING: 'badge-info',
  IMPLEMENTATION: 'badge-warning',
  LIVE: 'badge-success',
  ON_HOLD: 'badge-neutral',
  DISCONTINUED: 'badge-danger',
};

const STAGE_LABELS: Record<string, string> = {
  ONBOARDING: 'Onboarding',
  IMPLEMENTATION: 'Implementation',
  LIVE: 'Live',
  ON_HOLD: 'On hold',
  DISCONTINUED: 'Discontinued',
  NOT_STARTED: 'Not started',
};

export default function Implementation() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState('');

  useEffect(() => {
    incomeAPI.getImplementation()
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load implementation data'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock label="Loading implementation…" />;
  if (!data) return <ErrorAlert message={error || 'No data'} />;

  const rows = stageFilter
    ? data.rows.filter((r: any) => (r.stage || 'NOT_STARTED') === stageFilter)
    : data.rows;

  return (
    <>
      <PageHeader
        title="Implementation"
        subtitle="Onboarding stages, purchase orders and agreement renewals."
      />

      <ErrorAlert message={error} />

      <div className="stat-grid">
        <StatCard label="Live Clients" value={data.stageCounts.LIVE || 0} icon="✓" tone="success" />
        <StatCard label="PO Pending" value={data.alerts.poPending} sub="Active clients without a PO"
          icon="▤" tone={data.alerts.poPending ? 'warning' : 'success'} />
        <StatCard label="Agreement Pending" value={data.alerts.agreementPending}
          sub="Active clients unsigned" icon="✎" tone={data.alerts.agreementPending ? 'warning' : 'success'} />
        <StatCard label="Expiring / Expired" value={data.alerts.expiring}
          sub="Agreements needing renewal" icon="⚑" tone={data.alerts.expiring ? 'danger' : 'success'} />
      </div>

      <div className="toolbar">
        <select className="select" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="">All stages</option>
          {Object.entries(STAGE_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{l} ({data.stageCounts[v] || 0})</option>
          ))}
        </select>
        <span className="toolbar-count">{rows.length} client{rows.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <EmptyState icon="◎" title="No clients in this stage" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th><th>Stage</th><th style={{ width: 160 }}>Delivery</th>
                  <th>Engineer</th><th>Go-live</th><th>PO</th><th>Agreement</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.clientId}>
                    <td>
                      <Link to={`/income/clients/${r.clientId}`} style={{ fontWeight: 600 }}>{r.name}</Link>
                      {!r.isActive && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>inactive</span>}
                    </td>
                    <td>
                      <span className={`badge ${STAGE_TONES[r.stage] || 'badge-neutral'}`}>
                        {STAGE_LABELS[r.stage || 'NOT_STARTED']}
                      </span>
                    </td>
                    <td>
                      {r.progress.total === 0 ? (
                        <span className="text-muted" style={{ fontSize: 12 }}>not tracked</span>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="bar-track" style={{ flex: 1 }}>
                            <div className="bar-fill green" style={{ width: `${r.progress.pct}%` }} />
                          </div>
                          <span style={{ fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {r.progress.live}/{r.progress.applicable}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="text-muted">{r.engineer || '—'}</td>
                    <td className="text-muted">{r.goLiveDate || '—'}</td>
                    <td>
                      {r.poReceived
                        ? <span className="badge badge-success"><span className="dot" />{r.poNumber || 'Received'}</span>
                        : <span className="badge badge-warning">Pending</span>}
                    </td>
                    <td>
                      <span className={`badge ${r.agreementExpired ? 'badge-danger' : r.agreementExpiring ? 'badge-warning' : r.agreementSigned ? 'badge-success' : 'badge-neutral'}`}>
                        {r.agreementLabel}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/income/clients/${r.clientId}/implementation`} className="btn btn-secondary btn-sm">
                          Manage
                        </Link>
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
