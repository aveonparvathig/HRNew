import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../api/payroll';
import { ErrorAlert } from './ui';
import { formatINR } from '../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};
const regimeName = (regime: string) => (regime === 'OLD' ? 'Old regime' : 'New regime');

// One employee's income-tax position for a financial year. The declaration
// itself (regime, rent, investments, proofs) is edited on its own page.
export default function PersonTaxCard({ person }: { person: any }) {
  const [data, setData] = useState<any>(null);
  const [fy, setFy] = useState('');
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getTaxProfile(person.id, fy);
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load tax details');
    }
  }, [person.id, fy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!data) return error ? <ErrorAlert message={error} /> : null;
  const regime = data.regime || data.defaultTaxRegime;

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div>
          <h3>Income tax</h3>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {regimeName(regime)}{data.regime ? '' : ' (organization default)'}
            {' · '}{data.poiConsidered ? 'tax uses approved proofs' : 'tax uses declared amounts'}
            {!data.hasValidPan && ' · no valid PAN on record'}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="select" style={{ width: 'auto' }} value={data.fyStart} onChange={e => setFy(e.target.value)}>
            {data.financialYears.map((y: any) => <option key={y.startYear} value={y.startYear}>FY {y.label}</option>)}
          </select>
          {data.summary && (
            <Link to={`/payroll/reports/tax-statement?fy=${data.fyStart}&personId=${person.id}`} className="btn btn-secondary btn-sm">Tax Statement</Link>
          )}
          <Link to={`/payroll/declarations/${person.id}?fy=${data.fyStart}`} className="btn btn-primary btn-sm">Declaration</Link>
        </div>
      </div>
      <div style={{ padding: '14px 22px 18px', fontSize: 13 }}>
        {data.summary ? (
          <p>
            As of {monthLabel(data.summary.period)}: taxable income <strong>{formatINR(data.summary.taxableIncome)}</strong>,
            tax for the year <strong>{formatINR(data.summary.totalTax)}</strong>,
            TDS that month <strong>{formatINR(data.summary.tdsThisMonth)}</strong>.
          </p>
        ) : (
          <p className="text-muted">
            {data.tdsAutoFrom
              ? `No tax computed yet for FY ${data.financialYear}. It appears after the first payroll run from ${monthLabel(data.tdsAutoFrom)}.`
              : 'TDS is typed by hand on each payslip. To have it computed, set a starting month in Payroll Settings → Income Tax.'}
          </p>
        )}
      </div>
    </div>
  );
}
