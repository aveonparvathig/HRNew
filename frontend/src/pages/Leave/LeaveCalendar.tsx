import { useState, useEffect, useMemo } from 'react';
import { leaveAPI } from '../../api/leave';
import { PageHeader, LoadingBlock, ErrorAlert } from '../../components/ui';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const addMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

export default function LeaveCalendar() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    leaveAPI.getCalendar(month).then(r => setData(r.data)).catch(err => setError(err.response?.data?.error || 'Failed to load calendar'));
  }, [month]);

  const grid = useMemo(() => {
    if (!data) return null;
    const [y, m] = month.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=Sun
    const holBy: Record<string, any> = {};
    for (const h of data.holidays) holBy[h.date] = h;
    const leaveBy: Record<string, any[]> = {};
    for (const lv of data.leaves) {
      let t = new Date(lv.startDate + 'T00:00:00Z').getTime();
      const end = new Date(lv.endDate + 'T00:00:00Z').getTime();
      while (t <= end) {
        const d = new Date(t).toISOString().slice(0, 10);
        if (d.slice(0, 7) === month) {
          const half = (d === lv.startDate && lv.halfDayStart) || (d === lv.endDate && lv.halfDayEnd);
          (leaveBy[d] = leaveBy[d] || []).push({ name: lv.name, code: lv.code, paid: lv.paid, half });
        }
        t += 86400000;
      }
    }
    const cells: ({ date: string; day: number; holiday: any; leaves: any[] } | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= days; d++) {
      const date = `${month}-${pad(d)}`;
      cells.push({ date, day: d, holiday: holBy[date], leaves: leaveBy[date] || [] });
    }
    return cells;
  }, [data, month]);

  return (
    <>
      <PageHeader title="Leave calendar" subtitle="Who's on approved leave, with holidays marked."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setMonth(addMonth(month, -1))}>←</button>
            <strong style={{ minWidth: 150, textAlign: 'center' }}>{monthLabel(month)}</strong>
            <button className="btn btn-secondary btn-sm" onClick={() => setMonth(addMonth(month, 1))}>→</button>
          </div>
        } />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {!grid ? <LoadingBlock label="Loading calendar…" /> : (
        <div className="card card-pad">
          <div className="leave-cal-head">{DOW.map(d => <div key={d}>{d}</div>)}</div>
          <div className="leave-cal-grid">
            {grid.map((c, i) => (
              <div key={i} className={`leave-cal-cell${c ? '' : ' empty'}${c?.holiday ? ' holiday' : ''}`}>
                {c && (
                  <>
                    <div className="leave-cal-daynum">{c.day}{c.holiday && <span className="leave-cal-hol" title={c.holiday.name}>{c.holiday.type === 'RESTRICTED' ? 'RH' : 'Holiday'}</span>}</div>
                    {c.holiday && <div className="leave-cal-holname">{c.holiday.name}</div>}
                    {c.leaves.map((lv: any, j: number) => (
                      <div key={j} className={`leave-cal-chip${lv.paid ? '' : ' lop'}`} title={`${lv.name} — ${lv.code}${lv.half ? ' (half)' : ''}`}>
                        <span className="leave-cal-code">{lv.code}{lv.half ? '½' : ''}</span> {lv.name.split(' ')[0]}
                      </div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 12 }} className="text-muted">
            <span><span className="leave-cal-chip" style={{ display: 'inline-block' }}>CL</span> approved leave</span>
            <span><span className="leave-cal-chip lop" style={{ display: 'inline-block' }}>LOP</span> unpaid</span>
            <span><span className="leave-cal-hol" style={{ display: 'inline-block' }}>Holiday</span> holiday / RH</span>
          </div>
        </div>
      )}
    </>
  );
}
