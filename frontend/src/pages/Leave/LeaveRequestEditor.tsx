import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { leaveAPI } from '../../api/leave';
import { PageHeader, EmptyState, LoadingBlock, ErrorAlert, SuccessAlert, Modal, BackButton } from '../../components/ui';
import { Button, ButtonLink, type ButtonVariant } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
import { confirmDialog } from '../../components/feedback';
import { formatDate } from '../../utils/format';
import { LEAVE_STATUS_TONES } from './LeaveList';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="lr-detail-row">
      <div className="lr-detail-label">{label}</div>
      <div className="lr-detail-value">{children}</div>
    </div>
  );
}

// Submit and approve never show together, so each is the single accent of the view.
const ACTION_LABELS: Record<string, { label: string; variant: ButtonVariant; icon?: string; confirm?: string }> = {
  submit: { label: 'Submit', variant: 'accent' },
  approve: { label: 'Approve', variant: 'accent', icon: 'checkCircle' },
  reject: { label: 'Reject', variant: 'danger', confirm: 'Reject this request? The employee can edit and resubmit.' },
  cancel: { label: 'Cancel leave', variant: 'ghost', confirm: 'Cancel this leave request? Approved leave will be reversed.' },
};

export default function LeaveRequestEditor() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const [req, setReq] = useState<any>(null);
  const [meta, setMeta] = useState<any>({ types: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [detail, metaRes] = await Promise.all([leaveAPI.getRequestDetail(requestId!), leaveAPI.getMeta()]);
      setReq(detail.data);
      setMeta(metaRes.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load request');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const doAction = async (action: string) => {
    const cfg = ACTION_LABELS[action];
    if (cfg.confirm && !await confirmDialog(cfg.confirm)) return;
    try {
      const res = await leaveAPI.changeStatus(req.id, action);
      setSuccess(res.data.message);
      setError('');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Action failed');
    }
  };

  const openEdit = () => {
    setForm({
      leaveTypeId: req.leaveTypeId, startDate: req.startDate, endDate: req.endDate,
      halfDayStart: req.halfDayStart, halfDayEnd: req.halfDayEnd, reason: req.reason,
    });
    setEditOpen(true);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await leaveAPI.updateRequest(req.id, form);
      setEditOpen(false);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!await confirmDialog(`Delete ${req.requestNumber}?`)) return;
    try { await leaveAPI.deleteRequest(req.id); navigate('/leave'); }
    catch (err: any) { setError(err.response?.data?.error || 'Failed to delete'); }
  };

  if (loading) return <LoadingBlock label="Loading request…" />;
  if (!req) return <EmptyState icon="◷" title="Request not found" action={<ButtonLink to="/leave">Back to leave</ButtonLink>} />;

  return (
    <>
      <div className="breadcrumb"><BackButton /><Link to="/leave">Leave</Link><span>/</span><span>{req.requestNumber}</span></div>

      <PageHeader
        title={`${req.leaveType.code} — ${req.person.name}`}
        subtitle={`${req.requestNumber} · ${formatDate(req.startDate)}${req.endDate !== req.startDate ? ` – ${formatDate(req.endDate)}` : ''} · ${req.days} day(s)`}
        actions={
          <>
            <span className={`badge ${LEAVE_STATUS_TONES[req.status]}`}>{req.status.toLowerCase()}</span>
            {req.editable && <Button icon="pen" onClick={openEdit}>Edit</Button>}
            {req.status === 'DRAFT' && <Button variant="danger" onClick={handleDelete}>Delete</Button>}
            {req.actions.map((a: string) => (
              <Button key={a} variant={ACTION_LABELS[a].variant} icon={ACTION_LABELS[a].icon} onClick={() => doAction(a)}>{ACTION_LABELS[a].label}</Button>
            ))}
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <div className="card card-pad mb-24">
        <h3 className="lr-details-title">Details</h3>
        <Row label="Leave type">{req.leaveType.name} ({req.leaveType.code}){!req.leaveType.paid && <span className="badge badge-warning lr-tag">Unpaid / LOP</span>}</Row>
        <Row label="Dates"><span className="lr-date">{formatDate(req.startDate)} – {formatDate(req.endDate)}</span>{req.halfDayStart ? ' · half-day start' : ''}{req.halfDayEnd ? ' · half-day end' : ''}</Row>
        <Row label="Days"><span className="num">{req.days}</span></Row>
        <Row label="Reason">{req.reason || '—'}</Row>
        {req.appliedOnBehalf && <Row label="Note">Raised by HR on behalf of the employee</Row>}
      </div>

      {req.approvals?.length > 0 && (
        <div className="card card-pad mb-24">
          <div className="lr-card-head">
            <h3 className="lr-section-title">Approval chain</h3>
            {req.canApproveNow && <span className="badge badge-warning">Awaiting your approval</span>}
          </div>
          <div className="approval-chain">
            {req.approvals.map((s: any) => {
              const state = s.decision === 'APPROVED' ? 'done' : s.decision === 'REJECTED' ? 'rejected'
                : (s.level === req.approvalLevel && req.status === 'SUBMITTED') ? 'current' : 'pending';
              return (
                <div key={s.level} className={`approval-step ${state}`}>
                  <span className="step-mark">{state === 'done' ? '✓' : state === 'rejected' ? '✗' : s.level}</span>
                  <div className="lr-step-body">
                    <div className="step-name">{s.approverName}</div>
                    <div className="step-sub">
                      {s.decision === 'APPROVED' ? `Approved${s.decidedAt ? ' · ' + formatDate(s.decidedAt) : ''}`
                        : s.decision === 'REJECTED' ? 'Rejected' : state === 'current' ? 'Awaiting' : 'Waiting'}
                      {s.note ? ` — ${s.note}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {req.status === 'SUBMITTED' && (!req.approvals || req.approvals.length === 0) && (
        <div className="alert alert-info mb-24"><Icon name="info" size={16} className="lr-alert-icon" /><span>No reporting manager — this request is awaiting HR approval.</span></div>
      )}

      {form && (
        <Modal title="Edit request" open={editOpen} onClose={() => setEditOpen(false)}>
          <form onSubmit={saveEdit} className="lr-form">
            <div className="field">
              <label htmlFor="lr-edit-type">Leave type</label>
              <select id="lr-edit-type" className="select" value={form.leaveTypeId} onChange={e => setForm({ ...form, leaveTypeId: e.target.value })}>
                {meta.types.map((t: any) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
              </select>
            </div>
            <div className="form-grid">
              <div className="field"><label htmlFor="lr-edit-from">From</label><input id="lr-edit-from" className="input" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
              <div className="field"><label htmlFor="lr-edit-to">To</label><input id="lr-edit-to" className="input" type="date" min={form.startDate} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
            </div>
            <div className="lr-checks">
              <label className="lr-check"><input type="checkbox" checked={form.halfDayStart} onChange={e => setForm({ ...form, halfDayStart: e.target.checked })} /> Half day start</label>
              <label className="lr-check"><input type="checkbox" checked={form.halfDayEnd} onChange={e => setForm({ ...form, halfDayEnd: e.target.checked })} /> Half day end</label>
            </div>
            <div className="field"><label htmlFor="lr-edit-reason">Reason</label><textarea id="lr-edit-reason" className="input" rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
