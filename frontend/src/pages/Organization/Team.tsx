import { useState, useEffect, useCallback } from 'react';
import { orgAPI } from '../../api/org';
import {
  PageHeader, LoadingBlock, ErrorAlert, Modal, StatusBadge,
} from '../../components/ui';
import { formatDate } from '../../utils/format';

const EMPTY_MEMBER = { email: '', password: '', firstName: '', lastName: '', role: 'MEMBER' };

export default function Team() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [form, setForm] = useState<any>(EMPTY_MEMBER);
  const [resetModal, setResetModal] = useState<any>(null); // member
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await orgAPI.getTeam();
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isOwner = data?.myRole === 'OWNER';

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await orgAPI.addMember(form);
      setAddModal(false);
      setForm(EMPTY_MEMBER);
      setSuccess(`${form.email} added — share their password with them securely.`);
      setError('');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (member: any, patch: any, okMsg?: string) => {
    try {
      await orgAPI.updateMember(member.id, patch);
      setSuccess(okMsg || '');
      setError('');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update member');
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await orgAPI.resetMemberPassword(resetModal.id, newPassword);
      setResetModal(null);
      setNewPassword('');
      setSuccess(res.data.message);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading team…" />;

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={isOwner
          ? 'Add teammates, manage roles and access.'
          : 'Your organization’s team. Only owners can make changes.'}
        actions={isOwner && (
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_MEMBER); setAddModal(true); }}>
            + Add Member
          </button>
        )}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {success && (
        <div className="alert alert-success">
          <span>✓</span><span style={{ flex: 1 }}>{success}</span>
          <button className="modal-close" onClick={() => setSuccess('')}>✕</button>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th><th>Role</th><th>Status</th><th>Joined</th>
                {isOwner && <th />}
              </tr>
            </thead>
            <tbody>
              {(data?.members || []).map((m: any) => (
                <tr key={m.id}>
                  <td>
                    <span style={{ fontWeight: 600 }}>
                      {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.email}
                      {m.id === data.myId && <span className="badge badge-info" style={{ marginLeft: 8 }}>you</span>}
                    </span>
                    <div className="text-muted" style={{ fontSize: 11.5 }}>{m.email}</div>
                  </td>
                  <td>
                    {isOwner && m.id !== data.myId ? (
                      <select className="select" style={{ width: 120, padding: '5px 8px', fontSize: 12.5 }}
                        value={m.role}
                        onChange={e => handleUpdate(m, { role: e.target.value },
                          `${m.email} is now ${e.target.value === 'OWNER' ? 'an owner' : 'a member'}.`)}>
                        <option value="OWNER">Owner</option>
                        <option value="MEMBER">Member</option>
                      </select>
                    ) : (
                      <span className={`badge ${m.role === 'OWNER' ? 'badge-info' : 'badge-neutral'}`}>
                        {m.role.toLowerCase()}
                      </span>
                    )}
                  </td>
                  <td><StatusBadge status={m.isActive ? 'active' : 'inactive'} /></td>
                  <td className="text-muted">{formatDate(m.createdAt)}</td>
                  {isOwner && (
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-sm"
                          onClick={() => { setNewPassword(''); setResetModal(m); }}>
                          Reset Password
                        </button>
                        {m.id !== data.myId && (
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => handleUpdate(m, { isActive: !m.isActive },
                              m.isActive ? `${m.email} disabled — they can no longer sign in.` : `${m.email} re-enabled.`)}>
                            {m.isActive ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add member */}
      <Modal title="Add Team Member" open={addModal} onClose={() => setAddModal(false)}>
        <form onSubmit={handleAdd}>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>First name</label>
              <input className="input" value={form.firstName}
                onChange={e => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="field">
              <label>Last name</label>
              <input className="input" value={form.lastName}
                onChange={e => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Email *</label>
            <input className="input" type="email" required autoFocus value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Temporary password *</label>
              <input className="input" type="text" required minLength={8}
                placeholder="At least 8 characters" value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} />
              <span className="hint">Share it securely; they can change it later.</span>
            </div>
            <div className="field">
              <label>Role</label>
              <select className="select" value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="MEMBER">Member</option>
                <option value="OWNER">Owner</option>
              </select>
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setAddModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add Member'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Reset password */}
      <Modal title={resetModal ? `Reset Password — ${resetModal.email}` : ''}
        open={Boolean(resetModal)} onClose={() => setResetModal(null)}>
        <form onSubmit={handleReset}>
          <div className="field">
            <label>New password *</label>
            <input className="input" type="text" required minLength={8} autoFocus
              placeholder="At least 8 characters" value={newPassword}
              onChange={e => setNewPassword(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setResetModal(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Resetting…' : 'Reset Password'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
