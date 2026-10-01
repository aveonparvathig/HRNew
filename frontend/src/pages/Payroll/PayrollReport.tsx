import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, EmptyState, ErrorAlert, BackButton } from '../../components/ui';

const REPORT_LABELS: Record<string, string> = {
  // For one run
  'pf-esi': 'PF & ESI',
  comparison: 'Comparison',
  overrides: 'Overrides',
  'input-history': 'Input History',
  register: 'Salary Register',
  summary: 'Salary Summary',
  'pf-statement': 'PF Statement',
  'pt-statement': 'Professional Tax',
  'lwf-statement': 'Labour Welfare Fund',
  // Across runs
  'ytd-statement': 'Year-to-Date Statement',
  'component-statement': 'Component Statement',
  'salary-structure': 'Salary Structure',
  'ctc-breakup': 'CTC Breakup',
  'revision-history': 'Salary Revision History',
  'pt-half-year': 'Professional Tax — Half-Year',
};

// Shared print page for payroll reports. With a runId the report is for
// that run; without one the query string carries the report's parameters.
export default function PayrollReport() {
  const { runId, kind } = useParams<{ runId?: string; kind: string }>();
  const [params] = useSearchParams();
  const query = params.toString();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const call = runId
      ? payrollAPI.getRunReport(runId, REPORT_LABELS[kind!] ? kind! : 'pf-esi')
      : payrollAPI.getReport(kind!, Object.fromEntries(new URLSearchParams(query)));
    call
      .then(res => { setDoc(res.data); setError(''); })
      .catch(err => { setDoc(null); setError(err.response?.data?.error || 'Failed to load report'); })
      .finally(() => setLoading(false));
  }, [runId, kind, query]);

  const back = runId ? `/payroll/runs/${runId}` : '/payroll/reports';

  if (loading) return <LoadingBlock label="Preparing report…" />;
  if (!doc) {
    return <EmptyState icon="▦" title="Report unavailable" message={error}
      action={<Link to={back} className="btn btn-secondary">{runId ? 'Back to Run' : 'Back to Reports'}</Link>} />;
  }

  return (
    <>
      <div className="no-print">
        <div className="breadcrumb"><BackButton />
          <Link to="/payroll">Payroll</Link>
          <span>/</span>
          <Link to={back}>{runId ? 'Run' : 'Reports'}</Link>
          <span>/</span>
          <span>{REPORT_LABELS[kind!] || REPORT_LABELS['pf-esi']}</span>
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

      <div className="letter-sheet sheet-wide print-area">
        <div dangerouslySetInnerHTML={{ __html: doc.html }} />
      </div>
    </>
  );
}
