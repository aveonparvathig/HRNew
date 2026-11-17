import { useState, useEffect, useCallback } from 'react';
import { orgAPI } from '../../api/org';
import {
  PageHeader, LoadingBlock, ErrorAlert, Modal, StatusBadge, SuccessAlert,
} from '../../components/ui';
import { formatDate } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';
import { Button } from '../../components/Button';

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
            <Button icon="key" disabled={saving} onClick={async () => {
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
              } catch {
                setError('Failed to generate logins');
              } finally {
                setSaving(false);
              }
            }}>
              Generate employee logins{data?.employeesWithoutLogin ? ` (${data.employeesWithoutLogin})` : ''}
            </Button>
            <Button variant="accent" icon="userPlus" onClick={() => { setForm(EMPTY_MEMBER); setAddModal(true); }}>
              Add member
            </Button>
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
                    <span className="og-strong">
                      {[m.firstName, m.lastName].filter(Boolean).join(' ') || m.email}
                      {m.id === data.myId && <span className="badge badge-info og-badge-gap">you</span>}
                    </span>
                    <div className="og-sub">
                      {m.email}
                      {m.personName && <> · linked to {m.personName}</>}
                      {m.mustChangePassword && !m.passwordExpired && <> · <span className="text-warning">{m.tempPasswordExpired ? 'temp password expired' : 'temp password'}</span></>}
                      {m.passwordExpired && <> · <span className="text-warning">password expired</span></>}
                    </div>
                  </td>
                  <td>
                    {isOwner && m.id !== data.myId ? (
                      <select className="select og-role-select" aria-label={`Role of ${m.email}`}
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
                      <div className="og-mt-4">
                        <span className="badge badge-danger" title="Too many wrong passwords">
                          Locked{m.lockedUntil ? ` until ${dateTime(m.lockedUntil)}` : ''}
                        </span>
                      </div>
                    )}
                    {!m.locked && m.failedAttempts > 0 && (
                      <div className="og-sub og-mt-4">
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
                          <Button size="sm" onClick={() => handleUnlock(m)}>Unlock</Button>
                        )}
                        <Button size="sm"
                          onClick={() => { setNewPassword(''); setResetModal(m); }}>
                          Reset password
                        </Button>
                        {m.id !== data.myId && (
                          <Button variant="ghost" size="sm"
                            onClick={() => handleUpdate(m, { isActive: !m.isActive },
                              m.isActive ? `${m.email} disabled — they can no longer sign in.` : `${m.email} re-enabled.`)}>
                            {m.isActive ? 'Disable' : 'Enable'}
                          </Button>
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
      <Modal title="Add team member" open={addModal} onClose={() => setAddModal(false)}>
        <form onSubmit={handleAdd}>
          <div className="form-grid mb-14">
            <div className="field">
              <label htmlFor="og-member-first">First name</label>
              <input id="og-member-first" className="input" value={form.firstName}
                onChange={e => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="og-member-last">Last name</label>
              <input id="og-member-last" className="input" value={form.lastName}
                onChange={e => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div className="field mb-14">
            <label htmlFor="og-member-email">Email *</label>
            <input id="og-member-email" className="input" type="email" required autoFocus value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="og-member-password">Temporary password *</label>
              <input id="og-member-password" className="input" type="text" required minLength={minLength}
                placeholder={`At least ${minLength} characters`} value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })} />
              <span className="hint">Share it securely. They must choose their own at first sign-in.</span>
            </div>
            <div className="field">
              <label htmlFor="og-member-role">Role</label>
              <select id="og-member-role" className="select" value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value })}>
                {ROLE_OPTIONS.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              {form.role === 'PAYROLL_VIEWER' && (
                <span className="hint">Opens every payroll page and report, and the people list, but cannot change anything. For an auditor or accountant.</span>
              )}
            </div>
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setAddModal(false)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>
              {saving ? 'Adding…' : 'Add member'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset password */}
      <Modal title={resetModal ? `Reset password — ${resetModal.email}` : ''}
        open={Boolean(resetModal)} onClose={() => setResetModal(null)}>
        <form onSubmit={handleReset}>
          <div className="field">
            <label htmlFor="og-reset-password">New password *</label>
            <input id="og-reset-password" className="input" type="text" required minLength={minLength} autoFocus
              placeholder={`At least ${minLength} characters`} value={newPassword}
              onChange={e => setNewPassword(e.target.value)} />
            <span className="hint">
              {resetModal?.id === data?.myId
                ? 'This changes your own password.'
                : 'A temporary password: they must choose their own at next sign-in, and they are signed out everywhere. It also unlocks the account.'}
            </span>
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setResetModal(null)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>
              {saving ? 'Resetting…' : 'Reset password'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
