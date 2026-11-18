import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useLetterPaper } from '../../utils/letterPaper';
import PaperChoice from '../../components/PaperChoice';
import { peopleAPI } from '../../api/people';
import { PageHeader, LoadingBlock, EmptyState, ErrorAlert, BackButton,
} from '../../components/ui';
import { formatDate } from '../../utils/format';
import { confirmDialog, toast } from '../../components/feedback';
import DownloadButton from '../../components/DownloadButton';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';

export default function LetterView() {
  const { docId } = useParams<{ docId: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [paper, setPaper] = useLetterPaper();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    peopleAPI.getDocument(docId!)
      .then(res => setDoc(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load the letter'))
      .finally(() => setLoading(false));
  }, [docId]);

  // Opened by "Generate & print": print once the letter is on the page,
  // and forget it so a reload does not print again
  useEffect(() => {
    if (!doc || searchParams.get('print') !== '1') return;
    setSearchParams({}, { replace: true });
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, [doc, searchParams, setSearchParams]);

  const handleDelete = async () => {
    if (!await confirmDialog('Remove this letter from the record? This cannot be undone.')) return;
    try {
      await peopleAPI.deleteDocument(doc.id);
      navigate(`/people/${doc.person.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  // Show the letter to the employee under My Documents, or take it back
  const toggleVisible = async () => {
    try {
      const res = await peopleAPI.updateDocument(doc.id, { visibleToEmployee: !doc.visibleToEmployee });
      setDoc({ ...doc, visibleToEmployee: res.data.visibleToEmployee });
      toast.success(res.data.visibleToEmployee ? `${doc.person.name} can now see this letter` : 'Hidden from the employee');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not change it');
    }
  };

  const handleEmail = async () => {
    if (!await confirmDialog({
      title: 'Email this letter?', message: `It goes to ${doc.emailTo} as a PDF.`, confirmLabel: 'Send',
    })) return;
    setSending(true);
    try {
      const res = await peopleAPI.emailDocument(doc.id);
      if (res.data.ok) { toast.success(`Sent to ${res.data.to}`); setError(''); } else setError(`Could not send: ${res.data.error}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not send the letter');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading letter…" />;
  if (!doc) {
    return <EmptyState icon="▤" title="Letter not found"
      action={<ButtonLink to="/people">Back to People</ButtonLink>} />;
  }

  return (
    <>
      <div className="no-print">
        <div className="breadcrumb"><BackButton />
          <Link to="/people">People</Link>
          <span>/</span>
          <Link to={`/people/${doc.person.id}`}>{doc.person.name}</Link>
          <span>/</span>
          <span>{doc.title}</span>
        </div>

        <PageHeader
          title={doc.title}
          subtitle={<>
            Issued {formatDate(doc.createdAt)}{doc.createdByName ? ` by ${doc.createdByName}` : ''} · saved to {doc.person.name}'s record
            {' · '}
            <span className={`badge ${doc.visibleToEmployee ? 'badge-success' : 'badge-neutral'}`}>
              {doc.visibleToEmployee ? 'Shown to the employee' : 'Not shown to the employee'}
            </span>
          </>}
          actions={
            <>
              <Button variant="danger" onClick={handleDelete}>Delete</Button>
              <Button onClick={toggleVisible}>
                {doc.visibleToEmployee ? 'Hide from employee' : 'Show to employee'}
              </Button>
              <Button icon="mail" loading={sending} disabled={!doc.emailTo} onClick={handleEmail}
                title={doc.emailTo ? `Send to ${doc.emailTo}` : 'No email address on record'}>
                {sending ? 'Sending…' : 'Email'}
              </Button>
              <PaperChoice paper={paper} onChange={setPaper} />
              <DownloadButton path={`/people/documents/${doc.id}/file`} params={{ paper }} busyLabel="Making the PDF…">
                <Icon name="download" size={16} className="btn-icon" />PDF
              </DownloadButton>
              <Button variant="accent" icon="printer" onClick={() => window.print()}>Print</Button>
            </>
          }
        />

        <ErrorAlert message={error} onDismiss={() => setError('')} />
      </div>

      <div className={`letter-sheet print-area${paper === 'letterhead' ? ' on-letterhead' : ''}`}>
        <div dangerouslySetInnerHTML={{ __html: doc.html }} />
      </div>
    </>
  );
}
