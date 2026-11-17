import { useState, useEffect, useCallback } from 'react';
import { attendanceAPI } from '../../api/attendance';
import { PageHeader, EmptyState, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { Button } from '../../components/Button';
import { toast, confirmDialog } from '../../components/feedback';

const EMPTY = { id: '', code: '', name: '', startTime: '09:00', endTime: '18:00', workHours: 8, isNight: false, active: true };

export default function Shifts() {
  const [shifts, setShifts] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    attendanceAPI.getMeta().then(r => setShifts(r.data.shifts)).catch(err => setError(err.response?.data?.error || 'Failed to load shifts'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await attendanceAPI.saveShift({ ...form, workHours: Number(form.workHours) });
      setOpen(false); load();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Could not save shift'); }
    finally { setSaving(false); }
  };

  const remove = async (s: any) => {
    if (!await confirmDialog(`Delete shift ${s.code}?`)) return;
    try { await attendanceAPI.deleteShift(s.id); load(); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Could not delete'); }
  };

  if (!shifts && !error) return <LoadingBlock label="Loading shifts…" />;

  const openAdd = () => { setForm(EMPTY); setOpen(true); };
  const hasShifts = (shifts || []).length > 0;

  return (
    <>
      <PageHeader title="Shifts" subtitle="Working-hour patterns used in the roster and attendance."
        actions={hasShifts && <Button variant="accent" icon="plus" onClick={openAdd}>Add shift</Button>} />
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="card">
        {!hasShifts ? (
          // One accent per view: the empty state carries the CTA when there are no shifts.
          <EmptyState icon="◷" title="No shifts yet" message="Add your first shift."
            action={<Button variant="accent" icon="plus" onClick={openAdd}>Add shift</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Code</th><th>Name</th><th>Timing</th><th className="num">Hours</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {shifts!.map(s => (
                  <tr key={s.id}>
                    <td><span className="badge badge-neutral la-code">{s.code}</span></td>
                    <td>{s.name}</td>
                    <td className="text-muted">
                      <span className="mono">{s.startTime} – {s.endTime}</span>
                      {s.isNight && <span className="badge badge-info la-badge-gap">night</span>}
                    </td>
                    <td className="num">{s.workHours}</td>
                    <td><span className={`badge ${s.active ? 'badge-success' : 'badge-neutral'}`}>{s.active ? 'active' : 'inactive'}</span></td>
                    <td><div className="row-actions">
                      <Button size="sm" icon="pen" onClick={() => { setForm({ ...s }); setOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s)}>Delete</Button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title={form.id ? `Edit ${form.code}` : 'Add shift'} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={save}>
          <div className="form-grid mb-14">
            <div className="field"><label htmlFor="la-shift-code">Code *</label><input id="la-shift-code" className="input" required disabled={!!form.id} value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. NGT" /></div>
            <div className="field"><label htmlFor="la-shift-name">Name *</label><input id="la-shift-name" className="input" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <div className="form-grid mb-14">
            <div className="field"><label htmlFor="la-shift-start">Start *</label><input id="la-shift-start" className="input" type="time" required value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} /></div>
            <div className="field"><label htmlFor="la-shift-end">End *</label><input id="la-shift-end" className="input" type="time" required value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} /></div>
            <div className="field"><label htmlFor="la-shift-hours">Work hours</label><input id="la-shift-hours" className="input" type="number" step="0.5" value={form.workHours} onChange={e => setForm({ ...form, workHours: e.target.value })} /></div>
          </div>
          <div className="cluster la-checks">
            <label className="la-check-label"><input type="checkbox" checked={form.isNight} onChange={e => setForm({ ...form, isNight: e.target.checked })} /> Night shift (ends next day)</label>
            <label className="la-check-label"><input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} /> Active</label>
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save shift'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
