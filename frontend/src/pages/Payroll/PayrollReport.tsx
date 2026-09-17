import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, EmptyState, ErrorAlert, BackButton } from '../../components/ui';

// Shared print page for run-level reports: pf-esi | comparison
export default function PayrollReport() {
  const { runId, kind } = useParams<{ runId: string; kind: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const call = kind === 'comparison'
      ? payrollAPI.getComparison(runId!)
      : payrollAPI.getPfEsiStatement(runId!);
    call
      .then(res => setDoc(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [runId, kind]);

  if (loading) return <LoadingBlock label="Preparing report…" />;
  if (!doc) {
    return <EmptyState icon="▦" title="Report unavailable" message={error}
      action={<Link to={`/payroll/runs/${runId}`} className="btn btn-secondary">Back to Run</Link>} />;
  }

  return (
    <>
      <div className="no-print">
        <div className="breadcrumb"><BackButton />
          <Link to="/payroll">Payroll</Link>
          <span>/</span>
          <Link to={`/payroll/runs/${runId}`}>Run</Link>
          <span>/</span>
          <span>{kind === 'comparison' ? 'Comparison' : 'PF & ESI'}</span>
        </div>
        <PageHeader
          title={doc.title}
          actions={
            <button className="btn btn-primary" onClick={() => window.print()}>
              🖨 Print / Save as PDF
            </button>
          }
        />
        <ErrorAlert message={error} onDismiss={() => setError('')} />
      </div>

      <div className="letter-sheet print-area">
        <div dangerouslySetInnerHTML={{ __html: doc.html }} />
      </div>
    </>
  );
}
