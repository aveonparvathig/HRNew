import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { recruitmentAPI } from '../../api/recruitment';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, SuccessAlert, Modal, StatusBadge, BackButton,
} from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Tabs } from '../../components/Tabs';
import PostingFormModal from '../../components/PostingFormModal';
import { formatDate } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';

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
    if (!await confirmDialog(`Delete the application from ${appModal.app.applicantName}?`)) return;
    try {
      await recruitmentAPI.deleteApplication(appModal.app.id);
      setAppModal({ open: false, app: null });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete application');
    }
  };

  const handleDeletePosting = async () => {
    if (!await confirmDialog(`Delete "${posting.title}" and all ${posting.totalApps} application(s)? This cannot be undone.`)) return;
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
        action={<ButtonLink to="/recruitment">Back to recruitment</ButtonLink>} />
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
            <Button icon="pen" onClick={() => setEditModal(true)}>Edit</Button>
            <Button variant="danger" onClick={handleDeletePosting}>Delete</Button>
            <Button variant="accent" icon="plus" onClick={() => openAppModal(null)}>Add candidate</Button>
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {success && (
        <SuccessAlert onDismiss={() => setSuccess(null)}>
          {success.message}
          {success.personId && <> <Link to={`/people/${success.personId}`}>Open their People record →</Link></>}
        </SuccessAlert>
      )}

      <div className="stat-grid">
        <StatCard label="Applications" value={posting.totalApps} icon="users" tone="primary" />
        <StatCard label="In progress" value={inProgress} sub="Applied → Offered" icon="kanban" tone="info" />
        <StatCard label="Hired" value={`${posting.hiredCount}/${posting.positionsCount}`}
          sub="Against open positions" icon="checkCircle"
          tone={posting.hiredCount >= posting.positionsCount ? 'success' : 'warning'} />
        <StatCard label="Closing" value={posting.closingDate ? formatDate(posting.closingDate) : '—'}
          sub={posting.postedDate ? `Posted ${formatDate(posting.postedDate)}` : 'Not posted yet'}
          icon="calendar" tone="warning" />
      </div>

      <Tabs label="Posting sections" value={tab} onChange={setTab}
        items={[
          { key: 'pipeline', label: 'Pipeline', count: posting.totalApps },
          { key: 'details', label: 'Job details' },
        ]} />

      {tab === 'pipeline' && (
        posting.totalApps === 0 ? (
          <div className="card">
            <EmptyState icon="⇥" title="No applications yet"
              message="Add the first candidate to start the pipeline."
              action={<Button icon="plus" onClick={() => openAppModal(null)}>Add candidate</Button>} />
          </div>
        ) : (
          <div className="kanban re-kanban">
            {posting.pipeline.map((col: any) => (
              <div key={col.value} className="kanban-col">
                <div className="kanban-col-head">
                  <span>{col.label}</span>
                  <span className="kanban-count num">{col.count}</span>
                </div>
                <div className="kanban-cards">
                  {col.apps.length === 0 ? (
                    <div className="kanban-empty">No candidates</div>
                  ) : col.apps.map((app: any) => (
                    <div key={app.id} className="app-card" role="button" tabIndex={0}
                      onClick={() => openAppModal(app)}
                      onKeyDown={e => {
                        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                          e.preventDefault();
                          openAppModal(app);
                        }
                      }}>
                      <div className="name">{app.applicantName}</div>
                      <div className="meta">
                        <span className="re-date">{formatDate(app.appliedDate)}</span>
                        {app.rating && <span className="stars" aria-label={`${app.rating} of 5`}>{stars(app.rating)}</span>}
                      </div>
                      <select
                        className="quick-move"
                        aria-label={`Move ${app.applicantName} to stage`}
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
            <h3 className="re-card-title">Description</h3>
            <p className="text-muted re-prose">
              {posting.description || 'No description added.'}
            </p>
          </div>
          <div className="card card-pad">
            <h3 className="re-card-title">Requirements</h3>
            <p className="text-muted re-prose re-prose-gap">
              {posting.requirements || 'No requirements added.'}
            </p>
            <div className="cluster">
              {posting.experienceRange && <span className="badge badge-neutral">Experience: {posting.experienceRange}</span>}
              {posting.salaryRange && <span className="badge badge-neutral">Salary: {posting.salaryRange}</span>}
              <span className="badge badge-neutral"><span className="num">{posting.positionsCount}</span> position{posting.positionsCount !== 1 ? 's' : ''}</span>
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
        title={appModal.app ? appModal.app.applicantName : `Add candidate — ${posting.title}`}
        open={appModal.open}
        onClose={() => setAppModal({ open: false, app: null })}>
        <form onSubmit={handleSaveApp}>
          <div className="form-section">
            <div className="form-section-title"><span className="step-dot">1</span> Candidate</div>
            <div className="field mb-14">
              <label htmlFor="re-app-name">Full name *</label>
              <input id="re-app-name" className="input" required autoFocus={!appModal.app}
                value={appForm.applicantName}
                onChange={e => setAppForm({ ...appForm, applicantName: e.target.value })} />
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="re-app-email">Email</label>
                <input id="re-app-email" className="input" type="email" placeholder="name@email.com"
                  value={appForm.applicantEmail}
                  onChange={e => setAppForm({ ...appForm, applicantEmail: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="re-app-phone">Phone</label>
                <input id="re-app-phone" className="input" placeholder="+91…"
                  value={appForm.applicantPhone}
                  onChange={e => setAppForm({ ...appForm, applicantPhone: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title"><span className="step-dot">2</span> Pipeline</div>
            <div className="form-grid mb-14">
              <div className="field">
                <label htmlFor="re-app-stage">Stage</label>
                <select id="re-app-stage" className="select" value={appForm.stage}
                  onChange={e => setAppForm({ ...appForm, stage: e.target.value })}>
                  {meta.applicationStages.map((s: any) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="re-app-applied">Applied on</label>
                <input id="re-app-applied" className="input" type="date" value={appForm.appliedDate}
                  onChange={e => setAppForm({ ...appForm, appliedDate: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Rating</label>
              <StarInput value={appForm.rating} onChange={v => setAppForm({ ...appForm, rating: v })} />
            </div>
          </div>

          <div className="form-section">
            <div className="form-section-title"><span className="step-dot">3</span> Notes <span className="re-optional">(optional)</span></div>
            <div className="form-grid mb-14">
              <div className="field">
                <label htmlFor="re-app-resume">Resume notes</label>
                <textarea id="re-app-resume" className="input" rows={3} placeholder="Key points from the resume"
                  value={appForm.resumeNotes}
                  onChange={e => setAppForm({ ...appForm, resumeNotes: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="re-app-cover">Cover letter</label>
                <textarea id="re-app-cover" className="input" rows={3}
                  value={appForm.coverLetter}
                  onChange={e => setAppForm({ ...appForm, coverLetter: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="re-app-notes">Internal notes</label>
              <textarea id="re-app-notes" className="input" rows={2} placeholder="Interview feedback, next steps…"
                value={appForm.notes}
                onChange={e => setAppForm({ ...appForm, notes: e.target.value })} />
            </div>
          </div>

          <div className={appModal.app ? 'form-actions re-actions-between' : 'form-actions'}>
            {appModal.app && (
              <div className="cluster re-actions-group">
                <Button variant="danger" onClick={handleDeleteApp}>Delete application</Button>
                {appModal.app.stage === 'HIRED' && !appModal.app.personId && (
                  <Button icon="userPlus" onClick={() => handleAddToPeople(appModal.app)}>Add to People</Button>
                )}
                {appModal.app.personId && (
                  <ButtonLink to={`/people/${appModal.app.personId}`} icon="user">People record</ButtonLink>
                )}
              </div>
            )}
            <div className="cluster re-actions-group">
              <Button variant="ghost" onClick={() => setAppModal({ open: false, app: null })}>Cancel</Button>
              <Button type="submit" variant="accent" loading={saving}>
                {saving ? 'Saving…' : appModal.app ? 'Save changes' : 'Add candidate'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
