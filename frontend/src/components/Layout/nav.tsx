// The app's navigation: one definition shared by the sidebar, the quick
// search and the dashboard.

// Stroke icon set (18px grid) — the design system replaces glyph characters.
export const ICON_PATHS: Record<string, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="8" height="10" rx="1.5" /><rect x="14" y="3" width="7" height="6" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="8" height="5" rx="1.5" /></>,
  chart: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-6" /><path d="M21 20H3" /></>,
  analytics: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9l6.4 6.4" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h6" /></>,
  layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  transfer: <><path d="M8 4v12m0 0-3-3m3 3 3-3" /><path d="M16 20V8m0 0-3 3m3-3 3 3" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.5" /><path d="M21 19c0-2.2-1.8-4-4-4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>,
  kanban: <><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="10" rx="1.5" /><rect x="17" y="4" width="5" height="13" rx="1.5" /></>,
  briefcase: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>,
  pen: <><path d="M14 3v5h5" /><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M9 14l2 2 4-4" /></>,
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  browser: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 4v5" /></>,
  banknote: <><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M7 12h.01M17 12h.01" /></>,
  sliders: <><path d="M4 8h10M18 8h2M4 16h2M10 16h10" /><circle cx="16" cy="8" r="2.5" /><circle cx="8" cy="16" r="2.5" /></>,
  home: <><path d="m3 10 9-7 9 7" /><path d="M5 8.5V21h14V8.5" /><path d="M10 21v-6h4v6" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9" /><path d="m16 7 3 3" /><path d="m19 4 2 2" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.5 3.2 8 8 9 4.8-1 8-4.5 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></>,
  pin: <><path d="M12 21s-7-6.1-7-11a7 7 0 0 1 14 0c0 4.9-7 11-7 11Z" /><circle cx="12" cy="10" r="2.5" /></>,
  megaphone: <><path d="m3 11 14-6v14L3 13v-2Z" /><path d="M17 8a4 4 0 0 1 0 8" /><path d="M6.5 13.5V19a1.5 1.5 0 0 0 3 0v-4.5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.8-3.8" /></>,
  chevron: <path d="m9 6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
};

