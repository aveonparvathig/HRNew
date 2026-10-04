import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlatformStore } from '../../store/platformStore';
import { platformAPI } from '../../api/platform';
import { ErrorAlert } from '../../components/ui';

export default function PlatformLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setAdmin = usePlatformStore(s => s.setAdmin);
  const setTokens = usePlatformStore(s => s.setTokens);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await platformAPI.login(email, password);
      setAdmin(res.data.admin);
      setTokens(res.data.accessToken, res.data.refreshToken);
      navigate('/platform');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Sign-in failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero" style={{ background: 'linear-gradient(135deg, #0f172a, #312e81)' }}>
        <div className="brand"><span className="brand-mark">◆</span> Platform Console</div>
        <div className="auth-hero-copy">
          <h2>Run the whole platform.</h2>
          <p>Manage every organization on Aveon HR — usage, lifecycle, plans and support — from one owner console.</p>
          <div className="auth-hero-features">
            <div className="feat"><span className="check">✓</span> Every tenant at a glance</div>
            <div className="feat"><span className="check">✓</span> Suspend &amp; reactivate instantly</div>
            <div className="feat"><span className="check">✓</span> Separate from any tenant workspace</div>
          </div>
        </div>
        <div className="fineprint">© {new Date().getFullYear()} Aveon HR · Platform Operations</div>
      </div>

      <div className="auth-form-side">
        <div className="auth-form">
          <h1>Owner sign-in</h1>
          <p className="sub">This console is separate from your organization workspace.</p>
          <ErrorAlert message={error} />
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="pemail">Email</label>
              <input id="pemail" className="input" type="email" value={email}
                onChange={e => setEmail(e.target.value)} placeholder="owner@platform.local"
                autoComplete="email" required />
            </div>
            <div className="field">
              <label htmlFor="ppassword">Password</label>
              <input id="ppassword" className="input" type="password" value={password}
                onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                autoComplete="current-password" required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in to console'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
