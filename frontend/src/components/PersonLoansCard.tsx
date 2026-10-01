import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../api/payroll';
import { formatINR } from '../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

// Loans and advances of one employee, on their profile page.
export default function PersonLoansCard({ person }: { person: any }) {
  const [loans, setLoans] = useState<any[] | null>(null);

  useEffect(() => {
    payrollAPI.getLoans(person.id)
      .then(res => setLoans(res.data.loans))
      .catch(() => setLoans([]));
  }, [person.id]);

  if (!loans) return null;
  const outstanding = loans.filter(l => l.status === 'ACTIVE').reduce((s, l) => s + l.outstanding, 0);

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div>
          <h3>Loans &amp; advances ({loans.length})</h3>
          {loans.length > 0 && (
            <span className="text-muted" style={{ fontSize: 12.5 }}>{formatINR(outstanding)} outstanding</span>
          )}
        </div>
        <Link to={`/payroll/loans?new=${person.id}`} className="btn btn-primary btn-sm">New Loan</Link>
      </div>
      {loans.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Loan</th><th className="num">Lent</th><th className="num">Outstanding</th><th className="num">Next instalment</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {loans.map(l => (
                <tr key={l.id}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{l.loanNo}</span>
                    {l.title && <div className="text-muted" style={{ fontSize: 11.5 }}>{l.title}</div>}
                  </td>
                  <td className="num">{formatINR(l.totalLent)}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{formatINR(l.outstanding)}</td>
                  <td className="num">
                    {l.nextInstalment ? `${formatINR(l.nextInstalment.amount)} in ${monthLabel(l.nextInstalment.period)}` : '—'}
                  </td>
                  <td>
                    <span className={`badge ${l.status === 'ACTIVE' ? 'badge-warning' : 'badge-success'}`}>
                      {l.status === 'ACTIVE' ? 'active' : 'closed'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/payroll/loans/${l.id}`} className="btn btn-secondary btn-sm">Open</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
