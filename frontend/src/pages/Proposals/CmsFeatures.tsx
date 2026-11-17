import { useState, useEffect, useRef } from 'react';
import { proposalsAPI } from '../../api/proposals';
import { PageHeader, LoadingBlock, ErrorAlert } from '../../components/ui';
import { Button } from '../../components/Button';
import { downloadHtmlAsPdf } from '../../utils/htmlToPdf';

// The spec is a complete standalone HTML document (own styles + A4 print
// rules), so it renders inside an iframe rather than the app's letter-sheet.
export default function CmsFeatures() {
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
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

  // Direct one-click PDF. html2canvas ignores the document's @media print
  // rules, so page breaks are driven here: each chapter starts a new page
  // and the key blocks are kept whole.
  const handlePdf = async () => {
    if (!doc || pdfBusy) return;
    setPdfBusy(true);
    try {
      const name = String(doc.filename || 'cms-erp-specifications').replace(/\.html?$/i, '') + '.pdf';
      await downloadHtmlAsPdf(doc.html, name, {
        fullDocument: true,
        pagebreak: {
          mode: ['css', 'legacy'],
          before: '.ch-hdr',
          avoid: ['.mod-banner', '.feat-grid', '.cards-g', '.roles-tbl', '.comp-callout', '.dc-table', '.hero-stats', '.flow-wrap', '.ns-contact'],
        },
      });
    } catch {
      setError('Could not generate the PDF. Use “Print / save as PDF” instead.');
    } finally {
      setPdfBusy(false);
    }
  };

  if (loading) return <LoadingBlock label="Preparing the specifications document…" />;

  return (
    <>
      <PageHeader
        title="CMS ERP product specifications"
        subtitle="Version 2026 · 16 chapters, 25+ modules, full functional specs — for demos, tenders and RFP responses."
        actions={doc && (
          <>
            <Button variant="ghost" icon="download" onClick={handleDownload}>HTML</Button>
            <Button icon="printer" onClick={handlePrint}>Print / save as PDF</Button>
            <Button variant="accent" icon="download" onClick={handlePdf} loading={pdfBusy}>
              {pdfBusy ? 'Preparing PDF…' : 'Download PDF'}
            </Button>
          </>
        )}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {doc && (
        <iframe
          ref={frameRef}
          title="CMS ERP product specifications"
          srcDoc={doc.html}
          className="mp-spec-frame"
        />
      )}
    </>
  );
}
