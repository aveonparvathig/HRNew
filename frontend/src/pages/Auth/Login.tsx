import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authAPI } from '../../api/auth';
import { ErrorAlert } from '../../components/ui';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setTokens = useAuthStore(state => state.setTokens);
  const setUser = useAuthStore(state => state.setUser);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authAPI.login({ email, password });
      const { user, accessToken, refreshToken } = response.data;
      setUser(user);
      setTokens(accessToken, refreshToken);
      navigate(response.data.user?.mustChangePassword ? '/change-password' : '/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="brand">
          <span className="brand-mark">₹</span>
          Aveon HR
        </div>
        <div className="auth-hero-copy">
          <h2>Run your business finances in one place.</h2>
          <p>Track client billing, record payments, and keep your income analytics up to date — built for modern teams.</p>
          <div className="auth-hero-features">
            <div className="feat"><span className="check">✓</span> Client billing &amp; payment tracking</div>
            <div className="feat"><span className="check">✓</span> Real-time income analytics</div>
            <div className="feat"><span className="check">✓</span> Multi-tenant organization support</div>
          </div>
        </div>
        <div className="fineprint">© {new Date().getFullYear()} Aveon HR · Aveon Infotech Private Limited</div>
      </div>

      <div className="auth-form-side">
        <div className="auth-form">
          <h1>Welcome back</h1>
          <p className="sub">Sign in to your workspace to continue.</p>

          <ErrorAlert message={error} />

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                className="input"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="switch">
            Don&apos;t have an account? <Link to="/register">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
