import { useState, useEffect, useCallback } from 'react';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert, SuccessAlert } from '../../components/ui';

const NUMBER_FIELDS: [string, string, string, boolean][] = [
  // key, label, unit, old-regime reliefs only
  ['standardDeduction', 'Standard deduction', '₹', false],
  ['rebateIncomeLimit', 'Rebate: taxable income up to', '₹', false],
  ['rebateMaxAmount', 'Rebate: tax waived up to', '₹', false],
  ['cessPercent', 'Health & education cess', '%', false],
  ['seniorExemption', 'Tax-free limit, age 60+', '₹', false],
  ['superSeniorExemption', 'Tax-free limit, age 80+', '₹', false],
  ['section80CLimit', 'Section 80C limit', '₹', true],
  ['housingInterestLimit', 'Housing-loan interest limit', '₹', true],
  ['professionalTaxLimit', 'Professional Tax deduction limit (0 = none)', '₹', true],
];

const EMPTY_SLAB = { incomeFrom: '', incomeTo: '', ratePercent: '', surchargePercent: '0' };

export default function IncomeTaxTab() {
  const [data, setData] = useState<any>(null);
  const [fy, setFy] = useState('');
  const [general, setGeneral] = useState<any>(null);
  const [configs, setConfigs] = useState<any[]>([]);
  const [forms, setForms] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getTaxConfig(fy);
      setData(res.data);
      setGeneral({ tdsAutoFrom: res.data.tdsAutoFrom, defaultTaxRegime: res.data.defaultTaxRegime });
      setForms({ form24qName: res.data.form24qName, form16Name: res.data.form16Name, form12baName: res.data.form12baName });
      setConfigs(res.data.configs.map((c: any) => ({
        ...c, slabs: c.slabs.map((s: any) => ({ ...s, incomeTo: s.incomeTo ?? '' })),
      })));
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the tax settings');
    }
  }, [fy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const run = async (key: string, call: () => Promise<any>, message: string) => {
    setSaving(key);
    setSuccess('');
    try {
      await call();
      setError('');
      setSuccess(message);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving('');
    }
  };

  if (!data || !general) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading tax settings…" />;

  const setConfig = (id: string, patch: any) => setConfigs(cs => cs.map(c => (c.id === id ? { ...c, ...patch } : c)));
  const setSlab = (c: any, i: number, patch: any) =>
    setConfig(c.id, { slabs: c.slabs.map((s: any, j: number) => (j === i ? { ...s, ...patch } : s)) });

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} />

      <form className="card card-pad mb-24" onSubmit={e => {
        e.preventDefault();
        run('general', () => payrollAPI.updateTaxSettings(general), 'Saved. Recalculate any open draft run to apply it.');
      }}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Computed TDS</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
          Until a starting month is set, TDS is whatever you type on each payslip. From that month on, payroll
          works it out from the year's income and spreads the balance over the months left. You can still type
          over it on any payslip.
        </p>
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>Compute TDS from</label>
            <input className="input" type="month" value={general.tdsAutoFrom}
              onChange={e => setGeneral({ ...general, tdsAutoFrom: e.target.value })} />
            <span className="hint">Leave blank to keep typing TDS by hand.</span>
          </div>
          <div className="field">
            <label>Regime when an employee has none set</label>
            <select className="select" value={general.defaultTaxRegime}
              onChange={e => setGeneral({ ...general, defaultTaxRegime: e.target.value })}>
              <option value="NEW">New regime</option>
              <option value="OLD">Old regime</option>
            </select>
            <span className="hint">Each employee's regime is set on their profile, per financial year.</span>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={saving === 'general'}>
          {saving === 'general' ? 'Saving…' : 'Save'}
        </button>
      </form>

      {forms && (
        <form className="card card-pad mb-24" onSubmit={e => {
          e.preventDefault();
          run('forms', () => payrollAPI.updateTaxSettings(forms), 'Form names saved.');
        }}>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Names of the tax forms</h3>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            Printed as the title of each form. The Income-tax Act, 2025 gives the forms new numbers, so set these to
            what the rules for the year call them.
          </p>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            {[['form24qName', 'Quarterly TDS return on salary'], ['form16Name', 'Salary TDS certificate'], ['form12baName', 'Statement of perquisites']].map(([key, label]) => (
              <div key={key} className="field">
                <label>{label}</label>
                <input className="input" required maxLength={60} value={forms[key]}
                  onChange={e => setForms({ ...forms, [key]: e.target.value })} />
              </div>
            ))}
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving === 'forms'}>
            {saving === 'forms' ? 'Saving…' : 'Save Names'}
          </button>
        </form>
      )}

      <div className="alert alert-warning">
        <span>⚠</span>
        <span>
          The rules below start from the FY 2025-26 figures. Check them against the Finance Act for each
          year before relying on the computed TDS.
        </span>
      </div>

      <div className="field" style={{ maxWidth: 240, marginBottom: 18 }}>
        <label>Financial year</label>
        <select className="select" value={data.fyStart} onChange={e => setFy(e.target.value)}>
          {data.financialYears.map((y: any) => <option key={y.startYear} value={y.startYear}>FY {y.label}</option>)}
        </select>
      </div>

      {configs.map(c => (
        <form key={c.id} className="card card-pad mb-24" onSubmit={e => {
          e.preventDefault();
          run(c.id, () => payrollAPI.updateTaxConfig(c.id, c),
            `${c.regime === 'NEW' ? 'New' : 'Old'} regime saved. Recalculate any open draft run to apply it.`);
        }}>
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>{c.regime === 'NEW' ? 'New regime' : 'Old regime'} — FY {data.financialYear}</h3>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            {c.allowsExemptions
              ? 'Allows HRA exemption, Professional Tax, Section 80C and other Chapter VI-A deductions, and housing-loan interest.'
              : 'Standard deduction only; no HRA exemption or Chapter VI-A deductions.'}
          </p>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            {NUMBER_FIELDS.filter(([, , , reliefOnly]) => !reliefOnly || c.allowsExemptions).map(([key, label, unit]) => (
              <div key={key} className="field">
                <label>{label}</label>
                <div className="input-unit"><span className="unit">{unit}</span>
                  <input className="input" type="number" min={0} step="0.01" value={c[key]}
                    onChange={e => setConfig(c.id, { [key]: e.target.value })} />
                </div>
              </div>
            ))}
          </div>
          <label className="checkbox-field" style={{ marginBottom: 16 }}>
            <input type="checkbox" checked={c.rebateMarginalRelief}
              onChange={e => setConfig(c.id, { rebateMarginalRelief: e.target.checked })} />
            Just above the rebate limit, cap the tax at the income over the limit (marginal relief)
          </label>

          <div className="form-section">
            <div className="form-section-title">Slabs — taxable income for the year</div>
            <div className="slab-row slab-row-4 text-muted" style={{ fontSize: 11.5, marginBottom: 4 }}>
              <span>From</span><span>To (blank = above)</span><span>Tax rate %</span><span>Surcharge %</span><span />
            </div>
            {c.slabs.map((s: any, i: number) => (
              <div key={i} className="slab-row slab-row-4">
                <input className="input" type="number" min={0} required value={s.incomeFrom}
                  onChange={e => setSlab(c, i, { incomeFrom: e.target.value })} />
                <input className="input" type="number" min={0} value={s.incomeTo}
                  onChange={e => setSlab(c, i, { incomeTo: e.target.value })} />
                <input className="input" type="number" min={0} max={100} step="0.01" required value={s.ratePercent}
                  onChange={e => setSlab(c, i, { ratePercent: e.target.value })} />
                <input className="input" type="number" min={0} max={100} step="0.01" value={s.surchargePercent}
                  onChange={e => setSlab(c, i, { surchargePercent: e.target.value })} />
                <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove slab" disabled={c.slabs.length === 1}
                  onClick={() => setConfig(c.id, { slabs: c.slabs.filter((_: any, j: number) => j !== i) })}>✕</button>
              </div>
            ))}
            <button type="button" className="btn btn-secondary btn-sm"
              onClick={() => setConfig(c.id, { slabs: [...c.slabs, EMPTY_SLAB] })}>+ Add slab</button>
            <span className="hint" style={{ display: 'block', marginTop: 8 }}>
              Surcharge is charged on the whole tax when total income falls in that slab.
            </span>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving === c.id}>
            {saving === c.id ? 'Saving…' : `Save ${c.regime === 'NEW' ? 'New' : 'Old'} Regime`}
          </button>
        </form>
      ))}
    </>
  );
}
