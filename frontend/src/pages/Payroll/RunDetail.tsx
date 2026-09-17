import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal, StatusBadge, BackButton,
} from '../../components/ui';
import { formatINR } from '../../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

export default function RunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();
  const [run, setRun] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [entryModal, setEntryModal] = useState<any>(null); // entry being edited
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [attModal, setAttModal] = useState(false);
  const [attFile, setAttFile] = useState('');
  const [attFileName, setAttFileName] = useState('');
  const [attResult, setAttResult] = useState<any>(null);
  const [attBusy, setAttBusy] = useState(false);

  const handleAttFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAttFileName(file.name);
    setAttResult(null);
    const reader = new FileReader();
    reader.onload = () => setAttFile(String(reader.result || ''));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const runAttImport = async (dryRun: boolean) => {
    if (!attFile) { setError('Choose the filled attendance file first'); return; }
    setAttBusy(true);
    try {
      const res = await payrollAPI.importAttendance(run.id, attFile, dryRun);
      setAttResult(res.data);
      setError('');
      if (!dryRun) {
        setSuccess(`Attendance imported: ${res.data.summary.updated} entries recalculated.`);
        setAttModal(false);
        setAttFile('');
        setAttFileName('');
        fetchData();
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Attendance import failed');
    } finally {
      setAttBusy(false);
    }
  };

  const downloadAttTemplate = async () => {
    const res = await payrollAPI.attendanceTemplate(run.id);
    const url = URL.createObjectURL(new Blob([res.data],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${run.period}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getRunDetail(runId!);
      setRun(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load run');
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isDraft = run?.status === 'DRAFT';

  const openEntry = (entry: any) => {
    setForm({
      monthlyPackage: entry.monthlyPackage,
      totalWorkingDays: entry.totalWorkingDays,
      empLeaveDays: entry.empLeaveDays,
      lopDays: entry.lopDays,
      internetAllowance: entry.internetAllowance,
      salaryArrearAllowance: entry.salaryArrearAllowance,
      salaryAdvance: entry.salaryAdvance,
      tds: entry.tds,
      isEsiEligible: entry.isEsiEligible,
      isPfApplicable: entry.isPfApplicable,
      remarks: entry.remarks,
    });
    setEntryModal(entry);
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await payrollAPI.updateEntry(entryModal.id, form);
      setEntryModal(null);
      setError('');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save entry');
    } finally {
      setSaving(false);
    }
  };

  const act = async (fn: () => Promise<any>, okMsg?: string) => {
    try {
      const res = await fn();
      setSuccess(okMsg || res?.data?.message || '');
      setError('');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Action failed');
    }
  };

  const handleExport = async () => {
    const res = await payrollAPI.exportRunCsv(run.id);
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-${run.period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteRun = async () => {
    if (!window.confirm(`Delete the ${monthLabel(run.period)} draft run and all its entries?`)) return;
    try {
      await payrollAPI.deleteRun(run.id);
      navigate('/payroll');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete run');
    }
  };

  if (loading) return <LoadingBlock label="Loading run…" />;
  if (!run) {
    return <EmptyState icon="▦" title="Run not found"
      action={<Link to="/payroll" className="btn btn-secondary">Back to Payroll</Link>} />;
  }

  const t = run.totals;

  // ---- Month-over-month trend chips (vs latest earlier run) ----
  const prevShort = run.prev
    ? (() => { const [y, m] = run.prev.period.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' }); })()
    : '';
  const trendChip = (cur: number, prevV: number | undefined, invert = false) => {
    if (!run.prev || prevV == null || prevV === 0) return null;
    const d = cur - prevV;
    if (Math.abs(d) < 1) return <span className="trend-chip trend-flat">— same as {prevShort}</span>;
    const pct = Math.abs((d / prevV) * 100);
    const up = d > 0;
    const good = invert ? !up : up;
    return (
      <span className={`trend-chip ${good ? 'trend-good' : 'trend-bad'}`}
        title={`${up ? '+' : '−'}${formatINR(Math.abs(d))} vs ${prevShort} (${formatINR(prevV)})`}>
        {up ? '▲' : '▼'} {pct >= 10 ? Math.round(pct) : pct.toFixed(1)}% vs {prevShort}
      </span>
    );
  };

  // ---- Payout composition: where the gross goes ----
  const compSum = (f: string) => run.entries.reduce((s: number, e: any) => s + (e[f] || 0), 0);
  const segments = [
    { label: 'Net pay', value: t.net, color: 'var(--success-dot, #129D61)' },
    { label: 'PF', value: compSum('pfEmployee'), color: 'var(--primary, #5A5FE0)' },
    { label: 'ESI', value: compSum('esiEmployee'), color: '#0E9CB8' },
    { label: 'Advance', value: compSum('salaryAdvance'), color: '#F79009' },
    { label: 'TDS', value: compSum('tds'), color: '#B42318' },
  ].filter(s => s.value > 0.5);
  const netShare = t.gross > 0 ? (t.net / t.gross) * 100 : 0;

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <span>{monthLabel(run.period)}</span>
      </div>

      <PageHeader
        title={`Payroll — ${monthLabel(run.period)}`}
        subtitle={`${t.employees} employees · ${t.pfCount} PF · ${t.esiCount} ESI${run.notes ? ` · ${run.notes}` : ''}`}
        actions={
          <>
            <StatusBadge status={run.status === 'FINALIZED' ? 'finalized' : 'draft'} />
            <button className="btn btn-secondary" onClick={handleExport}>⤓ Register</button>
            <Link to={`/payroll/runs/${run.id}/reports/pf-esi`} className="btn btn-secondary">▤ PF &amp; ESI</Link>
            <Link to={`/payroll/runs/${run.id}/reports/comparison`} className="btn btn-secondary">⇄ vs Prev Month</Link>
            <Link to={`/payroll/runs/${run.id}/payslips`} className="btn btn-secondary">
              🖨 All Payslips
            </Link>
            {isDraft ? (
              <>
                <button className="btn btn-secondary" onClick={() => setAttModal(true)}>
                  ⤒ Import Attendance
                </button>
                <button className="btn btn-secondary"
                  onClick={() => act(() => payrollAPI.recalculateRun(run.id))}>
                  ↻ Recalculate
                </button>
                <button className="btn btn-danger" onClick={handleDeleteRun}>Delete</button>
                <button className="btn btn-primary"
                  onClick={() => window.confirm('Finalize this run? Entries lock until reopened.')
                    && act(() => payrollAPI.finalizeRun(run.id), 'Run finalized.')}>
                  ✓ Finalize
                </button>
              </>
            ) : (
              <button className="btn btn-secondary"
                onClick={() => act(() => payrollAPI.reopenRun(run.id), 'Run reopened for edits.')}>
                ↺ Reopen
              </button>
            )}
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {success && (
        <div className="alert alert-success">
          <span>✓</span><span style={{ flex: 1 }}>{success}</span>
          <button className="modal-close" onClick={() => setSuccess('')}>✕</button>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Gross Salary" value={formatINR(t.gross)} icon="▤" tone="primary"
          trend={trendChip(t.gross, run.prev?.totals?.gross)}
          sub={`${t.employees} employees on the roster`} />
        <StatCard label="Deductions" value={formatINR(t.deductions)}
          trend={trendChip(t.deductions, run.prev?.totals?.deductions, true)}
          sub="ESI + PF + advances + TDS" icon="−" tone="warning" />
        <StatCard label="Net Payable" value={formatINR(t.net)} icon="₹" tone="success"
          trend={trendChip(t.net, run.prev?.totals?.net)}
          sub={t.gross > 0 ? `${netShare.toFixed(1)}% of gross reaches employees` : undefined} />
        <StatCard label="CTC" value={t.ctc > 0 ? formatINR(t.ctc) : '—'}
          trend={trendChip(t.ctc, run.prev?.totals?.ctc)}
          sub={t.ctc > 0 ? `+ ${formatINR(t.employerContributions)} employer share` : 'Not tracked for this run'}
          icon="◔" tone="info" />
      </div>

      {t.gross > 0 && segments.length > 1 && (
        <div className="card payout-card">
          <div className="payout-head">
            <h3>Where the gross goes</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              {formatINR(t.gross)} gross{run.prev ? ` · compared with ${monthLabel(run.prev.period)}` : ''}
            </span>
          </div>
          <div className="payout-bar" role="img"
            aria-label={segments.map(s => `${s.label} ${formatINR(s.value)}`).join(', ')}>
            {segments.map(s => (
              <span key={s.label} className="payout-seg"
                style={{ width: `${(s.value / t.gross) * 100}%`, background: s.color }}
                title={`${s.label} — ${formatINR(s.value)} (${((s.value / t.gross) * 100).toFixed(1)}%)`} />
            ))}
          </div>
          <div className="payout-legend">
            {segments.map(s => (
              <span key={s.label} className="payout-key">
                <span className="payout-dot" style={{ background: s.color }} />
                {s.label}
                <strong>{formatINR(s.value)}</strong>
                <span className="text-muted">
                  ({(s.value / t.gross) * 100 < 0.1 ? '<0.1' : ((s.value / t.gross) * 100).toFixed(1)}%)
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Salary register</h3>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {isDraft ? 'Click Edit to adjust attendance & one-offs — the row recomputes instantly.' : 'Finalized — reopen to edit.'}
          </span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th><th className="num">Package</th>
                <th className="num">Pay Days</th><th className="num">Basic</th>
                <th className="num">Gross</th><th className="num">ESI</th>
                <th className="num">PF</th><th className="num">Deductions</th>
                <th className="num">Net</th><th />
              </tr>
            </thead>
            <tbody>
              {run.entries.map((e: any) => (
                <tr key={e.id}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{e.person.name}</span>
                    <div className="text-muted" style={{ fontSize: 11.5 }}>
                      {[e.person.employeeNo, e.person.designation].filter(Boolean).join(' · ')}
                    </div>
                  </td>
                  <td className="num">{formatINR(e.monthlyPackage)}</td>
                  <td className="num">
                    {e.payDays}/{e.totalWorkingDays}
                    {e.lopDays > 0 && <div style={{ fontSize: 11, color: 'var(--warning)' }}>{e.lopDays} LOP</div>}
                  </td>
                  <td className="num">{formatINR(e.basic)}</td>
                  <td className="num">{formatINR(e.grossSalary)}</td>
                  <td className="num text-muted">{e.esiEmployee ? formatINR(e.esiEmployee) : '—'}</td>
                  <td className="num text-muted">{e.pfEmployee ? formatINR(e.pfEmployee) : '—'}</td>
                  <td className="num text-warning">{formatINR(e.totalDeductions)}</td>
                  <td className="num text-success" style={{ fontWeight: 700 }}>{formatINR(e.netPayable)}</td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/payroll/payslips/${e.id}`} className="btn btn-secondary btn-sm">Payslip</Link>
                      {isDraft && (
                        <button className="btn btn-secondary btn-sm" onClick={() => openEntry(e)}>Edit</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="totals-row">
                <td>Totals ({t.employees})</td>
                <td /><td />
                <td className="num">{formatINR(run.entries.reduce((s: number, e: any) => s + e.basic, 0))}</td>
                <td className="num">{formatINR(t.gross)}</td>
                <td /><td />
                <td className="num">{formatINR(t.deductions)}</td>
                <td className="num">{formatINR(t.net)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Entry edit modal */}
      <Modal size="lg" title={entryModal ? `${entryModal.person.name} — ${monthLabel(run.period)}` : ''}
        open={Boolean(entryModal)} onClose={() => setEntryModal(null)}>
        {entryModal && (
          <form onSubmit={handleSaveEntry}>
            <div className="form-section">
              <div className="form-section-title"><span className="step-dot">1</span> Attendance</div>
              <div className="form-grid">
                <div className="field">
                  <label>Working days</label>
                  <input className="input" type="number" min={1} max={31} value={form.totalWorkingDays}
                    onChange={e => setForm({ ...form, totalWorkingDays: e.target.value })} />
                </div>
                <div className="field">
                  <label>Leave days</label>
                  <input className="input" type="number" min={0} step="0.5" value={form.empLeaveDays}
                    onChange={e => setForm({ ...form, empLeaveDays: e.target.value })} />
                </div>
                <div className="field">
                  <label>LOP days</label>
                  <input className="input" type="number" min={0} step="0.5" value={form.lopDays}
                    onChange={e => setForm({ ...form, lopDays: e.target.value })} />
                  <span className="hint">Loss of pay — reduces the basic proportionally.</span>
                </div>
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title"><span className="step-dot">2</span> One-offs</div>
              <div className="form-grid">
                {[
                  ['internetAllowance', 'Internet allowance'],
                  ['salaryArrearAllowance', 'Salary arrear'],
                  ['salaryAdvance', 'Salary advance (deduct)'],
                  ['tds', 'TDS (deduct)'],
                ].map(([k, label]) => (
                  <div key={k} className="field">
                    <label>{label}</label>
                    <div className="input-unit"><span className="unit">₹</span>
                      <input className="input" type="number" min={0} step="0.01" value={form[k]}
                        onChange={e => setForm({ ...form, [k]: e.target.value })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="form-section">
              <div className="form-section-title"><span className="step-dot">3</span> Overrides</div>
              <div className="form-grid" style={{ marginBottom: 12 }}>
                <div className="field">
                  <label>Monthly package (snapshot)</label>
                  <div className="input-unit"><span className="unit">₹</span>
                    <input className="input" type="number" min={0} step="0.01" value={form.monthlyPackage}
                      onChange={e => setForm({ ...form, monthlyPackage: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Remarks</label>
                  <input className="input" value={form.remarks || ''}
                    onChange={e => setForm({ ...form, remarks: e.target.value })} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20 }}>
                <label className="checkbox-field">
                  <input type="checkbox" checked={form.isPfApplicable}
                    onChange={e => setForm({ ...form, isPfApplicable: e.target.checked })} />
                  PF applicable
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={form.isEsiEligible}
                    onChange={e => setForm({ ...form, isEsiEligible: e.target.checked })} />
                  ESI eligible
                </label>
              </div>
            </div>

            <div className="form-actions" style={{ justifyContent: 'space-between' }}>
              <button type="button" className="btn btn-danger"
                onClick={() => window.confirm(`Remove ${entryModal.person.name} from this run?`)
                  && act(() => payrollAPI.removeEntry(entryModal.id)).then(() => setEntryModal(null))}>
                Remove from Run
              </button>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" className="btn btn-ghost" onClick={() => setEntryModal(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : 'Save & Recompute'}
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Attendance import */}
      <Modal title={`Import Attendance — ${monthLabel(run.period)}`} open={attModal}
        onClose={() => { setAttModal(false); setAttResult(null); }}>
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
          Download the template (prefilled with this run's current values), fill in
          <strong> Leave Days, LOP Days, Working Days, Advance, TDS</strong> in Excel,
          then upload it back. Every touched row is recalculated by the salary engine.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <button type="button" className="btn btn-secondary" onClick={downloadAttTemplate}>
            ⤓ Download Template
          </button>
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            {attFileName || 'Choose filled file…'}
            <input type="file" accept=".xlsx" onChange={handleAttFile} hidden />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <button type="button" className="btn btn-secondary" disabled={attBusy || !attFile}
            onClick={() => runAttImport(true)}>
            {attBusy ? 'Working…' : '👁 Preview'}
          </button>
          <button type="button" className="btn btn-primary" disabled={attBusy || !attFile}
            onClick={() => runAttImport(false)}>
            {attBusy ? 'Working…' : '⤒ Import Now'}
          </button>
        </div>
        {attResult && (
          <>
            <p style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>
              {attResult.dryRun ? 'Preview' : 'Imported'}: {attResult.summary.updated} to update
              · {attResult.summary.skipped} unchanged · {attResult.summary.errors} errors
            </p>
            <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table className="table">
                <thead>
                  <tr><th>Employee</th><th>Action</th><th className="num">Leave</th><th className="num">LOP</th><th className="num">New Net</th></tr>
                </thead>
                <tbody>
                  {attResult.results.map((r: any) => (
                    <tr key={r.row}>
                      <td style={{ fontWeight: 600 }}>{r.name}</td>
                      <td>
                        <span className={`badge ${String(r.action).startsWith('error') ? 'badge-danger' : String(r.action).startsWith('skip') ? 'badge-neutral' : 'badge-success'}`}>
                          {r.action}
                        </span>
                      </td>
                      <td className="num">{r.leave ?? '—'}</td>
                      <td className="num">{r.lop ?? '—'}</td>
                      <td className="num">{r.net != null ? formatINR(r.net) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
