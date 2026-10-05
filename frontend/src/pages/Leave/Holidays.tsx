import { useState, useEffect, useCallback } from 'react';
import { leaveAPI } from '../../api/leave';
import { PageHeader, EmptyState, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { toast, confirmDialog } from '../../components/feedback';
import { formatDate } from '../../utils/format';

const thisYear = new Date().getFullYear();
const EMPTY = { id: '', date: '', name: '', type: 'PUBLIC', workLocationId: '' };

export default function Holidays() {
  const [year, setYear] = useState(String(thisYear));
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    leaveAPI.listHolidays(year)
      .then(r => { setData(r.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'Failed to load holidays'));
  }, [year]);

  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await leaveAPI.saveHoliday({ ...form, workLocationId: form.workLocationId || null });
      setOpen(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not save holiday');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (h: any) => {
    if (!await confirmDialog(`Remove ${h.name} (${formatDate(h.date)})?`)) return;
    try { await leaveAPI.deleteHoliday(h.id); load(); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Could not remove'); }
  };

  if (!data && !error) return <LoadingBlock label="Loading holidays…" />;

  return (
    <>
      <PageHeader title="Holiday list" subtitle="Company holidays. Restricted (RH) holidays are optional; location-specific ones apply only there."
        actions={<button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY, date: `${year}-01-01` }); setOpen(true); }}>+ Add Holiday</button>} />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="toolbar">
        <select className="select" value={year} onChange={e => setYear(e.target.value)}>
          {[thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      </div>

      <div className="card">
        {(data?.holidays || []).length === 0 ? (
          <EmptyState icon="◷" title="No holidays yet" message={`Add the ${year} holiday list.`} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Holiday</th><th>Type</th><th>Location</th><th /></tr></thead>
              <tbody>
                {data.holidays.map((h: any) => (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 600 }}>{formatDate(h.date)}</td>
                    <td>{h.name}</td>
                    <td><span className={`badge ${h.type === 'RESTRICTED' ? 'badge-warning' : 'badge-info'}`}>{h.type === 'RESTRICTED' ? 'restricted' : 'public'}</span></td>
                    <td className="text-muted">{h.workLocation?.name || 'All locations'}</td>
                    <td><div className="row-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => { setForm({ id: h.id, date: h.date, name: h.name, type: h.type, workLocationId: h.workLocationId || '' }); setOpen(true); }}>Edit</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(h)}>Remove</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title={form.id ? 'Edit holiday' : 'Add holiday'} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save}>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field"><label>Date *</label><input className="input" type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field"><label>Type</label><select className="select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="PUBLIC">Public</option><option value="RESTRICTED">Restricted (optional)</option></select></div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}><label>Name *</label><input className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Diwali" /></div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Location</label>
            <select className="select" value={form.workLocationId} onChange={e => setForm({ ...form, workLocationId: e.target.value })}>
              <option value="">All locations</option>
              {(data?.locations || []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
