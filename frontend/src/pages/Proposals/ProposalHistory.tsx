import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { proposalsAPI } from '../../api/proposals';
import { PageHeader, EmptyState, LoadingBlock, ErrorAlert } from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';

export default function ProposalHistory() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await proposalsAPI.getHistory(q);
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (record: any) => {
    if (!window.confirm(`Delete ${record.clientName} Rev ${record.revision}? This cannot be undone.`)) return;
    try {
      await proposalsAPI.deleteRecord(record.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (loading && !data) return <LoadingBlock label="Loading history…" />;

  return (
    <>
      <PageHeader
        title="Proposal History"
        subtitle="Every generated proposal, kept verbatim with a revision chain per client."
        actions={<Link to="/proposals" className="btn btn-primary">+ New Proposal</Link>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="toolbar">
        <div className="search-input">
          <input className="input" placeholder="Search by client…" value={q}
            onChange={e => setQ(e.target.value)} />
        </div>
        <span className="toolbar-count">{data?.total || 0} proposal{data?.total !== 1 ? 's' : ''}</span>
      </div>

      <div className="card">
        {(data?.records || []).length === 0 ? (
          <EmptyState icon="📄" title={q ? 'No matching proposals' : 'No proposals yet'}
            message={q ? 'Try a different client name.' : 'Generate your first proposal from the builder.'}
            action={!q && <Link to="/proposals" className="btn btn-primary">+ New Proposal</Link>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th><th>Rev</th><th>Selection</th>
                  <th className="num">Year-1 Total</th><th className="num">Δ vs prev</th>
                  <th>Generated</th><th />
                </tr>
              </thead>
              <tbody>
                {(() => {
                  // Group into revision chains per client (newest chain first)
                  const groups = new Map<string, any[]>();
                  for (const r of data.records) {
                    const key = r.clientName.toLowerCase();
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key)!.push(r);
                  }
                  const rows: React.ReactNode[] = [];
                  for (const recs of groups.values()) {
                    recs.sort((a, b) => b.revision - a.revision);
                    recs.forEach((r, i) => {
                      const prev = recs[i + 1];
                      const delta = prev ? r.totalAmount - prev.totalAmount : null;
                      rows.push(
                        <tr key={r.id} style={i === 0 && rows.length > 0 ? { borderTop: '2px solid var(--border)' } : undefined}>
                          <td>
                            {i === 0 ? (
                              <>
                                <Link to={`/proposals/history/${r.id}`} style={{ fontWeight: 600 }}>{r.clientName}</Link>
                                {recs.length > 1 && (
                                  <span className="text-muted" style={{ fontSize: 11.5 }}> · {recs.length} revisions</span>
                                )}
                              </>
                            ) : (
                              <span className="text-muted" style={{ fontSize: 12, paddingLeft: 14 }}>↳ earlier revision</span>
                            )}
                          </td>
                          <td>
                            <span className={`badge ${i === 0 ? 'badge-success' : 'badge-neutral'}`}>
                              Rev {r.revision}{i === 0 && recs.length > 1 ? ' · latest' : ''}
                            </span>
                          </td>
                          <td className="text-muted">{r.selectionLabel}</td>
                          <td className="num" style={{ fontWeight: 600 }}>{formatINR(r.totalAmount)}</td>
                          <td className="num">
                            {delta == null ? <span className="text-muted">—</span> : delta === 0
                              ? <span className="text-muted">same</span>
                              : <span className={delta > 0 ? 'text-success' : 'text-danger'} style={{ fontSize: 12.5 }}>
                                  {delta > 0 ? '▲' : '▼'} {formatINR(Math.abs(delta))}
                                </span>}
                          </td>
                          <td className="text-muted">{formatDate(r.createdAt)}</td>
                          <td>
                            <div className="row-actions">
                              <Link to={`/proposals/history/${r.id}`} className="btn btn-secondary btn-sm">View</Link>
                              <Link to={`/proposals?from=${r.id}`} className="btn btn-secondary btn-sm">Revise</Link>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>Del</button>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  }
                  return rows;
                })()}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
