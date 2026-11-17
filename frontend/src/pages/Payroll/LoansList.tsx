import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal, StatusBadge, BackButton,
} from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
import { formatINR, formatDate } from '../../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};
const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const emptyForm = (personId = '') => ({
  personId, title: '', type: 'FLAT', principal: '', annualRate: '0', instalments: '',
  loanDate: today(), startPeriod: thisMonth(), remarks: '',
});

export default function LoansList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ACTIVE');
  const [form, setForm] = useState<any>(null);
  const [preview, setPreview] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [loans, options] = await Promise.all([payrollAPI.getLoans(), payrollAPI.getReportOptions()]);
      setData(loans.data);
      setEmployees(options.data.employees.filter((p: any) => !['RESIGNED', 'TERMINATED'].includes(p.employmentStatus)));
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load loans');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // "New loan" from an employee's page arrives as ?new=<personId>
  useEffect(() => {
    const personId = params.get('new');
    if (personId) {
      setForm(emptyForm(personId));
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  // Repayment plan for the terms typed so far
  useEffect(() => {
    if (!form || !(Number(form.principal) > 0) || !(Number(form.instalments) >= 1) || !form.startPeriod) {
      setPreview(null);
      return;
    }
    let live = true;
    payrollAPI.previewLoan(form)
      .then(res => { if (live) setPreview(res.data); })
      .catch(() => { if (live) setPreview(null); });
    return () => { live = false; };
  }, [form]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await payrollAPI.createLoan(form);
      navigate(`/payroll/loans/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create the loan');
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading loans…" />;

  const loans = data.loans.filter((l: any) => filter === 'ALL' || l.status === filter);
  const type = data.types.find((t: any) => t.value === form?.type);

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <span>Loans</span>
      </div>

      <PageHeader
        title="Loans & advances"
        subtitle="Instalments are deducted automatically in each month's payroll run."
        actions={<>
          <ButtonLink to="/payroll/reports/loan-register" icon="receipt">Loan register</ButtonLink>
          <Button variant="accent" icon="plus" onClick={() => setForm(emptyForm())}>New loan</Button>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="stat-grid">
        <StatCard label="Active loans" value={data.totals.active} icon="banknote" tone="primary" />
        <StatCard label="Outstanding" value={formatINR(data.totals.outstanding)} icon="receipt" tone="warning"
          sub="Principal still to be recovered" />
        <StatCard label="Closed" value={data.totals.closed} icon="checkCircle" tone="success" />
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Loans</h3>
          <div className="segmented">
            {[['ACTIVE', 'Active'], ['CLOSED', 'Closed'], ['ALL', 'All']].map(([value, label]) => (
              <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
        </div>
        {loans.length === 0 ? (
          <EmptyState icon="▤" title={filter === 'ACTIVE' ? 'No active loans' : 'No loans here'}
            message="Record a loan or salary advance and its instalments will be recovered through payroll." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Loan</th><th>Employee</th><th className="num">Lent</th><th className="num">Outstanding</th>
                  <th className="num">Next instalment</th><th>Ends</th><th>Status</th><th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {loans.map((l: any) => (
                  <tr key={l.id}>
                    <td>
                      <span className="ps-strong num">{l.loanNo}</span>
                      <div className="ps-sub">
                        {[l.title, l.typeLabel, l.annualRate ? `${l.annualRate}%` : ''].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td>
                      {l.person.name}
                      <div className="ps-sub num">{l.person.employeeNo}</div>
                    </td>
                    <td className="num">
                      {formatINR(l.totalLent)}
                      <div className="ps-sub">{formatDate(l.loanDate)}</div>
                    </td>
                    <td className="num ps-strong">{formatINR(l.outstanding)}</td>
                    <td className="num">
                      {l.nextInstalment ? (
                        <>
                          {formatINR(l.nextInstalment.amount)}
                          <div className="ps-sub">
                            {monthLabel(l.nextInstalment.period)} · {l.instalmentsLeft} left
                          </div>
                        </>
                      ) : '—'}
                    </td>
                    <td>{l.lastPeriod ? monthLabel(l.lastPeriod) : '—'}</td>
                    <td><StatusBadge status={l.status === 'ACTIVE' ? 'active' : 'completed'} /></td>
                    <td>
                      <div className="row-actions">
                        <ButtonLink to={`/payroll/loans/${l.id}`} size="sm">Open</ButtonLink>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal size="lg" title="New loan or advance" open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={handleCreate}>
            <div className="form-grid mb-14">
              <div className="field">
                <label htmlFor="ps-newloan-person">Employee *</label>
                <select id="ps-newloan-person" className="select" required value={form.personId}
                  onChange={e => setForm({ ...form, personId: e.target.value })}>
                  <option value="">Pick an employee…</option>
                  {employees.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.employeeNo ? ` (${p.employeeNo})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ps-newloan-title">What it is for</label>
                <input id="ps-newloan-title" className="input" placeholder="e.g. Salary advance" value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ps-newloan-principal">Amount *</label>
                <div className="input-unit"><span className="unit">₹</span>
                  <input id="ps-newloan-principal" className="input" type="number" min={1} step="0.01" required value={form.principal}
                    onChange={e => setForm({ ...form, principal: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="ps-newloan-date">Given on *</label>
                <input id="ps-newloan-date" className="input" type="date" required value={form.loanDate}
                  onChange={e => setForm({ ...form, loanDate: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ps-newloan-instalments">Number of instalments *</label>
                <input id="ps-newloan-instalments" className="input" type="number" min={1} max={360} required value={form.instalments}
                  onChange={e => setForm({ ...form, instalments: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ps-newloan-start">First deduction in *</label>
                <input id="ps-newloan-start" className="input" type="month" required value={form.startPeriod}
                  onChange={e => setForm({ ...form, startPeriod: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ps-newloan-rate">Interest rate</label>
                <div className="input-unit"><span className="unit">%</span>
                  <input id="ps-newloan-rate" className="input" type="number" min={0} max={60} step="0.01" value={form.annualRate}
                    onChange={e => setForm({ ...form, annualRate: e.target.value })} />
                </div>
                <span className="hint">A year. Leave at 0 for an interest-free advance.</span>
              </div>
              <div className="field">
                <label htmlFor="ps-newloan-type">Interest method</label>
                <select id="ps-newloan-type" className="select" value={form.type} disabled={!(Number(form.annualRate) > 0)}
                  onChange={e => setForm({ ...form, type: e.target.value })}>
                  {data.types.map((t: any) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <span className="hint">{Number(form.annualRate) > 0 ? type?.hint : 'Only matters when interest is charged.'}</span>
              </div>
              <div className="field ps-span-all">
                <label htmlFor="ps-newloan-remarks">Remarks</label>
                <input id="ps-newloan-remarks" className="input" value={form.remarks}
                  onChange={e => setForm({ ...form, remarks: e.target.value })} />
              </div>
            </div>

            {preview && preview.lines.length > 0 && (
              <div className="alert alert-success ps-align-start">
                <Icon name="banknote" size={16} className="ps-alert-icon" />
                <span>
                  <strong>{formatINR(preview.lines[0].instalment)}</strong> a month
                  {preview.lines[preview.lines.length - 1].instalment !== preview.lines[0].instalment
                    && <> (last instalment {formatINR(preview.lines[preview.lines.length - 1].instalment)})</>}
                  , from {monthLabel(preview.lines[0].period)} to {monthLabel(preview.lines[preview.lines.length - 1].period)}.
                  {preview.totalInterest > 0
                    ? <> Interest {formatINR(preview.totalInterest)}; {formatINR(preview.totalRepayable)} repaid in all.</>
                    : <> No interest.</>}
                </span>
              </div>
            )}

            <div className="form-actions">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Create loan'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
