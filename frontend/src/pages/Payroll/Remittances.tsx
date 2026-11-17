import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, BackButton, Modal } from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';
import { Button, ButtonLink } from '../../components/Button';

const TYPE_LABELS: Record<string, string> = {
  PF: 'Provident Fund', ESI: 'ESI', PT: 'Professional Tax', LWF: 'Labour Welfare Fund',
};

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const today = () => new Date().toISOString().slice(0, 10);

export default function Remittances() {
  const [data, setData] = useState<any>(null);
  const [fy, setFy] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null); // payment being recorded
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getRemittances(fy);
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load statutory payments');
    }
  }, [fy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await payrollAPI.createRemittance(form);
      setForm(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to record the payment');
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (payment: any) => {
    if (!await confirmDialog(`Remove the ${TYPE_LABELS[payment.type]} payment of ${formatINR(payment.amount)}?`)) return;
    try {
      await payrollAPI.deleteRemittance(payment.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove the payment');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading statutory payments…" />;

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <span>Statutory payments</span>
      </div>

      <PageHeader
        title="Statutory payments"
        subtitle="What each month's payroll owes for PF, ESI, Professional Tax and Labour Welfare Fund, and what has been paid."
        actions={data.financialYears.length > 0 && (
          <select className="select ps-w-auto" aria-label="Financial year" value={data.startYear}
            onChange={e => setFy(e.target.value)}>
            {data.financialYears.map((y: any) => <option key={y.startYear} value={y.startYear}>FY {y.label}</option>)}
          </select>
        )}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {data.months.length === 0 ? (
        <div className="card">
          <EmptyState icon="▤" title={`No payroll in FY ${data.financialYear}`} />
        </div>
      ) : data.months.map((m: any) => (
        <div key={m.period} className="card mb-24">
          <div className="card-header">
            <div>
              <h3>{monthLabel(m.period)}</h3>
              <span className="text-sm-muted">
                {m.status === 'FINALIZED' ? 'Finalized' : 'Draft — dues may still change'}
              </span>
            </div>
            <ButtonLink to={`/payroll/runs/${m.runId}`} size="sm">Open run</ButtonLink>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Payable to</th><th className="num">Due</th><th className="num">Paid</th><th className="num">Balance</th><th>Payments</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {data.types.filter((t: string) => m.dues[t] > 0 || m.paid[t] > 0).map((t: string) => {
                  const balance = Math.round((m.dues[t] - m.paid[t]) * 100) / 100;
                  return (
                    <tr key={t}>
                      <td className="ps-strong">{TYPE_LABELS[t]}</td>
                      <td className="num">{formatINR(m.dues[t])}</td>
                      <td className="num">{m.paid[t] ? formatINR(m.paid[t]) : '—'}</td>
                      <td className={`num ps-strong ${balance > 0 ? 'text-warning' : 'text-success'}`}>
                        {balance > 0 ? formatINR(balance) : balance < 0 ? `${formatINR(-balance)} over` : 'Paid'}
                      </td>
                      <td className="ps-small">
                        {m.payments.filter((p: any) => p.type === t).map((p: any) => (
                          <div key={p.id}>
                            <span className="num">{formatINR(p.amount)}</span> on {formatDate(p.paidOn)}
                            {p.reference && <span className="text-muted"> · {p.reference}</span>}
                            <button className="btn-link-danger" onClick={() => handleDelete(p)} aria-label="Remove payment">remove</button>
                          </div>
                        ))}
                      </td>
                      <td>
                        <div className="row-actions">
                          <Button size="sm" onClick={() => setForm({
                            period: m.period, type: t, amount: balance > 0 ? balance : '', paidOn: today(),
                            reference: '', bankName: '', remarks: '',
                          })}>Record payment</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {data.types.every((t: string) => !(m.dues[t] > 0 || m.paid[t] > 0)) && (
                  <tr><td colSpan={6} className="text-muted">Nothing due for this month.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <Modal title={form ? `${TYPE_LABELS[form.type]} — ${monthLabel(form.period)}` : ''}
        open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={handleSave}>
            <div className="form-grid mb-14">
              <div className="field">
                <label htmlFor="ps-rem-amount">Amount paid *</label>
                <div className="input-unit"><span className="unit">₹</span>
                  <input id="ps-rem-amount" className="input num" type="number" min={0.01} step="0.01" required value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="ps-rem-date">Paid on *</label>
                <input id="ps-rem-date" className="input" type="date" required value={form.paidOn}
                  onChange={e => setForm({ ...form, paidOn: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ps-rem-ref">Challan / reference no.</label>
                <input id="ps-rem-ref" className="input" value={form.reference}
                  onChange={e => setForm({ ...form, reference: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="ps-rem-bank">Bank</label>
                <input id="ps-rem-bank" className="input" value={form.bankName}
                  onChange={e => setForm({ ...form, bankName: e.target.value })} />
              </div>
              <div className="field ps-span-all">
                <label htmlFor="ps-rem-remarks">Remarks</label>
                <input id="ps-rem-remarks" className="input" value={form.remarks}
                  onChange={e => setForm({ ...form, remarks: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Record payment'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
