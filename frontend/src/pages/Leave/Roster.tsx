import { useState, useEffect, useCallback, useMemo } from 'react';
import { attendanceAPI } from '../../api/attendance';
import { PageHeader, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { toast, confirmDialog } from '../../components/feedback';
import { type WeekOffRule, isWeekOff, offSummary, ORDINAL, WEEK_NUMBERS, WEEK_PRESETS } from '../../utils/weekOff';

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
      await attendanceAPI.setProfile({ personId: profile.personId, defaultShiftId: profile.defaultShiftId || null, weekOffDays: profile.weekOffDays, weekOffRules: profile.weekOffRules || [] });
      setProfile(null); load();
      toast.success('Profile saved.');
    } catch (err: any) { toast.error(err.response?.data?.error || 'Could not save'); }
  };

  // Week-off editing for the per-employee profile modal (mirrors Leave Settings).
  const pRules = (): WeekOffRule[] => profile?.weekOffRules || [];
  const pMode = (i: number): 'none' | 'every' | 'weeks' =>
    profile.weekOffDays.includes(i) ? 'every' : pRules().some(r => r.day === i) ? 'weeks' : 'none';
  const setPOff = (days: number[], newRules: WeekOffRule[]) =>
    setProfile((p: any) => ({ ...p, weekOffDays: [...new Set(days)].sort((a: number, b: number) => a - b), weekOffRules: [...newRules].sort((a, b) => a.day - b.day) }));
  const enablePDay = (i: number, on: boolean) =>
    on ? setPOff([...profile.weekOffDays, i], pRules().filter(r => r.day !== i))
       : setPOff(profile.weekOffDays.filter((d: number) => d !== i), pRules().filter(r => r.day !== i));
  const setPMode = (i: number, mode: 'every' | 'weeks') => {
    if (mode === 'every') setPOff([...profile.weekOffDays, i], pRules().filter(r => r.day !== i));
    else {
      const weeks = pRules().find(r => r.day === i)?.weeks.length ? pRules().find(r => r.day === i)!.weeks : [2, 4];
      setPOff(profile.weekOffDays.filter((d: number) => d !== i), [...pRules().filter(r => r.day !== i), { day: i, weeks }]);
    }
  };
  const togglePWeek = (i: number, w: number) => {
    const cur = pRules().find(r => r.day === i)?.weeks || [];
    const weeks = cur.includes(w) ? cur.filter(x => x !== w) : [...cur, w].sort((a, b) => a - b);
    setPOff(profile.weekOffDays, [...pRules().filter(r => r.day !== i), { day: i, weeks }]);
  };
  const applyPPreset = (i: number, weeks: number[]) =>
    setPOff(profile.weekOffDays.filter((d: number) => d !== i), [...pRules().filter(r => r.day !== i), { day: i, weeks }]);

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
                      <button className="roster-empname" onClick={() => setProfile({ personId: r.personId, name: r.name, defaultShiftId: r.defaultShiftId || '', weekOffDays: [...r.weekOffDays], weekOffRules: [...(r.weekOffRules || [])] })} title="Edit default shift & week-off">
                        {r.name}
                        <span className="roster-empsub">{r.defaultShiftCode || 'no default'} · off {offSummary(r.weekOffDays, r.weekOffRules, DOW)}</span>
                      </button>
                    </td>
                    {days.map(d => {
                      const date = `${month}-${pad(d)}`;
                      const ov = r.overrides[date];
                      const wo = isWeekOff(date, r.weekOffDays, r.weekOffRules);
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
              {DOW.map((d, i) => {
                const mode = pMode(i);
                const rule = pRules().find(r => r.day === i);
                return (
                  <div key={i} style={{ paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, minWidth: 64 }}>
                        <input type="checkbox" checked={mode !== 'none'} onChange={e => enablePDay(i, e.target.checked)} /> {d}
                      </label>
                      {mode !== 'none' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button type="button" className={`btn btn-sm ${mode === 'every' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPMode(i, 'every')}>Every week</button>
                          <button type="button" className={`btn btn-sm ${mode === 'weeks' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setPMode(i, 'weeks')}>Specific weeks</button>
                        </div>
                      )}
                    </div>
                    {mode === 'weeks' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6, marginLeft: 22 }}>
                        {WEEK_NUMBERS.map(w => (
                          <button type="button" key={w} style={{ minWidth: 40, padding: '2px 6px' }}
                            className={`btn btn-sm ${rule?.weeks.includes(w) ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => togglePWeek(i, w)}>{ORDINAL[w - 1]}</button>
                        ))}
                        <span className="text-muted" style={{ margin: '0 2px' }}>·</span>
                        {WEEK_PRESETS.map(p => (
                          <button type="button" key={p.label} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }} onClick={() => applyPPreset(i, p.weeks)}>{p.label}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
