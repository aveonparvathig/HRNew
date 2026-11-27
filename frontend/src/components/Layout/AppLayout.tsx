import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore, useEnabledModules } from '../../store/authStore';
import { useTheme, resolveTheme, type ThemeMode } from '../../store/theme';
import { authAPI } from '../../api/auth';
import { LoadingBlock } from '../ui';
import CommandPalette from '../CommandPalette';
import ThemeCustomizer from '../ThemeCustomizer';
import { HOME_ITEM, Icon, activeNav, navSectionsFor, type NavItem } from './nav';

// Collapsed = only the icon rail shows; the sub-menu panel is hidden
const RAIL_KEY = 'nav-rail';
const HOME_KEY = 'home';

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
  const panelRef = useRef<HTMLElement>(null);

  const sections = useMemo(() => navSectionsFor(user, modules), [user, modules]);

  // Refresh the plan context once on mount, so a plan change by the platform
  // owner takes effect on the next visit without needing to sign in again.
  useEffect(() => {
    authAPI.getCurrentUser()
      .then(res => { if (res.data?.org) setOrg(res.data.org); })
      .catch(() => { /* leave the stored context in place */ });
  }, [setOrg]);
  const active = activeNav(sections, location.pathname);
  const activeKey = active?.key ?? HOME_KEY;
  const activeSection = sections.find(s => s.key === activeKey);
  const activeItem = activeSection?.items.find(i => i.to === active?.to);
  const pageTitle = location.pathname === HOME_ITEM.to ? HOME_ITEM.label : (activeItem?.label || HOME_ITEM.label);

  // The section whose sub-menu is showing: the one in use, until the user picks another on the rail
  const [picked, setPicked] = useState<string | null>(null);
  // In collapsed mode a picked section opens its sub-menu as a flyout
  const [flyout, setFlyout] = useState(false);
  const shownKey = picked ?? activeKey;
  const shownSection = sections.find(s => s.key === shownKey);

  // The home panel lists the dashboard and a shortcut into each section
  const homeItems: NavItem[] = [
    HOME_ITEM,
    ...sections.map(s => ({ to: s.items[0].to, icon: s.icon, label: s.label })),
  ];
  const panelItems = shownSection ? shownSection.items : homeItems;
  const panelTitle = shownSection ? shownSection.label : 'Overview';
  const panelLinkActive = (item: NavItem) => shownSection
    ? item.to === active?.to
    : item.to === HOME_ITEM.to && location.pathname === HOME_ITEM.to;

  const pickSection = (key: string) => {
    setPicked(key);
    if (rail) setFlyout(f => (key === shownKey ? !f : true));
  };

  const toggleRail = () => {
    setFlyout(false);
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

  // Each page starts at the top; the drawer, flyout and menus close whenever
  // navigation happens, and the sub-menu follows the page in use again
  useEffect(() => {
    setNavOpen(false);
    setAcctOpen(false);
    setNotifOpen(false);
    setFlyout(false);
    setPicked(null);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  // The current link is brought into view in a long sub-menu
  useEffect(() => {
    panelRef.current?.querySelector('.nav-link.active')?.scrollIntoView({ block: 'nearest' });
  }, [location.pathname, shownKey]);

  // Ctrl+K (⌘K on a Mac) opens the quick search from anywhere; Esc closes the flyout
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(open => !open);
      } else if (e.key === 'Escape') {
        setFlyout(false);
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

  const railButton = (key: string, icon: string, label: string) => (
    <button key={key} type="button" title={label}
      className={`rail-item${key === activeKey ? ' current' : ''}${key === shownKey && (!rail || flyout) ? ' open' : ''}`}
      onClick={() => pickSection(key)} aria-expanded={key === shownKey && (!rail || flyout)}
      aria-controls="nav-panel">
      <span className="rail-icon"><Icon name={icon} size={20} className="" /></span>
      <span className="rail-label">{label}</span>
    </button>
  );

  return (
    <div className={`app-shell${rail ? ' rail' : ''}${flyout ? ' flyout' : ''}`}>
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="mobile-topbar">
        <button className="hamburger" onClick={() => setNavOpen(true)} aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <BrandMark />
        <span className="grow-1">Aveon HR</span>
        <button className="hamburger" onClick={toggleTheme} aria-label="Toggle theme">
          <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={20} className="" />
        </button>
        <button className="hamburger" onClick={() => setSearchOpen(true)} aria-label="Search">
          <Icon name="search" size={20} className="" />
        </button>
      </header>

      {navOpen && <div className="nav-backdrop" onClick={() => setNavOpen(false)} />}
      {flyout && <div className="flyout-backdrop" onClick={() => setFlyout(false)} />}

      <aside className={`sidebar${navOpen ? ' open' : ''}`}>
        <nav className="nav-rail" aria-label="Sections">
          <Link to={HOME_ITEM.to} className="rail-brand" title="Aveon HR — Dashboard">
            <BrandMark />
          </Link>
          <div className="rail-items">
            {railButton(HOME_KEY, HOME_ITEM.icon, HOME_ITEM.label)}
            {sections.map(s => railButton(s.key, s.icon, s.label))}
          </div>
          <div className="rail-foot">
            {user?.personId ? (
              <Link to={`/people/${user.personId}`} className="rail-item" title="My profile">
                <span className="avatar">{initials}</span>
                <span className="rail-label">Profile</span>
              </Link>
            ) : (
              <span className="rail-item" title={fullName}>
                <span className="avatar">{initials}</span>
              </span>
            )}
            <button type="button" className="rail-item" onClick={handleLogout} title="Sign out">
              <span className="rail-icon"><Icon name="logout" size={19} className="" /></span>
              <span className="rail-label">Sign out</span>
            </button>
          </div>
        </nav>

        <nav className="nav-panel" id="nav-panel" ref={panelRef} aria-label={panelTitle}>
          <div className="panel-head">
            <div className="panel-title">{panelTitle}</div>
            <div className="panel-sub">Aveon HR</div>
          </div>
          <div className="panel-links">
            {panelItems.map(item => {
              const on = panelLinkActive(item);
              return (
                <Link key={item.to + item.label} to={item.to} title={item.label}
                  className={`nav-link${on ? ' active' : ''}`} aria-current={on ? 'page' : undefined}>
                  <Icon name={item.icon} />
                  <span className="nav-label">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
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
              title={rail ? 'Show the sub-menu' : 'Hide the sub-menu'} aria-label="Toggle sub-menu">
              <Icon name="panelLeft" size={17} className="" />
            </button>
            <div className="topbar-ctx">
              <div className="title">{pageTitle}</div>
              <div className="crumbs">
                <Link to={HOME_ITEM.to}>Home</Link>
                <Icon name="chevron" size={11} className="crumb-sep" />
                {activeSection ? activeSection.label : HOME_ITEM.label}
              </div>
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
              <Icon name={resolved === 'dark' ? 'sun' : 'moon'} size={19} className="" />
            </button>

            <div className="dropdown">
              <button className={`topbar-btn${notifOpen ? ' on' : ''}`} onClick={() => { setNotifOpen(o => !o); setAcctOpen(false); }}
                aria-label="Notifications" aria-expanded={notifOpen}>
                <Icon name="bell" size={19} className="" />
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
              <button className="topbar-user" onClick={() => { setAcctOpen(o => !o); setNotifOpen(false); }}
                aria-label="Account" aria-expanded={acctOpen}>
                <span className="topbar-user-name">{fullName}</span>
                <span className="topbar-avatar avatar">{initials}</span>
              </button>
              {acctOpen && (
                <>
                  <div className="dropdown-backdrop" onClick={() => setAcctOpen(false)} />
                  <div className="dropdown-panel">
                    <div className="dropdown-head">
                      <div className="avatar">{initials}</div>
                      <div className="min-w-0">
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
