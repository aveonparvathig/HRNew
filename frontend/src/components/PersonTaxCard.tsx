import { useState, useEffect, useCallback } from 'react';
import { Button, ButtonLink } from './Button';
import { payrollAPI } from '../api/payroll';
import { ErrorAlert } from './ui';
import { formatINR } from '../utils/format';
import PerquisitesModal from './PerquisitesModal';

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
  const [perquisites, setPerquisites] = useState(false);

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
          <span className="text-sm-muted">
            {regimeName(regime)}{data.regime ? '' : ' (organization default)'}
            {' · '}{data.poiConsidered ? 'tax uses approved proofs' : 'tax uses declared amounts'}
            {!data.hasValidPan && ' · no valid PAN on record'}
          </span>
        </div>
        <div className="cluster">
          <select className="select pp-select-auto" aria-label="Financial year" value={data.fyStart} onChange={e => setFy(e.target.value)}>
            {data.financialYears.map((y: any) => <option key={y.startYear} value={y.startYear}>FY {y.label}</option>)}
          </select>
          {data.summary && (
            <ButtonLink to={`/payroll/reports/tax-statement?fy=${data.fyStart}&personId=${person.id}`} size="sm" variant="ghost" icon="receipt">Tax statement</ButtonLink>
          )}
          <Button size="sm" onClick={() => setPerquisites(true)}>Perquisites</Button>
          <ButtonLink to={`/payroll/declarations/${person.id}?fy=${data.fyStart}`} size="sm" icon="pen">Declaration</ButtonLink>
        </div>
      </div>
      <div className="pp-card-body pp-card-body-pad">
        {data.summary ? (
          <p>
            As of {monthLabel(data.summary.period)}: taxable income <strong className="num">{formatINR(data.summary.taxableIncome)}</strong>,
            tax for the year <strong className="num">{formatINR(data.summary.totalTax)}</strong>,
            TDS that month <strong className="num">{formatINR(data.summary.tdsThisMonth)}</strong>.
          </p>
        ) : (
          <p className="text-muted">
            {data.tdsAutoFrom
              ? `No tax computed yet for FY ${data.financialYear}. It appears after the first payroll run from ${monthLabel(data.tdsAutoFrom)}.`
              : 'TDS is typed by hand on each payslip. To have it computed, set a starting month in Payroll settings → Income tax.'}
          </p>
        )}
      </div>
      <PerquisitesModal personId={person.id} fy={data.fyStart} open={perquisites} onClose={() => setPerquisites(false)} />
    </div>
  );
}
