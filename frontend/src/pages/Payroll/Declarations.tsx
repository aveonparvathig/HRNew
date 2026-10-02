import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, BackButton } from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';
import { toast } from '../../components/feedback';

const STATUS: Record<string, [string, string]> = {
  DRAFT: ['Draft', 'badge-neutral'], SUBMITTED: ['Submitted', 'badge-warning'], REVIEWED: ['Reviewed', 'badge-success'],
};

const regimeName = (regime: string) => (regime === 'OLD' ? 'Old regime' : 'New regime');

const WINDOWS: [string, string, string][] = [
  ['declarationOpen', 'Employees can edit their declaration', 'Turn off to lock declarations; HR can still edit.'],
  ['proofOpen', 'Employees can attach proofs', 'Usually opened towards the end of the year.'],
  ['employeeCanChooseRegime', 'Employees can choose their tax regime', 'When off, only HR sets the regime.'],
  ['employeeTaxEstimate', 'Employees can see a tax estimate before payslips are released', 'Their tax statement then counts the latest payroll month even while it is unreleased, marked as an estimate.'],
];

// Every employee's income-tax declaration for a year, and the year's windows.
export default function Declarations() {
  const [data, setData] = useState<any>(null);
  const [fy, setFy] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getDeclarations(fy);
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load declarations');
    }
  }, [fy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const setWindow = async (key: string, value: boolean | string) => {
    try {
      await payrollAPI.updateDeclarationControl({ fyStart: data.fyStart, [key]: value });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not change the setting');
    }
  };

  const decide = async (request: any, approve: boolean) => {
    try {
      await payrollAPI.decideReopenRequest(request.id, { approve });
      toast.success(approve ? `Reopened for ${request.person.name}.` : 'Request declined.');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not decide the request');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading declarations…" />;

  const q = search.trim().toLowerCase();
  const rows = data.rows.filter((r: any) =>
    (!q || r.person.name.toLowerCase().includes(q) || (r.person.employeeNo || '').toLowerCase().includes(q))
    && (!status || r.status === status));
  const waiting = data.rows.filter((r: any) => r.status === 'SUBMITTED').length;
  const started = data.rows.filter((r: any) => r.declared > 0 || r.rent > 0 || r.housingLoanInterest > 0).length;

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <span>Tax Declarations</span>
      </div>

      <PageHeader
        title="Income Tax Declarations"
        subtitle={`FY ${data.financialYear} · ${started} of ${data.rows.length} employees have declared something${waiting ? ` · ${waiting} waiting for review` : ''}`}
        actions={<>
          <select className="select" style={{ width: 'auto' }} value={data.fyStart} onChange={e => setFy(e.target.value)}>
            {data.financialYears.map((y: any) => <option key={y.startYear} value={y.startYear}>FY {y.label}</option>)}
          </select>
          <Link to={`/payroll/reports/declarations?fy=${data.fyStart}`} className="btn btn-secondary">Declarations Report</Link>
          <Link to="/payroll/settings?tab=declarations" className="btn btn-secondary">Declaration Items</Link>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>What employees can do — FY {data.financialYear}</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          These apply to employees using My Pay. HR can always edit a declaration.
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          {WINDOWS.map(([key, label, hint]) => (
            <label key={key} className="checkbox-field" style={{ alignItems: 'flex-start' }}>
              <input type="checkbox" style={{ marginTop: 2 }} checked={data.control[key]}
                onChange={e => setWindow(key, e.target.checked)} />
              <span>{label}<span className="text-muted" style={{ display: 'block', fontSize: 12 }}>{hint}</span></span>
            </label>
          ))}
        </div>
        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label>Close the declaration window after</label>
            <input className="input" type="date" disabled={!data.control.declarationOpen} value={data.control.declarationLockOn || ''}
              onChange={e => setWindow('declarationLockOn', e.target.value)} />
            <span className="hint">
              {data.control.declarationOpen
                ? 'Employees can edit up to the end of this day; the window then closes by itself. Leave blank to close it by hand.'
                : 'Open the window first to give it a closing date.'}
            </span>
          </div>
          <div className="field">
            <label>Open proof submission from</label>
            <input className="input" type="month" disabled={data.control.proofOpen} value={data.control.proofOpenFrom || ''}
              onChange={e => setWindow('proofOpenFrom', e.target.value)} />
            <span className="hint">
              {data.control.proofOpen ? 'Proof submission is open now.' : 'Proofs open by themselves on the first day of this month. Leave blank to open them by hand.'}
            </span>
          </div>
        </div>
      </div>

      {data.reopenRequests.length > 0 && (
        <div className="card mb-24">
          <div className="card-header">
            <div>
              <h3>Requests to reopen a declaration</h3>
              <span className="text-muted" style={{ fontSize: 12.5 }}>
                Reopening lets the employee change their declaration and submit it again, even with the window closed.
              </span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Employee</th><th>Asked on</th><th>What they need to change</th><th /></tr></thead>
              <tbody>
                {data.reopenRequests.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/payroll/declarations/${r.person.id}?fy=${r.fyStart}`} style={{ fontWeight: 600 }}>{r.person.name}</Link>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>{r.person.employeeNo}</div>
                    </td>
                    <td>{formatDate(r.createdAt)}</td>
                    <td>{r.reason}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-primary btn-sm" onClick={() => decide(r, true)}>Reopen</button>
                        <button className="btn btn-secondary btn-sm" onClick={() => decide(r, false)}>Decline</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Employees</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select className="select" style={{ width: 'auto' }} aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="">Any status</option>
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted, to review</option>
              <option value="REVIEWED">Reviewed</option>
            </select>
            <input className="input" style={{ maxWidth: 240 }} placeholder="Search name or code…" value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon="▤" title="No employees match" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th><th>Status</th><th>Regime</th><th className="num">Deductions declared</th>
                  <th className="num">Approved</th><th className="num">Rent</th><th className="num">Proofs</th>
                  <th>Tax uses</th><th>Employee saved</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.person.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{r.person.name}</span>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>{r.person.employeeNo}</div>
                    </td>
                    <td><span className={`badge ${(STATUS[r.status] || STATUS.DRAFT)[1]}`}>{(STATUS[r.status] || STATUS.DRAFT)[0]}</span></td>
                    <td>
                      {regimeName(r.regime)}
                      {r.regimeIsDefault && <div className="text-muted" style={{ fontSize: 11.5 }}>default</div>}
                    </td>
                    <td className="num">{r.declared ? formatINR(r.declared) : '—'}</td>
                    <td className="num">{r.approved ? formatINR(r.approved) : '—'}</td>
                    <td className="num">{r.rent ? formatINR(r.rent) : '—'}</td>
                    <td className="num">{r.proofs || '—'}</td>
                    <td>
                      <span className={`badge ${r.poiConsidered ? 'badge-success' : 'badge-neutral'}`}>
                        {r.poiConsidered ? 'Approved' : 'Declared'}
                      </span>
                    </td>
                    <td>{r.submittedAt ? formatDate(r.submittedAt) : <span className="text-muted">—</span>}</td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/payroll/declarations/${r.person.id}?fy=${data.fyStart}`} className="btn btn-secondary btn-sm">Open</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
