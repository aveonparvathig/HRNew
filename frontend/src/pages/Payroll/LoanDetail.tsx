import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal, StatusBadge, BackButton,
} from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};
const today = () => new Date().toISOString().slice(0, 10);

type Action = 'skip' | 'prepay' | 'foreclose' | 'revise';
const ACTION_TITLES: Record<Action, string> = {
  skip: 'Skip a Month', prepay: 'Part Payment', foreclose: 'Settle in Full', revise: 'Revise Loan',
};

export default function LoanDetail() {
  const { loanId } = useParams<{ loanId: string }>();
  const navigate = useNavigate();
  const [loan, setLoan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [action, setAction] = useState<Action | null>(null);
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getLoan(loanId!);
      setLoan(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the loan');
    } finally {
      setLoading(false);
    }
  }, [loanId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return <LoadingBlock label="Loading loan…" />;
  if (!loan) {
    return <EmptyState icon="▤" title="Loan not found" message={error}
      action={<Link to="/payroll/loans" className="btn btn-secondary">Back to Loans</Link>} />;
  }

  const due = loan.schedule.filter((l: any) => l.status === 'DUE');
  const isActive = loan.status === 'ACTIVE';
  const showPerquisite = loan.schedule.some((l: any) => l.perquisite > 0);

  const open = (kind: Action) => {
    setForm({
      skip: { period: due[0]?.period || '', remarks: '' },
      prepay: { amount: '', date: today(), remarks: '' },
      foreclose: { date: today(), interest: '0', remarks: '' },
      revise: {
        topUp: '0', annualRate: String(loan.annualRate), instalments: String(due.length || 1),
        startPeriod: due[0]?.period || loan.currentPeriod, remarks: '',
      },
    }[kind]);
    setAction(kind);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await payrollAPI.loanAction(loan.id, action!, form);
      setSuccess(res.data.message || 'Saved');
      setError('');
      setAction(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not save the change');
      setAction(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${loan.loanNo}? Nothing has been repaid yet, so no history is lost.`)) return;
    try {
      await payrollAPI.deleteLoan(loan.id);
      navigate('/payroll/loans');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete the loan');
    }
  };

  const field = (label: string, key: string, props: any = {}, hint = '') => (
    <div className="field" style={props.wide ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      {props.unit ? (
        <div className="input-unit"><span className="unit">{props.unit}</span>
          <input className="input" type="number" min={0} step="0.01" required={props.required}
            value={form[key] ?? ''} onChange={e => setForm({ ...form, [key]: e.target.value })} />
        </div>
      ) : (
        <input className="input" type={props.type || 'text'} required={props.required} min={props.min} max={props.max}
          value={form[key] ?? ''} onChange={e => setForm({ ...form, [key]: e.target.value })} />
      )}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <Link to="/payroll/loans">Loans</Link>
        <span>/</span>
        <span>{loan.loanNo}</span>
      </div>

      <PageHeader
        title={`${loan.loanNo} — ${loan.person.name}`}
        subtitle={[loan.title, loan.typeLabel, loan.annualRate ? `${loan.annualRate}% a year` : '',
          `given ${formatDate(loan.loanDate)}`].filter(Boolean).join(' · ')}
        actions={
          <>
            <StatusBadge status={isActive ? 'active' : 'completed'} />
            <Link to={`/payroll/reports/loan-statement?loanId=${loan.id}`} className="btn btn-secondary">🖨 Statement</Link>
            {isActive && (
              <>
                <button className="btn btn-secondary" disabled={due.length === 0} onClick={() => open('skip')}>Skip a Month</button>
                <button className="btn btn-secondary" disabled={due.length === 0} onClick={() => open('prepay')}>Part Payment</button>
                <button className="btn btn-secondary" onClick={() => open('revise')}>Revise</button>
                <button className="btn btn-primary" onClick={() => open('foreclose')}>Settle in Full</button>
              </>
            )}
            {loan.canDelete && <button className="btn btn-danger" onClick={handleDelete}>Delete</button>}
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {success && (
        <div className="alert alert-success">
          <span>✓</span><span style={{ flex: 1 }}>{success}</span>
          <button className="modal-close" onClick={() => setSuccess('')}>✕</button>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Lent" value={formatINR(loan.totalLent)} icon="▤" tone="primary" />
        <StatCard label="Outstanding" value={formatINR(loan.outstanding)} icon="₹" tone="warning"
          sub={`${formatINR(loan.totalLent - loan.outstanding)} principal repaid`} />
        <StatCard label="Interest Paid" value={formatINR(loan.interestPaid)} icon="%" tone="info" />
        <StatCard label="Instalments Left" value={loan.instalmentsLeft} icon="◷" tone="success"
          sub={loan.nextInstalment ? `Next ${formatINR(loan.nextInstalment.amount)} in ${monthLabel(loan.nextInstalment.period)}` : 'Nothing more due'} />
      </div>

      <div className="card mb-24">
        <div className="card-header">
          <h3>Repayment plan</h3>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            An instalment is marked paid when the payroll run for its month is finalized.
          </span>
        </div>
        {loan.schedule.length === 0 ? (
          <EmptyState icon="◷" title="No instalments" message="This loan was settled outside payroll." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th><th>Month</th><th className="num">Principal</th><th className="num">Interest</th>
                  <th className="num">Instalment</th>{showPerquisite && <th className="num">Perquisite</th>}<th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loan.schedule.map((l: any) => {
                  const overdue = l.status === 'DUE' && l.period < loan.currentPeriod;
                  return (
                    <tr key={l.id}>
                      <td className="text-muted">{l.seq}</td>
                      <td style={{ fontWeight: 600 }}>{monthLabel(l.period)}</td>
                      <td className="num">{formatINR(l.principal)}</td>
                      <td className="num text-muted">{l.interest ? formatINR(l.interest) : '—'}</td>
                      <td className="num" style={{ fontWeight: 600 }}>{formatINR(l.instalment)}</td>
                      {showPerquisite && <td className="num text-muted">{l.perquisite ? formatINR(l.perquisite) : '—'}</td>}
                      <td>
                        <span className={`badge ${l.status === 'PAID' ? 'badge-success' : overdue ? 'badge-danger' : 'badge-neutral'}`}>
                          {l.status === 'PAID' ? 'paid' : overdue ? 'not deducted' : 'due'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {showPerquisite && (
          <p className="text-muted" style={{ fontSize: 12, padding: '10px 22px 16px' }}>
            Perquisite is the taxable benefit of paying {loan.annualRate}% against the {loan.perquisite.benchmarkRate}% benchmark.
            It will feed the income-tax calculation; it is not deducted from pay.
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-header"><h3>Transactions</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Date</th><th>Transaction</th><th className="num">Lent</th><th className="num">Principal repaid</th>
                <th className="num">Interest</th><th className="num">Balance</th><th>Remarks</th><th>By</th>
              </tr>
            </thead>
            <tbody>
              {loan.transactions.map((t: any) => (
                <tr key={t.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(t.date)}</td>
                  <td>{t.label}{t.period && <span className="text-muted"> ({monthLabel(t.period)})</span>}</td>
                  <td className="num">{t.principal > 0 ? formatINR(t.principal) : '—'}</td>
                  <td className="num">{t.principal < 0 ? formatINR(-t.principal) : '—'}</td>
                  <td className="num text-muted">{t.interest ? formatINR(t.interest) : '—'}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{formatINR(t.balanceAfter)}</td>
                  <td>{t.remarks || '—'}</td>
                  <td>{t.createdByName || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal title={action ? `${ACTION_TITLES[action]} — ${loan.loanNo}` : ''} open={Boolean(action)} onClose={() => setAction(null)}>
        {action && (
          <form onSubmit={handleSubmit}>
            {action === 'skip' && (
              <>
                <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
                  Nothing is deducted in the chosen month. The remaining instalments move one month later.
                </p>
                <div className="form-grid" style={{ marginBottom: 14 }}>
                  <div className="field">
                    <label>Month to skip *</label>
                    <select className="select" required value={form.period} onChange={e => setForm({ ...form, period: e.target.value })}>
                      {due.map((l: any) => <option key={l.id} value={l.period}>{monthLabel(l.period)} — {formatINR(l.instalment)}</option>)}
                    </select>
                  </div>
                  {field('Reason', 'remarks')}
                </div>
              </>
            )}
            {action === 'prepay' && (
              <>
                <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
                  A payment made outside payroll. {formatINR(loan.outstanding)} is outstanding. The instalments left
                  stay the same in number and become smaller.
                </p>
                <div className="form-grid" style={{ marginBottom: 14 }}>
                  {field('Amount paid *', 'amount', { unit: '₹', required: true })}
                  {field('Paid on *', 'date', { type: 'date', required: true })}
                  {field('Remarks', 'remarks', { wide: true })}
                </div>
              </>
            )}
            {action === 'foreclose' && (
              <>
                <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
                  The employee pays the whole balance of <strong>{formatINR(loan.outstanding)}</strong> outside payroll.
                  The remaining instalments are cancelled and the loan closes.
                </p>
                <div className="form-grid" style={{ marginBottom: 14 }}>
                  {field('Settled on *', 'date', { type: 'date', required: true })}
                  {field('Interest collected', 'interest', { unit: '₹' }, 'Any interest paid with the settlement.')}
                  {field('Remarks', 'remarks', { wide: true })}
                </div>
              </>
            )}
            {action === 'revise' && (
              <>
                <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
                  {formatINR(loan.outstanding)} is outstanding. Set new terms for it; instalments already paid are not affected.
                </p>
                <div className="form-grid" style={{ marginBottom: 14 }}>
                  {field('Top-up amount', 'topUp', { unit: '₹' }, 'Extra money lent now, added to the balance.')}
                  {field('Interest rate', 'annualRate', { unit: '%' }, 'A year.')}
                  {field('Instalments from here *', 'instalments', { type: 'number', min: 1, max: 360, required: true })}
                  {field('Next deduction in *', 'startPeriod', { type: 'month', required: true })}
                  {field('Remarks', 'remarks', { wide: true })}
                </div>
              </>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setAction(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Confirm'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
