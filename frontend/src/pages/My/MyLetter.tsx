import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { selfAPI } from '../../api/self';
import { PageHeader, LoadingBlock, EmptyState, BackButton } from '../../components/ui';
import { formatDate } from '../../utils/format';
import DownloadButton from '../../components/DownloadButton';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';

// One letter HR has shared with the signed-in employee.
export default function MyLetter() {
  const { docId } = useParams<{ docId: string }>();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    selfAPI.getDocumentLetter(docId!)
      .then(res => { setDoc(res.data); setError(''); })
      .catch(err => { setDoc(null); setError(err.response?.data?.error || 'Failed to load the letter'); })
      .finally(() => setLoading(false));
  }, [docId]);

  if (loading) return <LoadingBlock label="Loading letter…" />;
  if (!doc) {
    return <EmptyState icon="▤" title="Not available" message={error}
      action={<ButtonLink to="/my/documents">Back to my documents</ButtonLink>} />;
  }

  return (
    <>
      <div className="no-print">
        <div className="breadcrumb"><BackButton />
          <Link to="/my/documents">My documents</Link>
          <span>/</span>
          <span>{doc.title}</span>
        </div>
        <PageHeader title={doc.title} subtitle={`Issued ${formatDate(doc.createdAt)}`}
          actions={<>
            <DownloadButton path={`/self/documents/letters/${doc.id}/pdf`} busyLabel="Making the PDF…"><Icon name="download" size={16} className="btn-icon" />PDF</DownloadButton>
            <Button variant="primary" icon="printer" onClick={() => window.print()}>Print</Button>
          </>} />
      </div>
      <div className="letter-sheet print-area">
        <div dangerouslySetInnerHTML={{ __html: doc.html }} />
      </div>
    </>
  );
}
