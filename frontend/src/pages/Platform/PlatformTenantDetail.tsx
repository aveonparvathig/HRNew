import { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { platformAPI, type Tenant, type PlatformAuditEntry, type Plan } from '../../api/platform';
import { StatCard, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { toast, confirmDialog } from '../../components/feedback';
import { formatDate } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';

const cap = (n: number) => (n > 0 ? n : '∞');
const MODULE_LABELS: Record<string, string> = {
  project: 'Project', recruitment: 'Recruitment', proposals: 'Proposals', expenses: 'Expenses', payroll: 'Payroll',
};

const dateTime = (d: string) =>
  new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const ACTION_LABEL: Record<string, string> = {
  TENANT_SUSPENDED: 'Suspended', TENANT_REACTIVATED: 'Reactivated',
  PLATFORM_LOGIN: 'Owner signed in', TENANT_CREATED: 'Created',
  TENANT_PLAN_SET: 'Plan changed', TENANT_IMPERSONATED: 'Support session',
};

export default function PlatformTenantDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [audit, setAudit] = useState<PlatformAuditEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planOpen, setPlanOpen] = useState(false);
  const [planForm, setPlanForm] = useState({ planId: '', maxEmployeesOverride: '', maxUsersOverride: '', trialEndsOn: '' });

  const load = useCallback(async () => {
    try {
      const res = await platformAPI.getTenant(id);
      setTenant(res.data.tenant);
      setAudit(res.data.audit);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load tenant');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { platformAPI.getPlans().then(res => setPlans(res.data.plans)).catch(() => {}); }, []);

  const openPlan = () => {
    setPlanForm({
      planId: tenant?.planId || '',
      maxEmployeesOverride: tenant?.maxEmployeesOverride != null ? String(tenant.maxEmployeesOverride) : '',
      maxUsersOverride: tenant?.maxUsersOverride != null ? String(tenant.maxUsersOverride) : '',
      trialEndsOn: tenant?.trialEndsOn ? tenant.trialEndsOn.slice(0, 10) : '',
    });
    setPlanOpen(true);
  };

  const savePlan = async () => {
    setBusy(true);
    try {
      const res = await platformAPI.setTenantPlan(id, {
        planId: planForm.planId || null,
        maxEmployeesOverride: planForm.maxEmployeesOverride === '' ? null : Number(planForm.maxEmployeesOverride),
        maxUsersOverride: planForm.maxUsersOverride === '' ? null : Number(planForm.maxUsersOverride),
        trialEndsOn: planForm.trialEndsOn || null,
      });
      setTenant(res.data.tenant);
      setPlanOpen(false);
      toast.success('Plan updated.');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not update plan');
    } finally {
      setBusy(false);
    }
  };

  const doSuspend = async () => {
    setBusy(true);
    try {
      const res = await platformAPI.suspend(id, reason.trim());
      setTenant(res.data.tenant);
      setSuspendOpen(false);
      setReason('');
      toast.success('Tenant suspended — their logins are now blocked.');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not suspend tenant');
    } finally {
      setBusy(false);
    }
  };

  const loginAs = async () => {
    if (!(await confirmDialog({
      title: `Open a support session for ${tenant?.name}?`,
      message: 'You will see the tenant exactly as their admin does, read-only. Every support session is logged. Use "Exit support" to return here.',
      confirmLabel: 'Log in as tenant',
    }))) return;
    try {
      const res = await platformAPI.impersonate(id);
      const s = useAuthStore.getState();
      s.setUser({ ...res.data.user });
      s.setOrg(res.data.org);
      s.setTokens(res.data.accessToken, '');
      s.setImpersonation({ by: res.data.impersonatedBy, tenant: res.data.tenantName, readOnly: res.data.readOnly });
      window.location.href = '/dashboard';
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not start support session');
    }
  };

  const doReactivate = async () => {
    if (!(await confirmDialog({
      title: 'Reactivate tenant?',
      message: `${tenant?.name} will be able to sign in again immediately.`,
      confirmLabel: 'Reactivate',
    }))) return;
    try {
      const res = await platformAPI.reactivate(id);
      setTenant(res.data.tenant);
      toast.success('Tenant reactivated.');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not reactivate tenant');
    }
  };

  const doDelete = async () => {
    setBusy(true);
    try {
      await platformAPI.deleteTenant(id, confirmName.trim());
      toast.success(`${tenant?.name} and all its data were deleted.`);
      navigate('/platform');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not delete tenant');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading tenant…" />;
  if (!tenant) return (
    <>
      <ErrorAlert message={error || 'Tenant not found'} />
      <Link to="/platform/tenants" className="btn btn-secondary btn-sm">← Back to tenants</Link>
    </>
  );

  const suspended = tenant.status === 'SUSPENDED';

  return (
    <>
      <div className="platform-head">
        <div>
          <Link to="/platform/tenants" className="text-muted" style={{ fontSize: 13 }}>← Tenants</Link>
          <h1 style={{ marginTop: 4 }}>
            {tenant.name}{' '}
            <span className={`badge ${suspended ? 'badge-danger' : 'badge-success'}`} style={{ verticalAlign: 'middle' }}>
              {tenant.status.toLowerCase()}
            </span>
          </h1>
          <p className="text-muted">{tenant.email || 'No contact email'} · joined {formatDate(tenant.createdAt)} · {tenant.createdVia === 'OWNER' ? 'owner-created' : 'self-signup'}</p>
        </div>
        <div className="row-actions">
          <button className="btn btn-secondary" onClick={loginAs}>Log in as</button>
          {suspended
            ? <button className="btn btn-primary" onClick={doReactivate}>Reactivate</button>
            : <button className="btn btn-danger" onClick={() => setSuspendOpen(true)}>Suspend</button>}
          <button className="btn btn-ghost" onClick={() => { setConfirmName(''); setDeleteOpen(true); }}>Delete</button>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {suspended && (
        <div className="alert alert-danger" style={{ marginBottom: 16 }}>
          <strong>Suspended{tenant.suspendedAt ? ` on ${formatDate(tenant.suspendedAt)}` : ''}.</strong>{' '}
          {tenant.suspendedReason ? `Reason: ${tenant.suspendedReason}` : 'No reason recorded.'} All logins for this tenant are blocked.
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Users" value={tenant.users} icon="◴" tone="primary" />
        <StatCard label="Employees" value={tenant.employees} icon="◷" tone="info" />
        <StatCard label="People (total)" value={tenant.people} icon="◵" tone="warning" />
        <StatCard label="Last sign-in" value={tenant.lastLoginAt ? formatDate(tenant.lastLoginAt) : '—'} icon="◶" tone="success" />
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, margin: 0 }}>Plan &amp; limits</h3>
          <button className="btn btn-secondary btn-sm" onClick={openPlan}>Change plan</button>
        </div>
        <div className="form-grid">
          <div>
            <div className="text-muted" style={{ fontSize: 12 }}>Plan</div>
            <div style={{ fontWeight: 600 }}>{tenant.planName || 'No plan (all modules, no caps)'}</div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: 12 }}>Employees</div>
            <div style={{ fontWeight: 600 }}>{tenant.employees} / {cap(tenant.limits.maxEmployees)}
              {tenant.maxEmployeesOverride != null && <span className="badge badge-info" style={{ marginLeft: 6 }}>override</span>}</div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: 12 }}>Logins</div>
            <div style={{ fontWeight: 600 }}>{tenant.users} / {cap(tenant.limits.maxUsers)}
              {tenant.maxUsersOverride != null && <span className="badge badge-info" style={{ marginLeft: 6 }}>override</span>}</div>
          </div>
          <div>
            <div className="text-muted" style={{ fontSize: 12 }}>Trial ends</div>
            <div style={{ fontWeight: 600 }}>{tenant.trialEndsOn ? formatDate(tenant.trialEndsOn) : '—'}</div>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <div className="text-muted" style={{ fontSize: 12, marginBottom: 4 }}>Modules</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tenant.limits.modules.map(m => (
              <span key={m} className="badge badge-success">{MODULE_LABELS[m] || m}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Platform activity</h3>
        {audit.length === 0 ? (
          <p className="text-muted">No platform actions recorded for this tenant yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Action</th><th>By</th><th>Detail</th></tr></thead>
              <tbody>
                {audit.map(a => (
                  <tr key={a.id}>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{dateTime(a.createdAt)}</td>
                    <td>{ACTION_LABEL[a.action] || a.action}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{a.actorEmail}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{a.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title={`Suspend ${tenant.name}?`} open={suspendOpen} onClose={() => setSuspendOpen(false)}>
        <p className="text-muted" style={{ marginBottom: 14 }}>
          Every login for this organization will be blocked immediately, including sessions already open.
          You can reactivate at any time.
        </p>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Reason (optional)</label>
          <textarea className="input" rows={2} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Non-payment, abuse report…" />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setSuspendOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={doSuspend}>
            {busy ? 'Suspending…' : 'Suspend tenant'}
          </button>
        </div>
      </Modal>

      <Modal title={`Plan for ${tenant.name}`} open={planOpen} onClose={() => setPlanOpen(false)}>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Plan</label>
          <select className="select" value={planForm.planId}
            onChange={e => setPlanForm({ ...planForm, planId: e.target.value })}>
            <option value="">No plan (all modules, no caps)</option>
            {plans.filter(p => p.isActive || p.id === planForm.planId).map(p => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.maxEmployees > 0 ? `${p.maxEmployees} emp` : 'unlimited'}, {p.maxUsers > 0 ? `${p.maxUsers} logins` : 'unlimited'}{p.trialDays > 0 ? `, ${p.trialDays}-day trial` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>Max employees override</label>
            <input className="input" type="number" min={0} value={planForm.maxEmployeesOverride}
              onChange={e => setPlanForm({ ...planForm, maxEmployeesOverride: e.target.value })}
              placeholder="use plan" />
          </div>
          <div className="field">
            <label>Max logins override</label>
            <input className="input" type="number" min={0} value={planForm.maxUsersOverride}
              onChange={e => setPlanForm({ ...planForm, maxUsersOverride: e.target.value })}
              placeholder="use plan" />
          </div>
          <div className="field">
            <label>Trial ends on</label>
            <input className="input" type="date" value={planForm.trialEndsOn}
              onChange={e => setPlanForm({ ...planForm, trialEndsOn: e.target.value })} />
          </div>
        </div>
        <p className="text-muted" style={{ fontSize: 12, marginBottom: 14 }}>
          Leave an override blank to use the plan's value. 0 means unlimited. Picking a trial plan with no date set starts the clock today.
        </p>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setPlanOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={savePlan}>
            {busy ? 'Saving…' : 'Save plan'}
          </button>
        </div>
      </Modal>

      <Modal title={`Delete ${tenant.name}?`} open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <div className="alert alert-danger" style={{ marginBottom: 14 }}>
          This permanently removes the organization and <strong>all its data</strong> — users, employees,
          payroll, documents, everything. This cannot be undone.
        </div>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Type <strong>{tenant.name}</strong> to confirm</label>
          <input className="input" value={confirmName} onChange={e => setConfirmName(e.target.value)}
            placeholder={tenant.name} autoComplete="off" />
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setDeleteOpen(false)}>Cancel</button>
          <button type="button" className="btn btn-danger" disabled={busy || confirmName.trim() !== tenant.name}
            onClick={doDelete}>
            {busy ? 'Deleting…' : 'Delete permanently'}
          </button>
        </div>
      </Modal>
    </>
  );
}
