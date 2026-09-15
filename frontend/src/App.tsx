import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import AppLayout from './components/Layout/AppLayout';
import Login from './pages/Auth/Login';
import { LoadingBlock } from './components/ui';

// Route-level code splitting: each page loads as its own chunk on first visit.
const Register = lazy(() => import('./pages/Auth/Register'));
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
const BulkPayslips = lazy(() => import('./pages/Payroll/BulkPayslips'));
const PayrollSettings = lazy(() => import('./pages/Payroll/PayrollSettings'));
const CompanyProfile = lazy(() => import('./pages/Organization/CompanyProfile'));
const Team = lazy(() => import('./pages/Organization/Team'));

function RequireAuth({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(state => state.user);
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function App() {
  const user = useAuthStore(state => state.user);

  return (
    <Router>
      <Suspense fallback={<LoadingBlock label="Loading…" />}>
        <Routes>
          <Route path="/login" element={!user ? <Login /> : <Navigate to="/dashboard" />} />
          <Route path="/register" element={!user ? <Register /> : <Navigate to="/dashboard" />} />

          <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/income" element={<IncomeDashboard />} />
            <Route path="/income/analytics" element={<IncomeAnalytics />} />
            <Route path="/income/clients" element={<ClientsList />} />
            <Route path="/income/clients/:clientId" element={<ClientDetail />} />
            <Route path="/income/clients/:clientId/implementation" element={<ClientOnboarding />} />
            <Route path="/income/implementation" element={<Implementation />} />
            <Route path="/income/academic-years" element={<AcademicYears />} />
            <Route path="/income/import-export" element={<ImportExport />} />
            <Route path="/recruitment" element={<PostingsList />} />
            <Route path="/recruitment/postings/:postingId" element={<PostingDetail />} />
            <Route path="/people" element={<PeopleList />} />
            <Route path="/people/pipeline" element={<Pipeline />} />
            <Route path="/people/openings" element={<JobOpenings />} />
            <Route path="/people/documents/:docId" element={<LetterView />} />
            <Route path="/people/:personId" element={<PersonDetail />} />
            <Route path="/proposals" element={<ProposalBuilder />} />
            <Route path="/proposals/history" element={<ProposalHistory />} />
            <Route path="/proposals/history/:recordId" element={<ProposalView />} />
            <Route path="/proposals/cms-features" element={<CmsFeatures />} />
            <Route path="/expenses" element={<ExpensesList />} />
            <Route path="/expenses/:reportId" element={<ExpenseReportEditor />} />
            <Route path="/expenses/:reportId/print" element={<ExpenseReportView />} />
            <Route path="/payroll" element={<RunsList />} />
            <Route path="/payroll/runs/:runId" element={<RunDetail />} />
            <Route path="/payroll/runs/:runId/payslips" element={<BulkPayslips />} />
            <Route path="/payroll/payslips/:entryId" element={<PayslipView />} />
            <Route path="/payroll/settings" element={<PayrollSettings />} />
            <Route path="/organization" element={<CompanyProfile />} />
            <Route path="/organization/team" element={<Team />} />
          </Route>

          <Route path="/" element={<Navigate to={user ? '/dashboard' : '/login'} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
