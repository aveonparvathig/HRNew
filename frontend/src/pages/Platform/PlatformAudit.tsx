import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { platformAPI, type PlatformAuditEntry } from '../../api/platform';
import { EmptyState, LoadingBlock, ErrorAlert } from '../../components/ui';

const dateTime = (d: string) =>
  new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const ACTION_LABEL: Record<string, string> = {
  PLATFORM_LOGIN: 'Owner signed in',
  TENANT_CREATED: 'Tenant created',
  TENANT_SUSPENDED: 'Tenant suspended',
  TENANT_REACTIVATED: 'Tenant reactivated',
  TENANT_DELETED: 'Tenant deleted',
  OWNER_ADDED: 'Owner added',
  OWNER_DISABLED: 'Owner disabled',
  OWNER_ENABLED: 'Owner enabled',
  TENANT_PLAN_SET: 'Plan changed',
  PLAN_UPDATED: 'Plan edited',
  TENANT_IMPERSONATED: 'Support session',
};
const ACTION_TONE: Record<string, string> = {
  TENANT_SUSPENDED: 'badge-danger', TENANT_DELETED: 'badge-danger', OWNER_DISABLED: 'badge-danger',
  TENANT_CREATED: 'badge-success', TENANT_REACTIVATED: 'badge-success', OWNER_ADDED: 'badge-success', OWNER_ENABLED: 'badge-success',
};

export default function PlatformAudit() {
  const [audit, setAudit] = useState<PlatformAuditEntry[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    platformAPI.getAudit()
      .then(res => setAudit(res.data.audit))
      .catch(err => setError(err.response?.data?.error || 'Failed to load audit log'));
  }, []);

  if (!audit && !error) return <LoadingBlock label="Loading audit log…" />;

  return (
    <>
      <div className="platform-head">
        <div>
          <h1>Audit log</h1>
          <p className="text-muted">Every platform-owner action, newest first. Only what changed is recorded.</p>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="card">
        {(audit || []).length === 0 ? (
          <EmptyState icon="◷" title="No activity yet" message="Platform-owner actions will appear here." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>When</th><th>Action</th><th>Tenant</th><th>By</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {(audit || []).map(a => (
                  <tr key={a.id}>
                    <td className="text-muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{dateTime(a.createdAt)}</td>
                    <td><span className={`badge ${ACTION_TONE[a.action] || 'badge-neutral'}`}>{ACTION_LABEL[a.action] || a.action}</span></td>
                    <td>
                      {a.orgName
                        ? <Link to={`/platform/tenants/${a.organizationId}`}>{a.orgName}</Link>
                        : <span className="text-muted">{a.organizationId ? (a.detail || '—') : '—'}</span>}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{a.actorEmail}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{a.detail || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
