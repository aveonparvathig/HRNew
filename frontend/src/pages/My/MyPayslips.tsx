import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { selfAPI } from '../../api/self';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState } from '../../components/ui';
import { formatINR } from '../../utils/format';
import DownloadButton from '../../components/DownloadButton';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

// The signed-in employee's own payslips, once HR has released them.
export default function MyPayslips() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [fy, setFy] = useState('');

  useEffect(() => {
    selfAPI.getPayslips()
      .then(res => {
        setData(res.data);
        // the current financial year is the middle option
        setFy(String(res.data.financialYears[1]?.startYear || ''));
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load your payslips'));
  }, []);

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading payslips…" />;

  return (
    <>
      <PageHeader
        title="My Payslips"
        subtitle="Payslips appear here once HR releases the month's payroll."
        actions={<>
          <select className="select" style={{ width: 'auto' }} value={fy} onChange={e => setFy(e.target.value)}>
            {data.financialYears.map((y: any) => <option key={y.startYear} value={y.startYear}>FY {y.label}</option>)}
          </select>
          <DownloadButton path="/self/payslips.zip" params={{ fy }} busyLabel="Making the files…">⤓ Year's payslips</DownloadButton>
          <Link to={`/my/reports/ytd-statement?fy=${fy}`} className="btn btn-secondary">Year-to-Date</Link>
          <Link to={`/my/reports/tax-statement?fy=${fy}`} className="btn btn-secondary">Tax Statement</Link>
          <Link to={`/my/reports/form-16?fy=${fy}`} className="btn btn-secondary">Form 16</Link>
        </>}
      />

      <div className="card">
        {data.entries.length === 0 ? (
          <EmptyState icon="▦" title="No payslips yet" message="Nothing has been released to you so far." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Month</th><th className="num">Pay days</th><th className="num">Gross</th>
                  <th className="num">Deductions</th><th className="num">Net pay</th><th />
                </tr>
              </thead>
              <tbody>
                {data.entries.map((e: any) => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 600 }}>{monthLabel(e.period)}</td>
                    <td className="num">{e.payDays} / {e.totalWorkingDays}</td>
                    <td className="num">{formatINR(e.grossSalary)}</td>
                    <td className="num">{formatINR(e.totalDeductions)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(e.netPayable)}</td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/my/payslips/${e.id}`} className="btn btn-secondary btn-sm">View</Link>
                        <DownloadButton path={`/self/payslips/${e.id}/pdf`} className="btn btn-secondary btn-sm">⤓ PDF</DownloadButton>
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
