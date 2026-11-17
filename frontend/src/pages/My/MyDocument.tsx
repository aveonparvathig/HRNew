import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { selfAPI } from '../../api/self';
import { PageHeader, LoadingBlock, EmptyState, BackButton } from '../../components/ui';
import DownloadButton from '../../components/DownloadButton';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';

const REPORT_LABELS: Record<string, string> = {
  'tax-statement': 'Income tax statement',
  'form-12bb': 'Form 12BB',
  'ytd-statement': 'Year-to-date statement',
  'loan-statement': 'Loan statement',
  'form-16': 'Form 16',
  'form-12ba': 'Statement of perquisites',
};

// Part A of Form 16 is a PDF from the tax department, uploaded by HR.
async function openPartA(fy: string) {
  const { data: doc } = await selfAPI.getForm16PartA(fy);
  const bytes = Uint8Array.from(atob(doc.fileData.split(',')[1]), c => c.charCodeAt(0));
  window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
}

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
  const backLabel = kind === 'loan-statement' ? 'My loans' : kind === 'form-12bb' ? 'My tax declaration' : 'My payslips';

  if (loading) return <LoadingBlock label="Preparing…" />;
  if (!doc) {
    return <EmptyState icon="▦" title="Not available" message={error}
      action={<ButtonLink to={back}>Back to {backLabel}</ButtonLink>} />;
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
          actions={<>
            {kind === 'form-16' && (
              <>
                {doc.partA && (
                  <Button icon="browser" onClick={() => openPartA(String(doc.fyStart)).catch(() => setError('Could not open Part A'))}>
                    Part A (PDF)
                  </Button>
                )}
                <ButtonLink to={`/my/reports/form-12ba?fy=${doc.fyStart}`}>Perquisites statement</ButtonLink>
              </>
            )}
            {entryId
              ? <DownloadButton path={`/self/payslips/${entryId}/pdf`}><Icon name="download" size={16} className="btn-icon" />PDF</DownloadButton>
              : kind === 'form-16'
                // One file: Part A where HR has uploaded it, then Part B
                ? <DownloadButton path="/self/form16.pdf" params={{ fy: String(doc.fyStart) }}><Icon name="download" size={16} className="btn-icon" />Form 16 (PDF)</DownloadButton>
              : <DownloadButton path={`/self/reports/${kind}`} params={{ ...Object.fromEntries(new URLSearchParams(query)), format: 'pdf' }}><Icon name="download" size={16} className="btn-icon" />PDF</DownloadButton>}
            <Button variant="primary" icon="printer" onClick={() => window.print()}>Print</Button>
          </>}
        />
        {error && <div className="alert alert-error"><Icon name="alert" size={16} className="mp-alert-icon" /><span>{error}</span></div>}
      </div>

      <div className={`letter-sheet print-area${entryId ? '' : ' sheet-wide'}`}>
        <div dangerouslySetInnerHTML={{ __html: doc.html }} />
      </div>
    </>
  );
}
