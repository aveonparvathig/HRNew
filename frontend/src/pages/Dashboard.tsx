import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore, useEnabledModules } from '../store/authStore';
import { payrollAPI } from '../api/payroll';
import { Icon } from '../components/Layout/nav';
import { formatINR } from '../utils/format';
import HrPanel from '../components/HrPanel';

const MODULES = [
  { to: '/income', icon: 'chart', tone: 'tone-blue', name: 'Project', desc: 'Client billing, payments & analytics' },
  { to: '/recruitment', icon: 'megaphone', tone: 'tone-violet', name: 'Recruitment', desc: 'Job postings & hiring pipeline' },
  { to: '/people', icon: 'users', tone: 'tone-indigo', name: 'People', desc: 'Employees, candidates, interns & interviews' },
  { to: '/expenses', icon: 'receipt', tone: 'tone-amber', name: 'Expenses', desc: 'Expense reports and claims' },
  { to: '/leave', icon: 'calendar', tone: 'tone-teal', name: 'Leave', desc: 'Apply for leave, balances & holidays' },
  { to: '/proposals', icon: 'pen', tone: 'tone-rose', name: 'Proposals', desc: 'Branded quotations from the module catalog' },
  { to: '/payroll', icon: 'banknote', tone: 'tone-green', name: 'Payroll', desc: 'Monthly runs, statutory returns & payslips' },
  { to: '/my/payslips', icon: 'banknote', tone: 'tone-cyan', name: 'My Pay', desc: 'Your payslips, tax declaration and loans' },
  { to: '/organization', icon: 'home', tone: 'tone-blue', name: 'Organization', desc: 'Company settings, bank accounts and lists' },
];

// A tile's gated module, if any (core tiles are always shown)
const TILE_MODULE: Record<string, string> = {
  '/income': 'project', '/recruitment': 'recruitment', '/expenses': 'expenses',
  '/proposals': 'proposals', '/payroll': 'payroll', '/leave': 'leave',
};

// Which module cards each role sees (mirrors the API policy)
const ALL = ['SUPER_ADMIN', 'HR', 'PAYROLL_VIEWER', 'EMPLOYEE', 'MARKETING'];
const MODULE_ROLES: Record<string, string[]> = {
  '/income': ['SUPER_ADMIN', 'EMPLOYEE'],
  '/recruitment': ['SUPER_ADMIN', 'HR'],
  '/people': ['SUPER_ADMIN', 'HR', 'PAYROLL_VIEWER', 'EMPLOYEE'],
  '/expenses': ALL,
  '/leave': ALL,
  '/proposals': ['SUPER_ADMIN', 'MARKETING'],
  '/payroll': ['SUPER_ADMIN', 'HR', 'PAYROLL_VIEWER'],
  '/my/payslips': ALL, // shown only when the login is linked to a person
  '/organization': ['SUPER_ADMIN', 'HR'],
};

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const greeting = () => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
};

// What the latest payroll month is waiting for
const NEXT_STEP: Record<string, { text: string; action: string; tone: string }> = {
  INPUTS_OPEN: { text: 'Attendance and one-off inputs are open.', action: 'Continue the run', tone: 'badge-warning' },
  INPUTS_LOCKED: { text: 'Inputs are locked. Review the figures and finalize.', action: 'Review and finalize', tone: 'badge-warning' },
  FINALIZED: { text: 'Payroll is locked. Payslips are not released to employees yet.', action: 'Open the run', tone: 'badge-info' },
  RELEASED: { text: 'Payslips are released. Salary payment is not recorded yet.', action: 'Record the payout', tone: 'badge-info' },
  PAID: { text: 'Paid and closed.', action: 'Open the run', tone: 'badge-success' },
};

