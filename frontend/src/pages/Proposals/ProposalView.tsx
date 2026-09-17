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
  const [pdfBusy, setPdfBusy] = useState(false);

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

  // One-click A4 PDF download (html2pdf is lazy-loaded on first use)
  const downloadPdf = async () => {
    setPdfBusy(true);
    setError('');
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      const doc = new DOMParser().parseFromString(record.html, 'text/html');
      const container = document.createElement('div');
      const styles = Array.from(doc.querySelectorAll('style')).map(s => s.outerHTML).join('');
      container.innerHTML =
        styles +
        '<style>.paper{box-shadow:none!important;width:210mm!important;margin:0!important}.footer{display:none}</style>' +
        doc.body.innerHTML;
      container.style.cssText = 'position:fixed;left:-11000px;top:0;width:210mm;background:#fff;';
      document.body.appendChild(container);
      try {
        await html2pdf().set({
          margin: 0,
          filename: `Proposal_${String(record.clientName).replace(/[^\w]+/g, '_')}_Rev${record.revision}.pdf`,
          image: { type: 'jpeg', quality: 0.96 },
          html2canvas: { scale: 2, useCORS: true, windowWidth: 794 },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        } as any).from(container).save();
      } finally {
        container.remove();
      }
    } catch {
      setError('PDF export failed — use Open Full Page and print to PDF instead.');
    } finally {
      setPdfBusy(false);
    }
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
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            <Link to={`/proposals?from=${record.id}`} className="btn btn-secondary">↻ Revise</Link>
            <button className="btn btn-secondary" onClick={openFullPage}>⧉ Full Page / Print</button>
            <button className="btn btn-primary" onClick={downloadPdf} disabled={pdfBusy}>
              {pdfBusy ? 'Exporting…' : '⤓ Download PDF'}
            </button>
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
