import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Menu, Modal, StatusBadge, BackButton, SuccessAlert,
} from '../../components/ui';
import { formatINR } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';
import ListSelect from '../../components/ListSelect';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const STAGES: [string, string][] = [
  ['INPUTS_OPEN', 'Inputs open'], ['INPUTS_LOCKED', 'Inputs locked'], ['FINALIZED', 'Payroll locked'],
  ['RELEASED', 'Payslips released'], ['PAID', 'Paid'],
];

// Checks that repeat for many employees are shown as one line with the names.
const GROUPED_CHECKS: Record<string, string> = {
  NO_WORK_LOCATION: 'with no work location — Professional Tax and Labour Welfare Fund are not applied to them',
  NO_BANK_ACCOUNT: 'paid by bank transfer but missing an account number or IFSC',
  NO_PAN: 'with no valid PAN — tax is deducted at the higher rate without one',
  NOT_IN_RUN: 'active but not in this run — Recalculate adds them',
};

// Reports drawn up for one payroll month
const RUN_REPORTS: [string, string][] = [
  ['register', 'Salary Register'], ['summary', 'Summary'], ['pf-esi', 'PF & ESI'],
  ['pf-statement', 'PF Statement'], ['pt-statement', 'Professional Tax'], ['lwf-statement', 'LWF'],
  ['tds-statement', 'TDS'],
  ['comparison', 'vs Previous Month'], ['reconciliation', 'Reconciliation'], ['headcount', 'Headcount'],
  ['anomalies', 'Anomalies'], ['overrides', 'Overrides'], ['input-history', 'Input History'],
  ['payment-register', 'Payment Register'], ['journal-voucher', 'Journal Voucher'],
];

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
  const [components, setComponents] = useState<any[]>([]);
  const [claims, setClaims] = useState<any>(null);
  const [holdModal, setHoldModal] = useState<any>(null); // entry whose salary is being held
  const [holdReason, setHoldReason] = useState('');

  useEffect(() => {
    payrollAPI.getComponents().then(res => setComponents(res.data.components)).catch(() => {});
  }, []);

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
      payrollAPI.getRunClaims(runId!).then(c => setClaims(c.data)).catch(() => setClaims(null));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load run');
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const isDraft = run?.status === 'DRAFT';
  const canEdit = isDraft && !run?.inputsLockedAt; // attendance and one-offs are open

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
      lines: (entry.lines || []).filter((l: any) => !l.source).map((l: any) => ({ componentId: l.componentId, amount: l.amount })),
      professionalTax: entry.professionalTax,
      ptTouched: false,
      tdsTouched: false,
    });
    setEntryModal(entry);
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Blank lines (nothing picked, nothing typed) are dropped rather than rejected
      // Professional Tax is sent only when edited: a number overrides the
      // computed amount, blank hands it back to the calculation.
      // TDS follows the same rule once payroll computes it.
      const { ptTouched, professionalTax, tdsTouched, tds, ...rest } = form;
      await payrollAPI.updateEntry(entryModal.id, {
        ...rest,
        ...(ptTouched ? { professionalTax } : {}),
        ...(!run.tdsAuto || tdsTouched ? { tds } : {}),
        lines: (form.lines || []).filter((l: any) => l.componentId || Number(l.amount)),
      });
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

  const handleHold = async (e: React.FormEvent) => {
    e.preventDefault();
    await act(() => payrollAPI.holdSalary(holdModal.id, holdReason), `${holdModal.person.name}'s salary is on hold.`);
    setHoldModal(null);
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

  // PF ECR text file / ESI contribution sheet for the government portals
  const downloadFile = async (kind: 'pf-ecr' | 'esi-upload') => {
    try {
      const { data: file } = await payrollAPI.getRunFile(run.id, kind);
      const missing = kind === 'pf-ecr' ? 'UAN' : 'ESI number';
      const left = file.skipped.length ? ` Left out for want of a ${missing}: ${file.skipped.join(', ')}.` : '';
      if (file.members === 0) {
        setSuccess('');
        setError(`No ${kind === 'pf-ecr' ? 'PF' : 'ESI'} members to include in the file.${left}`);
        return;
      }
      const blob = file.base64
        ? new Blob([Uint8Array.from(atob(file.base64), c => c.charCodeAt(0))],
          { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        : new Blob([file.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.filename;
      a.click();
      URL.revokeObjectURL(url);
      setError('');
      setSuccess(`${file.filename} downloaded with ${file.members} member${file.members === 1 ? '' : 's'}.${left}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not prepare the file');
    }
  };

  const handleDeleteRun = async () => {
    if (!await confirmDialog(`Delete the ${monthLabel(run.period)} draft run and all its entries?`)) return;
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
  const blocking = (run.checks || []).filter((c: any) => c.blocking);
  const warnings = (run.checks || []).filter((c: any) => !c.blocking);
  const stageIndex = STAGES.findIndex(([key]) => key === run.stage?.key);

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
  const otherDeductions = run.entries.reduce((s: number, e: any) =>
    s + (e.lines || []).filter((l: any) => l.type === 'DEDUCTION').reduce((t: number, l: any) => t + l.amount, 0), 0);
  const segments = [
    { label: 'Net pay', value: t.net, color: 'var(--success-dot, #129D61)' },
    { label: 'PF', value: compSum('pfEmployee'), color: 'var(--primary, #5A5FE0)' },
    { label: 'ESI', value: compSum('esiEmployee'), color: '#0E9CB8' },
    { label: 'Advance', value: compSum('salaryAdvance'), color: '#F79009' },
    { label: 'TDS', value: compSum('tds'), color: '#B42318' },
    { label: 'Professional Tax', value: compSum('professionalTax'), color: '#7A5AF8' },
    { label: 'LWF', value: compSum('lwfEmployee'), color: '#15B79E' },
    { label: 'Loans', value: compSum('loanDeduction'), color: '#DD2590' },
    { label: 'Other deductions', value: otherDeductions, color: '#667085' },
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
        subtitle={`FY ${run.financialYear} · ${t.employees} employees · ${t.pfCount} PF · ${t.esiCount} ESI${run.notes ? ` · ${run.notes}` : ''}`}
        actions={
          <>
            <StatusBadge status={run.status === 'FINALIZED' ? 'finalized' : 'draft'} />
            {!isDraft && (
              <span className={`badge ${run.releasedAt ? 'badge-success' : 'badge-neutral'}`}
                title={run.releasedAt ? 'Employees can see this month\'s payslip in My Pay' : 'Employees cannot see this month\'s payslip yet'}>
                {run.releasedAt ? 'Released to employees' : 'Not released'}
              </span>
            )}
            <Menu label="Reports" wide>
              <div className="menu-heading">Reports for {monthLabel(run.period)}</div>
              {RUN_REPORTS.map(([kind, label]) => (
                <Link key={kind} to={`/payroll/runs/${run.id}/reports/${kind}`} className="menu-item" role="menuitem">{label}</Link>
              ))}
              <div className="menu-heading">Downloads</div>
              <button className="menu-item" role="menuitem" onClick={handleExport}>⤓ Salary register (Excel)</button>
              <button className="menu-item" role="menuitem" onClick={() => downloadFile('pf-ecr')}>⤓ PF ECR file</button>
              <button className="menu-item" role="menuitem" onClick={() => downloadFile('esi-upload')}>⤓ ESI sheet</button>
            </Menu>
            <Link to={`/payroll/runs/${run.id}/payslips`} className="btn btn-secondary">
              🖨 All Payslips
            </Link>
            {isDraft ? (
              <>
                {canEdit && (
                  <button className="btn btn-secondary" onClick={() => setAttModal(true)}>
                    ⤒ Import Attendance
                  </button>
                )}
                <button className="btn btn-secondary"
                  onClick={() => act(() => payrollAPI.recalculateRun(run.id))}>
                  ↻ Recalculate
                </button>
                {canEdit ? (
                  <button className="btn btn-secondary" title="Freeze attendance and one-offs while the month is reviewed"
                    onClick={() => act(() => payrollAPI.lockInputs(run.id), 'Inputs locked. Attendance and one-offs cannot be edited until unlocked.')}>
                    Lock Inputs
                  </button>
                ) : (
                  <button className="btn btn-secondary"
                    onClick={() => act(() => payrollAPI.unlockInputs(run.id), 'Inputs unlocked.')}>
                    Unlock Inputs
                  </button>
                )}
                <button className="btn btn-danger" onClick={handleDeleteRun}>Delete</button>
                <button className="btn btn-primary" disabled={blocking.length > 0}
                  title={blocking.length ? 'Fix the items marked below first' : undefined}
                  onClick={async () => await confirmDialog('Finalize this run? Entries lock until reopened.')
                    && act(async () => {
                      const res = await payrollAPI.finalizeRun(run.id);
                      return { data: { message: res.data.nextRun
                        ? `Run finalized. ${monthLabel(res.data.nextRun.period)} has been opened as a draft.` : 'Run finalized.' } };
                    })}>
                  ✓ Finalize
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-secondary"
                  onClick={async () => await confirmDialog({
                    title: `Reopen ${monthLabel(run.period)}?`,
                    message: 'The run goes back to draft so its entries can be edited. Payslips are withdrawn from employees and loan instalments posted for the month are reversed until it is finalized again.',
                    confirmLabel: 'Reopen',
                  }) && act(() => payrollAPI.reopenRun(run.id), 'Run reopened for edits.')}>
                  ↺ Reopen
                </button>
                {run.releasedAt ? (
                  <button className="btn btn-secondary"
                    onClick={() => act(() => payrollAPI.holdRun(run.id), 'Payslips withdrawn from employees.')}>
                    Withdraw Payslips
                  </button>
                ) : (
                  <button className="btn btn-secondary"
                    onClick={() => act(() => payrollAPI.releaseRun(run.id), 'Payslips released. Employees can now see them in My Pay.')}>
                    Release Payslips
                  </button>
                )}
                <Link to={`/payroll/runs/${run.id}/payout`} className="btn btn-primary">₹ Payout</Link>
              </>
            )}
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      {run.stage && (
        <div className="stage-steps" aria-label={`Stage: ${run.stage.label}`}>
          {STAGES.filter(([key]) => key !== 'INPUTS_OPEN' || stageIndex === 0).map(([key, label]) => {
            const index = STAGES.findIndex(s => s[0] === key);
            const done = key === 'RELEASED' ? run.stage.released : key === 'PAID' ? run.stage.paid : index <= stageIndex;
            return (
              <span key={key} className={`stage-step${done ? ' done' : ''}${key === run.stage.key ? ' current' : ''}`}>
                <span className="stage-dot">{done ? '✓' : ''}</span>
                {label}
                {key === 'PAID' && run.stage.finalized && run.stage.payable > 0 && (
                  <span className="text-muted"> {run.stage.paidCount}/{run.stage.payable}</span>
                )}
              </span>
            );
          })}
          {run.stage.heldCount > 0 && <span className="badge badge-warning">{run.stage.heldCount} on hold</span>}
        </div>
      )}

      {blocking.length > 0 && (
        <div className="alert alert-error" style={{ alignItems: 'flex-start' }}>
          <span>⛔</span>
          <div style={{ flex: 1 }}>
            <strong>Fix before finalizing</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {blocking.map((c: any) => (
                <li key={`${c.entryId}-${c.code}`}><strong>{c.personName}</strong> — {c.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {warnings.length > 0 && (
        <details className="alert alert-warning alert-details" open={isDraft}>
          <summary>
            <span>⚠</span>
            <strong>{isDraft ? 'Check before finalizing' : 'Worth checking'}</strong>
            <span className="alert-count">{warnings.length} {warnings.length === 1 ? 'item' : 'items'}</span>
          </summary>
          <div>
            <ul style={{ margin: '8px 0 0', paddingLeft: 30 }}>
              {warnings.filter((c: any) => !GROUPED_CHECKS[c.code]).map((c: any) => (
                <li key={`${c.entryId}-${c.personName}-${c.code}`}><strong>{c.personName}</strong> — {c.message}</li>
              ))}
              {/* One line per kind for checks that repeat across many employees */}
              {Object.entries(GROUPED_CHECKS).map(([code, text]) => {
                const names = warnings.filter((c: any) => c.code === code).map((c: any) => c.personName);
                return names.length > 0 && (
                  <li key={code}><strong>{names.length}</strong> {text}: {names.join(', ')}.</li>
                );
              })}
            </ul>
          </div>
        </details>
      )}

      <div className="stat-grid">
        <StatCard label="Gross Salary" value={formatINR(t.gross)} icon="▤" tone="primary"
          trend={trendChip(t.gross, run.prev?.totals?.gross)}
          sub={`${t.employees} employees on the roster`} />
        <StatCard label="Deductions" value={formatINR(t.deductions)}
          trend={trendChip(t.deductions, run.prev?.totals?.deductions, true)}
          sub="ESI, PF, taxes, advances and other deductions" icon="−" tone="warning" />
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

      {claims?.claims.length > 0 && (
        <div className="card mb-24">
          <div className="card-header">
            <div>
              <h3>Expense claims</h3>
              <span className="text-muted" style={{ fontSize: 12.5 }}>
                {canEdit
                  ? 'Approved claims can be paid with this month\'s salary: untaxed, shown separately on the payslip, and added to the transfer.'
                  : `${formatINR(claims.attachedTotal)} of claims ${isDraft ? 'will be' : 'were'} paid with this month's salary.`}
              </span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Claim</th><th>Employee</th><th className="num">Amount</th><th>With this salary</th><th /></tr></thead>
              <tbody>
                {claims.claims.filter((c: any) => canEdit || c.attached).map((c: any) => (
                  <tr key={c.id}>
                    <td><span style={{ fontWeight: 600 }}>{c.reportNumber}</span><div className="text-muted" style={{ fontSize: 11.5 }}>{c.title}</div></td>
                    <td>{c.person.name}</td>
                    <td className="num">{formatINR(c.amount)}</td>
                    <td><span className={`badge ${c.attached ? 'badge-success' : 'badge-neutral'}`}>{c.attached ? 'Yes' : 'No'}</span></td>
                    <td>
                      <div className="row-actions">
                        {canEdit && (
                          <button className="btn btn-secondary btn-sm"
                            onClick={() => act(() => payrollAPI.setRunClaim(run.id, c.id, !c.attached),
                              c.attached ? `${c.reportNumber} removed from this salary.` : `${c.reportNumber} will be paid with this salary.`)}>
                            {c.attached ? 'Remove' : 'Pay with Salary'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Salary register</h3>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            {canEdit ? 'Click Edit to adjust attendance & one-offs — the row recomputes instantly.'
              : isDraft ? 'Inputs are locked — unlock to edit.' : 'Finalized — reopen to edit.'}
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
                    {e.payStatus === 'HOLD' && (
                      <span className="badge badge-warning" style={{ marginLeft: 8 }} title={e.holdReason}>On hold</span>
                    )}
                    {e.paidOn && <span className="badge badge-success" style={{ marginLeft: 8 }}>Paid</span>}
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
                  <td className={`num ${e.netPayable < 0 ? 'text-danger' : 'text-success'}`} style={{ fontWeight: 700 }}>
                    {formatINR(e.netPayable)}
                    {e.reimbursement > 0 && (
                      <div className="text-muted" style={{ fontSize: 11, fontWeight: 400 }}>+ {formatINR(e.reimbursement)} claims</div>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      <Link to={`/payroll/payslips/${e.id}`} className="btn btn-secondary btn-sm">Payslip</Link>
                      {canEdit && (
                        <button className="btn btn-secondary btn-sm" onClick={() => openEntry(e)}>Edit</button>
                      )}
                      {e.payStatus === 'HOLD' ? (
                        <button className="btn btn-secondary btn-sm"
                          onClick={() => act(() => payrollAPI.releaseSalary(e.id), `${e.person.name}'s salary is released for payment.`)}>
                          Release
                        </button>
                      ) : !e.paidOn && !e.payoutBatchId && (
                        <button className="btn btn-ghost btn-sm" title="Compute the salary but do not pay it yet"
                          onClick={() => { setHoldReason(''); setHoldModal(e); }}>
                          Hold
                        </button>
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
                  ['tds', run.tdsAuto ? `TDS — ${entryModal.tdsOverridden ? 'entered by hand' : 'computed'}` : 'TDS (deduct)'],
                ].map(([k, label]) => (
                  <div key={k} className="field">
                    <label>{label}</label>
                    <div className="input-unit"><span className="unit">₹</span>
                      <input className="input" type="number" min={0} step="0.01" value={form[k]}
                        onChange={e => setForm({ ...form, [k]: e.target.value, ...(k === 'tds' ? { tdsTouched: true } : {}) })} />
                    </div>
                    {k === 'tds' && run.tdsAuto && (
                      <span className="hint">
                        Worked out from the year's income. Type an amount to override it; clear the box to go back.{' '}
                        <Link to={`/payroll/reports/tax-statement?fy=${run.period.slice(5) >= '04' ? run.period.slice(0, 4) : Number(run.period.slice(0, 4)) - 1}&personId=${entryModal.person.id}`}>See the working</Link>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {entryModal.loanDeduction > 0 && (
              <div className="alert alert-warning">
                <span>₹</span>
                <span>
                  A loan instalment of <strong>{formatINR(entryModal.loanDeduction)}</strong> is deducted this month.
                  To skip or change it, open the loan from the <Link to="/payroll/loans">Loans</Link> page.
                </span>
              </div>
            )}

            <div className="form-section">
              <div className="form-section-title"><span className="step-dot">3</span> Other earnings &amp; deductions</div>
              {(entryModal.lines || []).filter((l: any) => l.source).map((l: any) => (
                <div key={l.componentId} className="line-row" style={{ alignItems: 'center', fontSize: 13 }}>
                  <span>{l.name} <span className="text-muted">({l.type === 'DEDUCTION' ? 'deduction' : 'earning'})</span></span>
                  <strong>{formatINR(l.amount)}</strong>
                  <Link to={l.source === 'ARREAR' ? '/payroll/adjustments' : '/payroll/adjustments?tab=settlements'}
                    className="text-muted" style={{ fontSize: 12 }}>
                    from {l.source === 'ARREAR' ? 'arrears' : 'the final settlement'}
                  </Link>
                </div>
              ))}
              {(form.lines || []).map((line: any, i: number) => {
                const taken = new Set([
                  ...(form.lines || []).map((l: any) => l.componentId),
                  ...(entryModal.lines || []).filter((l: any) => l.source).map((l: any) => l.componentId),
                ]);
                const setLine = (patch: any) => setForm({
                  ...form, lines: form.lines.map((l: any, j: number) => (j === i ? { ...l, ...patch } : l)),
                });
                return (
                  <div key={i} className="line-row">
                    <select className="select" value={line.componentId}
                      onChange={e => setLine({ componentId: e.target.value })}>
                      <option value="">Pick a component…</option>
                      {['EARNING', 'DEDUCTION'].map(type => (
                        <optgroup key={type} label={type === 'EARNING' ? 'Earnings' : 'Deductions'}>
                          {components
                            .filter(c => c.type === type && (c.isActive || c.id === line.componentId)
                              && (c.id === line.componentId || !taken.has(c.id)))
                            .map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                    <div className="input-unit"><span className="unit">₹</span>
                      <input className="input" type="number" min={0} step="0.01" value={line.amount}
                        onChange={e => setLine({ amount: e.target.value })} />
                    </div>
                    <button type="button" className="btn btn-ghost btn-sm" aria-label="Remove line"
                      onClick={() => setForm({ ...form, lines: form.lines.filter((_: any, j: number) => j !== i) })}>
                      ✕
                    </button>
                  </div>
                );
              })}
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => setForm({ ...form, lines: [...(form.lines || []), { componentId: '', amount: '' }] })}>
                + Add line
              </button>
              <span className="hint" style={{ display: 'block', marginTop: 8 }}>
                Bonus, incentive, other deduction and the like. PF and ESI are not calculated on these.
              </span>
            </div>

            <div className="form-section">
              <div className="form-section-title"><span className="step-dot">4</span> Overrides</div>
              <div className="form-grid" style={{ marginBottom: 12 }}>
                <div className="field">
                  <label>Monthly package (snapshot)</label>
                  <div className="input-unit"><span className="unit">₹</span>
                    <input className="input" type="number" min={0} step="0.01" value={form.monthlyPackage}
                      onChange={e => setForm({ ...form, monthlyPackage: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Professional Tax{entryModal.ptOverridden ? ' (entered by hand)' : ''}</label>
                  <div className="input-unit"><span className="unit">₹</span>
                    <input className="input" type="number" min={0} step="0.01" value={form.professionalTax}
                      onChange={e => setForm({ ...form, professionalTax: e.target.value, ptTouched: true })} />
                  </div>
                  <span className="hint">Worked out from the state policy. Type an amount to override it; clear the box to go back.</span>
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
                onClick={async () => await confirmDialog(`Remove ${entryModal.person.name} from this run?`)
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

      {/* Hold a salary */}
      <Modal title={holdModal ? `Hold Salary — ${holdModal.person.name}` : ''} open={Boolean(holdModal)}
        onClose={() => setHoldModal(null)}>
        {holdModal && (
          <form onSubmit={handleHold}>
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 14 }}>
              The salary of {formatINR(holdModal.netPayable)} stays on the register and in the statutory returns,
              but is left out of payment batches and hidden from the employee until you release it.
            </p>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Reason *</label>
              <ListSelect listType="HOLD_REASON" required autoFocus value={holdReason} onChange={setHoldReason} placeholder="Pick a reason" />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setHoldModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Hold Salary</button>
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
