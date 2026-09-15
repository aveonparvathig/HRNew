import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { useAuthStore } from '../../store/authStore';

export default function ChangePassword() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const setUser = useAuthStore(s => (s as any).setUser || (() => {}));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const forced = Boolean(user?.mustChangePassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (newPassword !== confirm) { setError('Passwords do not match'); return; }
    setSaving(true);
    setError('');
    try {
      await apiClient.post('/auth/change-password', { currentPassword, newPassword });
      // Clear the forced flag locally and continue into the app
      const stored = JSON.parse(localStorage.getItem('auth-storage') || '{}');
      if (stored?.state?.user) {
        stored.state.user.mustChangePassword = false;
        localStorage.setItem('auth-storage', JSON.stringify(stored));
      }
      if (typeof setUser === 'function' && user) setUser({ ...user, mustChangePassword: false });
      navigate('/dashboard');
      window.location.reload();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)', padding: 16 }}>
      <div className="card card-pad" style={{ width: '100%', maxWidth: 420 }}>
        <h2 style={{ fontSize: 20, marginBottom: 6 }}>
          {forced ? 'Set your new password' : 'Change password'}
        </h2>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 18 }}>
          {forced
            ? 'Your account uses a temporary password — choose your own to continue.'
            : 'Enter your current password, then the new one.'}
        </p>
        {error && <div className="alert alert-error"><span>⚠</span>{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="field">
            <label>{forced ? 'Temporary password' : 'Current password'}</label>
            <input className="input" type="password" required autoFocus
              value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          </div>
          <div className="field">
            <label>New password</label>
            <input className="input" type="password" required minLength={8}
              value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <span className="hint">At least 8 characters</span>
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input className="input" type="password" required
              value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>
    </div>
  );
}
