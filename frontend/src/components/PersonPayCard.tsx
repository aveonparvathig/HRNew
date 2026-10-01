import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../api/payroll';
import { Modal, ErrorAlert } from './ui';
import { formatINR } from '../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

// How one employee is paid: payment mode, salary stop, and salaries on hold.
export default function PersonPayCard({ person }: { person: any }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getPaySettings(person.id);
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load payment details');
    }
  }, [person.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await payrollAPI.updatePaySettings(person.id, form);
      setForm(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save payment details');
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : null;
  const mode = data.modes.find((m: any) => m.value === data.paymentMode)?.label || data.paymentMode;

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div>
          <h3>Salary payment</h3>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            Paid by {mode.toLowerCase()}
            {data.paymentMode === 'BANK' && !data.hasBankDetails && ' · account number or IFSC missing'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/payroll/settlements/new?personId=${person.id}`} className="btn btn-secondary btn-sm">Final Settlement</Link>
          <button className="btn btn-primary btn-sm"
            onClick={() => setForm({ paymentMode: data.paymentMode, salaryStopped: data.salaryStopped, salaryStopReason: data.salaryStopReason })}>
            Edit
          </button>
        </div>
      </div>
      {(error || data.salaryStopped || data.held.length > 0) && (
        <div style={{ padding: '14px 22px 18px', fontSize: 13 }}>
          <ErrorAlert message={error} onDismiss={() => setError('')} />
          {data.salaryStopped && (
            <div className="alert alert-warning" style={{ marginBottom: data.held.length ? 12 : 0 }}>
              <span>⏸</span>
              <span>Salary is stopped: {data.salaryStopReason}. New payroll runs leave this employee out.</span>
            </div>
          )}
          {data.held.length > 0 && (
            <p>
              On hold:{' '}
              {data.held.map((h: any, i: number) => (
                <span key={h.id}>
                  {i > 0 && ', '}
                  <Link to={`/payroll/runs/${h.runId}/payout`}>{monthLabel(h.period)}</Link> ({formatINR(h.amount)}{h.reason ? `, ${h.reason}` : ''})
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      <Modal title={`Salary Payment — ${person.name}`} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={handleSave}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Payment mode</label>
              <select className="select" value={form.paymentMode} onChange={e => setForm({ ...form, paymentMode: e.target.value })}>
                {data.modes.map((m: any) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <span className="hint">Decides which payment batch the salary goes into. Bank transfers need the account number and IFSC on the profile.</span>
            </div>
            <label className="checkbox-field" style={{ marginBottom: 10 }}>
              <input type="checkbox" checked={form.salaryStopped}
                onChange={e => setForm({ ...form, salaryStopped: e.target.checked })} />
              Stop salary: leave this employee out of new payroll runs
            </label>
            {form.salaryStopped && (
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Reason *</label>
                <input className="input" required placeholder="e.g. On unpaid sabbatical" value={form.salaryStopReason}
                  onChange={e => setForm({ ...form, salaryStopReason: e.target.value })} />
              </div>
            )}
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              Stopping does not remove the employee from a run that already exists. To compute a salary but not pay it, use Hold on the run instead.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
