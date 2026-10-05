import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { usePlatformStore } from './store/platformStore';
import AppLayout from './components/Layout/AppLayout';
import Login from './pages/Auth/Login';
import { LoadingBlock } from './components/ui';
import { FeedbackHost } from './components/feedback';

// Route-level code splitting: each page loads as its own chunk on first visit.
const Register = lazy(() => import('./pages/Auth/Register'));
const ChangePassword = lazy(() => import('./pages/Auth/ChangePassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const OrgChart = lazy(() => import('./pages/People/OrgChart'));
const IncomeDashboard = lazy(() => import('./pages/Income/IncomeDashboard'));
const IncomeAnalytics = lazy(() => import('./pages/Income/IncomeAnalytics'));
const ClientsList = lazy(() => import('./pages/Income/ClientsList'));
const ClientDetail = lazy(() => import('./pages/Income/ClientDetail'));
const ClientOnboarding = lazy(() => import('./pages/Income/ClientOnboarding'));
const Implementation = lazy(() => import('./pages/Income/Implementation'));
const ClientVisits = lazy(() => import('./pages/Income/ClientVisits'));
const AcademicYears = lazy(() => import('./pages/Income/AcademicYears'));
const ImportExport = lazy(() => import('./pages/Income/ImportExport'));
const PostingsList = lazy(() => import('./pages/Recruitment/PostingsList'));
const PostingDetail = lazy(() => import('./pages/Recruitment/PostingDetail'));
const PeopleList = lazy(() => import('./pages/People/PeopleList'));
const PersonDetail = lazy(() => import('./pages/People/PersonDetail'));
const Pipeline = lazy(() => import('./pages/People/Pipeline'));
const JobOpenings = lazy(() => import('./pages/People/JobOpenings'));
const LetterView = lazy(() => import('./pages/People/LetterView'));
const Letters = lazy(() => import('./pages/People/Letters'));
const Communication = lazy(() => import('./pages/People/Communication'));
const MyUpdates = lazy(() => import('./pages/My/MyUpdates'));
const IdentityDocuments = lazy(() => import('./pages/People/IdentityDocuments'));
const MyDocuments = lazy(() => import('./pages/My/MyDocuments'));
const MyLetter = lazy(() => import('./pages/My/MyLetter'));
const ProposalBuilder = lazy(() => import('./pages/Proposals/ProposalBuilder'));
const ProposalHistory = lazy(() => import('./pages/Proposals/ProposalHistory'));
const ProposalView = lazy(() => import('./pages/Proposals/ProposalView'));
const CmsFeatures = lazy(() => import('./pages/Proposals/CmsFeatures'));
const ExpensesList = lazy(() => import('./pages/Expenses/ExpensesList'));
const ExpenseReportEditor = lazy(() => import('./pages/Expenses/ExpenseReportEditor'));
const ExpenseReportView = lazy(() => import('./pages/Expenses/ExpenseReportView'));
const RunsList = lazy(() => import('./pages/Payroll/RunsList'));
const RunDetail = lazy(() => import('./pages/Payroll/RunDetail'));
const PayslipView = lazy(() => import('./pages/Payroll/PayslipView'));
const PayrollReport = lazy(() => import('./pages/Payroll/PayrollReport'));
const BulkPayslips = lazy(() => import('./pages/Payroll/BulkPayslips'));
const PayslipEmail = lazy(() => import('./pages/Payroll/PayslipEmail'));
const PayrollSettings = lazy(() => import('./pages/Payroll/PayrollSettings'));
const AuditLog = lazy(() => import('./pages/Payroll/AuditLog'));
const ReportsHub = lazy(() => import('./pages/Payroll/ReportsHub'));
const Remittances = lazy(() => import('./pages/Payroll/Remittances'));
const LoansList = lazy(() => import('./pages/Payroll/LoansList'));
const LoanDetail = lazy(() => import('./pages/Payroll/LoanDetail'));
const Payout = lazy(() => import('./pages/Payroll/Payout'));
const TdsReturns = lazy(() => import('./pages/Payroll/TdsReturns'));
const Adjustments = lazy(() => import('./pages/Payroll/Adjustments'));
const SettlementForm = lazy(() => import('./pages/Payroll/SettlementForm'));
const Declarations = lazy(() => import('./pages/Payroll/Declarations'));
const DeclarationDetail = lazy(() => import('./pages/Payroll/DeclarationDetail'));
const MyPayslips = lazy(() => import('./pages/My/MyPayslips'));
const MyDeclaration = lazy(() => import('./pages/My/MyDeclaration'));
const MyLoans = lazy(() => import('./pages/My/MyLoans'));
const MyDocument = lazy(() => import('./pages/My/MyDocument'));
const CompanySettings = lazy(() => import('./pages/Organization/CompanySettings'));
const Team = lazy(() => import('./pages/Organization/Team'));
const Security = lazy(() => import('./pages/Organization/Security'));
// Platform-owner console — a separate app above all tenants
const PlatformLogin = lazy(() => import('./pages/Platform/PlatformLogin'));
const PlatformLayout = lazy(() => import('./pages/Platform/PlatformLayout'));
const PlatformTenants = lazy(() => import('./pages/Platform/PlatformTenants'));
const PlatformTenantDetail = lazy(() => import('./pages/Platform/PlatformTenantDetail'));
const PlatformOwners = lazy(() => import('./pages/Platform/PlatformOwners'));
const PlatformAudit = lazy(() => import('./pages/Platform/PlatformAudit'));
const PlatformPlans = lazy(() => import('./pages/Platform/PlatformPlans'));
const PlatformOverview = lazy(() => import('./pages/Platform/PlatformOverview'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(state => state.user);
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}

// Route guard mirroring the API's role policy (the server enforces it too)
function RequireRole({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const user = useAuthStore(state => state.user);
  if (user && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}
const SA = ['SUPER_ADMIN'];
const SA_HR = ['SUPER_ADMIN', 'HR'];
// Payroll pages open for the read-only viewer too; the API refuses its changes
const PAYROLL = ['SUPER_ADMIN', 'HR', 'PAYROLL_VIEWER'];
const SA_EMP = ['SUPER_ADMIN', 'EMPLOYEE'];
const SA_MKT = ['SUPER_ADMIN', 'MARKETING'];

// Platform console guard — the owner session is entirely separate from any tenant login
function RequirePlatform({ children }: { children: React.ReactNode }) {
  const admin = usePlatformStore(state => state.admin);
  if (!admin) return <Navigate to="/platform/login" replace />;
  return <>{children}</>;
}

function App() {
  const user = useAuthStore(state => state.user);
  const platformAdmin = usePlatformStore(state => state.admin);

  return (
    <Router>
      <FeedbackHost />
      <Suspense fallback={<LoadingBlock label="Loading…" />}>
        <Routes>
          {/* Platform-owner console — above all tenants, its own auth */}
          <Route path="/platform/login" element={!platformAdmin ? <PlatformLogin /> : <Navigate to="/platform" />} />
          <Route element={<RequirePlatform><PlatformLayout /></RequirePlatform>}>
            <Route path="/platform" element={<PlatformOverview />} />
            <Route path="/platform/tenants" element={<PlatformTenants />} />
            <Route path="/platform/tenants/:id" element={<PlatformTenantDetail />} />
            <Route path="/platform/plans" element={<PlatformPlans />} />
            <Route path="/platform/owners" element={<PlatformOwners />} />
            <Route path="/platform/audit" element={<PlatformAudit />} />
          </Route>

          <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
          <Route path="/register" element={!user ? <Register /> : <Navigate to="/dashboard" />} />
          <Route path="/change-password" element={user ? <ChangePassword /> : <Navigate to="/login" />} />

          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/income" element={<RequireRole roles={SA_EMP}><IncomeDashboard /></RequireRole>} />
            <Route path="/income/analytics" element={<RequireRole roles={SA_EMP}><IncomeAnalytics /></RequireRole>} />
            <Route path="/income/clients" element={<RequireRole roles={SA_EMP}><ClientsList /></RequireRole>} />
            <Route path="/income/clients/:clientId" element={<RequireRole roles={SA_EMP}><ClientDetail /></RequireRole>} />
            <Route path="/income/clients/:clientId/implementation" element={<RequireRole roles={SA_EMP}><ClientOnboarding /></RequireRole>} />
            <Route path="/income/implementation" element={<RequireRole roles={SA_EMP}><Implementation /></RequireRole>} />
            <Route path="/income/implementation/visits" element={<RequireRole roles={SA_EMP}><ClientVisits /></RequireRole>} />
            <Route path="/income/academic-years" element={<RequireRole roles={SA}><AcademicYears /></RequireRole>} />
            <Route path="/income/import-export" element={<RequireRole roles={SA}><ImportExport /></RequireRole>} />
            <Route path="/recruitment" element={<RequireRole roles={SA_HR}><PostingsList /></RequireRole>} />
            <Route path="/recruitment/postings/:postingId" element={<RequireRole roles={SA_HR}><PostingDetail /></RequireRole>} />
            <Route path="/people" element={<PeopleList />} />
            <Route path="/people/org-chart" element={<OrgChart />} />
            <Route path="/people/pipeline" element={<RequireRole roles={SA_HR}><Pipeline /></RequireRole>} />
            <Route path="/people/openings" element={<RequireRole roles={SA_HR}><JobOpenings /></RequireRole>} />
            <Route path="/people/documents/:docId" element={<RequireRole roles={SA_HR}><LetterView /></RequireRole>} />
            <Route path="/people/letters" element={<RequireRole roles={SA_HR}><Letters /></RequireRole>} />
            <Route path="/people/communication" element={<RequireRole roles={SA_HR}><Communication /></RequireRole>} />
            <Route path="/people/identity-documents" element={<RequireRole roles={SA_HR}><IdentityDocuments /></RequireRole>} />
            <Route path="/people/:personId" element={<PersonDetail />} />
            <Route path="/proposals" element={<RequireRole roles={SA_MKT}><ProposalBuilder /></RequireRole>} />
            <Route path="/proposals/history" element={<RequireRole roles={SA_MKT}><ProposalHistory /></RequireRole>} />
            <Route path="/proposals/history/:recordId" element={<RequireRole roles={SA_MKT}><ProposalView /></RequireRole>} />
            <Route path="/proposals/cms-features" element={<RequireRole roles={SA_MKT}><CmsFeatures /></RequireRole>} />
            <Route path="/expenses" element={<ExpensesList />} />
            <Route path="/expenses/:reportId" element={<ExpenseReportEditor />} />
            <Route path="/expenses/:reportId/print" element={<ExpenseReportView />} />
            <Route path="/payroll" element={<RequireRole roles={PAYROLL}><RunsList /></RequireRole>} />
            <Route path="/payroll/runs/:runId" element={<RequireRole roles={PAYROLL}><RunDetail /></RequireRole>} />
            <Route path="/payroll/runs/:runId/reports/:kind" element={<RequireRole roles={PAYROLL}><PayrollReport /></RequireRole>} />
            <Route path="/payroll/runs/:runId/payout" element={<RequireRole roles={PAYROLL}><Payout /></RequireRole>} />
            <Route path="/payroll/runs/:runId/payslips" element={<RequireRole roles={PAYROLL}><BulkPayslips /></RequireRole>} />
            <Route path="/payroll/runs/:runId/email" element={<RequireRole roles={SA_HR}><PayslipEmail /></RequireRole>} />
            <Route path="/payroll/payslips/:entryId" element={<RequireRole roles={PAYROLL}><PayslipView /></RequireRole>} />
            <Route path="/payroll/settings" element={<RequireRole roles={PAYROLL}><PayrollSettings /></RequireRole>} />
            <Route path="/payroll/audit-log" element={<RequireRole roles={PAYROLL}><AuditLog /></RequireRole>} />
            <Route path="/payroll/remittances" element={<RequireRole roles={PAYROLL}><Remittances /></RequireRole>} />
            <Route path="/payroll/loans" element={<RequireRole roles={PAYROLL}><LoansList /></RequireRole>} />
            <Route path="/payroll/loans/:loanId" element={<RequireRole roles={PAYROLL}><LoanDetail /></RequireRole>} />
            <Route path="/payroll/adjustments" element={<RequireRole roles={PAYROLL}><Adjustments /></RequireRole>} />
            <Route path="/payroll/settlements/new" element={<RequireRole roles={PAYROLL}><SettlementForm /></RequireRole>} />
            <Route path="/payroll/settlements/:settlementId" element={<RequireRole roles={PAYROLL}><SettlementForm /></RequireRole>} />
            <Route path="/payroll/tds" element={<RequireRole roles={PAYROLL}><TdsReturns /></RequireRole>} />
            <Route path="/payroll/declarations" element={<RequireRole roles={PAYROLL}><Declarations /></RequireRole>} />
            <Route path="/payroll/declarations/:personId" element={<RequireRole roles={PAYROLL}><DeclarationDetail /></RequireRole>} />
            <Route path="/payroll/reports" element={<RequireRole roles={PAYROLL}><ReportsHub /></RequireRole>} />
            <Route path="/payroll/reports/:kind" element={<RequireRole roles={PAYROLL}><PayrollReport /></RequireRole>} />
            {/* An employee's own pay: the API scopes these to the person linked to the login */}
            <Route path="/my/updates" element={<MyUpdates />} />
            <Route path="/my/payslips" element={<MyPayslips />} />
            <Route path="/my/payslips/:entryId" element={<MyDocument />} />
            <Route path="/my/declaration" element={<MyDeclaration />} />
            <Route path="/my/loans" element={<MyLoans />} />
            <Route path="/my/documents" element={<MyDocuments />} />
            <Route path="/my/documents/:docId" element={<MyLetter />} />
            <Route path="/my/reports/:kind" element={<MyDocument />} />
            <Route path="/organization" element={<RequireRole roles={SA_HR}><CompanySettings /></RequireRole>} />
            <Route path="/organization/team" element={<RequireRole roles={SA}><Team /></RequireRole>} />
            <Route path="/organization/security" element={<RequireRole roles={SA}><Security /></RequireRole>} />
          </Route>

          <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
