import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../api/payroll';
import { Modal, ErrorAlert } from './ui';
import { confirmDialog, toast } from './feedback';
import { formatINR } from '../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};
const SCOPE: Record<string, string> = { EMPLOYEE: 'set for this employee', DESIGNATION: 'from the designation', DEPARTMENT: 'from the department' };
const STATE: Record<string, [string, string]> = {
  RUNNING: ['Running', 'badge-success'], UPCOMING: ['Not started', 'badge-neutral'], ENDED: ['Ended', 'badge-neutral'],
};
const drafts = (n: number) => (n ? ` ${n} draft payslip${n === 1 ? '' : 's'} recalculated.` : '');

// How one employee's pay is split, and the components they get every month.
export default function PersonStructureCard({ person, onChanged }: { person: any; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null); // recurring component being added or edited
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getPersonStructure(person.id);
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the salary structure');
    }
  }, [person.id]);

  useEffect(() => { fetchData(); }, [fetchData, person.currentMonthlyPackage, person.designation, person.department]);

  const fail = (err: any, fallback: string) => setError(err.response?.data?.error || fallback);

  const assign = async (templateId: string) => {
    try {
      const res = await payrollAPI.assignStructure({ scope: 'EMPLOYEE', target: person.id, templateId });
      toast.success(`${res.data.message}.${drafts(res.data.draftPayslipsChanged)}`);
      fetchData();
      onChanged();
    } catch (err: any) {
      fail(err, 'Could not change the structure');
    }
  };

  const openForm = (item?: any) => setForm(item
    ? { id: item.id, componentId: item.componentId, name: item.name, amount: item.amount, fromPeriod: item.fromPeriod, toPeriod: item.toPeriod, prorate: item.prorate, remarks: item.remarks }
    : { componentId: '', amount: '', fromPeriod: data.period, toPeriod: '', prorate: true, remarks: '' });

  const saveRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = form.id
        ? await payrollAPI.updateRecurring(form.id, form)
        : await payrollAPI.createRecurring(person.id, form);
      toast.success(`Recurring component saved.${drafts(res.data.draftEntriesUpdated)}`);
      setForm(null);
      setError('');
      fetchData();
      onChanged();
    } catch (err: any) {
      fail(err, 'Could not save the recurring component');
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (item: any) => {
    if (!await confirmDialog({
      title: `Remove ${item.name}?`,
      message: 'It comes off draft payslips and is not added to new ones. Payslips already finalized keep it. To stop it from a month onward and keep the record, give it a last month instead.',
      confirmLabel: 'Remove', danger: true,
    })) return;
    try {
      const res = await payrollAPI.deleteRecurring(item.id);
      toast.success(`${res.data.message}.${drafts(res.data.draftEntriesUpdated)}`);
      fetchData();
      onChanged();
    } catch (err: any) {
      fail(err, 'Could not remove it');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : null;
  const m = data.monthly;
  const parts: [string, number][] = [
    ['Basic', m.basic], ['DA', m.da], ['HRA', m.hra], ['Transport', m.transportAllowance], ['Food', m.foodAllowance],
  ];
  const running = data.recurring.filter((r: any) => r.state === 'RUNNING');
  const extra = running.reduce((s: number, r: any) => s + (r.type === 'DEDUCTION' ? 0 : r.amount), 0);

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div>
          <h3>Salary structure</h3>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {data.structure ? `Template “${data.structure.name}”, ${SCOPE[data.structure.scope]}` : 'The company’s split'}
            {data.grossPercent < 99.995 && ` · pays ${data.grossPercent}% of the package as gross`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {data.templates.length > 0 && (
            <select className="select" style={{ width: 'auto' }} aria-label="Structure template for this employee" value={data.ownTemplateId}
              onChange={e => assign(e.target.value)}>
              <option value="">{data.structure && data.structure.scope !== 'EMPLOYEE' ? `As for the ${data.structure.scope.toLowerCase()}` : 'Company split'}</option>
              {data.templates.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <Link to="/payroll/settings?tab=structures" className="btn btn-secondary btn-sm">Templates</Link>
          <button className="btn btn-primary btn-sm" onClick={() => openForm()}>+ Recurring Component</button>
        </div>
      </div>
      <div style={{ padding: '0 22px' }}>
        <ErrorAlert message={error} onDismiss={() => setError('')} />
      </div>
      <div style={{ padding: '12px 22px 4px', fontSize: 13 }}>
        {data.monthlyPackage > 0 ? (
          <p>
            A full month: {parts.filter(([, v]) => v > 0).map(([label, v]) => `${label} ${formatINR(v)}`).join(' · ')}
            {extra > 0 && ` · recurring ${formatINR(extra)}`}
            {' '}= gross <strong>{formatINR(m.grossSalary + extra)}</strong>
          </p>
        ) : <p className="text-muted">No package set yet.</p>}
      </div>
      {data.recurring.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Every month</th><th className="num">Amount</th><th>From</th><th>To</th><th>Loss of pay</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {data.recurring.map((r: any) => (
                <tr key={r.id}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{r.name}</span>
                    <div className="text-muted" style={{ fontSize: 11.5 }}>{r.type === 'DEDUCTION' ? 'Deduction' : 'Earning'}{r.remarks ? ` · ${r.remarks}` : ''}</div>
                  </td>
                  <td className="num">{formatINR(r.amount)}</td>
                  <td>{monthLabel(r.fromPeriod)}</td>
                  <td>{r.toPeriod ? monthLabel(r.toPeriod) : <span className="text-muted">Until changed</span>}</td>
                  <td>{r.prorate ? 'Reduced' : <span className="text-muted">Paid in full</span>}</td>
                  <td><span className={`badge ${STATE[r.state][1]}`}>{STATE[r.state][0]}</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => openForm(r)}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title={form?.id ? `Recurring Component — ${form.name}` : `Recurring Component — ${person.name}`} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={saveRecurring}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              {!form.id && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Pay component *</label>
                  <select className="select" required value={form.componentId} onChange={e => setForm({ ...form, componentId: e.target.value })}>
                    <option value="">Pick a component…</option>
                    {data.components.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.type === 'DEDUCTION' ? 'deduction' : 'earning'})</option>)}
                  </select>
                  <span className="hint">Components are kept in Payroll Settings → Pay components. Add one there if it is not listed.</span>
                </div>
              )}
              <div className="field">
                <label>Amount for a full month *</label>
                <div className="input-unit"><span className="unit">₹</span>
                  <input className="input" type="number" min={0.01} step="0.01" required value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>From *</label>
                <input className="input" type="month" required value={form.fromPeriod} onChange={e => setForm({ ...form, fromPeriod: e.target.value })} />
              </div>
              <div className="field">
                <label>Last month</label>
                <input className="input" type="month" value={form.toPeriod} onChange={e => setForm({ ...form, toPeriod: e.target.value })} />
                <span className="hint">Leave blank to run until you change it.</span>
              </div>
              <div className="field">
                <label>Note</label>
                <input className="input" maxLength={200} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
              </div>
            </div>
            <label className="checkbox-field" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
              <input type="checkbox" style={{ marginTop: 2 }} checked={form.prorate} onChange={e => setForm({ ...form, prorate: e.target.checked })} />
              <span>
                Reduce it for loss-of-pay days
                <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>
                  On: paid for the days paid, like the rest of the salary. Off: the full amount every month.
                </span>
              </span>
            </label>
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              It is added to each payslip of the months it covers, draft runs included, and counted for income tax across the year.
              PF and ESI are worked out on the fixed salary components only. Finalized payslips do not change.
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
