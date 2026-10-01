import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, BackButton, Pagination } from '../../components/ui';

const PAGE_SIZE = 50;

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

const actionLabel = (action: string) => {
  const text = action.replace(/_/g, ' ').toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', {
  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
});

export default function AuditLog() {
  const [data, setData] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollAPI.getAuditLog({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the audit log');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <span>Audit Log</span>
      </div>

      <PageHeader
        title="Payroll Audit Log"
        subtitle="Every change to payroll runs, entries, settings and setup — who made it and when."
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {!data && loading ? <LoadingBlock label="Loading audit log…" /> : data && (
        <div className="card">
          {data.rows.length === 0 ? (
            <EmptyState icon="◷" title="No changes recorded yet"
              message="Changes made from now on are listed here." />
          ) : (
            <>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th><th>User</th><th>Action</th><th>Run</th>
                      <th>Employee</th><th>Field</th><th>Old value</th><th>New value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r: any) => (
                      <tr key={r.id}>
                        <td style={{ whiteSpace: 'nowrap' }}>{when(r.createdAt)}</td>
                        <td>{r.userName || '—'}</td>
                        <td>
                          {actionLabel(r.action)}
                          {r.source !== 'MANUAL' && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>{r.source.toLowerCase()}</span>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>{r.period ? monthLabel(r.period) : '—'}</td>
                        <td>{r.personName || '—'}</td>
                        <td>{r.fieldLabel || '—'}</td>
                        <td className="text-muted">{r.oldValue || '—'}</td>
                        <td>{r.newValue || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total}
                onPageChange={setPage} loading={loading} />
            </>
          )}
        </div>
      )}
    </>
  );
}
