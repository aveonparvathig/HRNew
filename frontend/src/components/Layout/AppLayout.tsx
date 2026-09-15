import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

// Stroke icon set (18px grid) — the design system replaces glyph characters.
const ICON_PATHS: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="8" height="10" rx="1.5" /><rect x="14" y="3" width="7" height="6" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="8" height="5" rx="1.5" /></>,
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-6" /><path d="M21 20H3" /></>,
  analytics: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6.4 6.4" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h6" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  transfer: <><path d="M8 4v12m0 0-3-3m3 3 3-3" /><path d="M16 20V8m0 0-3 3m3-3 3 3" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M21 19c0-2.2-1.8-4-4-4" /></>,
  kanban: <><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="10" rx="1.5" /><rect x="17" y="4" width="5" height="13" rx="1.5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
  pen: <><path d="M14 3v5h5" /><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M9 14l2 2 4-4" /></>,
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  browser: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></>,
  banknote: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M7 12h.01M17 12h.01" /></>,
  sliders: <><path d="M4 8h10M18 8h2M4 16h2M10 16h10" /><circle cx="16" cy="8" r="2.5" /><circle cx="8" cy="16" r="2.5" /></>,
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 8.5V21h14V8.5" /><path d="M10 21v-6h4v6" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  megaphone: <><path d="m3 11 14-6v14L3 13v-2Z" /><path d="M17 8a4 4 0 0 1 0 8" /><path d="M6.5 13.5V19a1.5 1.5 0 0 0 3 0v-4.5" /></>,
};

function Icon({ name }: { name: string }) {
  return (
    <svg className="nav-icon" width="17" height="17" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      {ICON_PATHS[name]}
    </svg>
  );
}

const NAV_ITEMS = [
  { to: '/dashboard', icon: 'dashboard', label: 'Dashboard', end: true },
];

const INCOME_ITEMS = [
  { to: '/income', icon: 'chart', label: 'Overview', end: true },
  { to: '/income/analytics', icon: 'analytics', label: 'Analytics', end: true },
  { to: '/income/clients', icon: 'building', label: 'Clients', end: false },
  { to: '/income/implementation', icon: 'layers', label: 'Implementation', end: true },
  { to: '/income/academic-years', icon: 'calendar', label: 'Billing Periods', end: true },
  { to: '/income/import-export', icon: 'transfer', label: 'Import / Export', end: true },
];

const PEOPLE_ITEMS = [
  { to: '/people', icon: 'users', label: 'People', end: true },
  { to: '/people/pipeline', icon: 'kanban', label: 'Pipeline', end: true },
  { to: '/people/openings', icon: 'briefcase', label: 'Job Openings', end: true },
  { to: '/recruitment', icon: 'megaphone', label: 'Recruitment', end: false },
  { to: '/expenses', icon: 'receipt', label: 'Expenses', end: false },
];

const PROPOSAL_ITEMS = [
  { to: '/proposals', icon: 'pen', label: 'Builder', end: true },
  { to: '/proposals/history', icon: 'history', label: 'History', end: true },
  { to: '/proposals/cms-features', icon: 'browser', label: 'CMS Features', end: true },
];

const PAYROLL_ITEMS = [
  { to: '/payroll', icon: 'banknote', label: 'Runs', end: true },
  { to: '/payroll/settings', icon: 'sliders', label: 'Settings', end: true },
];

const ORG_ITEMS = [
  { to: '/organization', icon: 'home', label: 'Company Profile', end: true },
  { to: '/organization/team', icon: 'users', label: 'Team', end: true },
];

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const [navOpen, setNavOpen] = useState(false);

  // Role-based navigation: the API enforces these same rules server-side
  const role = user?.role || 'SUPER_ADMIN';
  const isSA = role === 'SUPER_ADMIN';
  const isHR = role === 'HR';
  const showIncome = isSA || role === 'EMPLOYEE';
  const incomeItems = INCOME_ITEMS.filter(i =>
    isSA || !['/income/academic-years', '/income/import-export'].includes(i.to));
  const peopleItems = PEOPLE_ITEMS.filter(i =>
    (isSA || isHR) || ['/people', '/expenses'].includes(i.to));

  // Close the drawer whenever navigation happens
  useEffect(() => { setNavOpen(false); }, [location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = (user?.email?.[0] || 'U').toUpperCase();

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <button className="hamburger" onClick={() => setNavOpen(true)} aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <span className="brand-mark">₹</span>
        Aveon HR
      </header>

      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}

      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <span className="brand-mark">₹</span>
          <span>
            Aveon HR
            <span className="brand-sub">Aveon Infotech</span>
          </span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}

          {showIncome && (
            <>
              <div className="sidebar-section">Income</div>
              {incomeItems.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </>
          )}

          <div className="sidebar-section">People</div>
          {peopleItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
              <Icon name={item.icon} />
              {item.label}
            </NavLink>
          ))}

          {isSA && (
            <>
              <div className="sidebar-section">Sales</div>
              {PROPOSAL_ITEMS.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </>
          )}

          {(isSA || isHR) && (
            <>
              <div className="sidebar-section">Payroll</div>
              {PAYROLL_ITEMS.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </>
          )}

          {isSA && (
            <>
              <div className="sidebar-section">Organization</div>
              {ORG_ITEMS.map(item => (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="avatar">{initials}</div>
          <div className="sidebar-user">
            <div className="name">{user?.firstName ? `${user.firstName} ${user.lastName || ''}` : 'Account'}</div>
            <div className="email">{user?.email}</div>
          </div>
          <button className="icon-btn" onClick={handleLogout} title="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              {ICON_PATHS.logout}
            </svg>
          </button>
        </div>
      </aside>

      <div className="app-main">
        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
