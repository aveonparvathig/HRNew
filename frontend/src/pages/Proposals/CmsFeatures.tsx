import { useState, useEffect, useRef } from 'react';
import { proposalsAPI } from '../../api/proposals';
import { PageHeader, LoadingBlock, ErrorAlert } from '../../components/ui';

// The spec is a complete standalone HTML document (own styles + A4 print
// rules), so it renders inside an iframe rather than the app's letter-sheet.
export default function CmsFeatures() {
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    proposalsAPI.getCmsFeatures()
      .then(res => setDoc(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load the specifications document'))
      .finally(() => setLoading(false));
  }, []);

  // Open the standalone document in its own tab and print from there —
  // printing inside the embedded frame can clip to a single page; the full
  // tab paginates the whole spec onto A4 (the document carries @page A4 CSS).
  const handlePrint = () => {
    const blob = new Blob([doc.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) {
      win.addEventListener('load', () => setTimeout(() => win.print(), 400));
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  const handleDownload = () => {
    const blob = new Blob([doc.html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <LoadingBlock label="Preparing the specifications document…" />;

  return (
    <>
      <PageHeader
        title="CMS ERP — Product Specifications"
        subtitle="Version 2026 · 16 chapters, 25+ modules, full functional specs — for demos, tenders and RFP responses."
        actions={doc && (
          <>
            <button className="btn btn-secondary" onClick={handleDownload}>⬇ Download HTML</button>
            <button className="btn btn-primary" onClick={handlePrint}>🖨 Print / Save as PDF (A4)</button>
          </>
        )}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {doc && (
        <iframe
          ref={frameRef}
          title="CMS ERP Product Specifications"
          srcDoc={doc.html}
          style={{
            width: '100%',
            height: 'calc(100vh - 180px)',
            minHeight: 600,
            border: '1px solid var(--border)',
            borderRadius: 12,
            background: '#fff',
          }}
        />
      )}
    </>
  );
}
