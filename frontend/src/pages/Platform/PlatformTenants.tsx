import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { platformAPI, type Tenant } from '../../api/platform';
import { StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
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
      <div className="platform-head">
        <div>
          <h1>Tenants</h1>
          <p className="text-muted">Every organization on the platform.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(NEW_TENANT); setShowNew(true); }}>
          + New tenant
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="stat-grid">
        <StatCard label="Tenants" value={stats.total} icon="◆" tone="primary" />
        <StatCard label="Active" value={stats.active} icon="✓" tone="success" />
        <StatCard label="Suspended" value={stats.suspended} icon="⊘" tone="danger" />
        <StatCard label="Employees (all tenants)" value={stats.employees} icon="◷" tone="info" />
      </div>

      <div className="toolbar">
        <div className="search-input">
          <input className="input" placeholder="Search by name or email…" value={q}
            onChange={e => setQ(e.target.value)} />
        </div>
        <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
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
                      <Link to={`/platform/tenants/${t.id}`} style={{ fontWeight: 600 }}>{t.name}</Link>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>{t.email || '—'}</div>
                    </td>
                    <td className="num">{t.users}</td>
                    <td className="num">{t.employees}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{formatDate(t.createdAt)}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>
                      {t.lastLoginAt ? formatDate(t.lastLoginAt) : '—'}
                    </td>
                    <td className="text-muted" style={{ fontSize: 12 }}>
                      {t.createdVia === 'OWNER' ? 'Owner-created' : 'Self-signup'}
                    </td>
                    <td><span className={`badge ${STATUS_TONE[t.status] || 'badge-neutral'}`}>{t.status.toLowerCase()}</span></td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/platform/tenants/${t.id}`} className="btn btn-secondary btn-sm">Open</Link>
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
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Organization name *</label>
            <input className="input" required autoFocus value={form.organizationName}
              onChange={e => setForm({ ...form, organizationName: e.target.value })}
              placeholder="e.g. Acme Textiles Pvt Ltd" />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Admin email *</label>
            <input className="input" type="email" required value={form.adminEmail}
              onChange={e => setForm({ ...form, adminEmail: e.target.value })}
              placeholder="owner@acme.com" />
            <small className="text-muted">Becomes the organization's first Super Admin.</small>
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>First name</label>
              <input className="input" value={form.adminFirstName}
                onChange={e => setForm({ ...form, adminFirstName: e.target.value })} />
            </div>
            <div className="field">
              <label>Last name</label>
              <input className="input" value={form.adminLastName}
                onChange={e => setForm({ ...form, adminLastName: e.target.value })} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Temporary password</label>
            <input className="input" value={form.adminPassword}
              onChange={e => setForm({ ...form, adminPassword: e.target.value })}
              placeholder="Leave blank to generate one" />
            <small className="text-muted">The admin must change it at first sign-in. Shown once after creating.</small>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create tenant'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal title="Tenant created" open={!!created} onClose={() => setCreated(null)}>
        <p style={{ marginBottom: 14 }}>
          <strong>{created?.name}</strong> is ready. Share these sign-in details with the admin —
          this password is shown only once.
        </p>
        <div className="card" style={{ background: 'var(--surface-2)', marginBottom: 16 }}>
          <div style={{ marginBottom: 8 }}><span className="text-muted">Email:</span> <strong>{created?.email}</strong></div>
          <div><span className="text-muted">Temporary password:</span>{' '}
            <code style={{ fontSize: 14, fontWeight: 700 }}>{created?.password}</code></div>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-secondary"
            onClick={() => { navigator.clipboard?.writeText(`${created?.email} / ${created?.password}`); toast.success('Copied'); }}>
            Copy
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setCreated(null)}>Done</button>
        </div>
      </Modal>
    </>
  );
}
