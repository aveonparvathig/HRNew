import { useState, useEffect, useCallback } from 'react';
import { attendanceAPI } from '../../api/attendance';
import { PageHeader, EmptyState, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
import { toast, confirmDialog } from '../../components/feedback';
import { formatDate } from '../../utils/format';

const thisMonth = new Date().toISOString().slice(0, 7);
const hhmm = (mins: number) => `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;

export default function Swipes() {
  const [meta, setMeta] = useState<any>({ employees: [] });
  const [personId, setPersonId] = useState('');
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<any>(null);
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<any>({ date: '', time: '', direction: 'IN' });
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState<any>(null);

  useEffect(() => { attendanceAPI.getMeta().then(r => setMeta(r.data)).catch(() => {}); }, []);

  const loadExceptions = useCallback(() => {
    attendanceAPI.getExceptions(month).then(r => setExceptions(r.data.exceptions)).catch(() => setExceptions([]));
  }, [month]);

  const load = useCallback(() => {
    loadExceptions();
    if (!personId) { setData(null); return; }
    setLoading(true);
    attendanceAPI.getSwipes(personId, month)
      .then(r => { setData(r.data); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'Failed to load swipes'))
      .finally(() => setLoading(false));
  }, [personId, month, loadExceptions]);

  useEffect(() => { load(); }, [load]);

  const addSwipe = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await attendanceAPI.addSwipe({ personId, ...form, direction: form.direction });
      setAddOpen(false); setForm({ date: '', time: '', direction: 'IN' }); load();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Could not add swipe'); }
  };

  const removeSwipe = async (id: string) => {
    if (!await confirmDialog('Remove this swipe?')) return;
    try { await attendanceAPI.deleteSwipe(id); load(); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Could not remove'); }
  };

  const runImport = async () => {
    try {
      const res = await attendanceAPI.importSwipes(importText);
      setImportResult(res.data);
      load();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Import failed'); }
  };

  return (
    <>
      <PageHeader title="Swipes" subtitle="Clock-in / clock-out punches. Add manually or import from a device file."
        actions={
          <>
            <Button onClick={() => { setImportResult(null); setImportText(''); setImportOpen(true); }}>Import</Button>
            {personId && <Button variant="accent" icon="plus" onClick={() => { setForm({ date: `${month}-01`, time: '', direction: 'IN' }); setAddOpen(true); }}>Add swipe</Button>}
          </>
        } />
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="toolbar">
        <select className="select la-select-person" aria-label="Employee" value={personId} onChange={e => setPersonId(e.target.value)}>
          <option value="">Select an employee…</option>
          {meta.employees.map((e2: any) => <option key={e2.id} value={e2.id}>{e2.name}{e2.employeeNo ? ` (${e2.employeeNo})` : ''}</option>)}
        </select>
        <input className="input la-input-month" type="month" aria-label="Month" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {exceptions.length > 0 && (
        <div className="alert alert-warning mb-16">
          <Icon name="alert" size={16} className="la-alert-icon" />
          <span><strong>{exceptions.length} attendance exception(s)</strong> this month — days with unpaired punches: {exceptions.slice(0, 5).map(x => `${x.name.split(' ')[0]} ${x.date.slice(8)}`).join(', ')}{exceptions.length > 5 ? '…' : ''}</span>
        </div>
      )}

      <div className="card">
        {!personId ? (
          <EmptyState icon="◷" title="Pick an employee" message="Select an employee to see their punches." />
        ) : loading ? <LoadingBlock label="Loading swipes…" /> : (data?.days || []).length === 0 ? (
          <EmptyState icon="◷" title="No swipes" message="No punches for this employee in this month." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Date</th><th>Punches</th><th>First in</th><th>Last out</th><th className="num">Worked</th><th>Status</th></tr></thead>
              <tbody>
                {data.days.map((d: any) => (
                  <tr key={d.date}>
                    <td className="la-strong">{formatDate(d.date)}</td>
                    <td>
                      <div className="cluster la-gap-4">
                        {d.swipes.map((s: any) => (
                          <button type="button" key={s.id} className={`badge la-swipe-chip ${s.direction === 'IN' ? 'badge-success' : 'badge-neutral'}`}
                            title={`${s.direction} · ${s.source} — click to remove`}
                            aria-label={`${s.time} ${s.direction}, remove`}
                            onClick={() => removeSwipe(s.id)}>
                            {s.time} <span aria-hidden="true">{s.direction === 'IN' ? '↓' : '↑'}</span>
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="text-muted mono">{d.summary.firstIn || '—'}</td>
                    <td className="text-muted mono">{d.summary.lastOut || '—'}</td>
                    <td className="num la-strong">{d.summary.workedMinutes ? hhmm(d.summary.workedMinutes) : '—'}</td>
                    <td>{d.summary.complete ? <span className="badge badge-success">complete</span> : <span className="badge badge-warning">exception</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title="Add swipe" open={addOpen} onClose={() => setAddOpen(false)}>
        <form onSubmit={addSwipe}>
          <div className="form-grid mb-14">
            <div className="field"><label htmlFor="la-swipe-date">Date *</label><input id="la-swipe-date" className="input" type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field"><label htmlFor="la-swipe-time">Time *</label><input id="la-swipe-time" className="input" type="time" required value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></div>
            <div className="field"><label htmlFor="la-swipe-dir">Direction</label><select id="la-swipe-dir" className="select" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}><option value="IN">IN</option><option value="OUT">OUT</option></select></div>
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button type="submit" variant="accent">Add</Button>
          </div>
        </form>
      </Modal>

      <Modal title="Import swipes" open={importOpen} onClose={() => setImportOpen(false)}>
        <p className="modal-lede">
          Paste CSV rows: <code>employeeNo, date (YYYY-MM-DD), time (HH:MM), direction (IN/OUT)</code>. A header row is skipped.
        </p>
        <textarea className="input la-code-input" rows={7} aria-label="Swipe CSV rows" value={importText}
          onChange={e => setImportText(e.target.value)} placeholder={'EMP001,2026-10-05,09:02,IN\nEMP001,2026-10-05,18:10,OUT'} />
        {importResult && (
          <div className="card la-import-result">
            <strong className="num">{importResult.created}</strong> swipe(s) imported{importResult.skipped.length ? `, ${importResult.skipped.length} skipped` : ''}.
            {importResult.skipped.slice(0, 4).map((s: any, i: number) => <div key={i} className="text-sm-muted">Line {s.line}: {s.reason}</div>)}
          </div>
        )}
        <div className="form-actions">
          <Button variant="ghost" onClick={() => setImportOpen(false)}>Close</Button>
          <Button variant="accent" onClick={runImport} disabled={!importText.trim()}>Import</Button>
        </div>
      </Modal>
    </>
  );
}
