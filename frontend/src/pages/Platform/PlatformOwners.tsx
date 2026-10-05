import { useCallback, useEffect, useState } from 'react';
import { platformAPI, type PlatformOwner } from '../../api/platform';
import { EmptyState, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { toast, confirmDialog } from '../../components/feedback';
import { usePlatformStore } from '../../store/platformStore';
import { formatDate } from '../../utils/format';

const NEW_OWNER = { email: '', name: '', password: '' };

export default function PlatformOwners() {
  const me = usePlatformStore(s => s.admin);
  const [owners, setOwners] = useState<PlatformOwner[] | null>(null);
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(NEW_OWNER);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    platformAPI.getOwners()
      .then(res => setOwners(res.data.owners))
      .catch(err => setError(err.response?.data?.error || 'Failed to load owners'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const addOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await platformAPI.addOwner(form);
      setShowNew(false);
      setForm(NEW_OWNER);
      toast.success('Platform owner added.');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not add owner');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (o: PlatformOwner) => {
    if (o.isActive && !(await confirmDialog({
      title: `Disable ${o.email}?`,
      message: 'They will no longer be able to sign in to the console.',
      confirmLabel: 'Disable',
    }))) return;
    try {
      await platformAPI.setOwnerActive(o.id, !o.isActive);
      toast.success(o.isActive ? 'Owner disabled.' : 'Owner enabled.');
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not update owner');
    }
  };

  if (!owners && !error) return <LoadingBlock label="Loading owners…" />;

  return (
    <>
      <div className="platform-head">
        <div>
          <h1>Platform owners</h1>
          <p className="text-muted">People who can open this console and manage every tenant.</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setForm(NEW_OWNER); setShowNew(true); }}>
          + Add owner
        </button>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="card">
        {(owners || []).length === 0 ? (
          <EmptyState icon="◆" title="No owners" message="Add a platform owner to get started." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Email</th><th>Name</th><th>Added</th><th>Last sign-in</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {(owners || []).map(o => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>
                      {o.email}{o.id === me?.id && <span className="badge badge-info" style={{ marginLeft: 8 }}>you</span>}
                    </td>
                    <td className="text-muted">{o.name || '—'}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{formatDate(o.createdAt)}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{o.lastLoginAt ? formatDate(o.lastLoginAt) : '—'}</td>
                    <td><span className={`badge ${o.isActive ? 'badge-success' : 'badge-neutral'}`}>{o.isActive ? 'active' : 'disabled'}</span></td>
                    <td>
                      <div className="row-actions">
                        {o.id === me?.id
                          ? <span className="text-muted" style={{ fontSize: 12 }}>—</span>
                          : <button className="btn btn-secondary btn-sm" onClick={() => toggle(o)}>
                              {o.isActive ? 'Disable' : 'Enable'}
                            </button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title="Add platform owner" open={showNew} onClose={() => setShowNew(false)}>
        <form onSubmit={addOwner}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Email *</label>
            <input className="input" type="email" required autoFocus value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })} placeholder="owner@yourco.com" />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Name</label>
            <input className="input" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Password *</label>
            <input className="input" type="password" required value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })} placeholder="At least 8 characters" />
            <small className="text-muted">Share it with them securely; they can change it later.</small>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowNew(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add owner'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
