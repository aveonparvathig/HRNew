import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import AppLayout from './components/Layout/AppLayout';
import Login from './pages/Auth/Login';
import { LoadingBlock } from './components/ui';

// Route-level code splitting: each page loads as its own chunk on first visit.
const Register = lazy(() => import('./pages/Auth/Register'));
const ChangePassword = lazy(() => import('./pages/Auth/ChangePassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const IncomeDashboard = lazy(() => import('./pages/Income/IncomeDashboard'));
const IncomeAnalytics = lazy(() => import('./pages/Income/IncomeAnalytics'));
const ClientsList = lazy(() => import('./pages/Income/ClientsList'));
const ClientDetail = lazy(() => import('./pages/Income/ClientDetail'));
const ClientOnboarding = lazy(() => import('./pages/Income/ClientOnboarding'));
const Implementation = lazy(() => import('./pages/Income/Implementation'));
const AcademicYears = lazy(() => import('./pages/Income/AcademicYears'));
const ImportExport = lazy(() => import('./pages/Income/ImportExport'));
const PostingsList = lazy(() => import('./pages/Recruitment/PostingsList'));
const PostingDetail = lazy(() => import('./pages/Recruitment/PostingDetail'));
const PeopleList = lazy(() => import('./pages/People/PeopleList'));
const PersonDetail = lazy(() => import('./pages/People/PersonDetail'));
const Pipeline = lazy(() => import('./pages/People/Pipeline'));
const JobOpenings = lazy(() => import('./pages/People/JobOpenings'));
const LetterView = lazy(() => import('./pages/People/LetterView'));
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
const PayrollSettings = lazy(() => import('./pages/Payroll/PayrollSettings'));
const CompanyProfile = lazy(() => import('./pages/Organization/CompanyProfile'));
const Team = lazy(() => import('./pages/Organization/Team'));

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
const SA_EMP = ['SUPER_ADMIN', 'EMPLOYEE'];

function App() {
  const user = useAuthStore(state => state.user);

  return (
    <Router>
      <Suspense fallback={<LoadingBlock label="Loading…" />}>
        <Routes>
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
            <Route path="/income/academic-years" element={<RequireRole roles={SA}><AcademicYears /></RequireRole>} />
            <Route path="/income/import-export" element={<RequireRole roles={SA}><ImportExport /></RequireRole>} />
            <Route path="/recruitment" element={<RequireRole roles={SA_HR}><PostingsList /></RequireRole>} />
            <Route path="/recruitment/postings/:postingId" element={<RequireRole roles={SA_HR}><PostingDetail /></RequireRole>} />
            <Route path="/people" element={<PeopleList />} />
            <Route path="/people/pipeline" element={<RequireRole roles={SA_HR}><Pipeline /></RequireRole>} />
            <Route path="/people/openings" element={<RequireRole roles={SA_HR}><JobOpenings /></RequireRole>} />
            <Route path="/people/documents/:docId" element={<RequireRole roles={SA_HR}><LetterView /></RequireRole>} />
            <Route path="/people/:personId" element={<PersonDetail />} />
            <Route path="/proposals" element={<RequireRole roles={SA}><ProposalBuilder /></RequireRole>} />
            <Route path="/proposals/history" element={<RequireRole roles={SA}><ProposalHistory /></RequireRole>} />
            <Route path="/proposals/history/:recordId" element={<RequireRole roles={SA}><ProposalView /></RequireRole>} />
            <Route path="/proposals/cms-features" element={<RequireRole roles={SA}><CmsFeatures /></RequireRole>} />
            <Route path="/expenses" element={<ExpensesList />} />
            <Route path="/expenses/:reportId" element={<ExpenseReportEditor />} />
            <Route path="/expenses/:reportId/print" element={<ExpenseReportView />} />
            <Route path="/payroll" element={<RequireRole roles={SA_HR}><RunsList /></RequireRole>} />
            <Route path="/payroll/runs/:runId" element={<RequireRole roles={SA_HR}><RunDetail /></RequireRole>} />
            <Route path="/payroll/runs/:runId/reports/:kind" element={<RequireRole roles={SA_HR}><PayrollReport /></RequireRole>} />
            <Route path="/payroll/runs/:runId/payslips" element={<RequireRole roles={SA_HR}><BulkPayslips /></RequireRole>} />
            <Route path="/payroll/payslips/:entryId" element={<RequireRole roles={SA_HR}><PayslipView /></RequireRole>} />
            <Route path="/payroll/settings" element={<RequireRole roles={SA_HR}><PayrollSettings /></RequireRole>} />
            <Route path="/organization" element={<RequireRole roles={SA}><CompanyProfile /></RequireRole>} />
            <Route path="/organization/team" element={<RequireRole roles={SA}><Team /></RequireRole>} />
          </Route>

          <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
