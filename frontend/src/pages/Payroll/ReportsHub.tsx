import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, ErrorAlert, BackButton } from '../../components/ui';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const RUN_REPORTS = [
  { kind: 'register', title: 'Salary register', hint: 'One line per employee with every component.' },
  { kind: 'summary', title: 'Salary summary', hint: 'Component totals, by department and location.' },
  { kind: 'pf-esi', title: 'PF & ESI statement', hint: 'Employee-wise contributions and remittance totals.' },
  { kind: 'pf-statement', title: 'PF statement', hint: 'EPF, pension and insurance wages and shares, with the challan.' },
  { kind: 'pt-statement', title: 'Professional Tax', hint: 'Tax deducted from each employee this month.' },
  { kind: 'lwf-statement', title: 'Labour Welfare Fund', hint: 'Employee and employer contributions this month.' },
  { kind: 'tds-statement', title: 'TDS statement', hint: 'Tax deducted from each employee this month, with the year\'s position.' },
  { kind: 'payment-register', title: 'Payment register', hint: 'Net pay by payment mode, with where each payment stands.' },
  { kind: 'cash-cheque', title: 'Cash and cheque statement', hint: 'Salaries not paid by bank transfer, with room to sign.' },
  { kind: 'payout-reconciliation', title: 'Payout reconciliation', hint: 'Processed against paid, and what is still outstanding.' },
  { kind: 'journal-voucher', title: 'Journal voucher', hint: 'The month as one balanced voucher, ledger by ledger.' },
  { kind: 'comparison', title: 'Month comparison', hint: 'Gross and net against the previous run.' },
  { kind: 'reconciliation', title: 'Payroll reconciliation', hint: 'Why the month differs from the last: joiners, leavers, revisions, attendance.' },
  { kind: 'headcount', title: 'Employee reconciliation', hint: 'Who was added and who dropped out since the previous run.' },
  { kind: 'negative-net', title: 'Negative and zero net pay', hint: 'Employees whose deductions exceed or wipe out their earnings.' },
  { kind: 'anomalies', title: 'Payroll anomalies', hint: 'Sudden swings, zero pay and missing statutory numbers.' },
  { kind: 'overrides', title: 'Overrides', hint: 'Manual inputs and values that differ from the employee record.' },
  { kind: 'input-history', title: 'Salary input history', hint: 'Every recorded change to the run.' },
];

