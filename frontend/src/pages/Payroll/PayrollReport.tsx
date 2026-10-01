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
  'tds-statement': 'TDS Statement',
  'payment-register': 'Payment Register',
  'cash-cheque': 'Cash and Cheque Statement',
  'payout-reconciliation': 'Payout Reconciliation',
  'journal-voucher': 'Journal Voucher',
  reconciliation: 'Payroll Reconciliation',
  headcount: 'Employee Reconciliation',
  'negative-net': 'Negative and Zero Net Pay',
  anomalies: 'Payroll Anomalies',
  // Across runs
  'ytd-statement': 'Year-to-Date Statement',
  'component-statement': 'Component Statement',
  'salary-structure': 'Salary Structure',
  'ctc-breakup': 'CTC Breakup',
  'revision-history': 'Salary Revision History',
  'pt-half-year': 'Professional Tax — Half-Year',
  'tax-statement': 'Income Tax Statement',
  'tax-consolidated': 'Income Tax — Consolidated',
  'pan-status': 'PAN Status',
  'form-12bb': 'Form 12BB',
  declarations: 'Income Tax Declarations',
  'bank-advice': 'Bank Transfer Advice',
  'register-tn-u': 'Form U — Employee Register',
  'register-tn-v': 'Form V — Register of Employment',
  'register-tn-w': 'Form W — Register of Wages',
  'register-tn-x': 'Form X — Leave and Social Security',
  'register-form-a': 'Form A — Employee Register',
  'register-form-b': 'Form B — Wage Register',
  'register-form-c': 'Form C — Loans and Recoveries',
  'register-form-d': 'Form D — Attendance Register',
  'register-bonus-c': 'Bonus Form C',
  'register-bonus-d': 'Bonus Form D',
  'register-gratuity-f': 'Gratuity Form F',
  arrears: 'Arrear Report',
  'pf-arrears': 'PF and ESI on Arrears',
  'settlement-statement': 'Settlement Statement',
  settlements: 'Settlement and Resettlement Report',
  'tds-challans': 'TDS Challan Report',
  'tds-return': 'Quarterly TDS Return',
  'form-16': 'Form 16 Part B',
  'form-16-all': 'Form 16 Part B — All Employees',
  'form-12ba': 'Statement of Perquisites',
  'hold-release': 'Hold and Release Report',
  duplicates: 'Duplicate Check',
  reimbursements: 'Reimbursement Summary',
  'loan-statement': 'Loan Statement',
  'loan-register': 'Loan Register',
  'loan-transactions': 'Loan Transactions',
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
          actions={<>
            {doc.register && <button className="btn btn-secondary" onClick={downloadWorkbook}>⤓ Excel</button>}
            <button className="btn btn-primary" onClick={() => window.print()}>
              🖨 Print / Save as PDF
            </button>
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
