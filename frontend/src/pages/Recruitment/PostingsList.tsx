import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { recruitmentAPI } from '../../api/recruitment';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, StatusBadge,
} from '../../components/ui';
import { Button } from '../../components/Button';
import PostingFormModal from '../../components/PostingFormModal';
import { formatDate } from '../../utils/format';

const TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACT: 'Contract', INTERNSHIP: 'Internship',
};

function PostingCard({ posting }: { posting: any }) {
  return (
    <Link to={`/recruitment/postings/${posting.id}`} className="module-card re-posting-card">
      <div className="re-posting-head">
        <h3 className="re-posting-title">{posting.title}</h3>
        <StatusBadge status={posting.status === 'ON_HOLD' ? 'pending' : posting.status.toLowerCase()} />
      </div>
      <p className="re-posting-meta">
        {[posting.department, posting.location].filter(Boolean).join(' · ') || '—'}
      </p>
      <div className="cluster re-posting-tags">
        <span className="badge badge-neutral">{TYPE_LABELS[posting.employmentType]}</span>
        <span className="badge badge-neutral"><span className="num">{posting.positionsCount}</span> position{posting.positionsCount !== 1 ? 's' : ''}</span>
        {posting.experienceRange && <span className="badge badge-neutral">{posting.experienceRange}</span>}
      </div>
      <div className="re-posting-foot">
        <span>
          <strong className="num re-strong">{posting.appCount}</strong> application{posting.appCount !== 1 ? 's' : ''}
          {posting.hiredCount > 0 && <span className="text-success"> · <span className="num">{posting.hiredCount}</span> hired</span>}
        </span>
        {posting.closingDate && <span>Closes <span className="re-date">{formatDate(posting.closingDate)}</span></span>}
      </div>
    </Link>
  );
}

export default function PostingsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [meta, setMeta] = useState<any>({ employmentTypes: [], postingStatuses: [], applicationStages: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [postingsRes, metaRes] = await Promise.all([
        recruitmentAPI.getPostings(),
        recruitmentAPI.getMeta(),
      ]);
      setData(postingsRes.data);
      setMeta(metaRes.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load postings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingBlock label="Loading recruitment…" />;

  const sections = data ? [
    { title: 'Open', rows: data.openPostings },
    { title: 'On hold', rows: data.onHoldPostings },
    { title: 'Draft', rows: data.draftPostings },
    { title: 'Closed', rows: data.closedPostings },
  ].filter(s => s.rows.length > 0) : [];

  return (
    <>
      <PageHeader
        title="Recruitment"
        subtitle="Job postings and candidate pipeline."
        actions={<Button variant="accent" icon="plus" onClick={() => setShowModal(true)}>New posting</Button>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {data && (
        <div className="stat-grid">
          <StatCard label="Job postings" value={data.totalCount}
            sub={`${data.openPostings.length} currently open`} icon="briefcase" tone="primary" />
          <StatCard label="Open positions" value={data.openPositions}
            sub="Headcount to fill" icon="userPlus" tone="info" />
          <StatCard label="Total applications" value={data.totalApplications}
            sub="Across all postings" icon="users" tone="success" />
        </div>
      )}

      {!data || data.totalCount === 0 ? (
        <div className="card">
          <EmptyState icon="◎" title="No job postings yet"
            message="Create your first posting to start tracking candidates."
            action={<Button icon="plus" onClick={() => setShowModal(true)}>New posting</Button>} />
        </div>
      ) : (
        sections.map(section => (
          <div key={section.title}>
            <div className="section-title">{section.title} <span className="num">({section.rows.length})</span></div>
            <div className="module-grid re-section-grid">
              {section.rows.map((p: any) => <PostingCard key={p.id} posting={p} />)}
            </div>
          </div>
        ))
      )}

      <PostingFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        posting={null}
        meta={meta}
        onSaved={p => navigate(`/recruitment/postings/${p.id}`)}
      />
    </>
  );
}
