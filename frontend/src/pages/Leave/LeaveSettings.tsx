import { useState, useEffect } from 'react';
import { leaveAPI } from '../../api/leave';
import { PageHeader, LoadingBlock, ErrorAlert } from '../../components/ui';
import { toast } from '../../components/feedback';

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

  const setReviewer = async (typeId: string, reviewerId: string) => {
    try {
      await leaveAPI.updateType(typeId, { reviewerId });
      setMeta((m: any) => ({ ...m, types: m.types.map((t: any) => t.id === typeId ? { ...t, reviewerId } : t) }));
      toast.success('Reviewer updated.');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not update reviewer');
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

      {meta.types.length > 0 && (
        <div className="card card-pad" style={{ maxWidth: 620, marginTop: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 6 }}>Leave type reviewers</h3>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            Assign a reviewer to send all requests of a type to one person instead of up the reporting chain. Leave blank to use the reporting manager.
          </p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Leave type</th><th>Reviewer</th></tr></thead>
              <tbody>
                {meta.types.map((t: any) => (
                  <tr key={t.id}>
                    <td><span className="badge badge-neutral">{t.code}</span> {t.name}</td>
                    <td>
                      <select className="select" value={t.reviewerId || ''} onChange={e => setReviewer(t.id, e.target.value)} style={{ minWidth: 200 }}>
                        <option value="">Reporting manager (chain)</option>
                        {meta.employees.map((e2: any) => <option key={e2.id} value={e2.id}>{e2.name}{e2.employeeNo ? ` (${e2.employeeNo})` : ''}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
