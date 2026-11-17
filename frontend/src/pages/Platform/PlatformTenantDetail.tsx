import { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { platformAPI, type Tenant, type PlatformAuditEntry, type Plan } from '../../api/platform';
import { PageHeader, StatCard, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Stack } from '../../components/layout';
import { toast, confirmDialog } from '../../components/feedback';
import { formatDate } from '../../utils/format';
import { useAuthStore } from '../../store/authStore';

const cap = (n: number) => (n > 0 ? n : '∞');
const MODULE_LABELS: Record<string, string> = {
  project: 'Project', recruitment: 'Recruitment', proposals: 'Sales (Proposals)',
  expenses: 'Expenses', payroll: 'Payroll', leave: 'Leave & Attendance',
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
  const [customCatalog, setCustomCatalog] = useState<string[]>([]);
  const [modBusy, setModBusy] = useState('');

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
  useEffect(() => {
    platformAPI.getPlans()
      .then(res => { setPlans(res.data.plans); setCustomCatalog(res.data.customModules || []); })
      .catch(() => {});
  }, []);

  // Grant/revoke a single custom module for this tenant.
  const toggleCustomModule = async (key: string) => {
    if (!tenant) return;
    const has = tenant.customModules.includes(key);
    const next = has ? tenant.customModules.filter(m => m !== key) : [...tenant.customModules, key];
    setModBusy(key);
    try {
      const res = await platformAPI.setTenantModules(id, { customModules: next });
      setTenant(res.data.tenant);
      toast.success(`${MODULE_LABELS[key] || key} ${has ? 'removed from' : 'enabled for'} ${tenant.name}.`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not update modules');
    } finally {
      setModBusy('');
    }
  };

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
      <ButtonLink to="/platform/tenants" size="sm">Back to tenants</ButtonLink>
    </>
  );

  const suspended = tenant.status === 'SUSPENDED';

  return (
    <>
      <PageHeader
        crumbs={<span className="pf-crumbs"><Link to="/platform/tenants">Tenants</Link><span className="sep">/</span>{tenant.name}</span>}
        title={tenant.name}
        badge={
          <span className={`badge pf-title-badge ${suspended ? 'badge-danger' : 'badge-success'}`}>
            {tenant.status.toLowerCase()}
          </span>
        }
        subtitle={`${tenant.email || 'No contact email'} · joined ${formatDate(tenant.createdAt)} · ${tenant.createdVia === 'OWNER' ? 'owner-created' : 'self-signup'}`}
        actions={
          <>
            <Button icon="user" onClick={loginAs}>Log in as</Button>
            {suspended
              ? <Button variant="accent" onClick={doReactivate}>Reactivate</Button>
              : <Button variant="danger" onClick={() => setSuspendOpen(true)}>Suspend</Button>}
            <Button variant="danger" onClick={() => { setConfirmName(''); setDeleteOpen(true); }}>Delete</Button>
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {suspended && (
        <div className="alert alert-danger mb-16">
          <strong>Suspended{tenant.suspendedAt ? ` on ${formatDate(tenant.suspendedAt)}` : ''}.</strong>{' '}
          {tenant.suspendedReason ? `Reason: ${tenant.suspendedReason}` : 'No reason recorded.'} All logins for this tenant are blocked.
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Users" value={tenant.users} icon="key" tone="primary" />
        <StatCard label="Employees" value={tenant.employees} icon="users" tone="info" />
        <StatCard label="People (total)" value={tenant.people} icon="user" tone="warning" />
        <StatCard label="Last sign-in" value={tenant.lastLoginAt ? formatDate(tenant.lastLoginAt) : '—'} icon="history" tone="success" />
      </div>

      <div className="card">
        <div className="pf-card-head">
          <h3 className="pf-card-title">Plan &amp; limits</h3>
          <Button size="sm" onClick={openPlan}>Change plan</Button>
        </div>
        <div className="form-grid">
          <div>
            <div className="pf-figure-label">Plan</div>
            <div className="pf-figure-value">{tenant.planName || 'No plan (all modules, no caps)'}</div>
          </div>
          <div>
            <div className="pf-figure-label">Employees</div>
            <div className="pf-figure-value"><span className="num">{tenant.employees} / {cap(tenant.limits.maxEmployees)}</span>
              {tenant.maxEmployeesOverride != null && <span className="badge badge-info pf-badge-gap">override</span>}</div>
          </div>
          <div>
            <div className="pf-figure-label">Logins</div>
            <div className="pf-figure-value"><span className="num">{tenant.users} / {cap(tenant.limits.maxUsers)}</span>
              {tenant.maxUsersOverride != null && <span className="badge badge-info pf-badge-gap">override</span>}</div>
          </div>
          <div>
            <div className="pf-figure-label">Trial ends</div>
            <div className="pf-figure-value num">{tenant.trialEndsOn ? formatDate(tenant.trialEndsOn) : '—'}</div>
          </div>
        </div>
        <div className="pf-modules">
          <div className="pf-figure-label">Modules</div>
          <div className="pf-module-list">
            {tenant.limits.modules.map(m => (
              <span key={m} className="badge badge-success">{MODULE_LABELS[m] || m}</span>
            ))}
          </div>
        </div>
      </div>

      {customCatalog.length > 0 && (
        <div className="card">
          <h3 className="pf-card-title tight">Custom modules</h3>
          <p className="pf-card-lede">
            Internal add-on modules that are off for every tenant by default and never part of a plan.
            Enable them only for the tenants that should have them.
          </p>
          <Stack gap={8}>
            {customCatalog.map(m => {
              const on = tenant.customModules.includes(m);
              return (
                <label key={m} className="pf-check">
                  <input type="checkbox" checked={on} disabled={modBusy === m} onChange={() => toggleCustomModule(m)} />
                  <span>{MODULE_LABELS[m] || m}</span>
                  {on && <span className="badge badge-success">enabled</span>}
                  {modBusy === m && <span className="text-sm-muted">saving…</span>}
                </label>
              );
            })}
          </Stack>
        </div>
      )}

      <div className="card">
        <h3 className="pf-card-title">Platform activity</h3>
        {audit.length === 0 ? (
          <p className="text-muted">No platform actions recorded for this tenant yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>When</th><th>Action</th><th>By</th><th>Detail</th></tr></thead>
              <tbody>
                {audit.map(a => (
                  <tr key={a.id}>
                    <td className="pf-date">{dateTime(a.createdAt)}</td>
                    <td>{ACTION_LABEL[a.action] || a.action}</td>
                    <td className="text-sm-muted">{a.actorEmail}</td>
                    <td className="text-sm-muted">{a.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title={`Suspend ${tenant.name}?`} open={suspendOpen} onClose={() => setSuspendOpen(false)}>
        <p className="text-muted pf-lede">
          Every login for this organization will be blocked immediately, including sessions already open.
          You can reactivate at any time.
        </p>
        <div className="field mb-14">
          <label htmlFor="pf-suspend-reason">Reason (optional)</label>
          <textarea id="pf-suspend-reason" className="input" rows={2} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Non-payment, abuse report…" />
        </div>
        <div className="form-actions">
          <Button variant="ghost" onClick={() => setSuspendOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={doSuspend}>
            {busy ? 'Suspending…' : 'Suspend tenant'}
          </Button>
        </div>
      </Modal>

      <Modal title={`Plan for ${tenant.name}`} open={planOpen} onClose={() => setPlanOpen(false)}>
        <div className="field mb-14">
          <label htmlFor="pf-plan-id">Plan</label>
          <select id="pf-plan-id" className="select" value={planForm.planId}
            onChange={e => setPlanForm({ ...planForm, planId: e.target.value })}>
            <option value="">No plan (all modules, no caps)</option>
            {plans.filter(p => p.isActive || p.id === planForm.planId).map(p => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.maxEmployees > 0 ? `${p.maxEmployees} emp` : 'unlimited'}, {p.maxUsers > 0 ? `${p.maxUsers} logins` : 'unlimited'}{p.trialDays > 0 ? `, ${p.trialDays}-day trial` : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="form-grid mb-14">
          <div className="field">
            <label htmlFor="pf-max-emp">Max employees override</label>
            <input id="pf-max-emp" className="input" type="number" min={0} value={planForm.maxEmployeesOverride}
              onChange={e => setPlanForm({ ...planForm, maxEmployeesOverride: e.target.value })}
              placeholder="use plan" />
          </div>
          <div className="field">
            <label htmlFor="pf-max-users">Max logins override</label>
            <input id="pf-max-users" className="input" type="number" min={0} value={planForm.maxUsersOverride}
              onChange={e => setPlanForm({ ...planForm, maxUsersOverride: e.target.value })}
              placeholder="use plan" />
          </div>
          <div className="field">
            <label htmlFor="pf-trial-ends">Trial ends on</label>
            <input id="pf-trial-ends" className="input" type="date" value={planForm.trialEndsOn}
              onChange={e => setPlanForm({ ...planForm, trialEndsOn: e.target.value })} />
          </div>
        </div>
        <p className="pf-hint">
          Leave an override blank to use the plan's value. 0 means unlimited. Picking a trial plan with no date set starts the clock today.
        </p>
        <div className="form-actions">
          <Button variant="ghost" onClick={() => setPlanOpen(false)}>Cancel</Button>
          <Button variant="accent" loading={busy} onClick={savePlan}>
            {busy ? 'Saving…' : 'Save plan'}
          </Button>
        </div>
      </Modal>

      <Modal title={`Delete ${tenant.name}?`} open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <div className="alert alert-danger mb-14">
          This permanently removes the organization and <strong>all its data</strong> — users, employees,
          payroll, documents, everything. This cannot be undone.
        </div>
        <div className="field mb-14">
          <label htmlFor="pf-confirm-name">Type <strong>{tenant.name}</strong> to confirm</label>
          <input id="pf-confirm-name" className="input" value={confirmName} onChange={e => setConfirmName(e.target.value)}
            placeholder={tenant.name} autoComplete="off" />
        </div>
        <div className="form-actions">
          <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button variant="danger" loading={busy} disabled={confirmName.trim() !== tenant.name}
            onClick={doDelete}>
            {busy ? 'Deleting…' : 'Delete permanently'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
