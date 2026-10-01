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
  { kind: 'tds-statement', title: 'TDS Statement', hint: 'Tax deducted from each employee this month, with the year\'s position.' },
  { kind: 'payment-register', title: 'Payment Register', hint: 'Net pay by payment mode, with where each payment stands.' },
  { kind: 'cash-cheque', title: 'Cash and Cheque Statement', hint: 'Salaries not paid by bank transfer, with room to sign.' },
  { kind: 'payout-reconciliation', title: 'Payout Reconciliation', hint: 'Processed against paid, and what is still outstanding.' },
  { kind: 'journal-voucher', title: 'Journal Voucher', hint: 'The month as one balanced voucher, ledger by ledger.' },
  { kind: 'comparison', title: 'Month Comparison', hint: 'Gross and net against the previous run.' },
  { kind: 'reconciliation', title: 'Payroll Reconciliation', hint: 'Why the month differs from the last: joiners, leavers, revisions, attendance.' },
  { kind: 'headcount', title: 'Employee Reconciliation', hint: 'Who was added and who dropped out since the previous run.' },
  { kind: 'negative-net', title: 'Negative and Zero Net Pay', hint: 'Employees whose deductions exceed or wipe out their earnings.' },
  { kind: 'anomalies', title: 'Payroll Anomalies', hint: 'Sudden swings, zero pay and missing statutory numbers.' },
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
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Income tax</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>For the financial year and employee chosen above. The tax statements are available once TDS is computed by payroll.</p>
        <div className="report-grid">
          <button className="report-tile" disabled={!fy || !personId} onClick={() => go('tax-statement', { fy, personId })}>
            <strong>Income Tax Statement</strong>
            <span>The chosen employee's full tax working: income, deductions, tax, what is paid and what is left.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('tax-consolidated', { fy })}>
            <strong>Income Tax — Consolidated</strong>
            <span>Every employee's taxable income, tax for the year, deducted so far and still to deduct.</span>
          </button>
          <button className="report-tile" disabled={!fy || !personId} onClick={() => go('form-12bb', { fy, personId })}>
            <strong>Form 12BB</strong>
            <span>The chosen employee's statement of claims: rent, housing-loan interest and deductions, ready to sign.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('declarations', { fy })}>
            <strong>Income Tax Declarations</strong>
            <span>Every employee's regime, rent, deductions declared against approved, and proofs attached.</span>
          </button>
          <button className="report-tile" disabled={!fy || !personId} onClick={() => go('form-16', { fy, personId })}>
            <strong>Form 16 Part B</strong>
            <span>The chosen employee's annual salary and tax certificate, from the year's finalized payroll.</span>
          </button>
          <button className="report-tile" disabled={!fy || !personId} onClick={() => go('form-12ba', { fy, personId })}>
            <strong>Statement of Perquisites</strong>
            <span>Form 12BA for the chosen employee.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('tds-challans', { fy })}>
            <strong>TDS Challan Report</strong>
            <span>Each deposit of tax in the year and the employees it covers. Quarterly returns are on the TDS Returns page.</span>
          </button>
          <button className="report-tile" onClick={() => go('pan-status', {})}>
            <strong>PAN Status</strong>
            <span>Active employees whose PAN is missing or malformed.</span>
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
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Payout and control</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
          The bank transfer advice for a payment batch opens from the run's Payout page.
        </p>
        <div className="report-grid">
          <button className="report-tile" disabled={!fy} onClick={() => go('hold-release', { fy })}>
            <strong>Hold and Release</strong>
            <span>Salaries put on hold in the financial year chosen above, and when they were released and paid.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('reimbursements', { fy })}>
            <strong>Reimbursement Summary</strong>
            <span>Expense claims settled in the year: with a month's salary, or directly.</span>
          </button>
          <button className="report-tile" onClick={() => go('duplicates', {})}>
            <strong>Duplicate Check</strong>
            <span>Employees sharing a bank account or a PAN.</span>
          </button>
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Arrears and settlements</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
          For the financial year chosen above. A settlement statement opens from the settlement itself.
        </p>
        <div className="report-grid">
          <button className="report-tile" disabled={!fy} onClick={() => go('arrears', { fy })}>
            <strong>Arrear Report</strong>
            <span>Arrears by the month they were paid in, component by component.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('arrears', { fy, kind: 'LOP_REVERSAL' })}>
            <strong>LOP Reversal Report</strong>
            <span>Loss-of-pay days reversed and what was paid for them.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('pf-arrears', { fy })}>
            <strong>PF and ESI on Arrears</strong>
            <span>Employee and employer shares on arrears, for the supplementary remittance.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('settlements', { fy })}>
            <strong>Settlements and Resettlements</strong>
            <span>Everyone settled in the year, with leave encashment, gratuity, notice and the net paid.</span>
          </button>
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Loans</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>A statement for one loan opens from the loan's own page.</p>
        <div className="report-grid">
          <button className="report-tile" onClick={() => go('loan-register', {})}>
            <strong>Loan Register</strong>
            <span>Every loan with its terms, what has been repaid and what is outstanding.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('loan-transactions', { fy })}>
            <strong>Loan Transactions</strong>
            <span>Loans given, instalments and other payments in the financial year chosen above.</span>
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
