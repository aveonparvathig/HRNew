import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { expensesAPI } from '../../api/expenses';
import { PageHeader, LoadingBlock, EmptyState, ErrorAlert, BackButton,
} from '../../components/ui';
import { EXPENSE_STATUS_TONES } from './ExpensesList';

export default function ExpenseReportView() {
  const { reportId } = useParams<{ reportId: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    expensesAPI.printReport(reportId!)
      .then(res => setDoc(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load report'))
      .finally(() => setLoading(false));
  }, [reportId]);

  if (loading) return <LoadingBlock label="Preparing report…" />;
  if (!doc) {
    return <EmptyState icon="⌯" title="Report not found"
      action={<Link to="/expenses" className="btn btn-secondary">Back to Expenses</Link>} />;
  }

  return (
    <>
      <div className="no-print">
        <div className="breadcrumb"><BackButton />
          <Link to="/expenses">Expenses</Link>
          <span>/</span>
          <Link to={`/expenses/${doc.id}`}>{doc.reportNumber}</Link>
          <span>/</span>
          <span>Print</span>
        </div>

        <PageHeader
          title={`Expense Report — ${doc.personName}`}
          subtitle={`${doc.reportNumber} · ${doc.title}`}
          actions={
            <>
              <span className={`badge ${EXPENSE_STATUS_TONES[doc.status] || 'badge-neutral'}`}>
                {doc.status.toLowerCase()}
              </span>
              <button className="btn btn-primary" onClick={() => window.print()}>
                🖨 Print / Save as PDF
              </button>
            </>
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
