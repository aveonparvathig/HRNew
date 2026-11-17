import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { proposalsAPI } from '../../api/proposals';
import { PageHeader, EmptyState, LoadingBlock, ErrorAlert } from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
import { formatINR, formatDate } from '../../utils/format';
import { useRole } from '../../store/authStore';
import { confirmDialog } from '../../components/feedback';

export default function ProposalHistory() {
  const { isSA } = useRole();
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
    if (!await confirmDialog(`Delete ${record.clientName} Rev ${record.revision}? This cannot be undone.`)) return;
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
        title="Proposal history"
        subtitle="Every generated proposal, kept verbatim with a revision chain per client."
        actions={<ButtonLink to="/proposals" variant="accent" icon="plus">New proposal</ButtonLink>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="toolbar">
        <div className="search-input">
          <input className="input" aria-label="Search proposals by client" placeholder="Search by client…" value={q}
            onChange={e => setQ(e.target.value)} />
        </div>
        <span className="toolbar-count"><span className="num">{data?.total || 0}</span> proposal{data?.total !== 1 ? 's' : ''}</span>
      </div>

      <div className="card">
        {(data?.records || []).length === 0 ? (
          <EmptyState icon="📄" title={q ? 'No matching proposals' : 'No proposals yet'}
            message={q ? 'Try a different client name.' : 'Generate your first proposal from the builder.'}
            action={!q && <ButtonLink to="/proposals" icon="plus">New proposal</ButtonLink>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Client</th><th>Rev</th><th>Selection</th>
                  <th className="num">Year-1 total</th><th className="num">Change vs previous</th>
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
                        <tr key={r.id} className={i === 0 && rows.length > 0 ? 'mp-chain-start' : undefined}>
                          <td>
                            {i === 0 ? (
                              <>
                                <Link to={`/proposals/history/${r.id}`} className="mp-strong">{r.clientName}</Link>
                                {recs.length > 1 && (
                                  <span className="mp-inline-sub"> · {recs.length} revisions</span>
                                )}
                              </>
                            ) : (
                              <span className="mp-earlier">↳ earlier revision</span>
                            )}
                          </td>
                          <td>
                            <span className={`badge ${i === 0 ? 'badge-success' : 'badge-neutral'}`}>
                              Rev {r.revision}{i === 0 && recs.length > 1 ? ' · latest' : ''}
                            </span>
                          </td>
                          <td className="text-muted">{r.selectionLabel}</td>
                          <td className="num mp-strong">{formatINR(r.totalAmount)}</td>
                          <td className="num">
                            {delta == null ? <span className="text-muted">—</span> : delta === 0
                              ? <span className="text-muted">same</span>
                              : <span className={`mp-delta ${delta > 0 ? 'num-pos' : 'num-neg'}`}>
                                  <Icon name={delta > 0 ? 'trendingUp' : 'trendingDown'} size={13} className="mp-delta-icon" />
                                  <span className="sr-only">{delta > 0 ? 'up ' : 'down '}</span>
                                  {formatINR(Math.abs(delta))}
                                </span>}
                          </td>
                          <td className="text-muted">{formatDate(r.createdAt)}</td>
                          <td>
                            <div className="row-actions">
                              <ButtonLink size="sm" to={`/proposals/history/${r.id}`}>View</ButtonLink>
                              <ButtonLink size="sm" to={`/proposals?from=${r.id}`}>Revise</ButtonLink>
                              {isSA && <Button variant="danger" size="sm" onClick={() => handleDelete(r)}>Delete</Button>}
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
