import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { proposalsAPI } from '../../api/proposals';
import { PageHeader, LoadingBlock, EmptyState, ErrorAlert, BackButton,
} from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';

export default function ProposalView() {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    proposalsAPI.getRecord(recordId!)
      .then(res => setRecord(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load the proposal'))
      .finally(() => setLoading(false));
  }, [recordId]);

  const openFullPage = () => {
    const blob = new Blob([record.html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${record.clientName} Rev ${record.revision}?`)) return;
    try {
      await proposalsAPI.deleteRecord(record.id);
      navigate('/proposals/history');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (loading) return <LoadingBlock label="Loading proposal…" />;
  if (!record) {
    return <EmptyState icon="📄" title="Proposal not found"
      action={<Link to="/proposals/history" className="btn btn-secondary">Back to History</Link>} />;
  }

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/proposals/history">Proposals</Link>
        <span>/</span>
        <span>{record.clientName} · Rev {record.revision}</span>
      </div>

      <PageHeader
        title={`${record.clientName} — Rev ${record.revision}`}
        subtitle={`${record.selectionLabel} · ${formatINR(record.totalAmount)} · generated ${formatDate(record.createdAt)}`}
        actions={
          <>
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            <Link to={`/proposals?from=${record.id}`} className="btn btn-secondary">↻ Revise</Link>
            <button className="btn btn-primary" onClick={openFullPage}>
              ⧉ Open Full Page / Print
            </button>
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="card" style={{ overflow: 'hidden' }}>
        <iframe
          title="Proposal preview"
          srcDoc={record.html}
          style={{ width: '100%', height: '75vh', border: 'none', display: 'block' }}
        />
      </div>
    </>
  );
}
