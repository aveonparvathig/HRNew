import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, EmptyState, LoadingBlock, ErrorAlert, SuccessAlert, BackButton } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';
import { formatINR } from '../../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const dateTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

// Mail a month's payslips to the employees, one at a time so progress
// shows and one refusal does not stop the rest.
export default function PayslipEmail() {
  const { runId } = useParams<{ runId: string }>();
  const [data, setData] = useState<any>(null);
  const [target, setTarget] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = useCallback(async (to?: string) => {
    try {
      const res = await payrollAPI.getPayslipDelivery(runId!, to);
      setData(res.data);
      setTarget(res.data.target);
      setError('');
      return res.data;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the payslips');
      return null;
    }
  }, [runId]);

  // First load: everyone who can be mailed and has not been yet is ticked
  useEffect(() => {
    fetchData().then(d => {
      if (d) setPicked(new Set(d.entries.filter((e: any) => !e.blocked && e.last?.status !== 'SENT').map((e: any) => e.id)));
    });
  }, [fetchData]);

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading…" />;

  const { run, mail, entries } = data;
  const sendable = entries.filter((e: any) => !e.blocked);
  const ready = run.status === 'FINALIZED' && Boolean(run.releasedAt) && mail.enabled && !mail.problem && data.engine.pdf;
  const sending = Boolean(progress);
  const chosen = sendable.filter((e: any) => picked.has(e.id));

  const toggle = (id: string) => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const changeTarget = async (to: string) => {
    setTarget(to);
    await fetchData(to);
  };

  const send = async () => {
    const again = chosen.filter((e: any) => e.last?.status === 'SENT').length;
    const ok = await confirmDialog({
      title: `Email ${chosen.length} ${chosen.length === 1 ? 'payslip' : 'payslips'} for ${monthLabel(run.period)}?`,
      message: `Each employee gets their own payslip as a PDF${data.passwordMode !== 'NONE' ? ', protected with a password' : ''}.`
        + (again ? ` ${again} of them ${again === 1 ? 'has' : 'have'} already been sent one and will get it again.` : ''),
      confirmLabel: 'Send',
    });
    if (!ok) return;
    setSuccess('');
    setError('');
    let failed = 0;
    setProgress({ done: 0, total: chosen.length, failed: 0 });
    for (let i = 0; i < chosen.length; i++) {
      try {
        const res = await payrollAPI.emailPayslip(chosen[i].id, target);
        if (!res.data.ok) failed++;
      } catch {
        failed++;
      }
      setProgress({ done: i + 1, total: chosen.length, failed });
    }
    setProgress(null);
    const fresh = await fetchData(target);
    // What failed stays ticked, ready to try again
    if (fresh) setPicked(new Set(fresh.entries.filter((e: any) => !e.blocked && e.last?.status === 'FAILED').map((e: any) => e.id)));
    const sent = chosen.length - failed;
    if (failed) setError(`${failed} of ${chosen.length} could not be sent. The reason is shown against each; they are ticked to try again.`);
    if (sent) setSuccess(`${sent} ${sent === 1 ? 'payslip' : 'payslips'} sent.`);
  };

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <Link to={`/payroll/runs/${run.id}`}>{monthLabel(run.period)}</Link>
        <span>/</span>
        <span>Email payslips</span>
      </div>

      <PageHeader
        title={`Email Payslips — ${monthLabel(run.period)}`}
        subtitle={`${entries.filter((e: any) => e.last?.status === 'SENT').length} of ${entries.length} sent so far${mail.from ? ` · from ${mail.from}` : ''}`}
        actions={
          <button className="btn btn-primary" disabled={!ready || sending || chosen.length === 0} onClick={send}>
            {sending ? `Sending ${progress!.done} of ${progress!.total}…` : `✉ Send to ${chosen.length}`}
          </button>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      {run.status !== 'FINALIZED' ? (
        <div className="alert alert-warning"><span>◷</span><span>This run is still a draft. Finalize it before emailing its payslips.</span></div>
      ) : !run.releasedAt ? (
        <div className="alert alert-warning">
          <span>◷</span>
          <span>The payslips are not released to employees yet. Release them on the <Link to={`/payroll/runs/${run.id}`}>run page</Link>, then email them.</span>
        </div>
      ) : null}
      {(!mail.enabled || mail.problem) && (
        <div className="alert alert-warning">
          <span>✉</span>
          <span>
            {mail.problem || 'Email is switched off'}. Set it up in <Link to="/organization?tab=email">Company Settings → Email</Link>.
          </span>
        </div>
      )}
      {!data.engine.pdf && (
        <div className="alert alert-warning"><span>⚠</span><span>PDF files cannot be made on this server, so payslips cannot be emailed.</span></div>
      )}

      {sending && (
        <div className="card card-pad mb-16">
          <div className="progress-track"><div className="progress-fill" style={{ width: `${(progress!.done / progress!.total) * 100}%` }} /></div>
          <p className="text-muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            Sending {progress!.done} of {progress!.total}{progress!.failed ? ` · ${progress!.failed} failed` : ''}. Keep this page open until it finishes.
          </p>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Employees</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              Payslip password: {data.passwordLabel}. An employee with no address at the one chosen is sent to their other address.
            </span>
          </div>
          <div className="segmented">
            {data.emailTargets.map((t: any) => (
              <button key={t.value} className={target === t.value ? 'active' : ''} disabled={sending} onClick={() => changeTarget(t.value)}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        {entries.length === 0 ? <EmptyState icon="▦" title="No payslips in this run" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" aria-label="Select all" disabled={sending}
                      checked={sendable.length > 0 && chosen.length === sendable.length}
                      onChange={e => setPicked(e.target.checked ? new Set(sendable.map((x: any) => x.id)) : new Set())} />
                  </th>
                  <th>Employee</th><th>Sent to</th><th className="num">Net pay</th><th>Last sent</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e: any) => (
                  <tr key={e.id}>
                    <td>
                      <input type="checkbox" aria-label={`Send to ${e.person.name}`} disabled={Boolean(e.blocked) || sending}
                        checked={picked.has(e.id) && !e.blocked} onChange={() => toggle(e.id)} />
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{e.person.name}</span>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>{e.person.employeeNo}</div>
                    </td>
                    <td>
                      {e.blocked ? (
                        <span className="text-warning" style={{ fontSize: 12.5 }}>
                          {e.blocked}. <Link to={`/people/${e.person.id}`}>Open profile</Link>
                        </span>
                      ) : (
                        <>
                          {e.address}
                          {e.fallback && <div className="text-muted" style={{ fontSize: 11.5 }}>their other address</div>}
                        </>
                      )}
                    </td>
                    <td className="num">{formatINR(e.netPayable)}</td>
                    <td>
                      {!e.last ? <span className="text-muted">—</span> : e.last.status === 'SENT' ? (
                        <>
                          <span className="badge badge-success">Sent</span>
                          <div className="text-muted" style={{ fontSize: 11.5 }}>{dateTime(e.last.at)} · {e.last.to}</div>
                        </>
                      ) : (
                        <>
                          <span className="badge badge-danger">Failed</span>
                          <div style={{ fontSize: 11.5, color: 'var(--danger)' }}>{e.last.error}</div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
