import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { proposalsAPI } from '../../api/proposals';
import { PageHeader, LoadingBlock, EmptyState, ErrorAlert, BackButton,
} from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';
import { useRole } from '../../store/authStore';
import { confirmDialog } from '../../components/feedback';

export default function ProposalView() {
  const { recordId } = useParams<{ recordId: string }>();
  const navigate = useNavigate();
  const { isSA } = useRole();
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    proposalsAPI.getRecord(recordId!)
      .then(res => setRecord(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load the proposal'))
      .finally(() => setLoading(false));
  }, [recordId]);

  const openFullPage = () => {
    const blob = new Blob([record.html], { type: 'text/html' });
    window.open(URL.createObjectURL(blob), '_blank');
  };

  // "Download PDF" via the browser's own print engine. It honours the
  // document's @page margins (the header/footer gap on every page) and its
  // @media print page-breaks, and renders crisp vector text — unlike
  // html2canvas, which rasterises the whole page and mis-paginates the
  // multi-column / break-inside layout (big gaps, orphaned cards). The user
  // picks "Save as PDF" as the print destination.
  const printToPdf = () => {
    const blob = new Blob([record.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (!win) {
      setError('Allow pop-ups for this site, then click Download PDF again.');
      return;
    }
    win.addEventListener('load', () => setTimeout(() => win.print(), 400));
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleDelete = async () => {
    if (!await confirmDialog(`Delete ${record.clientName} Rev ${record.revision}?`)) return;
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

  const revisions: any[] = record.revisions || [];

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
            {isSA && <button className="btn btn-danger" onClick={handleDelete}>Delete</button>}
            <Link to={`/proposals?from=${record.id}`} className="btn btn-secondary">↻ Revise</Link>
            <button className="btn btn-secondary" onClick={openFullPage}>⧉ Full Page</button>
            <button className="btn btn-primary" onClick={printToPdf}>⤓ Download PDF</button>
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {revisions.length > 1 && (
        <div className="rev-strip">
          <span className="text-muted" style={{ fontSize: 12.5, marginRight: 4 }}>Revision history:</span>
          {revisions.map((r, i) => {
            const prev = i > 0 ? revisions[i - 1] : null;
            const delta = prev ? r.totalAmount - prev.totalAmount : 0;
            const current = r.id === record.id;
            return (
              <Link key={r.id} to={`/proposals/history/${r.id}`}
                className={`rev-chip ${current ? 'current' : ''}`}
                title={`${r.selectionLabel} · ${formatDate(r.createdAt)}`}>
                <strong>Rev {r.revision}</strong>
                <span>{formatINR(r.totalAmount)}</span>
                {prev && delta !== 0 && (
                  <span className={delta > 0 ? 'text-success' : 'text-danger'} style={{ fontSize: 11 }}>
                    {delta > 0 ? '▲' : '▼'}{formatINR(Math.abs(delta))}
                  </span>
                )}
                {i === revisions.length - 1 && <span className="badge badge-success" style={{ fontSize: 10, padding: '1px 8px' }}>latest</span>}
              </Link>
            );
          })}
        </div>
      )}

      <div className="card" style={{ overflow: 'hidden', background: '#E9ECF2' }}>
        <iframe
          title="Proposal preview"
          srcDoc={record.html}
          style={{ width: '100%', height: '78vh', border: 'none', display: 'block' }}
        />
      </div>
    </>
  );
}
