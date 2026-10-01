import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import {
  PageHeader, StatCard, LoadingBlock, ErrorAlert, EmptyState, Modal, BackButton,
} from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};
const STATE_BADGE: Record<string, string> = {
  WAITING: 'badge-warning', IN_DRAFT: 'badge-info', PAID: 'badge-success', FINALIZED: 'badge-success',
  CANCELLED: 'badge-neutral', NOT_APPLIED: 'badge-warning',
};

// Pay owed for months already finalized, and the settlement of people who leave.
export default function Adjustments() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settlements' ? 'settlements' : 'arrears';

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <span>Arrears &amp; Settlements</span>
      </div>
      <div className="tabs">
        {[['arrears', 'Arrears'], ['settlements', 'Final settlements']].map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setParams(key === 'settlements' ? { tab: key } : {}, { replace: true })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'arrears' ? <ArrearsTab /> : <SettlementsTab />}
    </>
  );
}

// ---------------------------------------------------------------------------
function ArrearsTab() {
  const [data, setData] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [filter, setFilter] = useState('OPEN');
  const [form, setForm] = useState<any>(null);     // loss-of-pay reversal being entered
  const [months, setMonths] = useState<any>(null); // reversible months of the chosen employee
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [arrears, options] = await Promise.all([payrollAPI.getArrears(), payrollAPI.getReportOptions()]);
      setData(arrears.data);
      setEmployees(options.data.employees);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load arrears');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Months with loss of pay for the employee picked in the reversal form
  useEffect(() => {
    if (!form?.personId) { setMonths(null); return; }
    let live = true;
    payrollAPI.getLopMonths(form.personId)
      .then(res => { if (live) setMonths(res.data); })
      .catch(() => { if (live) setMonths(null); });
    return () => { live = false; };
  }, [form?.personId]);

  const handleReverse = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await payrollAPI.reverseLop({ entryId: form.entryId, days: form.days, reason: form.reason });
      setForm(null);
      setError('');
      setSuccess(`${formatINR(res.data.gross)} raised as an arrear. ${res.data.paidIn
        ? `It is on the ${monthLabel(res.data.paidIn)} draft payslip.` : 'It will be paid with the next payroll run.'}`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not reverse the loss of pay');
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (a: any) => {
    const reason = window.prompt(`Cancel the ${formatINR(a.gross)} arrear of ${a.person.name} for ${monthLabel(a.sourcePeriod)}? Give a reason.`);
    if (!reason) return;
    try {
      await payrollAPI.cancelArrear(a.id, reason);
      setSuccess('Arrear cancelled.');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not cancel the arrear');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading arrears…" />;

  const rows = data.arrears.filter((a: any) =>
    filter === 'ALL' || (filter === 'OPEN' ? ['WAITING', 'IN_DRAFT'].includes(a.state) : a.state === filter));
  const picked = months?.entries.find((m: any) => m.entryId === form?.entryId);

  return (
    <>
      <PageHeader
        title="Arrears"
        subtitle="Pay owed for months that are already finalized. It is paid with the next payroll run, with PF and ESI on it."
        actions={<button className="btn btn-primary" onClick={() => setForm({ personId: '', entryId: '', days: '', reason: '' })}>Reverse Loss of Pay</button>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {success && (
        <div className="alert alert-success">
          <span>✓</span><span style={{ flex: 1 }}>{success}</span>
          <button className="modal-close" onClick={() => setSuccess('')}>✕</button>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="To be paid" value={formatINR(data.totals.open.amount)} icon="₹" tone="warning"
          sub={`${data.totals.open.count} arrear${data.totals.open.count === 1 ? '' : 's'}, ${data.totals.waiting} waiting for a run`} />
        <StatCard label="Paid" value={data.totals.paid} icon="✓" tone="success" sub="Arrears paid through payroll" />
      </div>

      <div className="alert alert-warning">
        <span>ⓘ</span>
        <span>
          A salary revision dated back into finalized months raises arrears on its own. Loss of pay can be reversed
          up to {data.lopReversalMonths} months back. A back-dated cut in salary is not recovered automatically.
        </span>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Arrears</h3>
          <div className="segmented">
            {[['OPEN', 'To be paid'], ['PAID', 'Paid'], ['CANCELLED', 'Cancelled'], ['ALL', 'All']].map(([value, label]) => (
              <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon="▤" title="No arrears here" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Employee</th><th>For the month</th><th>Why</th><th className="num">Arrear</th><th className="num">PF + ESI</th><th className="num">Net</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{a.person.name}</span>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>{a.person.employeeNo}</div>
                    </td>
                    <td>{monthLabel(a.sourcePeriod)}</td>
                    <td>
                      {a.kind === 'LOP_REVERSAL'
                        ? `${a.lopDays} LOP day${a.lopDays === 1 ? '' : 's'} reversed`
                        : `Package ${formatINR(a.fromPackage)} → ${formatINR(a.toPackage)}`}
                      {a.reason && <div className="text-muted" style={{ fontSize: 11.5 }}>{a.reason}</div>}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(a.gross)}</td>
                    <td className="num text-muted">{a.pfEmployee + a.esiEmployee ? formatINR(a.pfEmployee + a.esiEmployee) : '—'}</td>
                    <td className="num">{formatINR(a.net)}</td>
                    <td>
                      <span className={`badge ${STATE_BADGE[a.state]}`}>{a.label}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {a.runId && <Link to={`/payroll/runs/${a.runId}`} className="btn btn-secondary btn-sm">Run</Link>}
                        {['WAITING', 'IN_DRAFT'].includes(a.state) && (
                          <button className="btn btn-danger btn-sm" onClick={() => handleCancel(a)}>Cancel</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title="Reverse Loss of Pay" open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={handleReverse}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Employee *</label>
              <select className="select" required value={form.personId}
                onChange={e => setForm({ ...form, personId: e.target.value, entryId: '', days: '' })}>
                <option value="">Pick an employee…</option>
                {employees.map(p => <option key={p.id} value={p.id}>{p.name}{p.employeeNo ? ` (${p.employeeNo})` : ''}</option>)}
              </select>
            </div>
            {form.personId && months && months.entries.length === 0 && (
              <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
                No finalized month from {monthLabel(months.from)} has loss of pay left to reverse.
              </p>
            )}
            {months?.entries.length > 0 && (
              <div className="form-grid" style={{ marginBottom: 14 }}>
                <div className="field">
                  <label>Month *</label>
                  <select className="select" required value={form.entryId}
                    onChange={e => setForm({ ...form, entryId: e.target.value, days: '' })}>
                    <option value="">Pick a month…</option>
                    {months.entries.map((m: any) => (
                      <option key={m.entryId} value={m.entryId}>{monthLabel(m.period)} — {m.left} LOP day{m.left === 1 ? '' : 's'}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Days to reverse *</label>
                  <input className="input" type="number" required min={0.5} max={picked?.left} step="0.5" value={form.days}
                    onChange={e => setForm({ ...form, days: e.target.value })} />
                  {picked && <span className="hint">Up to {picked.left}.</span>}
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Reason</label>
                  <input className="input" placeholder="e.g. Leave approved late" value={form.reason}
                    onChange={e => setForm({ ...form, reason: e.target.value })} />
                </div>
              </div>
            )}
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              The month's payslip is not changed. The pay for these days is added to the next payslip as Salary Arrears.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !form.entryId}>{saving ? 'Saving…' : 'Reverse'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
function SettlementsTab() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [personId, setPersonId] = useState('');

  useEffect(() => {
    Promise.all([payrollAPI.getSettlements(), payrollAPI.getReportOptions()])
      .then(([s, options]) => { setData(s.data); setEmployees(options.data.employees); })
      .catch(err => setError(err.response?.data?.error || 'Failed to load settlements'));
  }, []);

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading settlements…" />;

  return (
    <>
      <PageHeader
        title="Final Settlements"
        subtitle="Leave encashment, gratuity, notice pay and recoveries of people who leave, paid on their last payslip."
        actions={<>
          <select className="select" style={{ width: 'auto', maxWidth: 240 }} value={personId} onChange={e => setPersonId(e.target.value)}>
            <option value="">Pick an employee…</option>
            {employees.map(p => <option key={p.id} value={p.id}>{p.name}{p.employeeNo ? ` (${p.employeeNo})` : ''}</option>)}
          </select>
          <button className="btn btn-primary" disabled={!personId}
            onClick={() => navigate(`/payroll/settlements/new?personId=${personId}`)}>New Settlement</button>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {data.leavers.length > 0 && (
        <div className="card mb-24">
          <div className="card-header">
            <div>
              <h3>Leaving, not yet settled</h3>
              <span className="text-muted" style={{ fontSize: 12.5 }}>On notice, resigned or with a leaving date, and no settlement so far.</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Employee</th><th>Status</th><th>Leaving date</th><th /></tr></thead>
              <tbody>
                {data.leavers.map((p: any) => (
                  <tr key={p.id}>
                    <td><span style={{ fontWeight: 600 }}>{p.name}</span><div className="text-muted" style={{ fontSize: 11.5 }}>{p.employeeNo}</div></td>
                    <td>{String(p.employmentStatus || '').replace(/_/g, ' ').toLowerCase()}</td>
                    <td>{p.leavingDate ? formatDate(p.leavingDate) : <span className="text-muted">not set</span>}</td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/payroll/settlements/new?personId=${p.id}`} className="btn btn-secondary btn-sm">Settle</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header"><h3>Settlements</h3></div>
        {data.settlements.length === 0 ? (
          <EmptyState icon="▤" title="No settlements yet" message="Pick an employee above to prepare their final settlement." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Employee</th><th>Kind</th><th>Last working day</th><th>Paid with</th><th className="num">Settlement amounts</th><th className="num">Net on payslip</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {data.settlements.map((s: any) => (
                  <tr key={s.id}>
                    <td><span style={{ fontWeight: 600 }}>{s.person.name}</span><div className="text-muted" style={{ fontSize: 11.5 }}>{s.person.employeeNo}</div></td>
                    <td>{s.sequence === 1 ? 'Final settlement' : `Resettlement ${s.sequence - 1}`}</td>
                    <td>{formatDate(s.lastWorkingDate)}</td>
                    <td>{monthLabel(s.period)}</td>
                    <td className="num">{formatINR(s.leaveEncashment + s.gratuity + s.noticePay - s.noticeRecovery)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{s.netPayable == null ? '—' : formatINR(s.netPayable)}</td>
                    <td><span className={`badge ${STATE_BADGE[s.state]}`}>{s.label}</span></td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/payroll/settlements/${s.id}`} className="btn btn-secondary btn-sm">Open</Link>
                        <Link to={`/payroll/reports/settlement-statement?settlementId=${s.id}`} className="btn btn-secondary btn-sm">Statement</Link>
                      </div>
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
