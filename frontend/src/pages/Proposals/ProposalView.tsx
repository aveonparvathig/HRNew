import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { proposalsAPI } from '../../api/proposals';
import { PageHeader, LoadingBlock, EmptyState, ErrorAlert, BackButton,
} from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
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
      action={<ButtonLink to="/proposals/history">Back to history</ButtonLink>} />;
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
            {isSA && <Button variant="danger" onClick={handleDelete}>Delete</Button>}
            <ButtonLink to={`/proposals?from=${record.id}`} icon="pen">Revise</ButtonLink>
            <Button icon="browser" onClick={openFullPage}>Full page</Button>
            <Button variant="accent" icon="download" onClick={printToPdf}>Download PDF</Button>
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {revisions.length > 1 && (
        <div className="rev-strip">
          <span className="text-sm-muted mp-rev-label">Revision history:</span>
          {revisions.map((r, i) => {
            const prev = i > 0 ? revisions[i - 1] : null;
            const delta = prev ? r.totalAmount - prev.totalAmount : 0;
            const current = r.id === record.id;
            return (
              <Link key={r.id} to={`/proposals/history/${r.id}`}
                className={`rev-chip ${current ? 'current' : ''}`}
                title={`${r.selectionLabel} · ${formatDate(r.createdAt)}`}>
                <strong>Rev {r.revision}</strong>
                <span className="num">{formatINR(r.totalAmount)}</span>
                {prev && delta !== 0 && (
                  <span className={`mp-delta mp-delta-xs ${delta > 0 ? 'num-pos' : 'num-neg'}`}>
                    <Icon name={delta > 0 ? 'trendingUp' : 'trendingDown'} size={12} className="mp-delta-icon" />
                    <span className="sr-only">{delta > 0 ? 'up ' : 'down '}</span>
                    {formatINR(Math.abs(delta))}
                  </span>
                )}
                {i === revisions.length - 1 && <span className="badge badge-success mp-rev-latest">latest</span>}
              </Link>
            );
          })}
        </div>
      )}

      <div className="card mp-doc-card">
        <iframe
          title="Proposal preview"
          srcDoc={record.html}
          className="mp-doc-frame"
        />
      </div>
    </>
  );
}
