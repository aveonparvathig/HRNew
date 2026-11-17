import { useState, useEffect, useCallback } from 'react';
import { Icon } from '../../components/Layout/nav';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import {
  PageHeader, StatCard, LoadingBlock, ErrorAlert, EmptyState, Modal, BackButton, SuccessAlert,
} from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Tabs } from '../../components/Tabs';
import { formatINR, formatDate } from '../../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};
const STATE_BADGE: Record<string, string> = {
  WAITING: 'badge-warning', IN_DRAFT: 'badge-info', PAID: 'badge-success', FINALIZED: 'badge-success',
  CANCELLED: 'badge-neutral', NOT_APPLIED: 'badge-warning',
};

// Rupees with a leading minus for money taken back
const signedINR = (n: number) => (n < 0 ? `−${formatINR(-n)}` : formatINR(n));

// Pay owed for months already finalized, and the settlement of people who leave.
export default function Adjustments() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'settlements' ? 'settlements' : 'arrears';

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <span>Arrears &amp; settlements</span>
      </div>
      <Tabs label="Adjustments" value={tab}
        items={[{ key: 'arrears', label: 'Arrears' }, { key: 'settlements', label: 'Final settlements' }]}
        onChange={key => setParams(key === 'settlements' ? { tab: key } : {}, { replace: true })} />
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
      const adding = form.mode === 'ADD';
      const body = { entryId: form.entryId, days: form.days, reason: form.reason };
      const res = adding ? await payrollAPI.addRetroLop(body) : await payrollAPI.reverseLop(body);
      setForm(null);
      setError('');
      const where = res.data.paidIn ? `It is on the ${monthLabel(res.data.paidIn)} draft payslip.` : '';
      setSuccess(adding
        ? `${formatINR(-res.data.gross)} of pay will be taken back. ${where || 'It will be recovered with the next payroll run.'}`
        : `${formatINR(res.data.gross)} raised as an arrear. ${where || 'It will be paid with the next payroll run.'}`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not change the loss of pay');
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async (a: any) => {
    const reason = window.prompt(`Cancel the ${formatINR(Math.abs(a.gross))} ${a.recovery ? 'recovery' : 'arrear'} of ${a.person.name} for ${monthLabel(a.sourcePeriod)}? Give a reason.`);
    if (!reason) return;
    try {
      await payrollAPI.cancelArrear(a.id, reason);
      setSuccess(a.recovery ? 'Recovery cancelled.' : 'Arrear cancelled.');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not cancel the arrear');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading arrears…" />;

  const rows = data.arrears.filter((a: any) =>
    filter === 'ALL' || (filter === 'OPEN' ? ['WAITING', 'IN_DRAFT'].includes(a.state) : a.state === filter));
  // The form reverses loss of pay (months that have some) or adds it (months with paid days)
  const adding = form?.mode === 'ADD';
  const monthOptions: any[] = months ? (adding ? months.paidMonths : months.entries) : [];
  const picked = monthOptions.find((m: any) => m.entryId === form?.entryId);
  const limit = adding ? picked?.canAdd : picked?.left;

  return (
    <>
      <PageHeader
        title="Arrears"
        subtitle="Corrections to months that are already finalized. They are paid, or taken back, with the next payroll run, with PF and ESI on them."
        actions={<>
          <Button onClick={() => setForm({ mode: 'ADD', personId: '', entryId: '', days: '', reason: '' })}>Add loss of pay</Button>
          <Button variant="accent" onClick={() => setForm({ mode: 'REVERSE', personId: '', entryId: '', days: '', reason: '' })}>Reverse loss of pay</Button>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <div className="stat-grid">
        <StatCard label="To be paid" value={formatINR(data.totals.open.amount)} icon="banknote" tone="warning"
          sub={`${data.totals.open.count} arrear${data.totals.open.count === 1 ? '' : 's'}, ${data.totals.waiting} waiting for a run`} />
        <StatCard label="To be recovered" value={formatINR(data.totals.recovering.amount)} icon="history" tone="danger"
          sub={data.totals.recovering.count ? `${data.totals.recovering.count} recover${data.totals.recovering.count === 1 ? 'y' : 'ies'} of pay already given` : 'Nothing to take back'} />
        <StatCard label="Settled" value={data.totals.paid} icon="checkCircle" tone="success" sub="Paid or recovered through payroll" />
      </div>

      <div className="alert alert-warning">
        <Icon name="info" size={16} className="ps-alert-icon" />
        <span>
          A salary revision dated back into finalized months raises arrears on its own. Loss of pay can be reversed,
          or added, up to {data.lopReversalMonths} months back. A back-dated cut in salary is recovered only when you
          say so, at the time the revision is saved.
        </span>
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Arrears</h3>
          <div className="segmented">
            {[['OPEN', 'Open'], ['PAID', 'Settled'], ['CANCELLED', 'Cancelled'], ['ALL', 'All']].map(([value, label]) => (
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
                <tr><th>Employee</th><th>For the month</th><th>Why</th><th className="num">Pay</th><th className="num">PF + ESI</th><th className="num">Net</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {rows.map((a: any) => (
                  <tr key={a.id}>
                    <td>
                      <span className="ps-strong">{a.person.name}</span>
                      <div className="ps-sub num">{a.person.employeeNo}</div>
                    </td>
                    <td>{monthLabel(a.sourcePeriod)}</td>
                    <td>
                      {a.kind === 'LOP_REVERSAL' ? `${a.lopDays} LOP day${a.lopDays === 1 ? '' : 's'} reversed`
                        : a.kind === 'LOP_RECOVERY' ? `${a.lopDays} LOP day${a.lopDays === 1 ? '' : 's'} added`
                        : `Package ${formatINR(a.fromPackage)} → ${formatINR(a.toPackage)}`}
                      {a.recovery && <span className="badge badge-danger ps-ml-6">Recovery</span>}
                      {a.reason && <div className="ps-sub">{a.reason}</div>}
                    </td>
                    <td className={`num ps-strong${a.recovery ? ' num-neg' : ''}`}>{signedINR(a.gross)}</td>
                    <td className="num text-muted">{a.pfEmployee + a.esiEmployee ? signedINR(a.pfEmployee + a.esiEmployee) : '—'}</td>
                    <td className={`num${a.recovery ? ' num-neg' : ''}`}>{signedINR(a.net)}</td>
                    <td>
                      <span className={`badge ${STATE_BADGE[a.state]}`}>{a.recovery ? a.label.replace('Paid with', 'Recovered with') : a.label}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {a.runId && <ButtonLink to={`/payroll/runs/${a.runId}`} size="sm">Run</ButtonLink>}
                        {['WAITING', 'IN_DRAFT'].includes(a.state) && (
                          <Button variant="danger" size="sm" onClick={() => handleCancel(a)}>Cancel</Button>
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

      <Modal title={adding ? 'Add loss of pay to a past month' : 'Reverse loss of pay'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={handleReverse}>
            <div className="field mb-14">
              <label htmlFor="ps-lop-person">Employee *</label>
              <select id="ps-lop-person" className="select" required value={form.personId}
                onChange={e => setForm({ ...form, personId: e.target.value, entryId: '', days: '' })}>
                <option value="">Pick an employee…</option>
                {employees.map(p => <option key={p.id} value={p.id}>{p.name}{p.employeeNo ? ` (${p.employeeNo})` : ''}</option>)}
              </select>
            </div>
            {form.personId && months && monthOptions.length === 0 && (
              <p className="ps-muted mb-14">
                {adding
                  ? `No finalized month from ${monthLabel(months.from)} has paid days to mark as loss of pay.`
                  : `No finalized month from ${monthLabel(months.from)} has loss of pay left to reverse.`}
              </p>
            )}
            {monthOptions.length > 0 && (
              <div className="form-grid mb-14">
                <div className="field">
                  <label htmlFor="ps-lop-month">Month *</label>
                  <select id="ps-lop-month" className="select" required value={form.entryId}
                    onChange={e => setForm({ ...form, entryId: e.target.value, days: '' })}>
                    <option value="">Pick a month…</option>
                    {monthOptions.map((m: any) => (
                      <option key={m.entryId} value={m.entryId}>{monthLabel(m.period)} — {m.left} LOP day{m.left === 1 ? '' : 's'} now</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ps-lop-days">{adding ? 'Days of loss of pay to add *' : 'Days to reverse *'}</label>
                  <input id="ps-lop-days" className="input" type="number" required min={0.5} max={limit} step="0.5" value={form.days}
                    onChange={e => setForm({ ...form, days: e.target.value })} />
                  {picked && <span className="hint">Up to {limit}.</span>}
                </div>
                <div className="field ps-span-all">
                  <label htmlFor="ps-lop-reason">Reason{adding ? ' *' : ''}</label>
                  <input id="ps-lop-reason" className="input" required={adding} placeholder={adding ? 'e.g. Absence reported after payroll closed' : 'e.g. Leave approved late'} value={form.reason}
                    onChange={e => setForm({ ...form, reason: e.target.value })} />
                </div>
              </div>
            )}
            <p className="text-sm-muted mb-14">
              {adding
                ? 'The month\'s payslip is not changed. The pay for these days is taken back on the next payslip as Salary Recovery, and the PF and ESI deducted on that pay are returned.'
                : 'The month\'s payslip is not changed. The pay for these days is added to the next payslip as Salary Arrears.'}
            </p>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" variant={adding ? 'danger' : 'accent'} loading={saving} disabled={!form.entryId}>
                {saving ? 'Saving…' : adding ? 'Add and recover' : 'Reverse'}
              </Button>
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
        title="Final settlements"
        subtitle="Leave encashment, gratuity, notice pay and recoveries of people who leave, paid on their last payslip."
        actions={<>
          <select className="select ps-select-auto" aria-label="Employee to settle" value={personId} onChange={e => setPersonId(e.target.value)}>
            <option value="">Pick an employee…</option>
            {employees.map(p => <option key={p.id} value={p.id}>{p.name}{p.employeeNo ? ` (${p.employeeNo})` : ''}</option>)}
          </select>
          <Button variant="accent" icon="plus" disabled={!personId}
            onClick={() => navigate(`/payroll/settlements/new?personId=${personId}`)}>New settlement</Button>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {data.leavers.length > 0 && (
        <div className="card mb-24">
          <div className="card-header">
            <div>
              <h3>Leaving, not yet settled</h3>
              <span className="text-sm-muted">On notice, resigned or with a leaving date, and no settlement so far.</span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Employee</th><th>Status</th><th>Leaving date</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {data.leavers.map((p: any) => (
                  <tr key={p.id}>
                    <td><span className="ps-strong">{p.name}</span><div className="ps-sub num">{p.employeeNo}</div></td>
                    <td>{String(p.employmentStatus || '').replace(/_/g, ' ').toLowerCase()}</td>
                    <td>{p.leavingDate ? formatDate(p.leavingDate) : <span className="text-muted">not set</span>}</td>
                    <td>
                      <div className="row-actions">
                        <ButtonLink to={`/payroll/settlements/new?personId=${p.id}`} size="sm">Settle</ButtonLink>
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
                <tr><th>Employee</th><th>Kind</th><th>Last working day</th><th>Paid with</th><th className="num">Settlement amounts</th><th className="num">Net on payslip</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {data.settlements.map((s: any) => (
                  <tr key={s.id}>
                    <td><span className="ps-strong">{s.person.name}</span><div className="ps-sub num">{s.person.employeeNo}</div></td>
                    <td>
                      {s.sequence === 1 ? 'Final settlement' : `Resettlement ${s.sequence - 1}`}
                      {s.settlementNo && <div className="ps-sub num">No. {s.settlementNo}</div>}
                    </td>
                    <td>{formatDate(s.lastWorkingDate)}</td>
                    <td>{monthLabel(s.period)}</td>
                    <td className="num">{formatINR(s.leaveEncashment + s.gratuity + s.noticePay - s.noticeRecovery)}</td>
                    <td className="num ps-strong">{s.netPayable == null ? '—' : formatINR(s.netPayable)}</td>
                    <td><span className={`badge ${STATE_BADGE[s.state]}`}>{s.label}</span></td>
                    <td>
                      <div className="row-actions">
                        <ButtonLink to={`/payroll/settlements/${s.id}`} size="sm">Open</ButtonLink>
                        <ButtonLink to={`/payroll/reports/settlement-statement?settlementId=${s.id}`} size="sm">Statement</ButtonLink>
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