export function Icon({ name, size = 17, className = 'nav-icon' }: { name: string; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

// `also`: other path prefixes that belong to this link (pages reached from it)
export interface NavItem { to: string; icon: string; label: string; also?: string[] }
export interface NavSection { key: string; label: string; items: NavItem[] }

export const HOME_ITEM: NavItem = { to: '/dashboard', icon: 'dashboard', label: 'Dashboard' };

const INCOME_ITEMS: NavItem[] = [
  { to: '/income', icon: 'chart', label: 'Overview' },
  { to: '/income/analytics', icon: 'analytics', label: 'Analytics' },
  { to: '/income/clients', icon: 'building', label: 'Clients' },
  { to: '/income/implementation', icon: 'layers', label: 'Implementation' },
  { to: '/income/implementation/visits', icon: 'pin', label: 'Client Visits' },
  { to: '/income/academic-years', icon: 'calendar', label: 'Billing Periods' },
  { to: '/income/import-export', icon: 'transfer', label: 'Import / Export' },
];

const PEOPLE_ITEMS: NavItem[] = [
  { to: '/people', icon: 'users', label: 'People' },
  { to: '/people/org-chart', icon: 'layers', label: 'Organization Chart' },
  { to: '/people/pipeline', icon: 'kanban', label: 'Pipeline' },
  { to: '/people/openings', icon: 'briefcase', label: 'Job Openings' },
  { to: '/recruitment', icon: 'megaphone', label: 'Recruitment' },
  { to: '/expenses', icon: 'receipt', label: 'Expenses' },
];

const PROPOSAL_ITEMS: NavItem[] = [
  { to: '/proposals', icon: 'pen', label: 'Builder' },
  { to: '/proposals/history', icon: 'history', label: 'History' },
  { to: '/proposals/cms-features', icon: 'browser', label: 'CMS Features' },
];

// Shown to anyone whose login is linked to a person record
const MY_PAY_ITEMS: NavItem[] = [
  { to: '/my/payslips', icon: 'banknote', label: 'My Payslips' },
  { to: '/my/declaration', icon: 'pen', label: 'My Tax Declaration' },
  { to: '/my/loans', icon: 'layers', label: 'My Loans' },
];

const PAYROLL_ITEMS: NavItem[] = [
  { to: '/payroll', icon: 'banknote', label: 'Runs' },
  { to: '/payroll/loans', icon: 'layers', label: 'Loans' },
  { to: '/payroll/adjustments', icon: 'transfer', label: 'Arrears & Settlements', also: ['/payroll/settlements'] },
  { to: '/payroll/declarations', icon: 'pen', label: 'Tax Declarations' },
  { to: '/payroll/tds', icon: 'calendar', label: 'TDS Returns' },
  { to: '/payroll/reports', icon: 'chart', label: 'Reports' },
  { to: '/payroll/remittances', icon: 'receipt', label: 'Statutory Payments' },
  { to: '/payroll/audit-log', icon: 'history', label: 'Audit Log' },
  { to: '/payroll/settings', icon: 'sliders', label: 'Settings' },
];

const ORG_ITEMS: NavItem[] = [
  { to: '/organization', icon: 'home', label: 'Company Settings' },
  { to: '/organization/team', icon: 'users', label: 'Team' },
  { to: '/organization/security', icon: 'shield', label: 'Security' },
];

// Role-based navigation: the API enforces these same rules server-side
export function navSectionsFor(user: { role?: string; personId?: string | null } | null): NavSection[] {
  const role = user?.role || 'SUPER_ADMIN';
  const isSA = role === 'SUPER_ADMIN';
  const isHR = role === 'HR';
  const isMarketing = role === 'MARKETING';
  const sections: NavSection[] = [];

  if (isSA || role === 'EMPLOYEE') {
    sections.push({
      key: 'income', label: 'Income',
      items: INCOME_ITEMS.filter(i => isSA || !['/income/academic-years', '/income/import-export'].includes(i.to)),
    });
  }
  sections.push({
    key: 'people', label: isMarketing ? 'Expenses' : 'People',
    items: PEOPLE_ITEMS.filter(i =>
      (isSA || isHR) ? true
        : isMarketing ? i.to === '/expenses' // marketing: own expenses only
        : ['/people', '/people/org-chart', '/expenses'].includes(i.to)),
  });
  if (user?.personId) sections.push({ key: 'my', label: 'My Pay', items: MY_PAY_ITEMS });
  if (isSA || isMarketing) sections.push({ key: 'sales', label: 'Sales', items: PROPOSAL_ITEMS });
  // The payroll viewer reads the same pages; the API refuses any change
  if (isSA || isHR || role === 'PAYROLL_VIEWER') sections.push({ key: 'payroll', label: 'Payroll', items: PAYROLL_ITEMS });
  // HR keeps the company's registrations, bank accounts and lists; logins are the Super Admin's
  if (isSA || isHR) {
    sections.push({ key: 'org', label: 'Organization', items: ORG_ITEMS.filter(i => isSA || i.to === '/organization') });
  }
  return sections;
}

// The link a path belongs to: the longest one it sits under, so a payroll
// run keeps "Runs" lit and a person's page keeps "People" lit.
export function activeNav(sections: NavSection[], pathname: string): { key: string; to: string } | null {
  let best: { key: string; to: string; length: number } | null = null;
  for (const section of sections) {
    for (const item of section.items) {
      for (const prefix of [item.to, ...(item.also || [])]) {
        const match = pathname === prefix || pathname.startsWith(prefix + '/');
        if (match && (!best || prefix.length > best.length)) best = { key: section.key, to: item.to, length: prefix.length };
      }
    }
  }
  return best;
}
