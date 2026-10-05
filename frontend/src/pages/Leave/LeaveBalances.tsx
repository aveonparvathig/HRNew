import { useState, useEffect, useCallback } from 'react';
import { leaveAPI } from '../../api/leave';
import { PageHeader, EmptyState, LoadingBlock, ErrorAlert, Modal } from '../../components/ui';
import { toast } from '../../components/feedback';

const thisYear = new Date().getFullYear();

export default function LeaveBalances() {
  const [meta, setMeta] = useState<any>({ types: [], employees: [] });
  const [personId, setPersonId] = useState('');
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [grantOpen, setGrantOpen] = useState(false);
  const [form, setForm] = useState<any>({ leaveTypeId: '', days: '', effectiveDate: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [accrualOpen, setAccrualOpen] = useState(false);
  const [accrualMonth, setAccrualMonth] = useState(new Date().toISOString().slice(0, 7));
  const [preview, setPreview] = useState<any>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => { leaveAPI.getMeta().then(r => setMeta(r.data)).catch(() => {}); }, []);

  const load = useCallback(() => {
    if (!personId) { setRows(null); return; }
    setLoading(true);
    leaveAPI.getBalances({ personId, year })
      .then(r => { setRows(r.data.rows); setError(''); })
      .catch(err => setError(err.response?.data?.error || 'Failed to load balances'))
      .finally(() => setLoading(false));
  }, [personId, year]);

  useEffect(() => { load(); }, [load]);

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await leaveAPI.grant({ ...form, personId, days: Number(form.days) });
      toast.success(res.data.message);
      setGrantOpen(false);
      setForm({ leaveTypeId: '', days: '', effectiveDate: '', note: '' });
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not grant leave');
    } finally {
      setSaving(false);
    }
  };

  const runAccrual = async (dryRun: boolean) => {
    setRunning(true);
    try {
      const res = await leaveAPI.runAccrual(accrualMonth, dryRun);
      if (dryRun) { setPreview(res.data); }
      else {
        toast.success(`Credited ${res.data.totalDays} day(s) to ${new Set(res.data.credited.map((c: any) => c.personId)).size} employee(s).`);
        setAccrualOpen(false); setPreview(null); load();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Accrual failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <PageHeader title="Leave balances" subtitle="Per-employee leave ledger. Grant, adjust, or run monthly accrual."
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => { setPreview(null); setAccrualOpen(true); }}>Run accrual</button>
            {personId && <button className="btn btn-primary" onClick={() => setGrantOpen(true)}>+ Grant / Adjust</button>}
          </>
        } />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="toolbar">
        <select className="select" value={personId} onChange={e => setPersonId(e.target.value)} style={{ minWidth: 240 }}>
          <option value="">Select an employee…</option>
          {meta.employees.map((e2: any) => <option key={e2.id} value={e2.id}>{e2.name}{e2.employeeNo ? ` (${e2.employeeNo})` : ''}</option>)}
        </select>
        <select className="select" value={year} onChange={e => setYear(Number(e.target.value))}>
          {[thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="card">
        {!personId ? (
          <EmptyState icon="◷" title="Pick an employee" message="Select an employee to see their leave ledger." />
        ) : loading ? <LoadingBlock label="Loading balances…" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Code</th><th>Leave Type</th><th className="num">O/B</th><th className="num">Granted</th><th className="num">Availed</th><th className="num">Applied</th><th className="num">Lapsed</th><th className="num">Balance</th></tr>
              </thead>
              <tbody>
                {(rows || []).map(r => (
                  <tr key={r.leaveTypeId}>
                    <td><span className="badge badge-neutral">{r.code}</span></td>
                    <td>{r.name}{!r.paid && <span className="badge badge-warning" style={{ marginLeft: 6 }}>unpaid</span>}</td>
                    <td className="num">{r.opening}</td>
                    <td className="num">{r.granted}</td>
                    <td className="num">{r.availed}</td>
                    <td className="num text-muted">{r.applied}</td>
                    <td className="num text-muted">{r.lapsed}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{r.paid ? r.balance : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title="Grant / adjust leave" open={grantOpen} onClose={() => setGrantOpen(false)}>
        <form onSubmit={grant}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Leave type *</label>
            <select className="select" required value={form.leaveTypeId} onChange={e => setForm({ ...form, leaveTypeId: e.target.value })}>
              <option value="">Select type…</option>
              {meta.types.map((t: any) => <option key={t.id} value={t.id}>{t.code} — {t.name}</option>)}
            </select>
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field"><label>Days *</label><input className="input" type="number" step="0.5" required value={form.days} onChange={e => setForm({ ...form, days: e.target.value })} placeholder="e.g. 12 (negative to deduct)" /></div>
            <div className="field"><label>Effective date</label><input className="input" type="date" value={form.effectiveDate} onChange={e => setForm({ ...form, effectiveDate: e.target.value })} /></div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}><label>Note</label><input className="input" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="e.g. Annual credit" /></div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setGrantOpen(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Apply'}</button>
          </div>
        </form>
      </Modal>

      <Modal title="Run monthly accrual" open={accrualOpen} onClose={() => setAccrualOpen(false)}>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Credits each employee their leave accrual for the month, per each type's policy. Safe to re-run — anyone already credited for the month is skipped.
        </p>
        <div className="field" style={{ marginBottom: 14 }}>
          <label>Month</label>
          <input className="input" type="month" style={{ maxWidth: 200 }} value={accrualMonth}
            onChange={e => { setAccrualMonth(e.target.value); setPreview(null); }} />
        </div>
        {preview && (
          <div className="card" style={{ background: 'var(--surface-2)', marginBottom: 14 }}>
            {preview.credited.length === 0 ? <span className="text-muted">Nothing to credit for {preview.period} (already done, or no accruing types).</span> : (
              <>
                <div style={{ marginBottom: 6 }}><strong>{new Set(preview.credited.map((c: any) => c.personId)).size}</strong> employee(s) · <strong>{preview.totalDays}</strong> day(s) total</div>
                <div className="text-muted" style={{ fontSize: 12 }}>
                  {Object.entries(preview.credited.reduce((m: any, c: any) => { m[c.code] = (m[c.code] || 0) + c.days; return m; }, {})).map(([code, d]: any) => `${code}: ${Math.round(d * 100) / 100}`).join(' · ')}
                </div>
              </>
            )}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setAccrualOpen(false)}>Close</button>
          <button type="button" className="btn btn-secondary" disabled={running} onClick={() => runAccrual(true)}>{running ? '…' : 'Preview'}</button>
          <button type="button" className="btn btn-primary" disabled={running || (preview && preview.credited.length === 0)} onClick={() => runAccrual(false)}>{running ? 'Crediting…' : 'Credit now'}</button>
        </div>
      </Modal>
    </>
  );
}
