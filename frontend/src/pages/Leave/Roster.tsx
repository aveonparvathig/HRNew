import { useState, useEffect, useCallback, useMemo } from 'react';
import { attendanceAPI } from '../../api/attendance';
import { PageHeader, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { toast, confirmDialog } from '../../components/feedback';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const dowOf = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();
const addMonth = (ym: string, d: number) => {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + d, 1));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`;
};
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

export default function Roster() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [assign, setAssign] = useState({ startDate: '', endDate: '', shiftId: '' });
  const [profile, setProfile] = useState<any>(null);

  const load = useCallback(() => {
    setData(null);
    attendanceAPI.getRoster(month).then(r => setData(r.data)).catch(err => setError(err.response?.data?.error || 'Failed to load roster'));
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => {
    const [y, m] = month.split('-').map(Number);
    const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return Array.from({ length: n }, (_, i) => i + 1);
  }, [month]);

  const toggle = (id: string) => setSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSelected = data && sel.size === data.rows.length && data.rows.length > 0;

  const doAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sel.size) return toast.error('Select employees (tick the boxes) first');
    try {
      const res = await attendanceAPI.assign({ personIds: [...sel], ...assign });
      toast.success(res.data.message);
      setAssign({ startDate: '', endDate: '', shiftId: '' });
      load();
    } catch (err: any) { toast.error(err.response?.data?.error || 'Could not assign'); }
  };

  const clearCell = async (personId: string, date: string) => {
    if (!await confirmDialog('Clear this day\'s shift override (fall back to the default)?')) return;
    try { await attendanceAPI.clear(personId, date); load(); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Could not clear'); }
  };

  const saveProfile = async () => {
    try {
      await attendanceAPI.setProfile({ personId: profile.personId, defaultShiftId: profile.defaultShiftId || null, weekOffDays: profile.weekOffDays });
      setProfile(null); load();
      toast.success('Profile saved.');
    } catch (err: any) { toast.error(err.response?.data?.error || 'Could not save'); }
  };

  if (!data && !error) return <LoadingBlock label="Loading roster…" />;

  return (
    <>
      <PageHeader title="Shift roster" subtitle="Each employee's default shift, week-offs, and day-by-day overrides."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setMonth(addMonth(month, -1))}>←</button>
            <strong style={{ minWidth: 140, textAlign: 'center' }}>{monthLabel(month)}</strong>
            <button className="btn btn-secondary btn-sm" onClick={() => setMonth(addMonth(month, 1))}>→</button>
          </div>
        } />
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {data && (
        <>
          <form className="card card-pad" style={{ marginBottom: 16 }} onSubmit={doAssign}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
              <div className="field" style={{ margin: 0 }}><label>Assign shift to selected ({sel.size})</label>
                <select className="select" required value={assign.shiftId} onChange={e => setAssign({ ...assign, shiftId: e.target.value })} style={{ minWidth: 160 }}>
                  <option value="">Shift…</option>
                  {data.shifts.filter((s: any) => s.active).map((s: any) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>
              <div className="field" style={{ margin: 0 }}><label>From</label><input className="input" type="date" required value={assign.startDate} onChange={e => setAssign({ ...assign, startDate: e.target.value, endDate: assign.endDate || e.target.value })} /></div>
              <div className="field" style={{ margin: 0 }}><label>To</label><input className="input" type="date" required min={assign.startDate} value={assign.endDate} onChange={e => setAssign({ ...assign, endDate: e.target.value })} /></div>
              <button type="submit" className="btn btn-primary">Assign</button>
            </div>
          </form>

          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="roster-table">
              <thead>
                <tr>
                  <th className="roster-emp">
                    <input type="checkbox" checked={!!allSelected} onChange={e => setSel(e.target.checked ? new Set(data.rows.map((r: any) => r.personId)) : new Set())} /> Employee
                  </th>
                  {days.map(d => {
                    const date = `${month}-${pad(d)}`;
                    return <th key={d} className="roster-day"><div>{d}</div><div className="roster-dow">{DOW[dowOf(date)][0]}</div></th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.personId}>
                    <td className="roster-emp">
                      <input type="checkbox" checked={sel.has(r.personId)} onChange={() => toggle(r.personId)} />
                      <button className="roster-empname" onClick={() => setProfile({ personId: r.personId, name: r.name, defaultShiftId: r.defaultShiftId || '', weekOffDays: [...r.weekOffDays] })} title="Edit default shift & week-off">
                        {r.name}
                        <span className="roster-empsub">{r.defaultShiftCode || 'no default'} · off {r.weekOffDays.map((w: number) => DOW[w]).join(',') || '—'}</span>
                      </button>
                    </td>
                    {days.map(d => {
                      const date = `${month}-${pad(d)}`;
                      const ov = r.overrides[date];
                      const wo = r.weekOffDays.includes(dowOf(date));
                      return (
                        <td key={d} className={`roster-cell${ov ? ' ov' : wo ? ' wo' : ''}`}
                          onClick={ov ? () => clearCell(r.personId, date) : undefined}
                          title={ov ? `${ov} (override — click to clear)` : wo ? 'Week-off' : (r.defaultShiftCode || '')}>
                          {ov || (wo ? '·' : (r.defaultShiftCode || ''))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-muted" style={{ fontSize: 12, marginTop: 8 }}>Tick employees, pick a shift and dates, then Assign. Bold cells are overrides — click one to clear it. “·” is a week-off.</p>
        </>
      )}

      {profile && (
        <Modal title={`${profile.name} — shift & week-off`} open={!!profile} onClose={() => setProfile(null)}>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Default shift</label>
            <select className="select" value={profile.defaultShiftId} onChange={e => setProfile({ ...profile, defaultShiftId: e.target.value })}>
              <option value="">None</option>
              {data.shifts.filter((s: any) => s.active).map((s: any) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 18 }}>
            <label>Week-off days (overrides the org default)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
              {DOW.map((d, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13 }}>
                  <input type="checkbox" checked={profile.weekOffDays.includes(i)}
                    onChange={() => setProfile((p: any) => ({ ...p, weekOffDays: p.weekOffDays.includes(i) ? p.weekOffDays.filter((x: number) => x !== i) : [...p.weekOffDays, i].sort() }))} /> {d}
                </label>
              ))}
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setProfile(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={saveProfile}>Save</button>
          </div>
        </Modal>
      )}
    </>
  );
}
