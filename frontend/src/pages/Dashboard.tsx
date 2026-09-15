import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { PageHeader } from '../components/ui';

const MODULES = [
  {
    to: '/income',
    icon: '₹',
    tone: 'tone-primary',
    name: 'Income',
    desc: 'Client billing, payments & analytics',
    live: true,
  },
  {
    to: '/recruitment',
    icon: '◎',
    tone: 'tone-warning',
    name: 'Recruitment',
    desc: 'Job postings & hiring pipeline',
    live: true,
  },
  {
    to: '/people',
    icon: '☰',
    tone: 'tone-info',
    name: 'People',
    desc: 'Candidates, interns & interviews',
    live: true,
  },
  {
    to: '/proposals',
    icon: '✎',
    tone: 'tone-success',
    name: 'Proposals',
    desc: 'Branded quotations from the module catalog',
    live: true,
  },
  {
    to: '/payroll',
    icon: '▦',
    tone: 'tone-primary',
    name: 'Payroll',
    desc: 'Monthly runs, salary register & payslips',
    live: true,
  },
];

// Which module cards each role sees (mirrors the API policy)
const MODULE_ROLES: Record<string, string[]> = {
  '/income': ['SUPER_ADMIN', 'EMPLOYEE'],
  '/recruitment': ['SUPER_ADMIN', 'HR'],
  '/people': ['SUPER_ADMIN', 'HR', 'EMPLOYEE'],
  '/proposals': ['SUPER_ADMIN'],
  '/payroll': ['SUPER_ADMIN', 'HR'],
};

export default function Dashboard() {
  const user = useAuthStore(state => state.user);
  const firstName = user?.firstName || user?.email?.split('@')[0] || 'there';
  const role = user?.role || 'SUPER_ADMIN';
  const modules = MODULES.filter(m => (MODULE_ROLES[m.to] || []).includes(role));

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle="Here's what's available in your workspace."
      />

      <div className="module-grid">
        {modules.map(mod =>
          mod.live ? (
            <Link key={mod.name} to={mod.to!} className="module-card">
              <div className={`module-icon ${mod.tone}`}>{mod.icon}</div>
              <h3>{mod.name}</h3>
              <p>{mod.desc}</p>
            </Link>
          ) : (
            <div key={mod.name} className="module-card disabled">
              <div className={`module-icon ${mod.tone}`}>{mod.icon}</div>
              <h3>{mod.name}</h3>
              <p>{mod.desc}</p>
              <span className="soon">Coming soon</span>
            </div>
          )
        )}
      </div>
    </>
  );
}
