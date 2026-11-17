import { useState, useEffect } from 'react';
import { leaveAPI } from '../../api/leave';
import { PageHeader, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { Button } from '../../components/Button';
import { toast } from '../../components/feedback';
import { type WeekOffRule, ORDINAL, WEEK_NUMBERS, WEEK_PRESETS } from '../../utils/weekOff';

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

  // Weekly-off editing. A day is off "every" week (in weekOffDays), on
  // "specific" week occurrences (a weekOffRules entry), or not off ("none").
  const rules = (): WeekOffRule[] => settings.weekOffRules || [];
  const dayMode = (i: number): 'none' | 'every' | 'weeks' =>
    settings.weekOffDays.includes(i) ? 'every' : rules().some(r => r.day === i) ? 'weeks' : 'none';
  const setOff = (days: number[], newRules: WeekOffRule[]) =>
    setSettings({ ...settings, weekOffDays: [...new Set(days)].sort((a, b) => a - b), weekOffRules: [...newRules].sort((a, b) => a.day - b.day) });

  const enableDay = (i: number, on: boolean) => {
    if (on) setOff([...settings.weekOffDays, i], rules().filter(r => r.day !== i)); // default: every week
    else setOff(settings.weekOffDays.filter((d: number) => d !== i), rules().filter(r => r.day !== i));
  };
  const setMode = (i: number, mode: 'every' | 'weeks') => {
    if (mode === 'every') setOff([...settings.weekOffDays, i], rules().filter(r => r.day !== i));
    else {
      const weeks = rules().find(r => r.day === i)?.weeks.length ? rules().find(r => r.day === i)!.weeks : [2, 4];
      setOff(settings.weekOffDays.filter((d: number) => d !== i), [...rules().filter(r => r.day !== i), { day: i, weeks }]);
    }
  };
  const toggleWeek = (i: number, w: number) => {
    const cur = rules().find(r => r.day === i)?.weeks || [];
    const weeks = cur.includes(w) ? cur.filter(x => x !== w) : [...cur, w].sort((a, b) => a - b);
    setOff(settings.weekOffDays, [...rules().filter(r => r.day !== i), { day: i, weeks }]);
  };
  const applyPreset = (i: number, weeks: number[]) =>
    setOff(settings.weekOffDays.filter((d: number) => d !== i), [...rules().filter(r => r.day !== i), { day: i, weeks }]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await leaveAPI.saveSettings({
        weekOffDays: settings.weekOffDays,
        weekOffRules: settings.weekOffRules || [],
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
        <div className="card card-pad lr-settings-card">
          <div className="field">
            <label>Weekly off days</label>
            <div className="lr-days">
              {DAYS.map((d, i) => {
                const mode = dayMode(i);
                const rule = rules().find(r => r.day === i);
                return (
                  <div key={i} className="lr-day">
                    <div className="lr-day-head">
                      <label className="lr-check">
                        <input type="checkbox" checked={mode !== 'none'} onChange={e => enableDay(i, e.target.checked)} /> {d}
                      </label>
                      {mode !== 'none' && (
                        <div className="lr-mode-btns">
                          <Button size="sm" variant={mode === 'every' ? 'primary' : 'secondary'} aria-pressed={mode === 'every'} onClick={() => setMode(i, 'every')}>Every week</Button>
                          <Button size="sm" variant={mode === 'weeks' ? 'primary' : 'secondary'} aria-pressed={mode === 'weeks'} onClick={() => setMode(i, 'weeks')}>Specific weeks</Button>
                        </div>
                      )}
                    </div>
                    {mode === 'weeks' && (
                      <div className="lr-day-weeks">
                        {WEEK_NUMBERS.map(w => (
                          <Button key={w} size="sm" className="lr-week-btn"
                            variant={rule?.weeks.includes(w) ? 'primary' : 'secondary'} aria-pressed={!!rule?.weeks.includes(w)}
                            onClick={() => toggleWeek(i, w)}>{ORDINAL[w - 1]}</Button>
                        ))}
                        <span className="lr-sep" aria-hidden="true">·</span>
                        {WEEK_PRESETS.map(p => (
                          <Button key={p.label} variant="ghost" size="sm" className="lr-preset" onClick={() => applyPreset(i, p.weeks)}>{p.label}</Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <small className="text-muted">Excluded from leave-day counts. Holidays are excluded too. “Specific weeks” means the nth occurrence of that day in the month — e.g. 2nd &amp; 4th Saturday.</small>
          </div>

          <div className="field">
            <label htmlFor="lr-year-start">Leave year starts in</label>
            <select id="lr-year-start" className="select lr-narrow" value={settings.leaveYearStartMonth}
              onChange={e => setSettings({ ...settings, leaveYearStartMonth: Number(e.target.value) })}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
            <small className="text-muted">January = calendar-year balances (the greytHR default).</small>
          </div>

          <label className="lr-toggle-row">
            <input type="checkbox" checked={settings.hrApplyOnBehalf} onChange={e => setSettings({ ...settings, hrApplyOnBehalf: e.target.checked })} />
            Let HR apply for leave on behalf of employees
          </label>

          <Button variant="accent" onClick={save} loading={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
        </div>
      )}

      <div className="card card-pad lr-section">
        <div className="lr-card-head">
          <h3 className="lr-section-title">Leave types</h3>
          <Button size="sm" icon="plus" onClick={() => openType()}>Add type</Button>
        </div>
        <p className="text-sm-muted lr-section-lede">
          Each type's policy: paid/unpaid, how it accrues, and an optional reviewer (sends requests of that type to one person instead of the reporting chain).
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Code</th><th>Name</th><th>Paid</th><th>Accrual</th><th>Reviewer</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {meta.types.map((t: any) => (
                <tr key={t.id}>
                  <td><span className="badge badge-neutral">{t.code}</span></td>
                  <td>{t.name}</td>
                  <td>{t.paid ? 'Paid' : <span className="badge badge-warning">Unpaid</span>}</td>
                  <td className="text-muted lr-date">{accrualLabel(t)}</td>
                  <td className="text-sm-muted">{t.reviewerId ? (meta.employees.find((e: any) => e.id === t.reviewerId)?.name || 'Reviewer') : 'Reporting chain'}</td>
                  <td><div className="row-actions"><Button size="sm" icon="pen" onClick={() => openType(t)}>Edit</Button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal title={typeForm.id ? `Edit ${typeForm.code}` : 'Add leave type'} open={typeOpen} onClose={() => setTypeOpen(false)}>
        <form onSubmit={saveType} className="lr-form">
          <div className="form-grid">
            <div className="field">
              <label htmlFor="lr-type-code">Code *</label>
              <input id="lr-type-code" className="input" required value={typeForm.code} disabled={!!typeForm.id}
                onChange={e => setTypeForm({ ...typeForm, code: e.target.value.toUpperCase() })} placeholder="e.g. ML" />
            </div>
            <div className="field">
              <label htmlFor="lr-type-name">Name *</label>
              <input id="lr-type-name" className="input" required value={typeForm.name} onChange={e => setTypeForm({ ...typeForm, name: e.target.value })} />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="lr-type-accrual">Accrual</label>
              <select id="lr-type-accrual" className="select" value={typeForm.accrualFrequency} onChange={e => setTypeForm({ ...typeForm, accrualFrequency: e.target.value })}>
                <option value="NONE">Manual only</option>
                <option value="MONTHLY">Monthly</option>
                <option value="ANNUAL">Annual</option>
              </select>
            </div>
            {typeForm.accrualFrequency === 'MONTHLY' && (
              <div className="field"><label htmlFor="lr-type-rate">Days / month</label><input id="lr-type-rate" className="input" type="number" step="0.25" value={typeForm.accrualRate} onChange={e => setTypeForm({ ...typeForm, accrualRate: e.target.value })} /></div>
            )}
            {typeForm.accrualFrequency === 'ANNUAL' && (
              <div className="field"><label htmlFor="lr-type-quota">Days / year</label><input id="lr-type-quota" className="input" type="number" step="0.5" value={typeForm.annualQuota} onChange={e => setTypeForm({ ...typeForm, annualQuota: e.target.value })} /></div>
            )}
          </div>
          <div className="field">
            <label htmlFor="lr-type-reviewer">Reviewer</label>
            <select id="lr-type-reviewer" className="select" value={typeForm.reviewerId} onChange={e => setTypeForm({ ...typeForm, reviewerId: e.target.value })}>
              <option value="">Reporting manager (chain)</option>
              {meta.employees.map((e2: any) => <option key={e2.id} value={e2.id}>{e2.name}{e2.employeeNo ? ` (${e2.employeeNo})` : ''}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lr-type-gender">Gender</label>
            <select id="lr-type-gender" className="select lr-narrow" value={typeForm.genderGate} onChange={e => setTypeForm({ ...typeForm, genderGate: e.target.value })}>
              <option value="">Any</option><option value="F">Female only</option><option value="M">Male only</option>
            </select>
          </div>
          <div className="lr-checks lr-checks-wide">
            {[['paid', 'Paid (unchecked = LOP)'], ['halfDayAllowed', 'Half-day allowed'], ['requiresAttachment', 'Requires document'], ['eligibleAfterProbation', 'After probation only'], ['encashable', 'Encashable']].map(([k, label]) => (
              <label key={k} className="lr-check">
                <input type="checkbox" checked={!!typeForm[k]} onChange={e => setTypeForm({ ...typeForm, [k]: e.target.checked })} /> {label}
              </label>
            ))}
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setTypeOpen(false)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={typeSaving}>{typeSaving ? 'Saving…' : 'Save type'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
