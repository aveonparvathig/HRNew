import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';
import { ErrorAlert } from '../../components/ui';
import { toast } from '../../components/feedback';

// Change your own password. Shown on its own, before anything else, when
// the password is a temporary one or has expired.
export default function ChangePassword() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => s.setUser);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [rules, setRules] = useState({ minLength: 8, historyCount: 0, expiryDays: 0 });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const forced = Boolean(user?.mustChangePassword);
  const expired = Boolean(user?.passwordExpired);

  useEffect(() => {
    apiClient.get('/auth/password-rules').then(res => setRules(res.data)).catch(() => { /* the server checks anyway */ });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < rules.minLength) { setError(`The new password must be at least ${rules.minLength} characters`); return; }
    if (newPassword !== confirm) { setError('The two new passwords do not match'); return; }
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/auth/change-password', { currentPassword, newPassword });
      if (user) setUser({ ...user, mustChangePassword: false, passwordExpired: false });
      toast.success('Password changed.');
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to change the password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="auth-center">
      <div className="card card-pad auth-card">
        <h2 className="auth-card-title">
          {forced ? 'Set your new password' : 'Change password'}
        </h2>
        <p className="auth-card-sub">
          {expired ? 'Your password has expired. Choose a new one to continue.'
            : forced ? 'Your account uses a temporary password. Choose your own to continue.'
            : 'Enter your current password, then the new one.'}
        </p>
        <ErrorAlert message={error} />
        <form onSubmit={handleSubmit} className="stack">
          <div className="field">
            <label>{forced && !expired ? 'Temporary password' : 'Current password'}</label>
            <input className="input" type="password" required autoFocus autoComplete="current-password"
              value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>New password</label>
            <input className="input" type="password" required minLength={rules.minLength} autoComplete="new-password"
              value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <span className="hint">
              At least {rules.minLength} characters.
              {rules.historyCount > 0 && ` Not one of your last ${rules.historyCount} passwords.`}
              {rules.expiryDays > 0 && ` It will need changing again in ${rules.expiryDays} days.`}
            </span>
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input className="input" type="password" required autoComplete="new-password"
              value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Change password'}
          </button>
          {!forced && <Link to="/dashboard" className="btn btn-ghost">Cancel</Link>}
        </form>
      </div>
    </div>
  );
}
