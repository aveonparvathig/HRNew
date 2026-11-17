import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Button, ButtonLink } from './Button';
import { Icon } from './Layout/nav';
import { payrollAPI } from '../api/payroll';
import { Modal, ErrorAlert } from './ui';
import ListSelect from './ListSelect';
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
          <span className="text-sm-muted">
            Paid by {mode.toLowerCase()}
            {data.paymentMode === 'BANK' && !data.hasBankDetails && ' · account number or IFSC missing'}
          </span>
        </div>
        <div className="cluster">
          <ButtonLink to={`/payroll/settlements/new?personId=${person.id}`} size="sm" variant="ghost" icon="banknote">Final settlement</ButtonLink>
          <Button size="sm" icon="pen"
            onClick={() => setForm({ paymentMode: data.paymentMode, salaryStopped: data.salaryStopped, salaryStopReason: data.salaryStopReason })}>
            Edit
          </Button>
        </div>
      </div>
      {(error || data.salaryStopped || data.held.length > 0) && (
        <div className="pp-card-body pp-card-body-pad">
          <ErrorAlert message={error} onDismiss={() => setError('')} />
          {data.salaryStopped && (
            <div className={`alert alert-warning${data.held.length ? ' pp-mb-12' : ' pp-mb-0'}`}>
              <Icon name="alert" size={16} className="pp-alert-icon" />
              <span>Salary is stopped: {data.salaryStopReason}. New payroll runs leave this employee out.</span>
            </div>
          )}
          {data.held.length > 0 && (
            <p>
              On hold:{' '}
              {data.held.map((h: any, i: number) => (
                <span key={h.id}>
                  {i > 0 && ', '}
                  <Link to={`/payroll/runs/${h.runId}/payout`}>{monthLabel(h.period)}</Link> (<span className="num">{formatINR(h.amount)}</span>{h.reason ? `, ${h.reason}` : ''})
                </span>
              ))}
            </p>
          )}
        </div>
      )}

      <Modal title={`Salary payment — ${person.name}`} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={handleSave}>
            <div className="field mb-14">
              <label htmlFor="pp-pay-mode">Payment mode</label>
              <select id="pp-pay-mode" className="select" value={form.paymentMode} onChange={e => setForm({ ...form, paymentMode: e.target.value })}>
                {data.modes.map((m: any) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <span className="hint">Decides which payment batch the salary goes into. Bank transfers need the account number and IFSC on the profile.</span>
            </div>
            <label className="checkbox-field pp-mb-10">
              <input type="checkbox" checked={form.salaryStopped}
                onChange={e => setForm({ ...form, salaryStopped: e.target.checked })} />
              Stop salary: leave this employee out of new payroll runs
            </label>
            {form.salaryStopped && (
              <div className="field mb-14">
                <label>Reason *</label>
                <ListSelect listType="STOP_REASON" required value={form.salaryStopReason} placeholder="Pick a reason"
                  onChange={v => setForm({ ...form, salaryStopReason: v })} />
              </div>
            )}
            <p className="text-sm-muted mb-14">
              Stopping does not remove the employee from a run that already exists. To compute a salary but not pay it, use Hold on the run instead.
            </p>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
