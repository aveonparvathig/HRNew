import { Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { LoadingBlock } from '../ui';
import CommandPalette from '../CommandPalette';
import { HOME_ITEM, ICON_PATHS, Icon, activeNav, navSectionsFor } from './nav';

// Which sidebar sections the user opened or closed by hand
const NAV_STATE_KEY = 'nav-sections';
const readNavState = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(NAV_STATE_KEY) || '{}') || {}; } catch { return {}; }
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore(state => state.user);
  const logout = useAuthStore(state => state.logout);
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [navState, setNavState] = useState<Record<string, boolean>>(readNavState);
  const navRef = useRef<HTMLElement>(null);

  const sections = useMemo(() => navSectionsFor(user), [user]);
  const active = activeNav(sections, location.pathname);
  const activeKey = active?.key ?? null;
  // A short menu is shown whole; a long one opens only the section in use
  const linkCount = sections.reduce((n, s) => n + s.items.length, 0);
  const isOpen = (key: string) => navState[key] ?? (linkCount <= 12 || key === activeKey);

  const toggleSection = (key: string) => {
    const next = { ...navState, [key]: !isOpen(key) };
    setNavState(next);
    try { localStorage.setItem(NAV_STATE_KEY, JSON.stringify(next)); } catch { /* private mode */ }
  };

  // Arriving in a section the user had closed opens it again
  useEffect(() => {
    if (!activeKey) return;
    setNavState(state => (state[activeKey] === false ? { ...state, [activeKey]: true } : state));
  }, [activeKey]);

  // Each page starts at the top; the drawer closes whenever navigation happens
  useEffect(() => {
    setNavOpen(false);
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

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Skip to content</a>

      <header className="mobile-topbar">
        <button className="hamburger" onClick={() => setNavOpen(true)} aria-label="Open menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <span className="brand-mark">₹</span>
        <span style={{ flex: 1 }}>Aveon HR</span>
        <button className="hamburger" onClick={() => setSearchOpen(true)} aria-label="Search">
          <Icon name="search" size={20} className="" />
        </button>
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

        <button className="sidebar-search" onClick={() => { setNavOpen(false); setSearchOpen(true); }}>
          <Icon name="search" size={15} />
          <span>Search</span>
          <kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>

        <nav className="sidebar-nav" ref={navRef} aria-label="Main">
          <NavLink to={HOME_ITEM.to} end className="nav-link">
            <Icon name={HOME_ITEM.icon} />
            {HOME_ITEM.label}
          </NavLink>

          {sections.map(section => {
            const open = isOpen(section.key);
            return (
              <div key={section.key} className="nav-group">
                <button className={`sidebar-section${section.key === activeKey ? ' current' : ''}`}
                  onClick={() => toggleSection(section.key)} aria-expanded={open}>
                  <span>{section.label}</span>
                  <Icon name="chevron" size={13} className={`section-chevron${open ? ' open' : ''}`} />
                </button>
                {open && section.items.map(item => (
                  <Link key={item.to} to={item.to} className={`nav-link${item.to === active?.to ? ' active' : ''}`}
                    aria-current={item.to === active?.to ? 'page' : undefined}>
                    <Icon name={item.icon} />
                    {item.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          {user?.personId ? (
            <Link to={`/people/${user.personId}`} className="sidebar-user-link" title="View my profile">
              <div className="avatar">{initials}</div>
              <div className="sidebar-user">
                <div className="name">{user?.firstName ? `${user.firstName} ${user.lastName || ''}` : 'Account'}</div>
                <div className="email">My profile</div>
              </div>
            </Link>
          ) : (
            <>
              <div className="avatar">{initials}</div>
              <div className="sidebar-user">
                <div className="name">{user?.firstName ? `${user.firstName} ${user.lastName || ''}` : 'Account'}</div>
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
    </div>
  );
}
