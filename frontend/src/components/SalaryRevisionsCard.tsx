import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../api/payroll';
import { Modal, ErrorAlert } from './ui';
import { formatINR } from '../utils/format';

const monthLabel = (date: string) => {
  const [y, m] = date.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

// Salary history of one employee, with the form to record a revision.
export default function SalaryRevisionsCard({ person, onChanged }: { person: any; onChanged: () => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ newMonthlyPackage: '', effectiveMonth: thisMonth(), reason: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getRevisions(person.id);
      setData(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load salary revisions');
    }
  }, [person.id]);

  useEffect(() => { fetchData(); }, [fetchData, person.currentMonthlyPackage]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await payrollAPI.createRevision(person.id, form);
      setOpen(false);
      setError('');
      setNotice([
        res.data.draftEntriesUpdated ? `${res.data.draftEntriesUpdated} draft payslip${res.data.draftEntriesUpdated === 1 ? '' : 's'} recalculated with the new package.` : '',
        res.data.finalizedThrough ? `Payroll up to ${monthLabel(res.data.finalizedThrough)} is already finalized and keeps the old package.` : '',
      ].filter(Boolean).join(' '));
      setForm({ newMonthlyPackage: '', effectiveMonth: thisMonth(), reason: '' });
      fetchData();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save the revision');
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (revision: any) => {
    if (!window.confirm(`Remove the revision effective ${monthLabel(revision.effectiveFrom)}?`)) return;
    try {
      const res = await payrollAPI.deleteRevision(person.id, revision.id);
      setNotice(res.data.draftEntriesUpdated
        ? `${res.data.draftEntriesUpdated} draft payslip${res.data.draftEntriesUpdated === 1 ? '' : 's'} recalculated with the earlier package.`
        : '');
      fetchData();
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove the revision');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : null;
  const revisions = data.revisions;

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div>
          <h3>Salary revisions ({revisions.length})</h3>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            Current package {formatINR(data.currentMonthlyPackage)} a month
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to={`/payroll/reports/ctc-breakup?personId=${person.id}`} className="btn btn-secondary btn-sm">CTC Breakup</Link>
          <button className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>Revise Salary</button>
        </div>
      </div>
      <div style={{ padding: '0 22px' }}>
        <ErrorAlert message={error} onDismiss={() => setError('')} />
        {notice && <div className="alert alert-warning"><span>⚠</span>{notice}</div>}
      </div>
      {revisions.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Effective from</th><th className="num">Old</th><th className="num">New</th>
                <th className="num">Change</th><th>Reason</th><th>Recorded by</th><th />
              </tr>
            </thead>
            <tbody>
              {revisions.map((r: any, i: number) => {
                const diff = r.newMonthlyPackage - r.oldMonthlyPackage;
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600 }}>{monthLabel(r.effectiveFrom)}</td>
                    <td className="num text-muted">{formatINR(r.oldMonthlyPackage)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(r.newMonthlyPackage)}</td>
                    <td className={`num ${diff >= 0 ? 'text-success' : 'text-warning'}`}>
                      {diff >= 0 ? '+' : '−'}{formatINR(Math.abs(diff))}
                      {r.oldMonthlyPackage > 0 && ` (${((diff / r.oldMonthlyPackage) * 100).toFixed(1)}%)`}
                    </td>
                    <td>{r.reason || '—'}</td>
                    <td>{r.createdByName || '—'}</td>
                    <td>
                      {i === 0 && (
                        <div className="row-actions">
                          <button className="btn btn-danger btn-sm" onClick={() => handleRemove(r)}>Remove</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal title={`Revise Salary — ${person.name}`} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={handleSave}>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>New monthly package *</label>
              <div className="input-unit"><span className="unit">₹</span>
                <input className="input" type="number" min={1} step="0.01" required
                  value={form.newMonthlyPackage}
                  onChange={e => setForm({ ...form, newMonthlyPackage: e.target.value })} />
              </div>
              <span className="hint">Currently {formatINR(data.currentMonthlyPackage)}</span>
            </div>
            <div className="field">
              <label>Applies from *</label>
              <input className="input" type="month" required value={form.effectiveMonth}
                onChange={e => setForm({ ...form, effectiveMonth: e.target.value })} />
              <span className="hint">Payroll for this month and later uses the new package. Draft runs update now; finalized runs do not change.</span>
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Reason</label>
              <input className="input" placeholder="e.g. Annual increment" value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Revision'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
