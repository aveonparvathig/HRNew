import { useState, useEffect, useCallback } from 'react';
import { orgAPI } from '../../api/org';
import {
  PageHeader, LoadingBlock, ErrorAlert, Modal, StatusBadge, SuccessAlert,
} from '../../components/ui';
import { formatDate } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';

const EMPTY_MEMBER = { email: '', password: '', firstName: '', lastName: '', role: 'EMPLOYEE' };

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin', HR: 'HR', PAYROLL_VIEWER: 'Payroll Viewer', EMPLOYEE: 'Employee', MARKETING: 'Marketing',
};
const ROLE_TONES: Record<string, string> = {
  SUPER_ADMIN: 'badge-info', HR: 'badge-violet', PAYROLL_VIEWER: 'badge-warning', EMPLOYEE: 'badge-neutral', MARKETING: 'badge-teal',
};
const ROLE_OPTIONS = ['EMPLOYEE', 'MARKETING', 'PAYROLL_VIEWER', 'HR', 'SUPER_ADMIN'];

const dateTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

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

  const isOwner = data?.myRole === 'SUPER_ADMIN';

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await orgAPI.addMember(form);
      setAddModal(false);
      setForm(EMPTY_MEMBER);
      setSuccess(`${form.email} added. Share the temporary password securely; they choose their own at first sign-in.`);
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
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async (member: any) => {
    try {
      const res = await orgAPI.unlockMember(member.id);
      setSuccess(res.data.message);
      setError('');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to unlock the account');
    }
  };

  if (loading) return <LoadingBlock label="Loading team…" />;

  const minLength = data?.passwordMinLength || 8;

  return (
    <>
      <PageHeader
        title="Team"
        subtitle={isOwner
          ? 'Add teammates, manage roles and access.'
          : 'Your organization’s team. Only owners can make changes.'}
        actions={isOwner && (
          <>
            <button className="btn btn-secondary" disabled={saving} onClick={async () => {
              if (!await confirmDialog(`Generate logins for ${data?.employeesWithoutLogin ?? 'all'} employees without one? A credential sheet will download — share each password securely; everyone must change it at first sign-in.`)) return;
              setSaving(true);
              try {
                const res = await orgAPI.generateLogins();
                const url = URL.createObjectURL(new Blob([res.data],
                  { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = `employee-logins-${new Date().toISOString().slice(0, 10)}.xlsx`;
                a.click();
                URL.revokeObjectURL(url);
                setSuccess(`Logins generated (${res.headers['x-created-count'] ?? '?'}) — credential sheet downloaded.`);
                fetchData();
              } catch (err: any) {
                setError('Failed to generate logins');
              } finally {
                setSaving(false);
              }
            }}>
              ⚿ Generate Employee Logins{data?.employeesWithoutLogin ? ` (${data.employeesWithoutLogin})` : ''}
            </button>
            <button className="btn btn-primary" onClick={() => { setForm(EMPTY_MEMBER); setAddModal(true); }}>
              + Add Member
            </button>
          </>
        )}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Member</th><th>Role</th><th>Status</th><th>Last sign-in</th><th>Joined</th>
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
                    <div className="text-muted" style={{ fontSize: 11.5 }}>
                      {m.email}
                      {m.personName && <> · linked to {m.personName}</>}
                      {m.mustChangePassword && !m.passwordExpired && <> · <span className="text-warning">{m.tempPasswordExpired ? 'temp password expired' : 'temp password'}</span></>}
                      {m.passwordExpired && <> · <span className="text-warning">password expired</span></>}
                    </div>
                  </td>
                  <td>
                    {isOwner && m.id !== data.myId ? (
                      <select className="select" style={{ width: 140, padding: '5px 8px', fontSize: 12.5 }}
                        value={m.role}
                        onChange={e => handleUpdate(m, { role: e.target.value },
                          `${m.email} is now ${ROLE_LABELS[e.target.value] || e.target.value}.`)}>
                        {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    ) : (
                      <span className={`badge ${ROLE_TONES[m.role] || 'badge-neutral'}`}>{ROLE_LABELS[m.role] || m.role}</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge status={m.isActive ? 'active' : 'inactive'} />
                    {m.locked && (
                      <div style={{ marginTop: 4 }}>
                        <span className="badge badge-danger" title="Too many wrong passwords">
                          Locked{m.lockedUntil ? ` until ${dateTime(m.lockedUntil)}` : ''}
                        </span>
                      </div>
                    )}
                    {!m.locked && m.failedAttempts > 0 && (
                      <div className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>
                        {m.failedAttempts} wrong {m.failedAttempts === 1 ? 'password' : 'passwords'} since
                      </div>
                    )}
                  </td>
                  <td className="text-muted">{m.lastLoginAt ? dateTime(m.lastLoginAt) : 'Never'}</td>
                  <td className="text-muted">{formatDate(m.createdAt)}</td>
                  {isOwner && (
                    <td>
                      <div className="row-actions">
                        {m.locked && (
                          <button className="btn btn-primary btn-sm" onClick={() => handleUnlock(m)}>Unlock</button>
                        )}
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
              <input className="input" type="text" required minLength={minLength}
                placeholder={`At least ${minLength} characters`} value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} />
              <span className="hint">Share it securely. They must choose their own at first sign-in.</span>
            </div>
            <div className="field">
              <label>Role</label>
              <select className="select" value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value })}>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              {form.role === 'PAYROLL_VIEWER' && (
                <span className="hint">Opens every payroll page and report, and the people list, but cannot change anything. For an auditor or accountant.</span>
              )}
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
            <input className="input" type="text" required minLength={minLength} autoFocus
              placeholder={`At least ${minLength} characters`} value={newPassword}
              onChange={e => setNewPassword(e.target.value)} />
            <span className="hint">
              {resetModal?.id === data?.myId
                ? 'This changes your own password.'
                : 'A temporary password: they must choose their own at next sign-in, and they are signed out everywhere. It also unlocks the account.'}
            </span>
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
