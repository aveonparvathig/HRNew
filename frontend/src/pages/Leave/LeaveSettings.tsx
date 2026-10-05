import { useState, useEffect } from 'react';
import { leaveAPI } from '../../api/leave';
import { PageHeader, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { toast } from '../../components/feedback';

const EMPTY_TYPE = {
  id: '', code: '', name: '', paid: true, accrualFrequency: 'NONE', accrualRate: 0, annualQuota: 0,
  halfDayAllowed: true, requiresAttachment: false, eligibleAfterProbation: false, encashable: false,
  genderGate: '', reviewerId: '',
};
const accrualLabel = (t: any) => t.accrualFrequency === 'MONTHLY' ? `${t.accrualRate}/mo`
  : t.accrualFrequency === 'ANNUAL' ? `${t.annualQuota}/yr` : 'Manual';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function LeaveSettings() {
  const [settings, setSettings] = useState<any>(null);
  const [meta, setMeta] = useState<any>({ types: [], employees: [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    leaveAPI.getSettings().then(r => setSettings(r.data)).catch(err => setError(err.response?.data?.error || 'Failed to load settings'));
    leaveAPI.getMeta().then(r => setMeta(r.data)).catch(() => {});
  }, []);

  const [typeOpen, setTypeOpen] = useState(false);
  const [typeForm, setTypeForm] = useState<any>(EMPTY_TYPE);
  const [typeSaving, setTypeSaving] = useState(false);

  const reloadMeta = () => leaveAPI.getMeta().then(r => setMeta(r.data)).catch(() => {});

  const openType = (t?: any) => {
    setTypeForm(t ? { ...EMPTY_TYPE, ...t, reviewerId: t.reviewerId || '' } : EMPTY_TYPE);
    setTypeOpen(true);
  };

  const saveType = async (e: React.FormEvent) => {
    e.preventDefault();
    setTypeSaving(true);
    const payload = {
      name: typeForm.name, paid: typeForm.paid, accrualFrequency: typeForm.accrualFrequency,
      accrualRate: Number(typeForm.accrualRate) || 0, annualQuota: Number(typeForm.annualQuota) || 0,
      halfDayAllowed: typeForm.halfDayAllowed, requiresAttachment: typeForm.requiresAttachment,
      eligibleAfterProbation: typeForm.eligibleAfterProbation, encashable: typeForm.encashable,
      genderGate: typeForm.genderGate, reviewerId: typeForm.reviewerId || '',
    };
    try {
      if (typeForm.id) await leaveAPI.updateType(typeForm.id, payload);
      else await leaveAPI.createType({ ...payload, code: typeForm.code });
      setTypeOpen(false);
      reloadMeta();
      toast.success('Leave type saved.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not save leave type');
    } finally {
      setTypeSaving(false);
    }
  };

  const toggleDay = (d: number) => {
    const set = new Set(settings.weekOffDays);
    set.has(d) ? set.delete(d) : set.add(d);
    setSettings({ ...settings, weekOffDays: [...set].sort((a: any, b: any) => a - b) });
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await leaveAPI.saveSettings({
        weekOffDays: settings.weekOffDays,
        leaveYearStartMonth: settings.leaveYearStartMonth,
        hrApplyOnBehalf: settings.hrApplyOnBehalf,
      });
      setSettings(res.data);
      toast.success('Leave settings saved.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (!settings && !error) return <LoadingBlock label="Loading settings…" />;

  return (
    <>
      <PageHeader title="Leave settings" subtitle="Week-offs, the leave year, and who can apply on behalf of employees." />
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {settings && (
        <div className="card card-pad" style={{ maxWidth: 620 }}>
          <div className="field" style={{ marginBottom: 20 }}>
            <label>Weekly off days</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
              {DAYS.map((d, i) => (
                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                  <input type="checkbox" checked={settings.weekOffDays.includes(i)} onChange={() => toggleDay(i)} /> {d}
                </label>
              ))}
            </div>
            <small className="text-muted">Excluded from leave-day counts. Holidays are excluded too.</small>
          </div>

          <div className="field" style={{ marginBottom: 20 }}>
            <label>Leave year starts in</label>
            <select className="select" style={{ maxWidth: 220 }} value={settings.leaveYearStartMonth}
              onChange={e => setSettings({ ...settings, leaveYearStartMonth: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <small className="text-muted">January = calendar-year balances (the greytHR default).</small>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 14 }}>
            <input type="checkbox" checked={settings.hrApplyOnBehalf} onChange={e => setSettings({ ...settings, hrApplyOnBehalf: e.target.checked })} />
            Let HR apply for leave on behalf of employees
          </label>

          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</button>
        </div>
      )}

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <h3 style={{ fontSize: 15, margin: 0 }}>Leave types</h3>
          <button className="btn btn-primary btn-sm" onClick={() => openType()}>+ Add type</button>
        </div>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          Each type's policy: paid/unpaid, how it accrues, and an optional reviewer (sends requests of that type to one person instead of the reporting chain).
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Code</th><th>Name</th><th>Paid</th><th>Accrual</th><th>Reviewer</th><th /></tr></thead>
            <tbody>
              {meta.types.map((t: any) => (
                <tr key={t.id}>
                  <td><span className="badge badge-neutral">{t.code}</span></td>
                  <td>{t.name}</td>
                  <td>{t.paid ? 'Paid' : <span className="badge badge-warning">Unpaid</span>}</td>
                  <td className="text-muted">{accrualLabel(t)}</td>
                  <td className="text-muted" style={{ fontSize: 12.5 }}>{t.reviewerId ? (meta.employees.find((e: any) => e.id === t.reviewerId)?.name || 'Reviewer') : 'Reporting chain'}</td>
                  <td><div className="row-actions"><button className="btn btn-secondary btn-sm" onClick={() => openType(t)}>Edit</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal title={typeForm.id ? `Edit ${typeForm.code}` : 'Add leave type'} open={typeOpen} onClose={() => setTypeOpen(false)}>
        <form onSubmit={saveType}>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Code *</label>
              <input className="input" required value={typeForm.code} disabled={!!typeForm.id}
                onChange={e => setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })} placeholder="e.g. ML" />
            </div>
            <div className="field">
              <label>Name *</label>
              <input className="input" required value={typeForm.name} onChange={e => setTypeForm({ ...typeForm, name: e.target.value })} />
            </div>
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Accrual</label>
              <select className="select" value={typeForm.accrualFrequency} onChange={e => setTypeForm({ ...typeForm, accrualFrequency: e.target.value })}>
                <option value="NONE">Manual only</option>
                <option value="MONTHLY">Monthly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </div>
            {typeForm.accrualFrequency === 'MONTHLY' && (
              <div className="field"><label>Days / month</label><input className="input" type="number" step="0.25" value={typeForm.accrualRate} onChange={e => setTypeForm({ ...typeForm, accrualRate: e.target.value })} /></div>
            )}
            {typeForm.accrualFrequency === 'ANNUAL' && (
              <div className="field"><label>Days / year</label><input className="input" type="number" step="0.5" value={typeForm.annualQuota} onChange={e => setTypeForm({ ...typeForm, annualQuota: e.target.value })} /></div>
            )}
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Reviewer</label>
            <select className="select" value={typeForm.reviewerId} onChange={e => setTypeForm({ ...typeForm, reviewerId: e.target.value })}>
              <option value="">Reporting manager (chain)</option>
              {meta.employees.map((e2: any) => <option key={e2.id} value={e2.id}>{e2.name}{e2.employeeNo ? ` (${e2.employeeNo})` : ''}</option>)}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Gender</label>
            <select className="select" style={{ maxWidth: 220 }} value={typeForm.genderGate} onChange={e => setTypeForm({ ...typeForm, genderGate: e.target.value })}>
              <option value="">Any</option><option value="F">Female only</option><option value="M">Male only</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 18, fontSize: 13 }}>
            {[['paid', 'Paid (unchecked = LOP)'], ['halfDayAllowed', 'Half-day allowed'], ['requiresAttachment', 'Requires document'], ['eligibleAfterProbation', 'After probation only'], ['encashable', 'Encashable']].map(([k, label]) => (
              <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox" checked={!!typeForm[k]} onChange={e => setTypeForm({ ...typeForm, [k]: e.target.checked })} /> {label}
              </label>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setTypeOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={typeSaving}>{typeSaving ? 'Saving…' : 'Save type'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
