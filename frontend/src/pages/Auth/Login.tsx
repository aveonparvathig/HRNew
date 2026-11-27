import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { authAPI } from '../../api/auth';
import { ErrorAlert } from '../../components/ui';
import { Icon } from '../../components/Layout/nav';
import { toast } from '../../components/feedback';

// The slides on the right-hand panel: what the suite does, one idea at a time
const SLIDES = [
  { icon: 'banknote', kicker: 'Payroll', title: 'Run payroll in a few clicks', text: 'Attendance, statutory deductions and payslips, month after month.' },
  { icon: 'users', kicker: 'People', title: 'Every employee in one place', text: 'Profiles, letters, documents and the org chart, always up to date.' },
  { icon: 'calendar', kicker: 'Leave', title: 'Leave and attendance, sorted', text: 'Requests, balances, rosters and holidays your team can see.' },
];
const SLIDE_MS = 6000;

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [slide, setSlide] = useState(0);
  const setTokens = useAuthStore(state => state.setTokens);
  const setUser = useAuthStore(state => state.setUser);
  const setOrg = useAuthStore(state => state.setOrg);

  // The panel moves on by itself, unless the reader prefers less motion
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setSlide(s => (s + 1) % SLIDES.length), SLIDE_MS);
    return () => window.clearInterval(id);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const response = await authAPI.login({ email, password });
      const { user, org, accessToken, refreshToken } = response.data;
      setUser(user);
      setOrg(org ?? null);
      setTokens(accessToken, refreshToken);
      const daysLeft = response.data.passwordExpiresInDays;
      if (daysLeft) {
        toast.info(`Your password expires in ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}. Change it from the key button beside your name.`);
      }
      navigate(response.data.user?.mustChangePassword ? '/change-password' : '/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const current = SLIDES[slide];

  return (
    <div className="login-page">
      <header className="login-top">
        <span className="brand-mark brand-logo"><img src="/brand-mark.png" alt="Aveon HR" width={44} height={44} /></span>
      </header>

      <main className="login-main">
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-brand">
            <img src="/brand-mark.png" alt="" width={40} height={40} />
            <span>Aveon <strong>HR</strong></span>
          </div>
          <h1 id="login-title">Hello there!</h1>
          <p className="login-sub">Sign in to your workspace to continue.</p>

          <ErrorAlert message={error} />

          <form onSubmit={handleSubmit} className="login-form">
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
                autoFocus
                required
              />
            </div>

            <div className="field">
              <label htmlFor="password">Password</label>
              <div className="login-password">
                <input
                  id="password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Password"
                  autoComplete="current-password"
                  required
                />
                <button type="button" className="login-eye" onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}>
                  <Icon name={showPassword ? 'eyeOff' : 'eye'} size={18} className="" />
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary login-submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Login'}
            </button>
          </form>

          <p className="login-switch">
            Don&apos;t have an account? <Link to="/register">Create one</Link>
          </p>
        </section>

        <aside className="login-promo" aria-label="About Aveon HR">
          <div className="promo-card">
            <div className="promo-art" aria-hidden>
              <span className="promo-blob one" />
              <span className="promo-blob two" />
              <span className="promo-icon"><Icon name={current.icon} size={44} className="" /></span>
              <span className="promo-chip c1"><Icon name="checkCircle" size={14} className="" />Payslips</span>
              <span className="promo-chip c2"><Icon name="checkCircle" size={14} className="" />Leave</span>
              <span className="promo-chip c3"><Icon name="checkCircle" size={14} className="" />Compliance</span>
            </div>
            <div className="promo-copy" key={slide}>
              <span className="promo-kicker">{current.kicker}</span>
              <h2>{current.title}</h2>
              <p>{current.text}</p>
            </div>
          </div>
          <div className="promo-caption">
            <strong>Aveon HR Business Suite</strong>
            <span>Payroll · People · Leave · Projects</span>
          </div>
          <div className="promo-dots" role="tablist" aria-label="Slides">
            {SLIDES.map((s, i) => (
              <button key={s.kicker} type="button" role="tab" aria-selected={i === slide}
                aria-label={s.kicker} className={i === slide ? 'on' : ''} onClick={() => setSlide(i)} />
            ))}
          </div>
        </aside>
      </main>

      <footer className="login-foot">
        © {new Date().getFullYear()} Aveon Infotech Private Limited
      </footer>
    </div>
  );
}
