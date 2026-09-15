import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authAPI } from '../../api/auth';
import { ErrorAlert } from '../../components/ui';

export default function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    organizationName: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const setTokens = useAuthStore(state => state.setTokens);
  const setUser = useAuthStore(state => state.setUser);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authAPI.signup(formData);
      const { user, accessToken, refreshToken } = response.data;
      setUser(user);
      setTokens(accessToken, refreshToken);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.');
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
          <h2>Set up your workspace in under a minute.</h2>
          <p>Create your organization, invite your team, and start tracking client income right away.</p>
          <div className="auth-hero-features">
            <div className="feat"><span className="check">✓</span> Free to get started</div>
            <div className="feat"><span className="check">✓</span> Your data stays isolated per organization</div>
            <div className="feat"><span className="check">✓</span> Payroll &amp; recruitment modules coming soon</div>
          </div>
        </div>
        <div className="fineprint">© {new Date().getFullYear()} Aveon HR · Aveon Infotech Private Limited</div>
      </div>

      <div className="auth-form-side">
        <div className="auth-form">
          <h1>Create your account</h1>
          <p className="sub">Start managing your organization&apos;s income.</p>

          <ErrorAlert message={error} />

          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="organizationName">Organization name</label>
              <input
                id="organizationName"
                name="organizationName"
                className="input"
                type="text"
                value={formData.organizationName}
                onChange={handleChange}
                placeholder="Acme Pvt Ltd"
                required
              />
            </div>

            <div className="form-grid" style={{ marginBottom: 16 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="firstName">First name</label>
                <input
                  id="firstName"
                  name="firstName"
                  className="input"
                  type="text"
                  value={formData.firstName}
                  onChange={handleChange}
                  placeholder="John"
                />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="lastName">Last name</label>
                <input
                  id="lastName"
                  name="lastName"
                  className="input"
                  type="text"
                  value={formData.lastName}
                  onChange={handleChange}
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="email">Work email</label>
              <input
                id="email"
                name="email"
                className="input"
                type="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                className="input"
                type="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="switch">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