// Labour-law registers. needs: what each is drawn up for.
const REGISTERS: { title: string; items: { code: string; title: string; hint: string; needs: 'run' | 'fy' | 'person' | 'none' }[] }[] = [
  {
    title: 'Tamil Nadu Shops and Establishments Rules (Forms U to X, in force from March 2022)',
    items: [
      { code: 'tn-u', title: 'Form U — employee register', hint: 'Everyone on the employee record, with joining, statutory numbers, bank and exit details.', needs: 'none' },
      { code: 'tn-v', title: 'Form V — register of employment', hint: 'Days worked and loss of pay for the month. Daily hours are not tracked and stay blank.', needs: 'run' },
      { code: 'tn-w', title: 'Form W — register of wages', hint: 'Wages, advances, deductions and net pay for the month, with the date and reference of payment.', needs: 'run' },
      { code: 'tn-x', title: 'Form X — leave and social security', hint: 'Leave taken in the month and gratuity paid on exit. Leave balances are not tracked.', needs: 'run' },
    ],
  },
  {
    title: 'Central combined registers (Ease of Compliance Rules, 2017)',
    items: [
      { code: 'form-a', title: 'Form A — employee register', hint: 'The central employee register, for everyone on the employee record.', needs: 'none' },
      { code: 'form-b', title: 'Form B — wage register', hint: 'Earned wages, deductions, net payment and employer share for the month.', needs: 'run' },
      { code: 'form-c', title: 'Form C — loans and recoveries', hint: 'Loans and advances running in the financial year, with their instalment months.', needs: 'fy' },
      { code: 'form-d', title: 'Form D — attendance register', hint: 'Days paid, leave and loss of pay for the month. Daily in and out times stay blank.', needs: 'run' },
    ],
  },
  {
    title: 'Bonus and gratuity',
    items: [
      { code: 'bonus-c', title: 'Bonus Form C', hint: 'Statutory bonus payable to each covered employee for the financial year.', needs: 'fy' },
      { code: 'bonus-d', title: 'Bonus Form D — annual return', hint: 'The annual bonus return, from the Form C figures.', needs: 'fy' },
      { code: 'gratuity-f', title: 'Gratuity Form F — nomination', hint: 'The chosen employee\'s nomination form, with their particulars filled in.', needs: 'person' },
    ],
  },
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
    <select id="rh-fy" className="select" value={fy} onChange={e => setFy(e.target.value)}>
      {options.financialYears.length === 0 && <option value="">No payroll yet</option>}
      {options.financialYears.map((y: any) => <option key={y.startYear} value={y.startYear}>FY {y.label}</option>)}
    </select>
  );
  const employeeSelect = (
    <select id="rh-person" className="select" value={personId} onChange={e => setPersonId(e.target.value)}>
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

      <PageHeader title="Payroll reports" subtitle="Every report opens ready to print or save as PDF." />

      <div className="card card-pad mb-24">
        <h3 className="pr-card-title">Monthly reports</h3>
        <p className="text-sm-muted pr-mb-16">For one payroll run.</p>
        <div className="field pr-field-narrow pr-mb-16">
          <label htmlFor="rh-run">Payroll month</label>
          <select id="rh-run" className="select" value={runId} onChange={e => setRunId(e.target.value)}>
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
        <h3 className="pr-card-title">Year-to-date reports</h3>
        <p className="text-sm-muted pr-mb-16">Month by month across a financial year (April to March).</p>
        <div className="form-grid pr-mb-16">
          <div className="field"><label htmlFor="rh-fy">Financial year</label>{yearSelect}</div>
          <div className="field"><label htmlFor="rh-person">Employee</label>{employeeSelect}</div>
          <div className="field">
            <label htmlFor="rh-component">Component</label>
            <select id="rh-component" className="select" value={component} onChange={e => setComponent(e.target.value)}>
              {options.components.map((c: any) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <div className="report-grid">
          <button className="report-tile" disabled={!fy || !personId}
            onClick={() => go('ytd-statement', { fy, personId })}>
            <strong>Year-to-date statement</strong>
            <span>The chosen employee's components for each month.</span>
          </button>
          <button className="report-tile" disabled={!fy}
            onClick={() => go('component-statement', { fy, component })}>
            <strong>Component statement</strong>
            <span>The chosen component for every employee, each month. Pick Net Payable for a year-to-date pay summary, or Bonus for a bonus statement.</span>
          </button>
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 className="pr-card-title">Income tax</h3>
        <p className="text-sm-muted pr-mb-16">For the financial year and employee chosen above. The tax statements are available once TDS is computed by payroll.</p>
        <div className="report-grid">
          <button className="report-tile" disabled={!fy || !personId} onClick={() => go('tax-statement', { fy, personId })}>
            <strong>Income tax statement</strong>
            <span>The chosen employee's full tax working: income, deductions, tax, what is paid and what is left.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('tax-consolidated', { fy })}>
            <strong>Income tax — consolidated</strong>
            <span>Every employee's taxable income, tax for the year, deducted so far and still to deduct.</span>
          </button>
          <button className="report-tile" disabled={!fy || !personId} onClick={() => go('form-12bb', { fy, personId })}>
            <strong>Form 12BB</strong>
            <span>The chosen employee's statement of claims: rent, housing-loan interest and deductions, ready to sign.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('declarations', { fy })}>
            <strong>Income tax declarations</strong>
            <span>Every employee's regime, rent, deductions declared against approved, and proofs attached.</span>
          </button>
          <button className="report-tile" disabled={!fy || !personId} onClick={() => go('form-16', { fy, personId })}>
            <strong>Form 16 Part B</strong>
            <span>The chosen employee's annual salary and tax certificate, from the year's finalized payroll.</span>
          </button>
          <button className="report-tile" disabled={!fy || !personId} onClick={() => go('form-12ba', { fy, personId })}>
            <strong>Statement of perquisites</strong>
            <span>Form 12BA for the chosen employee.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('tds-challans', { fy })}>
            <strong>TDS challan report</strong>
            <span>Each deposit of tax in the year and the employees it covers. Quarterly returns are on the TDS Returns page.</span>
          </button>
          <button className="report-tile" onClick={() => go('pan-status', {})}>
            <strong>PAN status</strong>
            <span>Active employees whose PAN is missing or malformed.</span>
          </button>
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 className="pr-card-title">Half-yearly reports</h3>
        <p className="text-sm-muted pr-mb-16">For the financial year chosen above.</p>
        <div className="field pr-field-narrow pr-mb-16">
          <label htmlFor="rh-half">Half-year</label>
          <select id="rh-half" className="select" value={half} onChange={e => setHalf(e.target.value)}>
            <option value="1">April – September</option>
            <option value="2">October – March</option>
          </select>
        </div>
        <div className="report-grid">
          <button className="report-tile" disabled={!fy} onClick={() => go('pt-half-year', { fy, half })}>
            <strong>Professional Tax — half-year</strong>
            <span>Income and tax per employee, and the number of employees in each slab, for the half-yearly return.</span>
          </button>
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 className="pr-card-title">Payout and control</h3>
        <p className="text-sm-muted pr-mb-16">
          The bank transfer advice for a payment batch opens from the run's Payout page.
        </p>
        <div className="report-grid">
          <button className="report-tile" disabled={!fy} onClick={() => go('hold-release', { fy })}>
            <strong>Hold and release</strong>
            <span>Salaries put on hold in the financial year chosen above, and when they were released and paid.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('reimbursements', { fy })}>
            <strong>Reimbursement summary</strong>
            <span>Expense claims settled in the year: with a month's salary, or directly.</span>
          </button>
          <button className="report-tile" onClick={() => go('duplicates', {})}>
            <strong>Duplicate check</strong>
            <span>Employees sharing a bank account or a PAN.</span>
          </button>
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 className="pr-card-title">Arrears and settlements</h3>
        <p className="text-sm-muted pr-mb-16">
          For the financial year chosen above. A settlement statement opens from the settlement itself.
        </p>
        <div className="report-grid">
          <button className="report-tile" disabled={!fy} onClick={() => go('arrears', { fy })}>
            <strong>Arrear report</strong>
            <span>Arrears by the month they were paid in, component by component.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('arrears', { fy, kind: 'LOP_REVERSAL' })}>
            <strong>LOP reversal report</strong>
            <span>Loss-of-pay days reversed and what was paid for them.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('pf-arrears', { fy })}>
            <strong>PF and ESI on arrears</strong>
            <span>Employee and employer shares on arrears, for the supplementary remittance.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('settlements', { fy })}>
            <strong>Settlements and resettlements</strong>
            <span>Everyone settled in the year, with leave encashment, gratuity, notice and the net paid.</span>
          </button>
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 className="pr-card-title">Loans</h3>
        <p className="text-sm-muted pr-mb-16">A statement for one loan opens from the loan's own page.</p>
        <div className="report-grid">
          <button className="report-tile" onClick={() => go('loan-register', {})}>
            <strong>Loan register</strong>
            <span>Every loan with its terms, what has been repaid and what is outstanding.</span>
          </button>
          <button className="report-tile" disabled={!fy} onClick={() => go('loan-transactions', { fy })}>
            <strong>Loan transactions</strong>
            <span>Loans given, instalments and other payments in the financial year chosen above.</span>
          </button>
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 className="pr-card-title">Labour-law registers</h3>
        <p className="text-sm-muted pr-mb-16">
          In the prescribed column order, filled from payroll; what the system does not record is left blank to fill by hand.
          Monthly registers use the payroll month chosen at the top, yearly ones the financial year, and Form F the employee.
          Each opens ready to print, with an Excel copy.
        </p>
        {REGISTERS.map(group => (
          <div key={group.title} className="pr-mb-16">
            <div className="pr-group-title">{group.title}</div>
            <div className="report-grid">
              {group.items.map(r => {
                const params: Record<string, string> = r.needs === 'run' ? { runId } : r.needs === 'fy' ? { fy } : r.needs === 'person' ? { personId } : {};
                const ready = r.needs === 'run' ? Boolean(runId) : r.needs === 'fy' ? Boolean(fy) : r.needs === 'person' ? Boolean(personId) : true;
                return (
                  <button key={r.code} className="report-tile" disabled={!ready} onClick={() => go(`register-${r.code}`, params)}>
                    <strong>{r.title}</strong>
                    <span>{r.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="card card-pad mb-24">
        <h3 className="pr-card-title">Salary structure</h3>
        <p className="text-sm-muted pr-mb-16">From each employee's current package.</p>
        <div className="report-grid">
          <button className="report-tile" onClick={() => go('salary-structure', {})}>
            <strong>Salary structure</strong>
            <span>Full-month split and CTC of every active employee.</span>
          </button>
          <button className="report-tile" disabled={!personId}
            onClick={() => go('ctc-breakup', { personId })}>
            <strong>CTC breakup</strong>
            <span>Monthly and annual cost for the employee chosen above.</span>
          </button>
          <button className="report-tile"
            onClick={() => go('revision-history', personId ? { personId } : {})}>
            <strong>Salary revision history</strong>
            <span>All employees, or only the employee chosen above.</span>
          </button>
        </div>
      </div>
    </>
  );
}
