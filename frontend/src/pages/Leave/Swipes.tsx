import { useState, useEffect, useCallback } from 'react';
import { attendanceAPI } from '../../api/attendance';
import { PageHeader, EmptyState, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
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
            <button className="btn btn-secondary" onClick={() => { setImportResult(null); setImportText(''); setImportOpen(true); }}>Import</button>
            {personId && <button className="btn btn-primary" onClick={() => { setForm({ date: `${month}-01`, time: '', direction: 'IN' }); setAddOpen(true); }}>+ Add Swipe</button>}
          </>
        } />
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="toolbar">
        <select className="select" value={personId} onChange={e => setPersonId(e.target.value)} style={{ minWidth: 240 }}>
          <option value="">Select an employee…</option>
          {meta.employees.map((e2: any) => <option key={e2.id} value={e2.id}>{e2.name}{e2.employeeNo ? ` (${e2.employeeNo})` : ''}</option>)}
        </select>
        <input className="input" type="month" style={{ maxWidth: 170 }} value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {exceptions.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: 16 }}>
          <span>⚠</span>
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
                    <td style={{ fontWeight: 600 }}>{formatDate(d.date)}</td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {d.swipes.map((s: any) => (
                          <span key={s.id} className={`badge ${s.direction === 'IN' ? 'badge-success' : 'badge-neutral'}`} title={`${s.direction} · ${s.source} — click to remove`} style={{ cursor: 'pointer' }} onClick={() => removeSwipe(s.id)}>
                            {s.time} {s.direction === 'IN' ? '↓' : '↑'}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-muted">{d.summary.firstIn || '—'}</td>
                    <td className="text-muted">{d.summary.lastOut || '—'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{d.summary.workedMinutes ? hhmm(d.summary.workedMinutes) : '—'}</td>
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
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field"><label>Date *</label><input className="input" type="date" required value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="field"><label>Time *</label><input className="input" type="time" required value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} /></div>
            <div className="field"><label>Direction</label><select className="select" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}><option value="IN">IN</option><option value="OUT">OUT</option></select></div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">Add</button>
          </div>
        </form>
      </Modal>

      <Modal title="Import swipes" open={importOpen} onClose={() => setImportOpen(false)}>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 10 }}>
          Paste CSV rows: <code>employeeNo, date (YYYY-MM-DD), time (HH:MM), direction (IN/OUT)</code>. A header row is skipped.
        </p>
        <textarea className="input" rows={7} style={{ fontFamily: 'monospace', fontSize: 12.5 }} value={importText}
          onChange={e => setImportText(e.target.value)} placeholder={'EMP001,2026-10-05,09:02,IN\nEMP001,2026-10-05,18:10,OUT'} />
        {importResult && (
          <div className="card" style={{ background: 'var(--surface-2)', margin: '12px 0', fontSize: 13 }}>
            <strong>{importResult.created}</strong> swipe(s) imported{importResult.skipped.length ? `, ${importResult.skipped.length} skipped` : ''}.
            {importResult.skipped.slice(0, 4).map((s: any, i: number) => <div key={i} className="text-muted" style={{ fontSize: 12 }}>Line {s.line}: {s.reason}</div>)}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(false)}>Close</button>
          <button type="button" className="btn btn-primary" onClick={runImport} disabled={!importText.trim()}>Import</button>
        </div>
      </Modal>
    </>
  );
}
