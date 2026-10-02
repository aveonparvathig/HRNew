import { useState, useEffect, useCallback } from 'react';
import { mastersAPI } from '../../api/masters';
import { LoadingBlock, ErrorAlert, SuccessAlert } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';

// What a series would write, for the preview while typing. The server
// has the same rule.
function sample(s: any): string {
  const now = new Date();
  const year = now.getFullYear();
  const fy = now.getMonth() >= 3 ? year : year - 1;
  const fill = (t: string) => String(t || '').replace(/\{YYYY\}/g, String(year)).replace(/\{FY\}/g, `${fy}-${String((fy + 1) % 100).padStart(2, '0')}`);
  const n = Math.max(1, Number(s.nextNumber) || 1);
  return `${fill(s.prefix)}${String(n).padStart(Math.max(1, Math.min(10, Number(s.padding) || 1)), '0')}${fill(s.suffix)}`;
}

// Running numbers: employee codes, letter references, settlements, payment batches.
export default function NumberSeriesTab() {
  const [series, setSeries] = useState<any[] | null>(null);
  const [forms, setForms] = useState<Record<string, any>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState('');

  const apply = (list: any[]) => {
    setSeries(list);
    setForms(Object.fromEntries(list.map(s => [s.key, { prefix: s.prefix, suffix: s.suffix, padding: s.padding, nextNumber: s.nextNumber }])));
  };

  const fetchData = useCallback(async () => {
    try {
      apply((await mastersAPI.getNumberSeries()).data.series);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the number series');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const run = async (key: string, call: () => Promise<any>, message: string) => {
    setSaving(key);
    setSuccess('');
    try {
      apply((await call()).data.series);
      setError('');
      setSuccess(message);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not save the series');
    } finally {
      setSaving('');
    }
  };

  if (!series) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading number series…" />;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <div className="alert alert-warning">
        <span>ⓘ</span>
        <span>
          A number is the text before it, the number with its digits, and the text after it. In the text,
          {' '}<code>{'{FY}'}</code> stands for the financial year (2026-27) and <code>{'{YYYY}'}</code> for the calendar year.
          Numbers already given out do not change when a series does.
        </span>
      </div>

      {series.map(s => {
        const form = forms[s.key];
        const set = (patch: any) => setForms({ ...forms, [s.key]: { ...form, ...patch } });
        return (
          <form key={s.key} className="card card-pad mb-24"
            onSubmit={e => { e.preventDefault(); run(s.key, () => mastersAPI.updateNumberSeries(s.key, form), `${s.label}: series saved.`); }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <h3 style={{ fontSize: 15, marginBottom: 4 }}>{s.label}</h3>
              <span className={`badge ${s.configured ? 'badge-success' : 'badge-neutral'}`}>
                {s.configured ? 'Series set' : s.key === 'EMPLOYEE_CODE' ? 'Default: EMP-0001 onward' : 'Not numbered'}
              </span>
            </div>
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              {s.hint}
              {s.key === 'EMPLOYEE_CODE' && ` The next code offered is ${s.next}; codes already in use are skipped.`}
              {s.key !== 'EMPLOYEE_CODE' && s.configured && ` The next one is ${s.next}.`}
            </p>
            <div className="form-grid">
              <div className="field">
                <label>Text before the number</label>
                <input className="input" maxLength={30} placeholder="e.g. AVN/{FY}/" value={form.prefix} onChange={e => set({ prefix: e.target.value })} />
              </div>
              <div className="field">
                <label>Digits</label>
                <input className="input" type="number" min={1} max={10} step={1} required value={form.padding}
                  onChange={e => set({ padding: e.target.value === '' ? '' : Number(e.target.value) })} />
              </div>
              <div className="field">
                <label>Next number</label>
                <input className="input" type="number" min={1} step={1} required value={form.nextNumber}
                  onChange={e => set({ nextNumber: e.target.value === '' ? '' : Number(e.target.value) })} />
              </div>
              <div className="field">
                <label>Text after the number</label>
                <input className="input" maxLength={30} value={form.suffix} onChange={e => set({ suffix: e.target.value })} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
              <button type="submit" className="btn btn-primary" disabled={saving === s.key}>{saving === s.key ? 'Saving…' : 'Save Series'}</button>
              {s.configured && (
                <button type="button" className="btn btn-ghost" disabled={saving === s.key}
                  onClick={async () => await confirmDialog({
                    title: `Remove the series for ${s.label.toLowerCase()}?`,
                    message: s.key === 'EMPLOYEE_CODE'
                      ? 'Employee codes go back to EMP-0001 onward, counted from the number of employees.'
                      : 'New ones are no longer numbered. Those already numbered keep their numbers.',
                    confirmLabel: 'Remove',
                  }) && run(s.key, () => mastersAPI.deleteNumberSeries(s.key), `${s.label}: series removed.`)}>
                  Remove Series
                </button>
              )}
              <span className="text-muted" style={{ fontSize: 12.5 }}>As typed, the next number reads <strong>{sample(form)}</strong></span>
            </div>
          </form>
        );
      })}
    </>
  );
}
