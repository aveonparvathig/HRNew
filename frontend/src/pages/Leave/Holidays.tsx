import { useState, useEffect, useCallback } from 'react';
import { leaveAPI } from '../../api/leave';
import { PageHeader, EmptyState, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { Button } from '../../components/Button';
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
        actions={<Button variant="accent" icon="plus" onClick={() => { setForm({ ...EMPTY, date: `${year}-01-01` }); setOpen(true); }}>Add holiday</Button>} />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="toolbar">
        <select className="select" aria-label="Year" value={year} onChange={e => setYear(e.target.value)}>
          {[thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={String(y)}>{y}</option>)}
        </select>
      </div>

      <div className="card">
        {(data?.holidays || []).length === 0 ? (
          <EmptyState icon="◷" title="No holidays yet" message={`Add the ${year} holiday list.`} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Holiday</th><th>Type</th><th>Location</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.holidays.map((h: any) => (
                  <tr key={h.id}>
                    <td className="lr-date lr-strong">{formatDate(h.date)}</td>
                    <td>{h.name}</td>
                    <td><span className={`badge ${h.type === 'RESTRICTED' ? 'badge-warning' : 'badge-info'}`}>{h.type === 'RESTRICTED' ? 'restricted' : 'public'}</span></td>
                    <td className="text-muted">{h.workLocation?.name || 'All locations'}</td>
                    <td><div className="row-actions">
                      <Button size="sm" icon="pen" onClick={() => { setForm({ id: h.id, date: h.date, name: h.name, type: h.type, workLocationId: h.workLocationId || '' }); setOpen(true); }}>Edit</Button>
                      <Button variant="ghost" size="sm" onClick={() => remove(h)}>Remove</Button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title={form.id ? 'Edit holiday' : 'Add holiday'} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save} className="lr-form">
          <div className="form-grid">
            <div className="field"><label htmlFor="lr-hol-date">Date *</label><input id="lr-hol-date" className="input" type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field"><label htmlFor="lr-hol-type">Type</label><select id="lr-hol-type" className="select" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}><option value="PUBLIC">Public</option><option value="RESTRICTED">Restricted (optional)</option></select></div>
          </div>
          <div className="field"><label htmlFor="lr-hol-name">Name *</label><input id="lr-hol-name" className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Diwali" /></div>
          <div className="field">
            <label htmlFor="lr-hol-location">Location</label>
            <select id="lr-hol-location" className="select" value={form.workLocationId} onChange={e => setForm({ ...form, workLocationId: e.target.value })}>
              <option value="">All locations</option>
              {(data?.locations || []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
