import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, ErrorAlert, BackButton } from '../../components/ui';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const RUN_REPORTS = [
  { kind: 'register', title: 'Salary Register', hint: 'One line per employee with every component.' },
  { kind: 'summary', title: 'Salary Summary', hint: 'Component totals, by department and location.' },
  { kind: 'pf-esi', title: 'PF & ESI Statement', hint: 'Employee-wise contributions and remittance totals.' },
  { kind: 'pf-statement', title: 'PF Statement', hint: 'EPF, pension and insurance wages and shares, with the challan.' },
  { kind: 'pt-statement', title: 'Professional Tax', hint: 'Tax deducted from each employee this month.' },
  { kind: 'lwf-statement', title: 'Labour Welfare Fund', hint: 'Employee and employer contributions this month.' },
  { kind: 'comparison', title: 'Month Comparison', hint: 'Gross and net against the previous run.' },
  { kind: 'overrides', title: 'Overrides', hint: 'Manual inputs and values that differ from the employee record.' },
  { kind: 'input-history', title: 'Salary Input History', hint: 'Every recorded change to the run.' },
];

export default function ReportsHub() {
  const navigate = useNavigate();
  const [options, setOptions] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [runId, setRunId] = useState('');
  const [fy, setFy] = useState('');
  const [personId, setPersonId] = useState('');
  const [component, setComponent] = useState('netPayable');
  const [half, setHalf] = useState('1');

  useEffect(() => {
    Promise.all([payrollAPI.getReportOptions(), payrollAPI.getRuns()])
      .then(([opt, runRes]) => {
        setOptions(opt.data);
        setRuns(runRes.data.runs);
        setRunId(runRes.data.runs[0]?.id || '');
        setFy(String(opt.data.financialYears[0]?.startYear || ''));
      })
      .catch(() => setError('Failed to load report options'));
  }, []);

  if (!options) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading reports…" />;

  const go = (kind: string, params: Record<string, string>) =>
    navigate(`/payroll/reports/${kind}?${new URLSearchParams(params).toString()}`);

  const yearSelect = (
    <select className="select" value={fy} onChange={e => setFy(e.target.value)}>
      {options.financialYears.length === 0 && <option value="">No payroll yet</option>}
      {options.financialYears.map((y: any) => <option key={y.startYear} value={y.startYear}>FY {y.label}</option>)}
    </select>
  );
  const employeeSelect = (
    <select className="select" value={personId} onChange={e => setPersonId(e.target.value)}>
      <option value="">Pick an employee…</option>
      {options.employees.map((p: any) => (
        <option key={p.id} value={p.id}>{p.name}{p.employeeNo ? ` (${p.employeeNo})` : ''}</option>
      ))}
    </select>
  );

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <span>Reports</span>
      </div>

      <PageHeader title="Payroll Reports" subtitle="Every report opens ready to print or save as PDF." />

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Monthly reports</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>For one payroll run.</p>
        <div className="field" style={{ maxWidth: 280, marginBottom: 16 }}>
          <label>Payroll month</label>
          <select className="select" value={runId} onChange={e => setRunId(e.target.value)}>
            {runs.length === 0 && <option value="">No runs yet</option>}
            {runs.map(r => <option key={r.id} value={r.id}>{monthLabel(r.period)}</option>)}
          </select>
        </div>
        <div className="report-grid">
          {RUN_REPORTS.map(r => (
            <Link key={r.kind} to={runId ? `/payroll/runs/${runId}/reports/${r.kind}` : '#'}
              className={`report-tile ${runId ? '' : 'disabled'}`}>
              <strong>{r.title}</strong>
              <span>{r.hint}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Year-to-date reports</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>Month by month across a financial year (April to March).</p>
        <div className="form-grid" style={{ marginBottom: 16 }}>
          <div className="field"><label>Financial year</label>{yearSelect}</div>
          <div className="field"><label>Employee</label>{employeeSelect}</div>
          <div className="field">
            <label>Component</label>
            <select className="select" value={component} onChange={e => setComponent(e.target.value)}>
              {options.components.map((c: any) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div className="report-grid">
          <button className="report-tile" disabled={!fy || !personId}
            onClick={() => go('ytd-statement', { fy, personId })}>
            <strong>Year-to-Date Statement</strong>
            <span>The chosen employee's components for each month.</span>
          </button>
          <button className="report-tile" disabled={!fy}
            onClick={() => go('component-statement', { fy, component })}>
            <strong>Component Statement</strong>
            <span>The chosen component for every employee, each month. Pick Net Payable for a year-to-date pay summary, or Bonus for a bonus statement.</span>
          </button>
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Half-yearly reports</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>For the financial year chosen above.</p>
        <div className="field" style={{ maxWidth: 280, marginBottom: 16 }}>
          <label>Half-year</label>
          <select className="select" value={half} onChange={e => setHalf(e.target.value)}>
            <option value="1">April – September</option>
            <option value="2">October – March</option>
          </select>
        </div>
        <div className="report-grid">
          <button className="report-tile" disabled={!fy} onClick={() => go('pt-half-year', { fy, half })}>
            <strong>Professional Tax — Half-Year</strong>
            <span>Income and tax per employee, and the number of employees in each slab, for the half-yearly return.</span>
          </button>
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Salary structure</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>From each employee's current package.</p>
        <div className="report-grid">
          <button className="report-tile" onClick={() => go('salary-structure', {})}>
            <strong>Salary Structure</strong>
            <span>Full-month split and CTC of every active employee.</span>
          </button>
          <button className="report-tile" disabled={!personId}
            onClick={() => go('ctc-breakup', { personId })}>
            <strong>CTC Breakup</strong>
            <span>Monthly and annual cost for the employee chosen above.</span>
          </button>
          <button className="report-tile"
            onClick={() => go('revision-history', personId ? { personId } : {})}>
            <strong>Salary Revision History</strong>
            <span>All employees, or only the employee chosen above.</span>
          </button>
        </div>
      </div>
    </>
  );
}
