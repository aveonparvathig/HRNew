import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { selfAPI } from '../../api/self';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, StatusBadge } from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

// The signed-in employee's own loans and salary advances.
export default function MyLoans() {
  const [loans, setLoans] = useState<any[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    selfAPI.getLoans()
      .then(res => setLoans(res.data.loans))
      .catch(err => setError(err.response?.data?.error || 'Failed to load your loans'));
  }, []);

  if (!loans) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading loans…" />;

  return (
    <>
      <PageHeader title="My Loans" subtitle="Instalments are deducted from your salary each month." />

      <div className="card">
        {loans.length === 0 ? (
          <EmptyState icon="▤" title="No loans" message="You have no loans or salary advances on record." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Loan</th><th className="num">Lent</th><th className="num">Outstanding</th>
                  <th className="num">Next instalment</th><th>Ends</th><th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {loans.map(l => (
                  <tr key={l.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{l.loanNo}</span>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>
                        {[l.title, l.typeLabel, l.annualRate ? `${l.annualRate}%` : ''].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="num">
                      {formatINR(l.totalLent)}
                      <div className="text-muted" style={{ fontSize: 11.5 }}>{formatDate(l.loanDate)}</div>
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(l.outstanding)}</td>
                    <td className="num">
                      {l.nextInstalment ? (
                        <>
                          {formatINR(l.nextInstalment.amount)}
                          <div className="text-muted" style={{ fontSize: 11.5 }}>
                            {monthLabel(l.nextInstalment.period)} · {l.instalmentsLeft} left
                          </div>
                        </>
                      ) : '—'}
                    </td>
                    <td>{l.lastPeriod ? monthLabel(l.lastPeriod) : '—'}</td>
                    <td><StatusBadge status={l.status === 'ACTIVE' ? 'active' : 'completed'} /></td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/my/reports/loan-statement?loanId=${l.id}`} className="btn btn-secondary btn-sm">Statement</Link>
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
