import { useState, useEffect, useCallback } from 'react';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert, EmptyState, Modal } from '../../components/ui';
import { formatINR } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};
const monthNames = (csv: string) =>
  String(csv || '').split(',').filter(Boolean).map(m => MONTHS[Number(m) - 1]).join(', ');
const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const toggle = (csv: string, month: number) => {
  const set = new Set(String(csv || '').split(',').filter(Boolean).map(Number));
  if (set.has(month)) set.delete(month); else set.add(month);
  return [...set].sort((a, b) => a - b).join(',');
};

const EMPTY_SLAB = { incomeFrom: '', incomeTo: '', amount: '' };

function MonthPicker({ value, onChange }: { value: string; onChange: (csv: string) => void }) {
  const picked = new Set(String(value || '').split(',').filter(Boolean).map(Number));
  return (
    <div className="month-picker">
      {MONTHS.map((name, i) => (
        <button key={name} type="button" className={`month-chip ${picked.has(i + 1) ? 'active' : ''}`}
          onClick={() => onChange(toggle(value, i + 1))}>
          {name}
        </button>
      ))}
    </div>
  );
}

export default function StatutoryPoliciesTab() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [pt, setPt] = useState<any>(null);   // PT policy being edited
  const [lwf, setLwf] = useState<any>(null); // LWF policy being edited
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getPolicies();
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load statutory policies');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const defaultState = () => data?.locationStates?.[0] || '';

  const openPt = (policy?: any) => setPt(policy
    ? {
      ...policy,
      slabs: policy.slabs.map((s: any) => ({ incomeFrom: s.incomeFrom, incomeTo: s.incomeTo ?? '', amount: s.amount })),
    }
    : {
      state: defaultState(), locality: '', effectiveFrom: thisMonth(), frequency: 'HALF_YEARLY',
      deductionMode: 'SPREAD', deductionMonths: '', slabs: [{ ...EMPTY_SLAB, incomeFrom: 0 }],
    });

  const openLwf = (policy?: any) => setLwf(policy
    ? { ...policy }
    : { state: defaultState(), effectiveFrom: thisMonth(), employeeAmount: '', employerAmount: '', deductionMonths: '12' });

  const save = async (call: () => Promise<any>, close: () => void, failure: string) => {
    setSaving(true);
    try {
      await call();
      close();
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || failure);
      close();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (label: string, call: () => Promise<any>) => {
    if (!await confirmDialog(`Delete the ${label}?`)) return;
    try {
      await call();
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete the policy');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading policies…" />;

  const setSlab = (i: number, patch: any) =>
    setPt({ ...pt, slabs: pt.slabs.map((s: any, j: number) => (j === i ? { ...s, ...patch } : s)) });

  const stateSelect = (value: string, onChange: (v: string) => void) => (
    <select className="select" required value={value} onChange={e => onChange(e.target.value)}>
      <option value="">—</option>
      {data.states.map((s: string) => <option key={s} value={s}>{s}</option>)}
    </select>
  );

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="alert alert-warning">
        <span>⚠</span>
        <span>
          Rates differ by state and local body and are revised from time to time. Enter the amounts from your
          current notification. A policy applies to employees whose work location is in its state, from the
          month it starts; where a policy names a town, it replaces the state's for work locations in that town.
          Runs already finalized do not change.
        </span>
      </div>

      <div className="card mb-24">
        <div className="card-header">
          <div>
            <h3>Professional Tax</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              Slabs by state, or by town where the local body sets them. Half-yearly states use the income of April–September and October–March.
              {data.excludedLocations?.length > 0 && ` No Professional Tax at: ${data.excludedLocations.join(', ')}.`}
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => openPt()}>+ Add Policy</button>
        </div>
        {data.ptPolicies.length === 0 ? (
          <EmptyState icon="▤" title="No Professional Tax policy yet"
            message="Until one is added, no Professional Tax is deducted." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Applies to</th><th>From</th><th>Basis</th><th>Deducted</th><th>Slabs</th><th /></tr></thead>
              <tbody>
                {data.ptPolicies.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{p.locality ? `${p.locality}, ${p.state}` : p.state}</span>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>
                        {!p.locality ? 'Whole state, except towns with their own policy'
                          : p.locations.length ? `Work locations: ${p.locations.join(', ')}`
                          : <span className="text-warning">No work location is in this town, so it is not used</span>}
                      </div>
                    </td>
                    <td>{monthLabel(p.effectiveFrom)}</td>
                    <td>{p.frequency === 'MONTHLY' ? 'Monthly income' : 'Half-yearly income'}</td>
                    <td>
                      {p.frequency === 'MONTHLY' ? 'Every month'
                        : p.deductionMode === 'LUMP_SUM' ? `Lump sum in ${monthNames(p.deductionMonths)}` : 'Spread over the half-year'}
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {p.slabs.map((s: any) => (
                        <div key={s.id}>
                          {formatINR(s.incomeFrom)} – {s.incomeTo == null ? 'above' : formatINR(s.incomeTo)}: <strong>{formatINR(s.amount)}</strong>
                        </div>
                      ))}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openPt(p)}>Edit</button>
                        <button className="btn btn-danger btn-sm"
                          onClick={() => remove(`${p.locality ? `${p.locality}, ` : ''}${p.state} Professional Tax policy`, () => payrollAPI.deletePtPolicy(p.id))}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Labour Welfare Fund</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>A fixed contribution from employee and employer in the months it falls due.</span>
          </div>
          <button className="btn btn-primary" onClick={() => openLwf()}>+ Add Policy</button>
        </div>
        {data.lwfPolicies.length === 0 ? (
          <EmptyState icon="▤" title="No Labour Welfare Fund policy yet"
            message="Until one is added, no Labour Welfare Fund is deducted." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>State</th><th>From</th><th className="num">Employee</th><th className="num">Employer</th><th>Months</th><th /></tr></thead>
              <tbody>
                {data.lwfPolicies.map((p: any) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.state}</td>
                    <td>{monthLabel(p.effectiveFrom)}</td>
                    <td className="num">{formatINR(p.employeeAmount)}</td>
                    <td className="num">{formatINR(p.employerAmount)}</td>
                    <td>{monthNames(p.deductionMonths)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openLwf(p)}>Edit</button>
                        <button className="btn btn-danger btn-sm"
                          onClick={() => remove(`${p.state} Labour Welfare Fund policy`, () => payrollAPI.deleteLwfPolicy(p.id))}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Professional Tax policy */}
      <Modal size="lg" title={pt?.id ? 'Edit Professional Tax Policy' : 'Add Professional Tax Policy'}
        open={Boolean(pt)} onClose={() => setPt(null)}>
        {pt && (
          <form onSubmit={e => {
            e.preventDefault();
            save(() => (pt.id ? payrollAPI.updatePtPolicy(pt.id, pt) : payrollAPI.createPtPolicy(pt)),
              () => setPt(null), 'Failed to save the policy');
          }}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field"><label>State *</label>{stateSelect(pt.state, v => setPt({ ...pt, state: v, locality: '' }))}</div>
              <div className="field">
                <label>Town</label>
                <select className="select" value={pt.locality || ''} onChange={e => setPt({ ...pt, locality: e.target.value })}>
                  <option value="">Whole state</option>
                  {/* A town already on the policy stays selectable even if no location is there now */}
                  {[...new Set([...(data.towns[pt.state] || []), ...(pt.locality ? [pt.locality] : [])])].map((t: string) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <span className="hint">
                  {(data.towns[pt.state] || []).length
                    ? 'Pick a town when its local body sets its own slabs. Towns come from the city of your work locations.'
                    : 'To set slabs for one town, give a work location in this state a city first.'}
                </span>
              </div>
              <div className="field">
                <label>Applies from *</label>
                <input className="input" type="month" required value={pt.effectiveFrom}
                  onChange={e => setPt({ ...pt, effectiveFrom: e.target.value })} />
              </div>
              <div className="field">
                <label>Slabs are for *</label>
                <select className="select" value={pt.frequency} onChange={e => setPt({ ...pt, frequency: e.target.value })}>
                  <option value="HALF_YEARLY">Half-yearly income (e.g. Tamil Nadu)</option>
                  <option value="MONTHLY">Monthly income</option>
                </select>
              </div>
              {pt.frequency === 'HALF_YEARLY' && (
                <div className="field">
                  <label>Deduct *</label>
                  <select className="select" value={pt.deductionMode} onChange={e => setPt({ ...pt, deductionMode: e.target.value })}>
                    <option value="SPREAD">A share every month</option>
                    <option value="LUMP_SUM">In full, in chosen months</option>
                  </select>
                </div>
              )}
            </div>
            {pt.frequency === 'HALF_YEARLY' && pt.deductionMode === 'LUMP_SUM' && (
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Deduction months — one in each half-year</label>
                <MonthPicker value={pt.deductionMonths} onChange={csv => setPt({ ...pt, deductionMonths: csv })} />
              </div>
            )}

            <div className="form-section">
              <div className="form-section-title">
                {pt.frequency === 'MONTHLY' ? 'Slabs — monthly gross' : 'Slabs — half-yearly gross'}
              </div>
              {pt.slabs.map((s: any, i: number) => (
                <div key={i} className="slab-row">
                  <div className="input-unit"><span className="unit">₹</span>
                    <input className="input" type="number" min={0} placeholder="From" required value={s.incomeFrom}
                      onChange={e => setSlab(i, { incomeFrom: e.target.value })} />
                  </div>
                  <div className="input-unit"><span className="unit">₹</span>
                    <input className="input" type="number" min={0} placeholder="To (blank = above)" value={s.incomeTo}
                      onChange={e => setSlab(i, { incomeTo: e.target.value })} />
                  </div>
                  <div className="input-unit"><span className="unit">₹</span>
                    <input className="input" type="number" min={0} step="0.01" placeholder="Tax" required value={s.amount}
                      onChange={e => setSlab(i, { amount: e.target.value })} />
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove slab"
                    disabled={pt.slabs.length === 1}
                    onClick={() => setPt({ ...pt, slabs: pt.slabs.filter((_: any, j: number) => j !== i) })}>✕</button>
                </div>
              ))}
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => setPt({ ...pt, slabs: [...pt.slabs, EMPTY_SLAB] })}>+ Add slab</button>
              <span className="hint" style={{ display: 'block', marginTop: 8 }}>
                Income from, income to, and the tax for that range. Leave "to" blank on the last slab.
              </span>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPt(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Policy'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Labour Welfare Fund policy */}
      <Modal title={lwf?.id ? 'Edit Labour Welfare Fund Policy' : 'Add Labour Welfare Fund Policy'}
        open={Boolean(lwf)} onClose={() => setLwf(null)}>
        {lwf && (
          <form onSubmit={e => {
            e.preventDefault();
            save(() => (lwf.id ? payrollAPI.updateLwfPolicy(lwf.id, lwf) : payrollAPI.createLwfPolicy(lwf)),
              () => setLwf(null), 'Failed to save the policy');
          }}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field"><label>State *</label>{stateSelect(lwf.state, v => setLwf({ ...lwf, state: v }))}</div>
              <div className="field">
                <label>Applies from *</label>
                <input className="input" type="month" required value={lwf.effectiveFrom}
                  onChange={e => setLwf({ ...lwf, effectiveFrom: e.target.value })} />
              </div>
              <div className="field">
                <label>Employee contribution *</label>
                <div className="input-unit"><span className="unit">₹</span>
                  <input className="input" type="number" min={0} step="0.01" required value={lwf.employeeAmount}
                    onChange={e => setLwf({ ...lwf, employeeAmount: e.target.value })} />
                </div>
              </div>
              <div className="field">
                <label>Employer contribution *</label>
                <div className="input-unit"><span className="unit">₹</span>
                  <input className="input" type="number" min={0} step="0.01" required value={lwf.employerAmount}
                    onChange={e => setLwf({ ...lwf, employerAmount: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>Months it is deducted *</label>
              <MonthPicker value={lwf.deductionMonths} onChange={csv => setLwf({ ...lwf, deductionMonths: csv })} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setLwf(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Policy'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
