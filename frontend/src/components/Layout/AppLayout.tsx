import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, useEnabledModules } from '../../store/authStore';
import { useTheme, resolveTheme, type ThemeMode } from '../../store/theme';
import { authAPI } from '../../api/auth';
import { LoadingBlock } from '../ui';
import CommandPalette from '../CommandPalette';
import ThemeCustomizer from '../ThemeCustomizer';
import { HOME_ITEM, ICON_PATHS, Icon, activeNav, navSectionsFor } from './nav';

// Which sidebar sections the user opened or closed by hand
const NAV_STATE_KEY = 'nav-sections';
const RAIL_KEY = 'nav-rail';
const readNavState = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(NAV_STATE_KEY) || '{}') || {}; } catch { return {}; }
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

const BrandMark = () => (
  <span className="brand-mark brand-logo">
    <img src="/brand-mark.png" alt="" width={34} height={34} />
  </span>
);

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const setOrg = useAuthStore(state => state.setOrg);
  const impersonation = useAuthStore(state => state.impersonation);
  const modules = useEnabledModules();

  const mode = useTheme(s => s.mode);
  const setMode = useTheme(s => s.setMode);
  const toggleTheme = useTheme(s => s.toggle);

  const exitSupport = () => {
    logout();
    window.location.href = '/platform';
  };
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [rail, setRail] = useState(() => {
    try { return localStorage.getItem(RAIL_KEY) === '1'; } catch { return false; }
  });
  const [acctOpen, setAcctOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [systemDark, setSystemDark] = useState(() => resolveTheme('system') === 'dark');
  const [navState, setNavState] = useState<Record<string, boolean>>(readNavState);
  const navRef = useRef<HTMLElement>(null);

  const sections = useMemo(() => navSectionsFor(user, modules), [user, modules]);

  // Refresh the plan context once on mount, so a plan change by the platform
  // owner takes effect on the next visit without needing to sign in again.
  useEffect(() => {
    authAPI.getCurrentUser()
      .then(res => { if (res.data?.org) setOrg(res.data.org); })
      .catch(() => { /* leave the stored context in place */ });
  }, [setOrg]);
  const active = activeNav(sections, location.pathname);
  const activeKey = active?.key ?? null;
  const activeItem = sections.flatMap(s => s.items).find(i => i.to === active?.to);
  const pageTitle = location.pathname === HOME_ITEM.to ? HOME_ITEM.label : (activeItem?.label || HOME_ITEM.label);
  // A short menu is shown whole; a long one opens only the section in use
  const linkCount = sections.reduce((n, s) => n + s.items.length, 0);
  const isOpen = (key: string) => navState[key] ?? (linkCount <= 12 || key === activeKey);

  const toggleSection = (key: string) => {
    const next = { ...navState, [key]: !isOpen(key) };
    setNavState(next);
    try { localStorage.setItem(NAV_STATE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  const toggleRail = () => {
    setRail(r => {
      const next = !r;
      try { localStorage.setItem(RAIL_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  };

  // Keep the quick theme toggle's icon correct when the OS switches while on "system"
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const resolved: 'light' | 'dark' = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  // Arriving in a section the user had closed opens it again
  useEffect(() => {
    if (!activeKey) return;
    setNavState(state => (state[activeKey] === false ? { ...state, [activeKey]: true } : state));
  }, [activeKey]);

  // Each page starts at the top; the drawer/menus close whenever navigation happens
  useEffect(() => {
    setNavOpen(false);
    setAcctOpen(false);
    setNotifOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // The current link is brought into view in a long menu
  useEffect(() => {
    navRef.current?.querySelector('.nav-link.active')?.scrollIntoView({ block: 'nearest' });
  }, [location.pathname, activeKey]);

  // Ctrl+K (⌘K on a Mac) opens the quick search from anywhere
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = (user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase();
  const fullName = user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'Account';

  // In rail (collapsed) mode the groups flatten to a single icon list
  const railItems = rail ? sections.flatMap(s => s.items) : [];

  return (
    <div className={`app-shell${rail ? ' rail' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="mobile-topbar">
        <button className="hamburger" onClick={() => setNavOpen(true)} aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <BrandMark />
        <span style={{ flex: 1 }}>Aveon HR</span>
        <button className="hamburger" onClick={toggleTheme} aria-label="Toggle theme">
          <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={20} className="" />
        </button>
        <button className="hamburger" onClick={() => setSearchOpen(true)} aria-label="Search">
          <Icon name="search" size={20} className="" />
        </button>
      </header>

      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}

      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        <div className="sidebar-brand">
          <BrandMark />
          <span className="brand-text">
            Aveon HR
            <span className="brand-sub">Aveon Infotech</span>
          </span>
        </div>

        <button className="sidebar-search" onClick={() => { setNavOpen(false); setSearchOpen(true); }}>
          <Icon name="search" size={15} />
          <span className="search-label">Search</span>
          <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>

        <nav className="sidebar-nav" ref={navRef} aria-label="Main">
          <NavLink to={HOME_ITEM.to} end className="nav-link" title={HOME_ITEM.label}>
            <Icon name={HOME_ITEM.icon} />
            <span className="nav-label">{HOME_ITEM.label}</span>
          </NavLink>

          {rail ? (
            railItems.map(item => (
              <Link key={item.to} to={item.to} title={item.label}
                className={`nav-link${item.to === active?.to ? ' active' : ''}`}
                aria-current={item.to === active?.to ? 'page' : undefined}>
                <Icon name={item.icon} />
                <span className="nav-label">{item.label}</span>
              </Link>
            ))
          ) : (
            sections.map(section => {
              const open = isOpen(section.key);
              return (
                <div key={section.key} className="nav-group">
                  <button className={`sidebar-section${section.key === activeKey ? ' current' : ''}`}
                    onClick={() => toggleSection(section.key)} aria-expanded={open}>
                    <span>{section.label}</span>
                    <Icon name="chevron" size={13} className={`section-chevron${open ? ' open' : ''}`} />
                  </button>
                  {open && section.items.map(item => (
                    <Link key={item.to} to={item.to} title={item.label}
                      className={`nav-link${item.to === active?.to ? ' active' : ''}`}
                      aria-current={item.to === active?.to ? 'page' : undefined}>
                      <Icon name={item.icon} />
                      <span className="nav-label">{item.label}</span>
                    </Link>
                  ))}
                </div>
              );
            })
          )}
        </nav>

        <div className="sidebar-footer">
          {user?.personId ? (
            <Link to={`/people/${user.personId}`} className="sidebar-user-link" title="View my profile">
              <div className="avatar">{initials}</div>
              <div className="sidebar-user">
                <div className="name">{fullName}</div>
                <div className="email">My profile</div>
              </div>
            </Link>
          ) : (
            <>
              <div className="avatar">{initials}</div>
              <div className="sidebar-user">
                <div className="name">{fullName}</div>
                <div className="email">{user?.email}</div>
              </div>
            </>
          )}
          <Link to="/change-password" className="icon-btn key-btn" title="Change password" aria-label="Change password">
            <Icon name="key" size={16} className="" />
          </Link>
          <button className="icon-btn" onClick={handleLogout} title="Sign out" aria-label="Sign out">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              {ICON_PATHS.logout}
            </svg>
          </button>
        </div>
      </aside>

      <div className="app-main">
        {impersonation && (
          <div className="impersonation-bar no-print">
            <span>
              <span aria-hidden>👁</span> Support session — viewing <strong>{impersonation.tenant}</strong>
              {impersonation.readOnly ? ' (read-only)' : ''} as {user?.email}
            </span>
            <button className="btn btn-sm" onClick={exitSupport}>Exit support</button>
          </div>
        )}

        <header className="topbar no-print">
          <div className="topbar-left">
            <button className="sidebar-collapse" onClick={toggleRail}
              title={rail ? 'Expand sidebar' : 'Collapse sidebar'} aria-label="Toggle sidebar">
              <Icon name="panelLeft" size={17} className="" />
            </button>
            <div className="topbar-ctx">
              <div className="title">{pageTitle}</div>
            </div>
          </div>

          <div className="topbar-right">
            <button className="topbar-search" onClick={() => setSearchOpen(true)}>
              <Icon name="search" size={15} className="" />
              <span>Search…</span>
              <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
            </button>

            <button className="topbar-btn" onClick={toggleTheme}
              title={resolved === 'dark' ? 'Switch to light' : 'Switch to dark'} aria-label="Toggle theme">
              <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={18} className="" />
            </button>

            <div className="dropdown">
              <button className={`topbar-btn${notifOpen ? ' on' : ''}`} onClick={() => { setNotifOpen(o => !o); setAcctOpen(false); }}
                aria-label="Notifications" aria-expanded={notifOpen}>
                <Icon name="bell" size={18} className="" />
              </button>
              {notifOpen && (
                <>
                  <div className="dropdown-backdrop" onClick={() => setNotifOpen(false)} />
                  <div className="dropdown-panel notif-panel">
                    <div className="dropdown-head"><div className="name">Notifications</div></div>
                    <div className="notif-empty">
                      <div className="big" aria-hidden>🔔</div>
                      You're all caught up.
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="dropdown">
              <button className="topbar-avatar avatar" onClick={() => { setAcctOpen(o => !o); setNotifOpen(false); }}
                aria-label="Account" aria-expanded={acctOpen}>{initials}</button>
              {acctOpen && (
                <>
                  <div className="dropdown-backdrop" onClick={() => setAcctOpen(false)} />
                  <div className="dropdown-panel">
                    <div className="dropdown-head">
                      <div className="avatar">{initials}</div>
                      <div style={{ minWidth: 0 }}>
                        <div className="name">{fullName}</div>
                        <div className="email">{user?.email}</div>
                      </div>
                    </div>
                    <div className="dropdown-title">Theme</div>
                    <div className="theme-row">
                      {([['light', 'sun', 'Light'], ['system', 'monitor', 'System'], ['dark', 'moon', 'Dark']] as [ThemeMode, string, string][]).map(([m, icon, label]) => (
                        <button key={m} className={`theme-opt${mode === m ? ' active' : ''}`} onClick={() => setMode(m)}>
                          <Icon name={icon} size={16} className="" />
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="dropdown-sep" />
                    {user?.personId && (
                      <Link className="dropdown-item" to={`/people/${user.personId}`}>
                        <Icon name="user" size={16} className="nav-icon" /> My profile
                      </Link>
                    )}
                    <Link className="dropdown-item" to="/change-password">
                      <Icon name="key" size={16} className="nav-icon" /> Change password
                    </Link>
                    <button className="dropdown-item danger" onClick={handleLogout}>
                      <Icon name="logout" size={16} className="nav-icon" /> Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="app-content" id="main">
          {user?.role === 'PAYROLL_VIEWER' && location.pathname.startsWith('/payroll') && (
            <div className="alert alert-info no-print" role="note">
              <span>ℹ</span>
              <span>View-only access: you can open every payroll page and report, but changes are not saved.</span>
            </div>
          )}
          {/* A page's code loads on first visit; the menu stays put meanwhile */}
          <Suspense fallback={<LoadingBlock label="Loading…" />}>
            <Outlet />
          </Suspense>
        </main>
      </div>

      {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
      <ThemeCustomizer />
    </div>
  );
}
