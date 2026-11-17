import { useState, useEffect, useCallback, useMemo } from 'react';
import { attendanceAPI } from '../../api/attendance';
import { PageHeader, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
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

  const doProcess = () => act(() => attendanceAPI.process(month), 'Attendance processed');
  const doFinalise = async () => {
    if (!await confirmDialog({ title: `Finalise ${monthLabel(month)}?`, message: 'Locks the month and pushes present/LOP days into its draft payroll run.', confirmLabel: 'Finalise' })) return;
    act(() => attendanceAPI.finalise(month), (d: any) => d.hasDraftRun ? `Finalised — ${d.payrollEntriesUpdated} payslip(s) updated` : 'Finalised (no draft payroll run for this month yet)');
  };
  const doReopen = () => act(() => attendanceAPI.reopen(month), 'Reopened');

  const saveOverride = async (status: string) => {
    try { await attendanceAPI.override({ personId: cell.personId, date: cell.date, status }); setCell(null); load(); toast.success('Day updated'); }
    catch (err: any) { toast.error(err.response?.data?.error || 'Could not override'); }
  };

  return (
    <>
      <PageHeader title="Attendance muster" subtitle="Daily attendance from the roster, swipes, holidays and leave."
        actions={
          <div className="cluster la-month-nav">
            <Button size="sm" aria-label="Previous month" onClick={() => setMonth(addMonth(month, -1))}>
              <Icon name="chevron" size={16} className="btn-icon la-flip" />
            </Button>
            <strong className="la-month-label">{monthLabel(month)}</strong>
            <Button size="sm" aria-label="Next month" onClick={() => setMonth(addMonth(month, 1))}>
              <Icon name="chevron" size={16} className="btn-icon" />
            </Button>
            {data && <span className={`badge ${finalised ? 'badge-success' : 'badge-info'}`}>{finalised ? 'finalised' : 'open'}</span>}
            {!finalised && <Button disabled={busy} onClick={doProcess}>Process</Button>}
            {!finalised ? <Button variant="accent" icon="checkCircle" disabled={busy} onClick={doFinalise}>Finalise</Button>
              : <Button variant="danger" disabled={busy} onClick={doReopen}>Reopen</Button>}
          </div>
        } />
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {!data ? <LoadingBlock label="Loading muster…" /> : (
        <>
          {!data.processed && (
            <div className="alert alert-info mb-16">
              <Icon name="info" size={16} className="la-alert-icon" />
              <span>Not processed yet — click <strong>Process</strong> to compute attendance for {monthLabel(month)}.</span>
            </div>
          )}
          <div className="card la-grid-scroll">
            <table className="roster-table muster-table la-grid">
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
                    <td className="roster-emp"><span className="la-strong">{r.name}</span></td>
                    {days.map(d => {
                      const date = `${month}-${pad(d)}`;
                      const c = r.cells[date];
                      const st = c?.status;
                      return (
                        <td key={d} className={`muster-cell${st ? ' st-' + st : ''}${c?.source === 'OVERRIDE' ? ' ovr' : ''}${finalised ? ' la-locked' : ''}`}
                          onClick={finalised ? undefined : () => setCell({ personId: r.personId, name: r.name, date, status: st })}
                          title={st ? `${st}${c.source === 'OVERRIDE' ? ' (override)' : ''}` : ''}>
                          {st ? CODE[st] : ''}
                        </td>
                      );
                    })}
                    <td className="muster-tot">{r.totals.presentDays || 0}</td>
                    <td className={`muster-tot la-tot-lop${r.totals.attendanceLop ? ' num-neg' : ''}`}>{r.totals.attendanceLop || 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cluster la-legend">
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
            <p className="modal-lede">Set this day's status (a manual override is kept when you re-process).</p>
            <div className="cluster">
              {STATUSES.map(s => (
                <Button key={s} size="sm" variant={cell.status === s ? 'primary' : 'secondary'} aria-pressed={cell.status === s} onClick={() => saveOverride(s)}>
                  <span className="la-code">{CODE[s]}</span> {s.replace('_', ' ').toLowerCase()}
                </Button>
              ))}
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
