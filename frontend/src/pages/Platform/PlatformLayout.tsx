import { Outlet, Link, useNavigate } from 'react-router-dom';
import { usePlatformStore } from '../../store/platformStore';

// A deliberately minimal shell for the owner console — no tenant sidebar, so
// it never looks or behaves like an organization workspace.
export default function PlatformLayout() {
  const navigate = useNavigate();
  const admin = usePlatformStore(s => s.admin);
  const logout = usePlatformStore(s => s.logout);

  const signOut = () => {
    logout();
    navigate('/platform/login');
  };

  return (
    <div className="platform-shell">
      <header className="platform-bar">
        <Link to="/platform" className="platform-brand">
          <span className="platform-mark">◆</span> Platform Console
        </Link>
        <div className="platform-bar-right">
          <span className="platform-owner">{admin?.email}</span>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main className="platform-main">
        <Outlet />
      </main>
    </div>
  );
}
