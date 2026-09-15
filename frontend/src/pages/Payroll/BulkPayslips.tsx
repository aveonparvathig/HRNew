import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, EmptyState, ErrorAlert, StatusBadge } from '../../components/ui';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

export default function BulkPayslips() {
  const { runId } = useParams<{ runId: string }>();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    payrollAPI.getRunPayslips(runId!)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load payslips'))
      .finally(() => setLoading(false));
  }, [runId]);

  if (loading) return <LoadingBlock label="Rendering payslips…" />;
  if (!data) {
    return <EmptyState icon="▦" title="Run not found"
      action={<Link to="/payroll" className="btn btn-secondary">Back to Payroll</Link>} />;
  }

  return (
    <>
      <div className="no-print">
        <div className="breadcrumb">
          <Link to="/payroll">Payroll</Link>
          <span>/</span>
          <Link to={`/payroll/runs/${data.runId}`}>{monthLabel(data.period)}</Link>
          <span>/</span>
          <span>All payslips</span>
        </div>
        <PageHeader
          title={`All Payslips — ${monthLabel(data.period)}`}
          subtitle={`${data.slips.length} payslips, one page each when printed.`}
          actions={
            <>
              <StatusBadge status={data.status === 'FINALIZED' ? 'finalized' : 'draft'} />
              <button className="btn btn-primary" onClick={() => window.print()}>
                🖨 Print All / Save as PDF
              </button>
            </>
          }
        />
        <ErrorAlert message={error} onDismiss={() => setError('')} />
      </div>

      <div className="print-area">
        {data.slips.map((slip: any, i: number) => (
          <div key={slip.id} className="letter-sheet"
            style={{
              marginBottom: 24,
              breakAfter: i < data.slips.length - 1 ? 'page' : 'auto',
            }}>
            <div dangerouslySetInnerHTML={{ __html: slip.html }} />
          </div>
        ))}
      </div>
    </>
  );
}
