import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { peopleAPI } from '../../api/people';
import { PageHeader, LoadingBlock, EmptyState, ErrorAlert } from '../../components/ui';
import { formatDate } from '../../utils/format';

export default function LetterView() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    peopleAPI.getDocument(docId!)
      .then(res => setDoc(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load the letter'))
      .finally(() => setLoading(false));
  }, [docId]);

  const handleDelete = async () => {
    if (!window.confirm('Remove this letter from the record? This cannot be undone.')) return;
    try {
      await peopleAPI.deleteDocument(doc.id);
      navigate(`/people/${doc.person.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (loading) return <LoadingBlock label="Loading letter…" />;
  if (!doc) {
    return <EmptyState icon="▤" title="Letter not found"
      action={<Link to="/people" className="btn btn-secondary">Back to People</Link>} />;
  }

  return (
    <>
      <div className="no-print">
        <div className="breadcrumb">
          <Link to="/people">People</Link>
          <span>/</span>
          <Link to={`/people/${doc.person.id}`}>{doc.person.name}</Link>
          <span>/</span>
          <span>{doc.title}</span>
        </div>

        <PageHeader
          title={doc.title}
          subtitle={`Issued ${formatDate(doc.createdAt)} · saved to ${doc.person.name}'s record`}
          actions={
            <>
              <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
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
