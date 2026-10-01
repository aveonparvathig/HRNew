import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../api/payroll';
import { Modal, ErrorAlert } from './ui';
import { formatINR } from '../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};
const regimeName = (regime: string) => (regime === 'OLD' ? 'Old regime' : 'New regime');

const AMOUNTS: [string, string, string][] = [
  ['prevEmployerIncome', 'Salary from previous employer', 'In this financial year, before joining.'],
  ['prevEmployerTds', 'Tax deducted by previous employer', ''],
  ['otherIncome', 'Other income declared', 'Interest, rent and the like.'],
];
const OLD_REGIME_AMOUNTS: [string, string, string][] = [
  ['annualRentPaid', 'Rent paid in the year', 'For the HRA exemption.'],
  ['section80C', 'Section 80C investments', 'Other than PF, which is counted automatically.'],
  ['otherDeductions', 'Other Chapter VI-A deductions', 'Section 80D and the rest, as allowed.'],
  ['housingLoanInterest', 'Interest on housing loan', 'Self-occupied property.'],
];

// One employee's income-tax details for a financial year.
export default function PersonTaxCard({ person }: { person: any }) {
  const [data, setData] = useState<any>(null);
  const [fy, setFy] = useState('');
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await payrollAPI.updateTaxProfile(person.id, { ...form, fyStart: data.fyStart });
      setForm(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save tax details');
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : null;
  const p = data.profile;
  const regime = p.regime || data.defaultTaxRegime;
  const isOld = (form?.regime || data.defaultTaxRegime) === 'OLD';
  const declared = [...AMOUNTS, ...OLD_REGIME_AMOUNTS].filter(([key]) => p[key] > 0);

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div>
          <h3>Income tax</h3>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {regimeName(regime)}{p.regime ? '' : ' (organization default)'}
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
          <button className="btn btn-primary btn-sm" onClick={() => setForm({ ...p })}>Edit</button>
        </div>
      </div>
      <div style={{ padding: '14px 22px 18px', fontSize: 13 }}>
        <ErrorAlert message={error} onDismiss={() => setError('')} />
        {data.summary ? (
          <p style={{ marginBottom: declared.length ? 10 : 0 }}>
            As of {monthLabel(data.summary.period)}: taxable income <strong>{formatINR(data.summary.taxableIncome)}</strong>,
            tax for the year <strong>{formatINR(data.summary.totalTax)}</strong>,
            TDS that month <strong>{formatINR(data.summary.tdsThisMonth)}</strong>.
          </p>
        ) : (
          <p className="text-muted" style={{ marginBottom: declared.length ? 10 : 0 }}>
            {data.tdsAutoFrom
              ? `No tax computed yet for FY ${data.financialYear}. It appears after the first payroll run from ${monthLabel(data.tdsAutoFrom)}.`
              : 'TDS is typed by hand on each payslip. To have it computed, set a starting month in Payroll Settings → Income Tax.'}
          </p>
        )}
        {declared.length > 0 && (
          <div className="text-muted">
            {declared.map(([key, label]) => <span key={key} style={{ marginRight: 16 }}>{label}: <strong>{formatINR(p[key])}</strong></span>)}
          </div>
        )}
      </div>

      <Modal size="lg" title={`Income Tax Details — ${person.name} — FY ${data.financialYear}`}
        open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={handleSave}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Tax regime</label>
                <select className="select" value={form.regime} onChange={e => setForm({ ...form, regime: e.target.value })}>
                  <option value="">Organization default ({regimeName(data.defaultTaxRegime)})</option>
                  <option value="NEW">New regime</option>
                  <option value="OLD">Old regime</option>
                </select>
              </div>
              {AMOUNTS.map(([key, label, hint]) => (
                <div key={key} className="field">
                  <label>{label}</label>
                  <div className="input-unit"><span className="unit">₹</span>
                    <input className="input" type="number" min={0} step="0.01" value={form[key]}
                      onChange={e => setForm({ ...form, [key]: e.target.value })} />
                  </div>
                  {hint && <span className="hint">{hint}</span>}
                </div>
              ))}
            </div>
            <div className="form-section">
              <div className="form-section-title">Old-regime reliefs</div>
              {!isOld && (
                <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
                  These are not used under the new regime. They are kept in case the regime changes.
                </p>
              )}
              <div className="form-grid" style={{ marginBottom: 12 }}>
                {OLD_REGIME_AMOUNTS.map(([key, label, hint]) => (
                  <div key={key} className="field">
                    <label>{label}</label>
                    <div className="input-unit"><span className="unit">₹</span>
                      <input className="input" type="number" min={0} step="0.01" value={form[key]}
                        onChange={e => setForm({ ...form, [key]: e.target.value })} />
                    </div>
                    {hint && <span className="hint">{hint}</span>}
                  </div>
                ))}
              </div>
              <label className="checkbox-field">
                <input type="checkbox" checked={form.isMetro} onChange={e => setForm({ ...form, isMetro: e.target.checked })} />
                Lives in a metro city (HRA exemption up to 50% of salary instead of 40%)
              </label>
            </div>
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              Recalculate any open draft run after saving so the TDS picks these up.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Details'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
