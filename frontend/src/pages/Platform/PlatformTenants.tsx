import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { platformAPI, type Tenant } from '../../api/platform';
import { PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { toast } from '../../components/feedback';
import { formatDate } from '../../utils/format';

const STATUS_TONE: Record<string, string> = { ACTIVE: 'badge-success', SUSPENDED: 'badge-danger' };
const NEW_TENANT = { organizationName: '', adminEmail: '', adminFirstName: '', adminLastName: '', adminPassword: '' };

export default function PlatformTenants() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(NEW_TENANT);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ name: string; email: string; password: string } | null>(null);

  const load = useCallback(() => {
    platformAPI.getTenants()
      .then(res => setTenants(res.data.tenants))
      .catch(err => setError(err.response?.data?.error || 'Failed to load tenants'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const createTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await platformAPI.createTenant(form);
      setShowNew(false);
      setForm(NEW_TENANT);
      setCreated({ name: res.data.tenant.name, email: res.data.adminEmail, password: res.data.tempPassword });
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not create tenant');
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!tenants) return [];
    const needle = q.trim().toLowerCase();
    return tenants.filter(t =>
      (!status || t.status === status) &&
      (!needle || t.name.toLowerCase().includes(needle) || t.email.toLowerCase().includes(needle)),
    );
  }, [tenants, q, status]);

  const stats = useMemo(() => {
    const list = tenants || [];
    return {
      total: list.length,
      active: list.filter(t => t.status === 'ACTIVE').length,
      suspended: list.filter(t => t.status === 'SUSPENDED').length,
      employees: list.reduce((s, t) => s + t.employees, 0),
    };
  }, [tenants]);

  if (!tenants && !error) return <LoadingBlock label="Loading tenants…" />;

  return (
    <>
      <PageHeader
        title="Tenants"
        subtitle="Every organization on the platform."
        actions={
          <Button variant="accent" icon="plus" onClick={() => { setForm(NEW_TENANT); setShowNew(true); }}>
            New tenant
          </Button>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="stat-grid">
        <StatCard label="Tenants" value={stats.total} icon="building" tone="primary" />
        <StatCard label="Active" value={stats.active} icon="checkCircle" tone="success" />
        <StatCard label="Suspended" value={stats.suspended} icon="alert" tone="danger" />
        <StatCard label="Employees (all tenants)" value={stats.employees} icon="users" tone="info" />
      </div>

      <div className="toolbar">
        <div className="search-input">
          <input className="input" placeholder="Search by name or email…" value={q} aria-label="Search tenants"
            onChange={e => setQ(e.target.value)} />
        </div>
        <select className="select" value={status} aria-label="Filter by status" onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState icon="◆" title={q || status ? 'No matching tenants' : 'No tenants yet'}
            message={q || status ? 'Try a different search or filter.' : 'Organizations appear here once they sign up.'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Organization</th><th className="num">Users</th><th className="num">Employees</th>
                  <th>Created</th><th>Last sign-in</th><th>Source</th><th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => (
                  <tr key={t.id}>
                    <td>
                      <Link to={`/platform/tenants/${t.id}`} className="pf-name">{t.name}</Link>
                      <div className="pf-sub">{t.email || '—'}</div>
                    </td>
                    <td className="num">{t.users}</td>
                    <td className="num">{t.employees}</td>
                    <td className="pf-date">{formatDate(t.createdAt)}</td>
                    <td className="pf-date">{t.lastLoginAt ? formatDate(t.lastLoginAt) : '—'}</td>
                    <td className="text-sm-muted">
                      {t.createdVia === 'OWNER' ? 'Owner-created' : 'Self-signup'}
                    </td>
                    <td><span className={`badge ${STATUS_TONE[t.status] || 'badge-neutral'}`}>{t.status.toLowerCase()}</span></td>
                    <td>
                      <div className="row-actions">
                        <ButtonLink to={`/platform/tenants/${t.id}`} size="sm">Open</ButtonLink>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title="New tenant" open={showNew} onClose={() => setShowNew(false)}>
        <form onSubmit={createTenant}>
          <div className="field mb-14">
            <label htmlFor="pf-org-name">Organization name *</label>
            <input id="pf-org-name" className="input" required autoFocus value={form.organizationName}
              onChange={e => setForm({ ...form, organizationName: e.target.value })}
              placeholder="e.g. Acme Textiles Pvt Ltd" />
          </div>
          <div className="field mb-14">
            <label htmlFor="pf-admin-email">Admin email *</label>
            <input id="pf-admin-email" className="input" type="email" required value={form.adminEmail}
              onChange={e => setForm({ ...form, adminEmail: e.target.value })}
              placeholder="owner@acme.com" />
            <small className="text-muted">Becomes the organization's first Super Admin.</small>
          </div>
          <div className="form-grid mb-14">
            <div className="field">
              <label htmlFor="pf-admin-first">First name</label>
              <input id="pf-admin-first" className="input" value={form.adminFirstName}
                onChange={e => setForm({ ...form, adminFirstName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pf-admin-last">Last name</label>
              <input id="pf-admin-last" className="input" value={form.adminLastName}
                onChange={e => setForm({ ...form, adminLastName: e.target.value })} />
            </div>
          </div>
          <div className="field mb-14">
            <label htmlFor="pf-admin-password">Temporary password</label>
            <input id="pf-admin-password" className="input" value={form.adminPassword}
              onChange={e => setForm({ ...form, adminPassword: e.target.value })}
              placeholder="Leave blank to generate one" />
            <small className="text-muted">The admin must change it at first sign-in. Shown once after creating.</small>
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>
              {saving ? 'Creating…' : 'Create tenant'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal title="Tenant created" open={!!created} onClose={() => setCreated(null)}>
        <p className="pf-lede">
          <strong>{created?.name}</strong> is ready. Share these sign-in details with the admin —
          this password is shown only once.
        </p>
        <div className="card pf-cred">
          <div className="pf-cred-row"><span className="text-muted">Email:</span> <strong>{created?.email}</strong></div>
          <div><span className="text-muted">Temporary password:</span>{' '}
            <code className="pf-code">{created?.password}</code></div>
        </div>
        <div className="form-actions">
          <Button
            onClick={() => { navigator.clipboard?.writeText(`${created?.email} / ${created?.password}`); toast.success('Copied'); }}>
            Copy
          </Button>
          <Button variant="accent" onClick={() => setCreated(null)}>Done</Button>
        </div>
      </Modal>
    </>
  );
}
