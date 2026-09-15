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
                  <th className="num">Year-1 Total</th><th>Generated</th><th />
                </tr>
              </thead>
              <tbody>
                {data.records.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/proposals/history/${r.id}`} style={{ fontWeight: 600 }}>{r.clientName}</Link>
                    </td>
                    <td><span className="badge badge-neutral">Rev {r.revision}</span></td>
                    <td className="text-muted">{r.selectionLabel}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(r.totalAmount)}</td>
                    <td className="text-muted">{formatDate(r.createdAt)}</td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/proposals/history/${r.id}`} className="btn btn-secondary btn-sm">View</Link>
                        <Link to={`/proposals?from=${r.id}`} className="btn btn-secondary btn-sm">Revise</Link>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>Del</button>
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
