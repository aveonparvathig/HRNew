import { useState, useEffect, useCallback, useMemo } from 'react';
import { attendanceAPI } from '../../api/attendance';
import { PageHeader, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { toast, confirmDialog } from '../../components/feedback';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');
const dowOf = (date: string) => new Date(date + 'T00:00:00Z').getUTCDay();
const addMonth = (ym: string, d: number) => { const [y, m] = ym.split('-').map(Number); const dt = new Date(Date.UTC(y, m - 1 + d, 1)); return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`; };
const monthLabel = (ym: string) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }); };

// Short code + CSS class per status
const CODE: Record<string, string> = { PRESENT: 'P', HALF_DAY: '½', ABSENT: 'A', WEEKOFF: 'WO', HOLIDAY: 'H', LEAVE: 'L', LOP: 'LP' };
const STATUSES = ['PRESENT', 'HALF_DAY', 'ABSENT', 'LEAVE', 'LOP', 'WEEKOFF', 'HOLIDAY'];

export default function Muster() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cell, setCell] = useState<any>(null);

  const load = useCallback(() => {
    setData(null);
    attendanceAPI.getMuster(month).then(r => setData(r.data)).catch(err => setError(err.response?.data?.error || 'Failed to load muster'));
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const days = useMemo(() => { const [y, m] = month.split('-').map(Number); const n = new Date(Date.UTC(y, m, 0)).getUTCDate(); return Array.from({ length: n }, (_, i) => i + 1); }, [month]);
  const finalised = data?.status === 'FINALISED';

  const act = async (fn: () => Promise<any>, msg: string | ((d: any) => string)) => {
    setBusy(true);
    try { const r = await fn(); toast.success(typeof msg === 'function' ? msg(r.data) : msg); load(); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Action failed'); }
    finally { setBusy(false); }
  };

  const doProcess = () => act(() => attendanceAPI.process(month), 'Attendance processed.');
  const doFinalise = async () => {
    if (!await confirmDialog({ title: `Finalise ${monthLabel(month)}?`, message: 'Locks the month and pushes present/LOP days into its draft payroll run.', confirmLabel: 'Finalise' })) return;
    act(() => attendanceAPI.finalise(month), (d: any) => d.hasDraftRun ? `Finalised — ${d.payrollEntriesUpdated} payslip(s) updated.` : 'Finalised (no draft payroll run for this month yet).');
  };
  const doReopen = () => act(() => attendanceAPI.reopen(month), 'Reopened.');

  const saveOverride = async (status: string) => {
    try { await attendanceAPI.override({ personId: cell.personId, date: cell.date, status }); setCell(null); load(); toast.success('Day updated.'); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Could not override'); }
  };

  return (
    <>
      <PageHeader title="Attendance muster" subtitle="Daily attendance from the roster, swipes, holidays and leave."
        actions={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setMonth(addMonth(month, -1))}>←</button>
            <strong style={{ minWidth: 130, textAlign: 'center' }}>{monthLabel(month)}</strong>
            <button className="btn btn-secondary btn-sm" onClick={() => setMonth(addMonth(month, 1))}>→</button>
            {data && <span className={`badge ${finalised ? 'badge-success' : 'badge-info'}`}>{finalised ? 'finalised' : 'open'}</span>}
            {!finalised && <button className="btn btn-secondary" disabled={busy} onClick={doProcess}>Process</button>}
            {!finalised ? <button className="btn btn-primary" disabled={busy} onClick={doFinalise}>Finalise</button>
              : <button className="btn btn-danger" disabled={busy} onClick={doReopen}>Reopen</button>}
          </div>
        } />
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {!data ? <LoadingBlock label="Loading muster…" /> : (
        <>
          {!data.processed && <div className="alert alert-info" style={{ marginBottom: 16 }}>Not processed yet — click <strong>Process</strong> to compute attendance for {monthLabel(month)}.</div>}
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="roster-table muster-table">
              <thead>
                <tr>
                  <th className="roster-emp">Employee</th>
                  {days.map(d => { const date = `${month}-${pad(d)}`; return <th key={d} className="roster-day"><div>{d}</div><div className="roster-dow">{DOW[dowOf(date)][0]}</div></th>; })}
                  <th className="muster-tot">P</th><th className="muster-tot">LOP</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.personId}>
                    <td className="roster-emp"><span style={{ fontWeight: 600 }}>{r.name}</span></td>
                    {days.map(d => {
                      const date = `${month}-${pad(d)}`;
                      const c = r.cells[date];
                      const st = c?.status;
                      return (
                        <td key={d} className={`muster-cell${st ? ' st-' + st : ''}${c?.source === 'OVERRIDE' ? ' ovr' : ''}`}
                          onClick={finalised ? undefined : () => setCell({ personId: r.personId, name: r.name, date, status: st })}
                          title={st ? `${st}${c.source === 'OVERRIDE' ? ' (override)' : ''}` : ''}>
                          {st ? CODE[st] : ''}
                        </td>
                      );
                    })}
                    <td className="muster-tot">{r.totals.presentDays || 0}</td>
                    <td className="muster-tot" style={{ fontWeight: 700, color: r.totals.attendanceLop ? 'var(--danger)' : undefined }}>{r.totals.attendanceLop || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginTop: 10, fontSize: 12 }} className="text-muted">
            <span><b className="muster-swatch st-PRESENT">P</b> present</span>
            <span><b className="muster-swatch st-HALF_DAY">½</b> half day</span>
            <span><b className="muster-swatch st-ABSENT">A</b> absent (LOP)</span>
            <span><b className="muster-swatch st-LEAVE">L</b> leave</span>
            <span><b className="muster-swatch st-LOP">LP</b> unpaid leave</span>
            <span><b className="muster-swatch st-WEEKOFF">WO</b> week-off</span>
            <span><b className="muster-swatch st-HOLIDAY">H</b> holiday</span>
            <span>“P” column = paid days · “LOP” = unauthorised-absence days fed to payroll. {finalised ? 'Finalised — reopen to edit.' : 'Click a cell to override.'}</span>
          </div>
        </>
      )}

      <Modal title={cell ? `${cell.name} — ${cell.date}` : ''} open={!!cell} onClose={() => setCell(null)}>
        {cell && (
          <>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>Set this day's status (a manual override is kept when you re-process).</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {STATUSES.map(s => (
                <button key={s} className={`btn btn-sm ${cell.status === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => saveOverride(s)}>{CODE[s]} {s.replace('_', ' ').toLowerCase()}</button>
              ))}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
