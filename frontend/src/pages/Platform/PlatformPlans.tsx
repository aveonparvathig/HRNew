import { useCallback, useEffect, useState } from 'react';
import { platformAPI, type Plan } from '../../api/platform';
import { LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { toast } from '../../components/feedback';

const MODULE_LABELS: Record<string, string> = {
  project: 'Project', recruitment: 'Recruitment', proposals: 'Proposals', expenses: 'Expenses', payroll: 'Payroll',
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
        enabledModules: editing.enabledModules,
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
      <div className="platform-head">
        <div>
          <h1>Plans</h1>
          <p className="text-muted">Subscription tiers. Editing a plan changes the limits for every tenant on it.</p>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Plan</th><th className="num">Employees</th><th className="num">Logins</th><th>Modules</th><th>Trial</th><th className="num">Price/mo</th><th>Status</th><th /></tr>
            </thead>
            <tbody>
              {(plans || []).map(p => (
                <tr key={p.id}>
                  <td style={{ fontWeight: 600 }}>{p.name}<div className="text-muted" style={{ fontSize: 11.5 }}>{p.code}</div></td>
                  <td className="num">{cap(p.maxEmployees)}</td>
                  <td className="num">{cap(p.maxUsers)}</td>
                  <td style={{ fontSize: 12 }}>
                    {p.enabledModules.length === modules.length ? 'All'
                      : p.enabledModules.map(m => MODULE_LABELS[m] || m).join(', ') || '—'}
                  </td>
                  <td className="text-muted">{p.trialDays > 0 ? `${p.trialDays} days` : '—'}</td>
                  <td className="num">{p.price > 0 ? `₹${p.price.toLocaleString('en-IN')}` : '—'}</td>
                  <td><span className={`badge ${p.isActive ? 'badge-success' : 'badge-neutral'}`}>{p.isActive ? 'active' : 'hidden'}</span></td>
                  <td><div className="row-actions"><button className="btn btn-secondary btn-sm" onClick={() => setEditing(p)}>Edit</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal title={editing ? `Edit ${editing.name}` : ''} open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Name</label>
              <input className="input" value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Max employees (0 = ∞)</label>
                <input className="input" type="number" min={0} value={editing.maxEmployees}
                  onChange={e => setEditing({ ...editing, maxEmployees: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div className="field">
                <label>Max logins (0 = ∞)</label>
                <input className="input" type="number" min={0} value={editing.maxUsers}
                  onChange={e => setEditing({ ...editing, maxUsers: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div className="field">
                <label>Trial days (0 = none)</label>
                <input className="input" type="number" min={0} value={editing.trialDays}
                  onChange={e => setEditing({ ...editing, trialDays: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
              <div className="field">
                <label>Price / month (₹)</label>
                <input className="input" type="number" min={0} value={editing.price}
                  onChange={e => setEditing({ ...editing, price: Math.max(0, Number(e.target.value) || 0) })} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Included modules</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
                {modules.map(m => (
                  <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={editing.enabledModules.includes(m)} onChange={() => toggleModule(m)} />
                    {MODULE_LABELS[m] || m}
                  </label>
                ))}
              </div>
              <small className="text-muted">The core HR directory is always included. No boxes ticked = all modules.</small>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <input type="checkbox" checked={editing.isActive} onChange={e => setEditing({ ...editing, isActive: e.target.checked })} />
              Active (offered to tenants)
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>
                {busy ? 'Saving…' : 'Save plan'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
