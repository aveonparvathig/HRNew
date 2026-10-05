import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { leaveAPI } from '../../api/leave';
import { PageHeader, EmptyState, LoadingBlock, ErrorAlert, SuccessAlert, Modal, BackButton } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';
import { formatDate } from '../../utils/format';
import { LEAVE_STATUS_TONES } from './LeaveList';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13.5 }}>
      <div className="text-muted" style={{ width: 130, flex: '0 0 130px' }}>{label}</div>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

const ACTION_LABELS: Record<string, { label: string; cls: string; confirm?: string }> = {
  submit: { label: '⇧ Submit', cls: 'btn-primary' },
  approve: { label: '✓ Approve', cls: 'btn-primary' },
  reject: { label: '✗ Reject', cls: 'btn-danger', confirm: 'Reject this request? The employee can edit and resubmit.' },
  cancel: { label: 'Cancel leave', cls: 'btn-ghost', confirm: 'Cancel this leave request? Approved leave will be reversed.' },
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
  if (!req) return <EmptyState icon="◷" title="Request not found" action={<Link to="/leave" className="btn btn-secondary">Back to Leave</Link>} />;

  return (
    <>
      <div className="breadcrumb"><BackButton /><Link to="/leave">Leave</Link><span>/</span><span>{req.requestNumber}</span></div>

      <PageHeader
        title={`${req.leaveType.code} — ${req.person.name}`}
        subtitle={`${req.requestNumber} · ${formatDate(req.startDate)}${req.endDate !== req.startDate ? ` – ${formatDate(req.endDate)}` : ''} · ${req.days} day(s)`}
        actions={
          <>
            <span className={`badge ${LEAVE_STATUS_TONES[req.status]}`}>{req.status.toLowerCase()}</span>
            {req.editable && <button className="btn btn-secondary" onClick={openEdit}>Edit</button>}
            {req.status === 'DRAFT' && <button className="btn btn-danger" onClick={handleDelete}>Delete</button>}
            {req.actions.map((a: string) => (
              <button key={a} className={`btn ${ACTION_LABELS[a].cls}`} onClick={() => doAction(a)}>{ACTION_LABELS[a].label}</button>
            ))}
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Details</h3>
        <Row label="Leave type">{req.leaveType.name} ({req.leaveType.code}){!req.leaveType.paid && <span className="badge badge-warning" style={{ marginLeft: 6 }}>Unpaid / LOP</span>}</Row>
        <Row label="Dates">{formatDate(req.startDate)} – {formatDate(req.endDate)}{req.halfDayStart ? ' · half-day start' : ''}{req.halfDayEnd ? ' · half-day end' : ''}</Row>
        <Row label="Days">{req.days}</Row>
        <Row label="Reason">{req.reason || '—'}</Row>
        {req.appliedOnBehalf && <Row label="Note">Raised by HR on behalf of the employee</Row>}
      </div>

      {req.approvals?.length > 0 && (
        <div className="card card-pad mb-24">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ fontSize: 15, margin: 0 }}>Approval chain</h3>
            {req.canApproveNow && <span className="badge badge-warning">Awaiting your approval</span>}
          </div>
          <div className="approval-chain">
            {req.approvals.map((s: any) => {
              const state = s.decision === 'APPROVED' ? 'done' : s.decision === 'REJECTED' ? 'rejected'
                : (s.level === req.approvalLevel && req.status === 'SUBMITTED') ? 'current' : 'pending';
              return (
                <div key={s.level} className={`approval-step ${state}`}>
                  <span className="step-mark">{state === 'done' ? '✓' : state === 'rejected' ? '✗' : s.level}</span>
                  <div style={{ minWidth: 0 }}>
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
        <div className="alert alert-info" style={{ marginBottom: 24 }}>No reporting manager — this request is awaiting HR approval.</div>
      )}

      {form && (
        <Modal title="Edit request" open={editOpen} onClose={() => setEditOpen(false)}>
          <form onSubmit={saveEdit}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Leave type</label>
              <select className="select" value={form.leaveTypeId} onChange={e => setForm({ ...form, leaveTypeId: e.target.value })}>
                {meta.types.map((t: any) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
              </select>
            </div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field"><label>From</label><input className="input" type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
              <div className="field"><label>To</label><input className="input" type="date" min={form.startDate} value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', gap: 18, marginBottom: 14, fontSize: 13 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.halfDayStart} onChange={e => setForm({ ...form, halfDayStart: e.target.checked })} /> Half day start</label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.halfDayEnd} onChange={e => setForm({ ...form, halfDayEnd: e.target.checked })} /> Half day end</label>
            </div>
            <div className="field" style={{ marginBottom: 14 }}><label>Reason</label><textarea className="input" rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
