import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { recruitmentAPI } from '../../api/recruitment';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, StatusBadge,
} from '../../components/ui';
import PostingFormModal from '../../components/PostingFormModal';
import { formatDate } from '../../utils/format';

const TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACT: 'Contract', INTERNSHIP: 'Internship',
};

function PostingCard({ posting }: { posting: any }) {
  return (
    <Link to={`/recruitment/postings/${posting.id}`} className="module-card" style={{ padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <h3 style={{ fontSize: 15 }}>{posting.title}</h3>
        <StatusBadge status={posting.status === 'ON_HOLD' ? 'pending' : posting.status.toLowerCase()} />
      </div>
      <p style={{ marginBottom: 10 }}>
        {[posting.department, posting.location].filter(Boolean).join(' · ') || '—'}
      </p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="badge badge-neutral">{TYPE_LABELS[posting.employmentType]}</span>
        <span className="badge badge-neutral">{posting.positionsCount} position{posting.positionsCount !== 1 ? 's' : ''}</span>
        {posting.experienceRange && <span className="badge badge-neutral">{posting.experienceRange}</span>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between' }}>
        <span>
          <strong style={{ color: 'var(--primary)' }}>{posting.appCount}</strong> application{posting.appCount !== 1 ? 's' : ''}
          {posting.hiredCount > 0 && <span className="text-success"> · {posting.hiredCount} hired</span>}
        </span>
        {posting.closingDate && <span>closes {formatDate(posting.closingDate)}</span>}
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
        actions={
          <button className="btn btn-primary" onClick={() => setShowModal(true)}>
            + New Posting
          </button>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {data && (
        <div className="stat-grid">
          <StatCard label="Job Postings" value={data.totalCount}
            sub={`${data.openPostings.length} currently open`} icon="◎" tone="primary" />
          <StatCard label="Open Positions" value={data.openPositions}
            sub="Headcount to fill" icon="☰" tone="info" />
          <StatCard label="Total Applications" value={data.totalApplications}
            sub="Across all postings" icon="⇥" tone="success" />
        </div>
      )}

      {!data || data.totalCount === 0 ? (
        <div className="card">
          <EmptyState icon="◎" title="No job postings yet"
            message="Create your first posting to start tracking candidates."
            action={<button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Posting</button>} />
        </div>
      ) : (
        sections.map(section => (
          <div key={section.title}>
            <div className="section-title">{section.title} ({section.rows.length})</div>
            <div className="module-grid" style={{ marginBottom: 8 }}>
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
