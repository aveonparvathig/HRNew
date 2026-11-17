import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { leaveAPI } from '../../api/leave';
import { PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Tabs } from '../../components/Tabs';
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
  const [overview, setOverview] = useState<any>(null);
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
      if (canManagePeople) {
        leaveAPI.getOverview().then(r => setOverview(r.data)).catch(() => setOverview(null));
      }
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load leave');
    } finally {
      setLoading(false);
    }
  }, [q, status, awaiting, personId, canManagePeople]);

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

  const openApply = () => { setForm({ ...EMPTY, personId: personId || '' }); setShowModal(true); };

  return (
    <>
      <PageHeader
        title="Leave"
        subtitle="Apply for leave, track approvals and balances."
        actions={<Button variant="accent" icon="plus" onClick={openApply}>Apply for leave</Button>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {overview && (
        <>
          <div className="stat-grid">
            <StatCard label="On leave today" value={overview.onLeaveToday} icon="calendar" tone="primary" />
            <StatCard label="Pending approvals" value={overview.pending} icon="clock" tone="warning" />
            <StatCard label="Approved this year" value={overview.byType.reduce((s: number, t: any) => s + t.days, 0)}
              sub="days" icon="checkCircle" tone="success" />
            <StatCard label="Leave types used" value={overview.byType.length} icon="layers" tone="info" />
          </div>
          {(overview.byType.length > 0 || overview.thisWeek.length > 0) && (
            <div className="platform-cards-2 lr-overview">
              <div className="card">
                <h3 className="lr-card-title">Leave taken this year, by type</h3>
                {overview.byType.length === 0 ? <p className="text-muted">None yet.</p> : (
                  <div className="lr-type-chips">
                    {overview.byType.map((t: any) => (
                      <span key={t.code} className="badge badge-neutral">{t.code}: <strong className="num">{t.days}</strong> d</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="card">
                <h3 className="lr-card-title">On leave this week</h3>
                {overview.thisWeek.length === 0 ? <p className="text-muted">Nobody on leave this week.</p> : (
                  <div className="lr-week">
                    {overview.thisWeek.slice(0, 6).map((r: any, i: number) => (
                      <div key={i} className="lr-week-row">
                        <span>{r.name} <span className="badge badge-neutral">{r.code}</span></span>
                        <span className="lr-date">{formatDate(r.startDate)}{r.endDate !== r.startDate ? `–${formatDate(r.endDate)}` : ''}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {myBalances && myBalances.length > 0 && (
        <div className="stat-grid">
          {myBalances.filter(b => b.paid).slice(0, 4).map(b => (
            <StatCard key={b.leaveTypeId} label={`${b.code} balance`} value={b.balance}
              sub={`${b.availed} availed of ${b.granted}`} icon="calendar" tone="info" />
          ))}
        </div>
      )}

      <Tabs label="Leave requests view" value={awaiting ? 'awaiting' : 'all'}
        onChange={k => setAwaiting(k === 'awaiting')}
        items={[
          { key: 'all', label: 'All requests' },
          { key: 'awaiting', label: 'Awaiting my approval', count: awaitingCount || undefined },
        ]} />

      {!awaiting && (
        <div className="toolbar">
          <div className="search-input">
            <input className="input" aria-label="Search leave requests" placeholder="Search by number, reason or employee…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <select className="select" aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {meta.statuses.map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      )}

      <div className="card">
        {(data?.requests || []).length === 0 ? (
          <EmptyState icon="◷" title={awaiting ? 'Nothing awaiting your approval' : q || status ? 'No matching requests' : 'No leave requests yet'}
            message={awaiting ? 'Requests waiting for your sign-off will appear here.' : 'Apply for leave — it routes to your manager for approval.'}
            action={!awaiting && !(q || status) && <Button icon="plus" onClick={openApply}>Apply for leave</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Request</th><th>Employee</th><th>Type</th><th>Dates</th><th className="num">Days</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {data.requests.map((r: any) => (
                  <tr key={r.id}>
                    <td><Link to={`/leave/${r.id}`} className="lr-strong">{r.requestNumber}</Link></td>
                    <td className="text-muted">{r.person.name}</td>
                    <td><span className="badge badge-neutral">{r.leaveType.code}</span>{!r.leaveType.paid && <span className="badge badge-warning lr-tag">LOP</span>}</td>
                    <td className="lr-date">{formatDate(r.startDate)}{r.endDate !== r.startDate ? ` – ${formatDate(r.endDate)}` : ''}</td>
                    <td className="num lr-strong">{r.days}</td>
                    <td><span className={`badge ${LEAVE_STATUS_TONES[r.status]}`}>{r.status.toLowerCase()}</span></td>
                    <td><div className="row-actions"><ButtonLink to={`/leave/${r.id}`} size="sm">Open</ButtonLink></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title="Apply for leave" open={showModal} onClose={() => setShowModal(false)}>
        <form onSubmit={handleCreate} className="lr-form">
          {canManagePeople && (
            <div className="field">
              <label htmlFor="lr-apply-person">Employee *</label>
              <select id="lr-apply-person" className="select" required value={form.personId} onChange={e => setForm({ ...form, personId: e.target.value })}>
                <option value="">Select employee…</option>
                {meta.employees.map((e2: any) => <option key={e2.id} value={e2.id}>{e2.name}{e2.employeeNo ? ` (${e2.employeeNo})` : ''}</option>)}
              </select>
              {!personId && <small className="text-muted">Your login isn't linked to an employee, so pick who this is for.</small>}
            </div>
          )}
          <div className="field">
            <label htmlFor="lr-apply-type">Leave type *</label>
            <select id="lr-apply-type" className="select" required value={form.leaveTypeId} onChange={e => setForm({ ...form, leaveTypeId: e.target.value })}>
              <option value="">Select type…</option>
              {meta.types.map((t: any) => <option key={t.id} value={t.id}>{t.code} — {t.name}{t.paid ? '' : ' (unpaid)'}</option>)}
            </select>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="lr-apply-from">From *</label>
              <input id="lr-apply-from" className="input" type="date" required value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value, endDate: form.endDate || e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="lr-apply-to">To *</label>
              <input id="lr-apply-to" className="input" type="date" required value={form.endDate} min={form.startDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div className="lr-checks">
            <label className="lr-check"><input type="checkbox" checked={form.halfDayStart} onChange={e => setForm({ ...form, halfDayStart: e.target.checked })} /> Half day on start</label>
            <label className="lr-check"><input type="checkbox" checked={form.halfDayEnd} onChange={e => setForm({ ...form, halfDayEnd: e.target.checked })} /> Half day on end</label>
          </div>
          <div className="field">
            <label htmlFor="lr-apply-reason">Reason</label>
            <textarea id="lr-apply-reason" className="input" rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Creating…' : 'Continue'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
