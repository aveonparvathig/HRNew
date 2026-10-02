import { useState, useEffect, useCallback } from 'react';
import { peopleAPI } from '../api/people';
import { Modal, ErrorAlert } from './ui';
import { formatDate } from '../utils/format';
import { confirmDialog, toast } from './feedback';
import ListSelect from './ListSelect';

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const STATE_BADGES: Record<string, [string, string]> = {
  CURRENT: ['badge-success', 'Current'],
  UPCOMING: ['badge-warning', 'Upcoming'],
};

// An employee's designation, department, work location and grade over
// time. HR records a change from a date; the employee sees their own.
export default function PositionHistoryCard({ person, meta, canManage, onChanged }: {
  person: any; meta: any; canManage: boolean; onChanged: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null); // the change being entered, or null
  const [typed, setTyped] = useState<string[]>([]); // the fields changed by hand in the form
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setData((await peopleAPI.getPositions(person.id)).data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the position history');
    }
  }, [person.id]);

  // The profile form corrects the current record, so the card follows the profile
  useEffect(() => { fetchData(); }, [fetchData, person.designation, person.department, person.workLocationId, person.grade, person.joinDate]);

  // The position held on a date: the latest record on or before it (history runs newest first)
  const heldOn = (date: string) => {
    const rows: any[] = data?.history || [];
    const row = rows.find(r => r.effectiveFrom <= date) || rows[rows.length - 1] || person;
    return {
      designation: row.designation || '', department: row.department || '',
      workLocationId: row.workLocationId || '', grade: row.grade || '',
    };
  };
  const openForm = () => {
    setTyped([]);
    setForm({ effectiveFrom: today(), reason: '', remarks: '', ...heldOn(today()) });
  };
  const set = (k: string, v: any) => {
    setTyped(t => (t.includes(k) ? t : [...t, k]));
    setForm((f: any) => ({ ...f, [k]: v }));
  };
  // A back-dated change starts from the position held then, not today's;
  // what was already typed stays
  const setDate = (date: string) => setForm((f: any) => {
    const held: any = heldOn(date);
    return { ...f, effectiveFrom: date, ...Object.fromEntries(Object.keys(held).filter(k => !typed.includes(k)).map(k => [k, held[k]])) };
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await peopleAPI.changePosition(person.id, form);
      setData((d: any) => ({ ...d, ...res.data }));
      setForm(null);
      setError('');
      toast.success(res.data.message);
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not record the change');
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: any) => {
    const ok = await confirmDialog({
      title: 'Remove this record?',
      message: `The ${row.reasonLabel.toLowerCase()} of ${formatDate(row.effectiveFrom)} is removed, and the months it covered read the record before it.`,
      confirmLabel: 'Remove', danger: true,
    });
    if (!ok) return;
    try {
      const res = await peopleAPI.deletePosition(row.id);
      setData((d: any) => ({ ...d, ...res.data }));
      setError('');
      toast.success(res.data.message);
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not remove the record');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : null;
  const history: any[] = data.history;
  const replacing = form && history.find(r => r.effectiveFrom === form.effectiveFrom);
  const reasons: any[] = data.reasons || meta?.positionReasons || [];

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div>
          <h3>Position history ({history.length})</h3>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            Payslips and reports of a month print the designation and department held in that month.
          </span>
        </div>
        {canManage && <button className="btn btn-primary btn-sm" onClick={openForm}>Change Position</button>}
      </div>
      <div style={{ padding: '0 22px' }}>
        <ErrorAlert message={error} onDismiss={() => setError('')} />
      </div>
      {history.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>From</th><th>Designation</th><th>Department</th><th>Work location</th><th>Grade</th>
                <th>Reason</th>{canManage && <th>Recorded by</th>}{canManage && <th />}
              </tr>
            </thead>
            <tbody>
              {history.map(r => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <span style={{ fontWeight: 600 }}>{formatDate(r.effectiveFrom)}</span>
                    {STATE_BADGES[r.state] && <> <span className={`badge ${STATE_BADGES[r.state][0]}`}>{STATE_BADGES[r.state][1]}</span></>}
                    {r.until && <div className="text-muted" style={{ fontSize: 12 }}>to {formatDate(r.until)}</div>}
                  </td>
                  <td>{r.designation || '—'}</td>
                  <td>{r.department || '—'}</td>
                  <td>{r.locationName || '—'}</td>
                  <td>{r.grade || '—'}</td>
                  <td>
                    {r.reasonLabel}
                    {r.changes.length > 0 && <div className="text-muted" style={{ fontSize: 12 }}>{r.changes.join(' · ')}</div>}
                    {r.remarks && <div className="text-muted" style={{ fontSize: 12 }}>{r.remarks}</div>}
                  </td>
                  {canManage && <td>{r.enteredByName || '—'}</td>}
                  {canManage && (
                    <td>
                      {!r.first && (
                        <div className="row-actions">
                          <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>Remove</button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title={`Change Position — ${person.name}`} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={save}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Effective from *</label>
                <input className="input" type="date" required value={form.effectiveFrom}
                  min={history.length ? history[history.length - 1].effectiveFrom : undefined}
                  onChange={e => setDate(e.target.value)} />
                <span className="hint">
                  {replacing
                    ? `There is a record on this date already. Saving corrects it.`
                    : form.effectiveFrom > today()
                      ? 'A date ahead: the employee keeps the present position until that day.'
                      : history.some(r => r.effectiveFrom > form.effectiveFrom)
                        ? 'Payslips from this month on print the new position. Later records that still hold the old value take the new one.'
                        : 'Payslips from this month on print the new position. Earlier months keep the old one.'}
                </span>
              </div>
              <div className="field">
                <label>Reason *</label>
                <select className="select" required value={form.reason} onChange={e => set('reason', e.target.value)}>
                  <option value="">—</option>
                  {reasons.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Designation</label>
                <ListSelect listType="DESIGNATION" value={form.designation} onChange={v => set('designation', v)} />
              </div>
              <div className="field">
                <label>Department</label>
                <ListSelect listType="DEPARTMENT" value={form.department} onChange={v => set('department', v)} />
              </div>
              <div className="field">
                <label>Work location</label>
                <select className="select" value={form.workLocationId} onChange={e => set('workLocationId', e.target.value)}>
                  <option value="">—</option>
                  {(meta?.workLocations || []).map((l: any) => <option key={l.id} value={l.id}>{l.name} — {l.state}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Grade</label>
                <ListSelect listType="GRADE" value={form.grade} onChange={v => set('grade', v)} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Remarks</label>
                <input className="input" maxLength={500} placeholder="e.g. Annual review, moved to the Chennai office"
                  value={form.remarks} onChange={e => set('remarks', e.target.value)} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : replacing ? 'Correct Record' : 'Save Change'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
