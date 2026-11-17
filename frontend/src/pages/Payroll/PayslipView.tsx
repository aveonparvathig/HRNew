import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, EmptyState, ErrorAlert, StatusBadge, BackButton,
} from '../../components/ui';
import DownloadButton from '../../components/DownloadButton';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

export default function PayslipView() {
  const { entryId } = useParams<{ entryId: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    payrollAPI.getPayslip(entryId!)
      .then(res => setDoc(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load payslip'))
      .finally(() => setLoading(false));
  }, [entryId]);

  if (loading) return <LoadingBlock label="Loading payslip…" />;
  if (!doc) {
    return <EmptyState icon="▦" title="Payslip not found"
      action={<ButtonLink to="/payroll">Back to payroll</ButtonLink>} />;
  }

  return (
    <>
      <div className="no-print">
        <div className="breadcrumb"><BackButton />
          <Link to="/payroll">Payroll</Link>
          <span>/</span>
          <Link to={`/payroll/runs/${doc.runId}`}>{monthLabel(doc.period)}</Link>
          <span>/</span>
          <span>{doc.personName}</span>
        </div>

        <PageHeader
          title={`Payslip — ${doc.personName}`}
          subtitle={monthLabel(doc.period)}
          actions={
            <>
              <StatusBadge status={doc.status === 'FINALIZED' ? 'finalized' : 'draft'} />
              <DownloadButton path={`/payroll/entries/${doc.id}/payslip.pdf`}>PDF</DownloadButton>
              <Button variant="primary" icon="receipt" onClick={() => window.print()}>
                Print
              </Button>
            </>
          }
        />
        <ErrorAlert message={error} onDismiss={() => setError('')} />
        {doc.status !== 'FINALIZED' && (
          <div className="alert alert-warning">
            <Icon name="clock" size={16} className="pr-alert-icon" />
            <span>This run is still a draft — figures may change until it is finalized.</span>
          </div>
        )}
      </div>

      <div className="letter-sheet print-area">
        <div dangerouslySetInnerHTML={{ __html: doc.html }} />
      </div>
    </>
  );
}