function PayrollStatus() {
  const [runs, setRuns] = useState<any[] | null>(null);

  useEffect(() => {
    payrollAPI.getRuns().then(res => setRuns(res.data?.runs || [])).catch(() => setRuns(null));
  }, []);

  if (!runs) return null;
  const latest = runs[0];
  const thisMonth = new Date().toISOString().slice(0, 7);

  if (!latest) {
    return (
      <div className="card status-card mb-24">
        <div className="status-main">
          <div className="status-title">Payroll</div>
          <p className="text-muted">No payroll run yet. Start the first month to see it here.</p>
        </div>
        <Link to="/payroll" className="btn btn-primary">Go to payroll</Link>
      </div>
    );
  }

  const step = NEXT_STEP[latest.stage?.key] || NEXT_STEP.FINALIZED;
  const settled = latest.stage?.finalized;
  return (
    <div className="card status-card mb-24">
      <div className="status-main">
        <div className="status-title">
          Payroll — {monthLabel(latest.period)}
          <span className={`badge ${step.tone}`}><span className="dot" />{latest.stage?.label || latest.status}</span>
        </div>
        <p className="text-muted">
          {step.text}
          {settled && latest.period < thisMonth && <> The {monthLabel(thisMonth)} run has not been started.</>}
        </p>
      </div>
      <div className="status-figures">
        <div><span>Net payable</span><strong>{formatINR(latest.totals?.net)}</strong></div>
        <div><span>Employees</span><strong>{latest.totals?.employees ?? '—'}</strong></div>
      </div>
      <div className="status-actions">
        <Link to={latest.stage?.key === 'RELEASED' ? `/payroll/runs/${latest.id}/payout` : `/payroll/runs/${latest.id}`}
          className="btn btn-primary">{step.action}</Link>
        {settled && latest.period < thisMonth && <Link to="/payroll" className="btn btn-secondary">Start {monthLabel(thisMonth).split(' ')[0]}</Link>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const user = useAuthStore(state => state.user);
  const firstName = user?.firstName || user?.email?.split('@')[0] || 'there';
  const role = user?.role || 'SUPER_ADMIN';
  const staff = ['SUPER_ADMIN', 'HR', 'PAYROLL_VIEWER'].includes(role);
  const managesPeople = role === 'SUPER_ADMIN' || role === 'HR';
  const enabledModules = useEnabledModules();
  const modules = MODULES.filter(m =>
    (MODULE_ROLES[m.to] || []).includes(role)
    && (m.to !== '/my/payslips' || Boolean(user?.personId))
    && (!TILE_MODULE[m.to] || enabledModules.includes(TILE_MODULE[m.to])));
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const initials = (user?.firstName?.[0] || user?.email?.[0] || 'U').toUpperCase();

  useEffect(() => { document.title = 'Dashboard · Aveon HR'; return () => { document.title = 'Aveon HR'; }; }, []);

  return (
    <>
      <section className="hero-banner no-print">
        <div className="hero-avatar">{initials}</div>
        <div className="hero-copy">
          <h1>{greeting()}, {firstName}</h1>
          <p>{today}</p>
        </div>
        <div className="hero-actions">
          {staff && <Link to="/payroll" className="btn btn-primary"><Icon name="banknote" size={16} className="" />Payroll</Link>}
          {managesPeople && <Link to="/people" className="btn btn-hero-ghost"><Icon name="users" size={16} className="" />People</Link>}
          {user?.personId && <Link to="/my/payslips" className="btn btn-hero-ghost"><Icon name="banknote" size={16} className="" />My payslips</Link>}
        </div>
      </section>

      {staff && <PayrollStatus />}

      {managesPeople && <HrPanel />}

      <h2 className="section-title" style={{ marginTop: 0 }}>Your workspace</h2>
      <div className="module-grid">
        {modules.map(mod => (
          <Link key={mod.name} to={mod.to} className="module-card">
            <div className={`module-icon ${mod.tone}`}><Icon name={mod.icon} size={21} className="" /></div>
            <h3>{mod.name}</h3>
            <p>{mod.desc}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
