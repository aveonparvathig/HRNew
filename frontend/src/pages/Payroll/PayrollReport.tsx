import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, EmptyState, ErrorAlert, BackButton } from '../../components/ui';
import DownloadButton from '../../components/DownloadButton';
import { Button, ButtonLink } from '../../components/Button';

const REPORT_LABELS: Record<string, string> = {
  // For one run
  'pf-esi': 'PF & ESI',
  comparison: 'Comparison',
  overrides: 'Overrides',
  'input-history': 'Input history',
  register: 'Salary register',
  summary: 'Salary summary',
  'pf-statement': 'PF statement',
  'pt-statement': 'Professional Tax',
  'lwf-statement': 'Labour Welfare Fund',
  'tds-statement': 'TDS statement',
  'payment-register': 'Payment register',
  'cash-cheque': 'Cash and cheque statement',
  'payout-reconciliation': 'Payout reconciliation',
  'journal-voucher': 'Journal voucher',
  reconciliation: 'Payroll reconciliation',
  headcount: 'Employee reconciliation',
  'negative-net': 'Negative and zero net pay',
  anomalies: 'Payroll anomalies',
  // Across runs
  'ytd-statement': 'Year-to-date statement',
  'component-statement': 'Component statement',
  'salary-structure': 'Salary structure',
  'ctc-breakup': 'CTC breakup',
  'revision-history': 'Salary revision history',
  'pt-half-year': 'Professional Tax — half-year',
  'tax-statement': 'Income tax statement',
  'tax-consolidated': 'Income tax — consolidated',
  'pan-status': 'PAN status',
  'form-12bb': 'Form 12BB',
  declarations: 'Income tax declarations',
  'bank-advice': 'Bank transfer advice',
  'register-tn-u': 'Form U — employee register',
  'register-tn-v': 'Form V — register of employment',
  'register-tn-w': 'Form W — register of wages',
  'register-tn-x': 'Form X — leave and social security',
  'register-form-a': 'Form A — employee register',
  'register-form-b': 'Form B — wage register',
  'register-form-c': 'Form C — loans and recoveries',
  'register-form-d': 'Form D — attendance register',
  'register-bonus-c': 'Bonus Form C',
  'register-bonus-d': 'Bonus Form D',
  'register-gratuity-f': 'Gratuity Form F',
  arrears: 'Arrear report',
  'pf-arrears': 'PF and ESI on arrears',
  'settlement-statement': 'Settlement statement',
  settlements: 'Settlement and resettlement report',
  'tds-challans': 'TDS challan report',
  'tds-return': 'Quarterly TDS return',
  'form-27a': 'Form 27A',
  'consultant-tds': 'Consultant fees and tax deducted',
  'nps-statement': 'NPS statement',
  'form-16': 'Form 16 Part B',
  'form-16-all': 'Form 16 Part B — all employees',
  'form-12ba': 'Statement of perquisites',
  'hold-release': 'Hold and release report',
  duplicates: 'Duplicate check',
  reimbursements: 'Reimbursement summary',
  'loan-statement': 'Loan statement',
  'loan-register': 'Loan register',
  'loan-transactions': 'Loan transactions',
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

  // Registers can also be taken as an Excel workbook
  const downloadWorkbook = async () => {
    try {
      const { data: file } = await payrollAPI.getRegisterWorkbook(doc.register, Object.fromEntries(new URLSearchParams(query)));
      const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not prepare the workbook');
    }
  };

  if (loading) return <LoadingBlock label="Preparing report…" />;
  if (!doc) {
    return <EmptyState icon="▦" title="Report unavailable" message={error}
      action={<ButtonLink to={back}>{runId ? 'Back to run' : 'Back to reports'}</ButtonLink>} />;
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
          actions={<>
            {doc.register && <Button onClick={downloadWorkbook}>Excel</Button>}
            {kind === 'journal-voucher' && runId && (
              <>
                <DownloadButton path={`/payroll/runs/${runId}/journal-voucher/file`} params={{ format: 'xlsx' }}>Excel</DownloadButton>
                <DownloadButton path={`/payroll/runs/${runId}/journal-voucher/file`} params={{ format: 'csv' }}>CSV</DownloadButton>
              </>
            )}
            <DownloadButton
              path={runId ? `/payroll/runs/${runId}/reports/${REPORT_LABELS[kind!] ? kind : 'pf-esi'}` : `/payroll/reports/${kind}`}
              params={{ ...Object.fromEntries(new URLSearchParams(query)), format: 'pdf' }}>
              PDF
            </DownloadButton>
            <Button variant="primary" icon="receipt" onClick={() => window.print()}>
              Print
            </Button>
          </>}
        />
        <ErrorAlert message={error} onDismiss={() => setError('')} />
      </div>

      <div className="letter-sheet sheet-wide print-area">
        <div dangerouslySetInnerHTML={{ __html: doc.html }} />
      </div>
    </>
  );
}
