import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { recruitmentAPI } from '../../api/recruitment';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal, StatusBadge, BackButton,
} from '../../components/ui';
import PostingFormModal from '../../components/PostingFormModal';
import { formatDate } from '../../utils/format';

const TYPE_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time', PART_TIME: 'Part-time', CONTRACT: 'Contract', INTERNSHIP: 'Internship',
};

const EMPTY_APP = {
  applicantName: '', applicantEmail: '', applicantPhone: '',
  stage: 'APPLIED', appliedDate: new Date().toISOString().split('T')[0],
  rating: null as number | null, resumeNotes: '', coverLetter: '', notes: '',
};

const stars = (n: number | null) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');

function StarInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="star-input">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" className={value && n <= value ? 'lit' : ''}
          onClick={() => onChange(value === n ? null : n)} aria-label={`${n} star`}>
          ★
        </button>
      ))}
    </div>
  );
}

export default function PostingDetail() {
  const { postingId } = useParams<{ postingId: string }>();
  const navigate = useNavigate();
  const [posting, setPosting] = useState<any>(null);
  const [meta, setMeta] = useState<any>({ employmentTypes: [], postingStatuses: [], applicationStages: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ message: string; personId?: string } | null>(null);
  const [tab, setTab] = useState<'pipeline' | 'details'>('pipeline');

  const [editModal, setEditModal] = useState(false);
  const [appModal, setAppModal] = useState<{ open: boolean; app: any | null }>({ open: false, app: null });
  const [appForm, setAppForm] = useState<any>(EMPTY_APP);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [postingRes, metaRes] = await Promise.all([
        recruitmentAPI.getPostingDetail(postingId!),
        recruitmentAPI.getMeta(),
      ]);
      setPosting(postingRes.data);
      setMeta(metaRes.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load posting');
    } finally {
      setLoading(false);
    }
  }, [postingId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openAppModal = (app: any | null) => {
    setAppForm(app ? {
      applicantName: app.applicantName, applicantEmail: app.applicantEmail,
      applicantPhone: app.applicantPhone, stage: app.stage, appliedDate: app.appliedDate,
      rating: app.rating, resumeNotes: app.resumeNotes, coverLetter: app.coverLetter,
      notes: app.notes,
    } : EMPTY_APP);
    setAppModal({ open: true, app });
  };

  const handleSaveApp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (appModal.app) await recruitmentAPI.updateApplication(appModal.app.id, appForm);
      else await recruitmentAPI.createApplication(postingId!, appForm);
      setAppModal({ open: false, app: null });
      setError('');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save application');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickMove = async (app: any, stage: string) => {
    try {
      await recruitmentAPI.updateApplication(app.id, { stage });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to move application');
    }
  };

  const handleAddToPeople = async (app: any) => {
    try {
      const res = await recruitmentAPI.addApplicationToPeople(app.id);
      setAppModal({ open: false, app: null });
      setSuccess({ message: res.data.message || 'Added to People.', personId: res.data.personId });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add to People');
    }
  };

  const handleDeleteApp = async () => {
    if (!appModal.app) return;
    if (!window.confirm(`Delete the application from ${appModal.app.applicantName}?`)) return;
    try {
      await recruitmentAPI.deleteApplication(appModal.app.id);
      setAppModal({ open: false, app: null });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete application');
    }
  };

  const handleDeletePosting = async () => {
    if (!window.confirm(`Delete "${posting.title}" and all ${posting.totalApps} application(s)? This cannot be undone.`)) return;
    try {
      await recruitmentAPI.deletePosting(posting.id);
      navigate('/recruitment');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete posting');
    }
  };

  if (loading) return <LoadingBlock label="Loading posting…" />;
  if (!posting) {
    return (
      <EmptyState icon="◎" title="Posting not found"
        action={<Link to="/recruitment" className="btn btn-secondary">Back to Recruitment</Link>} />
    );
  }

  const inProgress = (posting.stageCounts['APPLIED'] || 0) + (posting.stageCounts['SCREENING'] || 0)
    + (posting.stageCounts['INTERVIEW'] || 0) + (posting.stageCounts['OFFERED'] || 0);

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/recruitment">Recruitment</Link>
        <span>/</span>
        <span>{posting.title}</span>
      </div>

      <PageHeader
        title={posting.title}
        subtitle={[posting.department, posting.location, TYPE_LABELS[posting.employmentType]]
          .filter(Boolean).join(' · ')}
        actions={
          <>
            <StatusBadge status={posting.status === 'ON_HOLD' ? 'pending' : posting.status.toLowerCase()} />
            <button className="btn btn-secondary" onClick={() => setEditModal(true)}>Edit</button>
            <button className="btn btn-danger" onClick={handleDeletePosting}>Delete</button>
            <button className="btn btn-primary" onClick={() => openAppModal(null)}>+ Add Candidate</button>
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {success && (
        <div className="alert alert-success">
          <span>✓</span>
          <span style={{ flex: 1 }}>
            {success.message}
            {success.personId && <> <Link to={`/people/${success.personId}`}>Open their People record →</Link></>}
          </span>
          <button className="modal-close" onClick={() => setSuccess(null)}>✕</button>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Applications" value={posting.totalApps} icon="⇥" tone="primary" />
        <StatCard label="In Progress" value={inProgress} sub="Applied → Offered" icon="◔" tone="info" />
        <StatCard label="Hired" value={`${posting.hiredCount}/${posting.positionsCount}`}
          sub="Against open positions" icon="✓"
          tone={posting.hiredCount >= posting.positionsCount ? 'success' : 'warning'} />
        <StatCard label="Closing" value={posting.closingDate ? formatDate(posting.closingDate) : '—'}
          sub={posting.postedDate ? `Posted ${formatDate(posting.postedDate)}` : 'Not posted yet'}
          icon="◷" tone="warning" />
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'pipeline' ? 'active' : ''}`} onClick={() => setTab('pipeline')}>
          Pipeline ({posting.totalApps})
        </button>
        <button className={`tab ${tab === 'details' ? 'active' : ''}`} onClick={() => setTab('details')}>
          Job Details
        </button>
      </div>

      {tab === 'pipeline' && (
        posting.totalApps === 0 ? (
          <div className="card">
            <EmptyState icon="⇥" title="No applications yet"
              message="Add the first candidate to start the pipeline."
              action={<button className="btn btn-primary" onClick={() => openAppModal(null)}>+ Add Candidate</button>} />
          </div>
        ) : (
          <div className="kanban">
            {posting.pipeline.map((col: any) => (
              <div key={col.value} className="kanban-col">
                <div className="kanban-col-head">
                  <span>{col.label}</span>
                  <span className="kanban-count">{col.count}</span>
                </div>
                <div className="kanban-cards">
                  {col.apps.length === 0 ? (
                    <div className="kanban-empty">No candidates</div>
                  ) : col.apps.map((app: any) => (
                    <div key={app.id} className="app-card" onClick={() => openAppModal(app)}>
                      <div className="name">{app.applicantName}</div>
                      <div className="meta">
                        <span>{formatDate(app.appliedDate)}</span>
                        {app.rating && <span className="stars">{stars(app.rating)}</span>}
                      </div>
                      <select
                        className="quick-move"
                        value={app.stage}
                        onClick={e => e.stopPropagation()}
                        onChange={e => handleQuickMove(app, e.target.value)}
                      >
                        {meta.applicationStages.map((s: any) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'details' && (
        <div className="grid-2">
          <div className="card card-pad">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Description</h3>
            <p className="text-muted" style={{ whiteSpace: 'pre-wrap', fontSize: 13.5 }}>
              {posting.description || 'No description added.'}
            </p>
          </div>
          <div className="card card-pad">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Requirements</h3>
            <p className="text-muted" style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, marginBottom: 18 }}>
              {posting.requirements || 'No requirements added.'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {posting.experienceRange && <span className="badge badge-neutral">Experience: {posting.experienceRange}</span>}
              {posting.salaryRange && <span className="badge badge-neutral">Salary: {posting.salaryRange}</span>}
              <span className="badge badge-neutral">{posting.positionsCount} position{posting.positionsCount !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </div>
      )}

      <PostingFormModal
        open={editModal}
        onClose={() => setEditModal(false)}
        posting={posting}
        meta={meta}
        onSaved={() => fetchData()}
      />

      {/* Application create/edit */}
      <Modal size="lg"
        title={appModal.app ? appModal.app.applicantName : `Add Candidate — ${posting.title}`}
        open={appModal.open}
        onClose={() => setAppModal({ open: false, app: null })}>
        <form onSubmit={handleSaveApp}>
          <div className="form-section">
            <div className="form-section-title"><span className="step-dot">1</span> Candidate</div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Full name *</label>
              <input className="input" required autoFocus={!appModal.app}
                value={appForm.applicantName}
                onChange={e => setAppForm({ ...appForm, applicantName: e.target.value })} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label>Email</label>
                <input className="input" type="email" placeholder="name@email.com"
                  value={appForm.applicantEmail}
                  onChange={e => setAppForm({ ...appForm, applicantEmail: e.target.value })} />
              </div>
              <div className="field">
                <label>Phone</label>
                <input className="input" placeholder="+91…"
                  value={appForm.applicantPhone}
                  onChange={e => setAppForm({ ...appForm, applicantPhone: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title"><span className="step-dot">2</span> Pipeline</div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Stage</label>
                <select className="select" value={appForm.stage}
                  onChange={e => setAppForm({ ...appForm, stage: e.target.value })}>
                  {meta.applicationStages.map((s: any) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Applied on</label>
                <input className="input" type="date" value={appForm.appliedDate}
                  onChange={e => setAppForm({ ...appForm, appliedDate: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Rating</label>
              <StarInput value={appForm.rating} onChange={v => setAppForm({ ...appForm, rating: v })} />
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title"><span className="step-dot">3</span> Notes <span style={{ textTransform: 'none', fontWeight: 500 }}>(optional)</span></div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Resume notes</label>
                <textarea className="input" rows={3} placeholder="Key points from the resume"
                  value={appForm.resumeNotes}
                  onChange={e => setAppForm({ ...appForm, resumeNotes: e.target.value })} />
              </div>
              <div className="field">
                <label>Cover letter</label>
                <textarea className="input" rows={3}
                  value={appForm.coverLetter}
                  onChange={e => setAppForm({ ...appForm, coverLetter: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Internal notes</label>
              <textarea className="input" rows={2} placeholder="Interview feedback, next steps…"
                value={appForm.notes}
                onChange={e => setAppForm({ ...appForm, notes: e.target.value })} />
            </div>
          </div>

          <div className="form-actions" style={{ justifyContent: appModal.app ? 'space-between' : 'flex-end' }}>
            {appModal.app && (
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-danger" onClick={handleDeleteApp}>
                  Delete Application
                </button>
                {appModal.app.stage === 'HIRED' && !appModal.app.personId && (
                  <button type="button" className="btn btn-secondary"
                    onClick={() => handleAddToPeople(appModal.app)}>
                    ☰ Add to People
                  </button>
                )}
                {appModal.app.personId && (
                  <Link to={`/people/${appModal.app.personId}`} className="btn btn-secondary">
                    ☰ People Record
                  </Link>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn btn-ghost"
                onClick={() => setAppModal({ open: false, app: null })}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : appModal.app ? 'Save Changes' : 'Add Candidate'}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
