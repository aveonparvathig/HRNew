import { useCallback, useEffect, useState } from 'react';
import { platformAPI, type Plan } from '../../api/platform';
import { PageHeader, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { Button } from '../../components/Button';
import { toast } from '../../components/feedback';

const MODULE_LABELS: Record<string, string> = {
  recruitment: 'Recruitment', expenses: 'Expenses', payroll: 'Payroll', leave: 'Leave & Attendance',
};
const cap = (n: number) => (n > 0 ? n : 'Unlimited');

export default function PlatformPlans() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Plan | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    platformAPI.getPlans()
      .then(res => { setPlans(res.data.plans); setModules(res.data.modules); })
      .catch(err => setError(err.response?.data?.error || 'Failed to load plans'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await platformAPI.updatePlan(editing.id, {
        name: editing.name, maxEmployees: editing.maxEmployees, maxUsers: editing.maxUsers,
        trialDays: editing.trialDays, price: editing.price, isActive: editing.isActive,
        // Only standard modules belong on a plan; drop any stale custom modules.
        enabledModules: editing.enabledModules.filter(m => modules.includes(m)),
      });
      setEditing(null);
      toast.success('Plan saved.');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not save plan');
    } finally {
      setBusy(false);
    }
  };

  const toggleModule = (key: string) => {
    if (!editing) return;
    const has = editing.enabledModules.includes(key);
    setEditing({ ...editing, enabledModules: has ? editing.enabledModules.filter(m => m !== key) : [...editing.enabledModules, key] });
  };

  if (!plans && !error) return <LoadingBlock label="Loading plans…" />;

  return (
    <>
      <PageHeader
        title="Plans"
        subtitle="Subscription tiers. Editing a plan changes the limits for every tenant on it."
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Plan</th><th className="num">Employees</th><th className="num">Logins</th><th>Modules</th><th>Trial</th><th className="num">Price / month</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {(plans || []).map(p => (
                <tr key={p.id}>
                  <td className="pf-name">{p.name}<div className="pf-sub">{p.code}</div></td>
                  <td className="num">{cap(p.maxEmployees)}</td>
                  <td className="num">{cap(p.maxUsers)}</td>
                  <td className="text-sm-muted">
                    {p.enabledModules.length === modules.length ? 'All'
                      : p.enabledModules.map(m => MODULE_LABELS[m] || m).join(', ') || '—'}
                  </td>
                  <td className="text-muted">{p.trialDays > 0 ? `${p.trialDays} days` : '—'}</td>
                  <td className="num">{p.price > 0 ? `₹${p.price.toLocaleString('en-IN')}` : '—'}</td>
                  <td><span className={`badge ${p.isActive ? 'badge-success' : 'badge-neutral'}`}>{p.isActive ? 'active' : 'hidden'}</span></td>
                  <td><div className="row-actions"><Button size="sm" icon="pen" onClick={() => setEditing(p)}>Edit</Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal title={editing ? `Edit ${editing.name}` : ''} open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <>
            <div className="field mb-14">
              <label htmlFor="pf-plan-name">Name</label>
              <input id="pf-plan-name" className="input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="form-grid mb-14">
              <div className="field">
                <label htmlFor="pf-plan-emp">Max employees (0 = ∞)</label>
                <input id="pf-plan-emp" className="input" type="number" min={0} value={editing.maxEmployees}
                  onChange={e => setEditing({ ...editing, maxEmployees: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div className="field">
                <label htmlFor="pf-plan-users">Max logins (0 = ∞)</label>
                <input id="pf-plan-users" className="input" type="number" min={0} value={editing.maxUsers}
                  onChange={e => setEditing({ ...editing, maxUsers: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div className="field">
                <label htmlFor="pf-plan-trial">Trial days (0 = none)</label>
                <input id="pf-plan-trial" className="input" type="number" min={0} value={editing.trialDays}
                  onChange={e => setEditing({ ...editing, trialDays: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div className="field">
                <label htmlFor="pf-plan-price">Price / month (₹)</label>
                <input id="pf-plan-price" className="input" type="number" min={0} value={editing.price}
                  onChange={e => setEditing({ ...editing, price: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
            </div>
            <div className="field mb-14">
              <label>Included modules</label>
              <div className="pf-check-list">
                {modules.map(m => (
                  <label key={m} className="pf-check-inline">
                    <input type="checkbox" checked={editing.enabledModules.includes(m)} onChange={() => toggleModule(m)} />
                    {MODULE_LABELS[m] || m}
                  </label>
                ))}
              </div>
              <small className="text-muted">The core HR directory is always included. No boxes ticked = all modules.</small>
            </div>
            <label className="pf-check mb-16">
              <input type="checkbox" checked={editing.isActive} onChange={e => setEditing({ ...editing, isActive: e.target.checked })} />
              Active (offered to tenants)
            </label>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
              <Button variant="accent" loading={busy} onClick={save}>
                {busy ? 'Saving…' : 'Save plan'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
