import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { platformAPI, type Tenant, type PlatformAuditEntry } from '../../api/platform';
import { StatCard, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { toast, confirmDialog } from '../../components/feedback';
import { formatDate } from '../../utils/format';

const dateTime = (d: string) =>
  new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const ACTION_LABEL: Record<string, string> = {
  TENANT_SUSPENDED: 'Suspended', TENANT_REACTIVATED: 'Reactivated',
  PLATFORM_LOGIN: 'Owner signed in', TENANT_CREATED: 'Created',
};

export default function PlatformTenantDetail() {
  const { id = '' } = useParams();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [audit, setAudit] = useState<PlatformAuditEntry[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

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

  if (loading) return <LoadingBlock label="Loading tenant…" />;
  if (!tenant) return (
    <>
      <ErrorAlert message={error || 'Tenant not found'} />
      <Link to="/platform" className="btn btn-secondary btn-sm">← Back to tenants</Link>
    </>
  );

  const suspended = tenant.status === 'SUSPENDED';

  return (
    <>
      <div className="platform-head">
        <div>
          <Link to="/platform" className="text-muted" style={{ fontSize: 13 }}>← Tenants</Link>
          <h1 style={{ marginTop: 4 }}>
            {tenant.name}{' '}
            <span className={`badge ${suspended ? 'badge-danger' : 'badge-success'}`} style={{ verticalAlign: 'middle' }}>
              {tenant.status.toLowerCase()}
            </span>
          </h1>
          <p className="text-muted">{tenant.email || 'No contact email'} · joined {formatDate(tenant.createdAt)} · {tenant.createdVia === 'OWNER' ? 'owner-created' : 'self-signup'}</p>
        </div>
        <div className="row-actions">
          {suspended
            ? <button className="btn btn-primary" onClick={doReactivate}>Reactivate</button>
            : <button className="btn btn-danger" onClick={() => setSuspendOpen(true)}>Suspend</button>}
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
    </>
  );
}
