import { useState, useEffect, useCallback, useMemo } from 'react';
import { attendanceAPI } from '../../api/attendance';
import { PageHeader, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
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

  const toggle = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
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
      toast.success('Profile saved');
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
          <div className="cluster la-month-nav">
            <Button size="sm" aria-label="Previous month" onClick={() => setMonth(addMonth(month, -1))}>
              <Icon name="chevron" size={16} className="btn-icon la-flip" />
            </Button>
            <strong className="la-month-label">{monthLabel(month)}</strong>
            <Button size="sm" aria-label="Next month" onClick={() => setMonth(addMonth(month, 1))}>
              <Icon name="chevron" size={16} className="btn-icon" />
            </Button>
          </div>
        } />
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {data && (
        <>
          <form className="card card-pad mb-16" onSubmit={doAssign}>
            <div className="cluster la-assign">
              <div className="field la-field-flush">
                <label htmlFor="la-roster-shift">Assign shift to selected (<span className="num">{sel.size}</span>)</label>
                <select id="la-roster-shift" className="select la-select-shift" required value={assign.shiftId} onChange={e => setAssign({ ...assign, shiftId: e.target.value })}>
                  <option value="">Shift…</option>
                  {data.shifts.filter((s: any) => s.active).map((s: any) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                </select>
              </div>
              <div className="field la-field-flush">
                <label htmlFor="la-roster-from">From</label>
                <input id="la-roster-from" className="input" type="date" required value={assign.startDate} onChange={e => setAssign({ ...assign, startDate: e.target.value, endDate: assign.endDate || e.target.value })} />
              </div>
              <div className="field la-field-flush">
                <label htmlFor="la-roster-to">To</label>
                <input id="la-roster-to" className="input" type="date" required min={assign.startDate} value={assign.endDate} onChange={e => setAssign({ ...assign, endDate: e.target.value })} />
              </div>
              <Button type="submit" variant="accent">Assign</Button>
            </div>
          </form>

          <div className="card la-grid-scroll">
            <table className="roster-table la-grid">
              <thead>
                <tr>
                  <th className="roster-emp">
                    <label className="la-check-label">
                      <input type="checkbox" aria-label="Select all employees" checked={!!allSelected} onChange={e => setSel(e.target.checked ? new Set(data.rows.map((r: any) => r.personId)) : new Set())} /> Employee
                    </label>
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
                      <div className="la-emp-cell">
                        <input type="checkbox" aria-label={`Select ${r.name}`} checked={sel.has(r.personId)} onChange={() => toggle(r.personId)} />
                        <button className="roster-empname" onClick={() => setProfile({ personId: r.personId, name: r.name, defaultShiftId: r.defaultShiftId || '', weekOffDays: [...r.weekOffDays], weekOffRules: [...(r.weekOffRules || [])] })} title="Edit default shift & week-off">
                          {r.name}
                          <span className="roster-empsub">{r.defaultShiftCode || 'no default'} · off {offSummary(r.weekOffDays, r.weekOffRules, DOW)}</span>
                        </button>
                      </div>
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
          <p className="text-sm-muted la-grid-note">Tick employees, pick a shift and dates, then assign. Bold cells are overrides — click one to clear it. “·” is a week-off.</p>
        </>
      )}

      {profile && (
        <Modal title={`${profile.name} — shift & week-off`} open={!!profile} onClose={() => setProfile(null)}>
          <div className="field mb-16">
            <label htmlFor="la-profile-shift">Default shift</label>
            <select id="la-profile-shift" className="select" value={profile.defaultShiftId} onChange={e => setProfile({ ...profile, defaultShiftId: e.target.value })}>
              <option value="">None</option>
              {data.shifts.filter((s: any) => s.active).map((s: any) => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
            </select>
          </div>
          <div className="field la-weekoff-field">
            <label>Week-off days (overrides the org default)</label>
            <div className="stack la-weekoff-list">
              {DOW.map((d, i) => {
                const mode = pMode(i);
                const rule = pRules().find(r => r.day === i);
                return (
                  <div key={i} className="la-weekoff-row">
                    <div className="cluster la-weekoff-head">
                      <label className="la-check-label la-weekoff-day">
                        <input type="checkbox" checked={mode !== 'none'} onChange={e => enablePDay(i, e.target.checked)} /> {d}
                      </label>
                      {mode !== 'none' && (
                        <div className="cluster la-gap-6">
                          <Button size="sm" variant={mode === 'every' ? 'primary' : 'secondary'} aria-pressed={mode === 'every'} onClick={() => setPMode(i, 'every')}>Every week</Button>
                          <Button size="sm" variant={mode === 'weeks' ? 'primary' : 'secondary'} aria-pressed={mode === 'weeks'} onClick={() => setPMode(i, 'weeks')}>Specific weeks</Button>
                        </div>
                      )}
                    </div>
                    {mode === 'weeks' && (
                      <div className="cluster la-gap-6 la-weekoff-weeks">
                        {WEEK_NUMBERS.map(w => (
                          <Button key={w} size="sm" className="la-week-btn"
                            variant={rule?.weeks.includes(w) ? 'primary' : 'secondary'}
                            aria-pressed={!!rule?.weeks.includes(w)}
                            onClick={() => togglePWeek(i, w)}>{ORDINAL[w - 1]}</Button>
                        ))}
                        <span className="text-muted la-sep" aria-hidden="true">·</span>
                        {WEEK_PRESETS.map(p => (
                          <Button key={p.label} size="sm" variant="ghost" className="la-preset-btn" onClick={() => applyPPreset(i, p.weeks)}>{p.label}</Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setProfile(null)}>Cancel</Button>
            <Button variant="accent" onClick={saveProfile}>Save</Button>
          </div>
        </Modal>
      )}
    </>
  );
}
