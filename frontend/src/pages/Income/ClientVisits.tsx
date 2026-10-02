import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { incomeAPI } from '../../api/income';
import { useAuthStore, useRole } from '../../store/authStore';
import {
  PageHeader, StatCard, ErrorAlert, LoadingBlock, EmptyState, Modal, BackButton,
} from '../../components/ui';
import { formatDate } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().split('T')[0];

const EMPTY_FORM = {
  clientId: '', engineerName: '', visitDate: today(),
  timeIn: '', timeOut: '', workDone: '', metPersons: '',
  followupNote: '', followupDate: '',
};

export default function ClientVisits() {
  const [params] = useSearchParams();
  const user = useAuthStore(s => s.user);
  const { isSA, isEmployee } = useRole();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [engineer, setEngineer] = useState('');
  const [client, setClient] = useState(params.get('client') || '');
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await incomeAPI.getVisits({
        month: month || undefined,
        engineer: engineer || undefined,
        client: client || undefined,
      });
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load visits');
    } finally {
      setLoading(false);
    }
  }, [month, engineer, client]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const openLog = () => {
    setEditId(null);
    setForm({ ...EMPTY_FORM, visitDate: today(), clientId: client || '' });
    setModal(true);
  };

  const openEdit = (v: any) => {
    setEditId(v.id);
    setForm({
      clientId: v.clientId, engineerName: v.engineerName, visitDate: v.visitDate,
      timeIn: v.timeIn, timeOut: v.timeOut, workDone: v.workDone, metPersons: v.metPersons,
      followupNote: v.followupNote, followupDate: v.followupDate || '',
    });
    setModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editId) await incomeAPI.updateVisit(editId, form);
      else await incomeAPI.createVisit(form);
      setModal(false);
      setError('');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save the visit');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (v: any) => {
    if (!await confirmDialog(`Delete the ${formatDate(v.visitDate)} visit to ${v.client?.name}?`)) return;
    try {
      await incomeAPI.deleteVisit(v.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (loading && !data) return <LoadingBlock label="Loading visits…" />;
  if (!data) return <ErrorAlert message={error || 'No data'} />;

  const visits = data.visits || [];
  const myName = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : '';
  const myVisits = visits.filter((v: any) => v.mine).length;
  const followupDue = (v: any) => v.followupDate && v.followupDate <= today();

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/income/implementation">Implementation</Link>
        <span>/</span>
        <span>Client Visits</span>
      </div>

      <PageHeader
        title="Client Visits"
        subtitle="Site attendance — who visited which institution, the work done and whom they met."
        actions={<button className="btn btn-primary" onClick={openLog}>+ Log Visit</button>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="stat-grid">
        <StatCard label={month ? 'Visits (selected month)' : 'Visits'} value={data.summary.count}
          icon="⇗" tone="primary" />
        <StatCard label="Clients Covered" value={data.summary.clients}
          sub="Institutions visited" icon="◎" tone="info" />
        <StatCard label="Engineers on Field" value={data.summary.engineers}
          icon="☰" tone="success" />
        <StatCard label="My Visits" value={myVisits}
          sub="Logged by you" icon="✓" tone="warning" />
      </div>

      <div className="toolbar">
        <input className="input" type="month" style={{ width: 160 }}
          value={month} onChange={e => setMonth(e.target.value)} />
        <select className="select" value={engineer} onChange={e => setEngineer(e.target.value)}>
          <option value="">All engineers</option>
          {(data.engineers || []).map((e: string) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select className="select" style={{ maxWidth: 260 }} value={client}
          onChange={e => setClient(e.target.value)}>
          <option value="">All clients</option>
          {(data.visitClients || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {month && (
          <button className="btn btn-ghost btn-sm" onClick={() => setMonth('')}>All time</button>
        )}
        <span className="toolbar-count">{visits.length} visit{visits.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="card">
        {visits.length === 0 ? (
          <EmptyState icon="⇗" title="No visits logged"
            message="Log the first site visit — date, work done and whom you met."
            action={<button className="btn btn-primary" onClick={openLog}>+ Log Visit</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th><th>Client</th><th>Engineer</th><th>Time</th>
                  <th>Work done</th><th>Met</th><th>Follow-up</th><th />
                </tr>
              </thead>
              <tbody>
                {visits.map((v: any) => (
                  <tr key={v.id}>
                    <td style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{formatDate(v.visitDate)}</td>
                    <td>
                      <Link to={`/income/clients/${v.clientId}`} style={{ fontWeight: 600 }}>
                        {v.client?.name}
                      </Link>
                    </td>
                    <td>{v.engineerName || <span className="text-muted">—</span>}</td>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>
                      {v.timeIn || v.timeOut ? `${v.timeIn || '?'} – ${v.timeOut || '?'}` : '—'}
                    </td>
                    <td style={{ maxWidth: 260, fontSize: 12.5 }}>{v.workDone || <span className="text-muted">—</span>}</td>
                    <td style={{ maxWidth: 180, fontSize: 12.5 }} className="text-muted">{v.metPersons || '—'}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {v.followupDate ? (
                        <span className={`badge ${followupDue(v) ? 'badge-danger' : 'badge-info'}`}
                          title={v.followupNote}>
                          {formatDate(v.followupDate)}
                        </span>
                      ) : v.followupNote ? (
                        <span className="text-muted" title={v.followupNote}>note</span>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td>
                      {(isSA || v.mine) && (
                        <div className="row-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(v)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(v)}>Del</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal size="lg" title={editId ? 'Edit Visit' : 'Log Client Visit'} open={modal}
        onClose={() => setModal(false)}>
        <form onSubmit={handleSave}>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Client *</label>
              <select className="select" required value={form.clientId}
                onChange={e => set('clientId', e.target.value)}>
                <option value="">— pick the institution —</option>
                {(data.visitClients || []).map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <span className="hint">Any client can be logged — not only your own assignments.</span>
            </div>
            <div className="field">
              <label>Visit date *</label>
              <input className="input" type="date" required value={form.visitDate}
                onChange={e => set('visitDate', e.target.value)} />
            </div>
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Engineer</label>
              {isEmployee ? (
                <input className="input" value={myName || 'You'} disabled />
              ) : (
                <>
                  <input className="input" list="visit-engineers" value={form.engineerName}
                    onChange={e => set('engineerName', e.target.value)} />
                  <datalist id="visit-engineers">
                    {(data.engineers || []).map((e: string) => <option key={e} value={e} />)}
                  </datalist>
                </>
              )}
            </div>
            <div className="field">
              <label>Time in</label>
              <input className="input" type="time" value={form.timeIn}
                onChange={e => set('timeIn', e.target.value)} />
            </div>
            <div className="field">
              <label>Time out</label>
              <input className="input" type="time" value={form.timeOut}
                onChange={e => set('timeOut', e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Work done *</label>
            <textarea className="input" rows={2} required
              placeholder="e.g. Configured exam module, trained COE staff on hall tickets"
              value={form.workDone} onChange={e => set('workDone', e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Met with</label>
            <input className="input"
              placeholder="e.g. Dr. Kumar (Principal), Ms. Devi (COE)"
              value={form.metPersons} onChange={e => set('metPersons', e.target.value)} />
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Next action / follow-up</label>
              <input className="input" placeholder="e.g. Share fee-structure template"
                value={form.followupNote} onChange={e => set('followupNote', e.target.value)} />
            </div>
            <div className="field">
              <label>Follow-up date</label>
              <input className="input" type="date" value={form.followupDate || ''}
                onChange={e => set('followupDate', e.target.value)} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editId ? 'Save Changes' : 'Log Visit'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
