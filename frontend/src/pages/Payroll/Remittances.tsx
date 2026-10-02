import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, BackButton, Modal } from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';

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
        <span>Statutory Payments</span>
      </div>

      <PageHeader
        title="Statutory Payments"
        subtitle="What each month's payroll owes for PF, ESI, Professional Tax and Labour Welfare Fund, and what has been paid."
        actions={data.financialYears.length > 0 && (
          <select className="select" style={{ width: 'auto' }} value={data.startYear}
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
              <span className="text-muted" style={{ fontSize: 12.5 }}>
                {m.status === 'FINALIZED' ? 'Finalized' : 'Draft — dues may still change'}
              </span>
            </div>
            <Link to={`/payroll/runs/${m.runId}`} className="btn btn-secondary btn-sm">Open run →</Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Payable to</th><th className="num">Due</th><th className="num">Paid</th><th className="num">Balance</th><th>Payments</th><th /></tr>
              </thead>
              <tbody>
                {data.types.filter((t: string) => m.dues[t] > 0 || m.paid[t] > 0).map((t: string) => {
                  const balance = Math.round((m.dues[t] - m.paid[t]) * 100) / 100;
                  return (
                    <tr key={t}>
                      <td style={{ fontWeight: 600 }}>{TYPE_LABELS[t]}</td>
                      <td className="num">{formatINR(m.dues[t])}</td>
                      <td className="num">{m.paid[t] ? formatINR(m.paid[t]) : '—'}</td>
                      <td className={`num ${balance > 0 ? 'text-warning' : 'text-success'}`} style={{ fontWeight: 600 }}>
                        {balance > 0 ? formatINR(balance) : balance < 0 ? `${formatINR(-balance)} over` : 'Paid'}
                      </td>
                      <td style={{ fontSize: 12.5 }}>
                        {m.payments.filter((p: any) => p.type === t).map((p: any) => (
                          <div key={p.id}>
                            {formatINR(p.amount)} on {formatDate(p.paidOn)}
                            {p.reference && <span className="text-muted"> · {p.reference}</span>}
                            <button className="btn-link-danger" onClick={() => handleDelete(p)} aria-label="Remove payment">remove</button>
                          </div>
                        ))}
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => setForm({
                            period: m.period, type: t, amount: balance > 0 ? balance : '', paidOn: today(),
                            reference: '', bankName: '', remarks: '',
                          })}>Record Payment</button>
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
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Amount paid *</label>
                <div className="input-unit"><span className="unit">₹</span>
                  <input className="input" type="number" min={0.01} step="0.01" required value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Paid on *</label>
                <input className="input" type="date" required value={form.paidOn}
                  onChange={e => setForm({ ...form, paidOn: e.target.value })} />
              </div>
              <div className="field">
                <label>Challan / reference no.</label>
                <input className="input" value={form.reference}
                  onChange={e => setForm({ ...form, reference: e.target.value })} />
              </div>
              <div className="field">
                <label>Bank</label>
                <input className="input" value={form.bankName}
                  onChange={e => setForm({ ...form, bankName: e.target.value })} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Remarks</label>
                <input className="input" value={form.remarks}
                  onChange={e => setForm({ ...form, remarks: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Record Payment'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
