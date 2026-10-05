import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { leaveAPI } from '../../api/leave';
import { PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { toast } from '../../components/feedback';
import { formatDate } from '../../utils/format';
import { useRole } from '../../store/authStore';

export const LEAVE_STATUS_TONES: Record<string, string> = {
  DRAFT: 'badge-neutral', SUBMITTED: 'badge-info', APPROVED: 'badge-success',
  REJECTED: 'badge-danger', CANCELLED: 'badge-neutral',
};

const EMPTY = { personId: '', leaveTypeId: '', startDate: '', endDate: '', halfDayStart: false, halfDayEnd: false, reason: '' };

export default function LeaveList() {
  const navigate = useNavigate();
  const { canManagePeople, personId } = useRole();
  const [data, setData] = useState<any>(null);
  const [meta, setMeta] = useState<any>({ types: [], statuses: [], employees: [] });
  const [myBalances, setMyBalances] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [awaiting, setAwaiting] = useState(false);
  const [awaitingCount, setAwaitingCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [listRes, metaRes, awaitRes] = await Promise.all([
        leaveAPI.getRequests(awaiting ? { awaiting: '1' } : { q, status }),
        leaveAPI.getMeta(),
        leaveAPI.getRequests({ awaiting: '1' }),
      ]);
      setData(listRes.data);
      setMeta(metaRes.data);
      setAwaitingCount(awaitRes.data.requests.length);
      if (personId) {
        leaveAPI.getBalances({ personId }).then(r => setMyBalances(r.data.rows)).catch(() => setMyBalances(null));
      }
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load leave');
    } finally {
      setLoading(false);
    }
  }, [q, status, awaiting, personId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await leaveAPI.createRequest(form);
      navigate(`/leave/${res.data.id}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not create the request');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <LoadingBlock label="Loading leave…" />;

  return (
    <>
      <PageHeader
        title="Leave"
        subtitle="Apply for leave, track approvals and balances."
        actions={<button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY, personId: personId || '' }); setShowModal(true); }}>+ Apply for Leave</button>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {myBalances && myBalances.length > 0 && (
        <div className="stat-grid">
          {myBalances.filter(b => b.paid).slice(0, 4).map(b => (
            <StatCard key={b.leaveTypeId} label={`${b.code} balance`} value={b.balance}
              sub={`${b.availed} availed of ${b.granted}`} icon="◷" tone="info" />
          ))}
        </div>
      )}

      <div className="segmented" style={{ marginBottom: 14, display: 'inline-flex' }}>
        <button type="button" className={awaiting ? '' : 'active'} onClick={() => setAwaiting(false)}>All requests</button>
        <button type="button" className={awaiting ? 'active' : ''} onClick={() => setAwaiting(true)}>
          Awaiting my approval{awaitingCount ? ` (${awaitingCount})` : ''}
        </button>
      </div>

      {!awaiting && (
        <div className="toolbar">
          <div className="search-input">
            <input className="input" placeholder="Search by number, reason or employee…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {meta.statuses.map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      )}

      <div className="card">
        {(data?.requests || []).length === 0 ? (
          <EmptyState icon="◷" title={awaiting ? 'Nothing awaiting your approval' : q || status ? 'No matching requests' : 'No leave requests yet'}
            message={awaiting ? 'Requests waiting for your sign-off will appear here.' : 'Apply for leave — it routes to your manager for approval.'}
            action={!awaiting && !(q || status) && <button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY, personId: personId || '' }); setShowModal(true); }}>+ Apply for Leave</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Request</th><th>Employee</th><th>Type</th><th>Dates</th><th className="num">Days</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {data.requests.map((r: any) => (
                  <tr key={r.id}>
                    <td><Link to={`/leave/${r.id}`} style={{ fontWeight: 600 }}>{r.requestNumber}</Link></td>
                    <td className="text-muted">{r.person.name}</td>
                    <td><span className="badge badge-neutral">{r.leaveType.code}</span>{!r.leaveType.paid && <span className="badge badge-warning" style={{ marginLeft: 4 }}>LOP</span>}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{formatDate(r.startDate)}{r.endDate !== r.startDate ? ` – ${formatDate(r.endDate)}` : ''}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{r.days}</td>
                    <td><span className={`badge ${LEAVE_STATUS_TONES[r.status]}`}>{r.status.toLowerCase()}</span></td>
                    <td><div className="row-actions"><Link to={`/leave/${r.id}`} className="btn btn-secondary btn-sm">Open</Link></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title="Apply for Leave" open={showModal} onClose={() => setShowModal(false)}>
        <form onSubmit={handleCreate}>
          {canManagePeople && (
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Employee *</label>
              <select className="select" required value={form.personId} onChange={e => setForm({ ...form, personId: e.target.value })}>
                <option value="">Select employee…</option>
                {meta.employees.map((e2: any) => <option key={e2.id} value={e2.id}>{e2.name}{e2.employeeNo ? ` (${e2.employeeNo})` : ''}</option>)}
              </select>
              {!personId && <small className="text-muted">Your login isn't linked to an employee, so pick who this is for.</small>}
            </div>
          )}
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Leave type *</label>
            <select className="select" required value={form.leaveTypeId} onChange={e => setForm({ ...form, leaveTypeId: e.target.value })}>
              <option value="">Select type…</option>
              {meta.types.map((t: any) => <option key={t.id} value={t.id}>{t.code} — {t.name}{t.paid ? '' : ' (unpaid)'}</option>)}
            </select>
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>From *</label>
              <input className="input" type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value, endDate: form.endDate || e.target.value })} />
            </div>
            <div className="field">
              <label>To *</label>
              <input className="input" type="date" required value={form.endDate} min={form.startDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 18, marginBottom: 14, fontSize: 13 }}>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.halfDayStart} onChange={e => setForm({ ...form, halfDayStart: e.target.checked })} /> Half day on start</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={form.halfDayEnd} onChange={e => setForm({ ...form, halfDayEnd: e.target.checked })} /> Half day on end</label>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Reason</label>
            <textarea className="input" rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Continue'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
