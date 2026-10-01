import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { selfAPI } from '../../api/self';
import { PageHeader, LoadingBlock, EmptyState, BackButton } from '../../components/ui';

const REPORT_LABELS: Record<string, string> = {
  'tax-statement': 'Income Tax Statement',
  'form-12bb': 'Form 12BB',
  'ytd-statement': 'Year-to-Date Statement',
  'loan-statement': 'Loan Statement',
};

// Print page for the signed-in employee's own documents: a payslip
// (/my/payslips/:entryId) or one of their reports (/my/reports/:kind).
export default function MyDocument() {
  const { entryId, kind } = useParams<{ entryId?: string; kind?: string }>();
  const [params] = useSearchParams();
  const query = params.toString();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    const call = entryId
      ? selfAPI.getPayslip(entryId)
      : selfAPI.getReport(kind!, Object.fromEntries(new URLSearchParams(query)));
    call
      .then(res => { setDoc(res.data); setError(''); })
      .catch(err => { setDoc(null); setError(err.response?.data?.error || 'Failed to load the document'); })
      .finally(() => setLoading(false));
  }, [entryId, kind, query]);

  const back = kind === 'loan-statement' ? '/my/loans' : kind === 'form-12bb' ? '/my/declaration' : '/my/payslips';
  const backLabel = kind === 'loan-statement' ? 'My Loans' : kind === 'form-12bb' ? 'My Tax Declaration' : 'My Payslips';

  if (loading) return <LoadingBlock label="Preparing…" />;
  if (!doc) {
    return <EmptyState icon="▦" title="Not available" message={error}
      action={<Link to={back} className="btn btn-secondary">Back to {backLabel}</Link>} />;
  }

  return (
    <>
      <div className="no-print">
        <div className="breadcrumb"><BackButton />
          <Link to={back}>{backLabel}</Link>
          <span>/</span>
          <span>{entryId ? 'Payslip' : REPORT_LABELS[kind!] || 'Report'}</span>
        </div>
        <PageHeader
          title={entryId ? `Payslip — ${doc.personName}` : doc.title}
          actions={<button className="btn btn-primary" onClick={() => window.print()}>🖨 Print / Save as PDF</button>}
        />
      </div>

      <div className={`letter-sheet print-area${entryId ? '' : ' sheet-wide'}`}>
        <div dangerouslySetInnerHTML={{ __html: doc.html }} />
      </div>
    </>
  );
}
