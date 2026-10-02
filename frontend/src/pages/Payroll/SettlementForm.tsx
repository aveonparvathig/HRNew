import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, ErrorAlert, BackButton, SuccessAlert } from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const AMOUNTS = ['leaveEncashment', 'gratuity', 'noticePay', 'noticeRecovery'] as const;
// What the preview is worked out from; a change to any of these refreshes it
const INPUTS = ['period', 'lastWorkingDate', 'noticeDays', 'noticeServedDays', 'noticePayDays', 'leaveDays'] as const;

// The full and final settlement of one employee: new, being worked on, or finalized.
export default function SettlementForm() {
  const navigate = useNavigate();
  const { settlementId } = useParams<{ settlementId?: string }>();
  const [params] = useSearchParams();
  const [saved, setSaved] = useState<any>(null);     // the stored settlement, when there is one
  const [preview, setPreview] = useState<any>(null); // figures worked out from the form
  const [form, setForm] = useState<any>(null);
  const [typed, setTyped] = useState<Record<string, boolean>>({}); // amounts typed over the computed ones
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState('');
  const personId = saved?.person.id || params.get('personId') || '';
  const timer = useRef<number | undefined>(undefined);

  const loadPreview = useCallback(async (id: string, body: any) => {
    const res = await payrollAPI.previewSettlement(id, body);
    setPreview(res.data);
    return res.data;
  }, []);

  // First load: the stored settlement, or defaults for a new one
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        if (settlementId) {
          const { data: s } = await payrollAPI.getSettlement(settlementId);
          if (!live) return;
          setSaved(s);
          setForm({
            period: s.period, lastWorkingDate: s.lastWorkingDate, resignedOn: s.resignedOn || '', reason: s.reason,
            payDays: s.payDays ?? '', noticeDays: s.noticeDays, noticeServedDays: s.noticeServedDays, noticePayDays: s.noticePayDays,
            leaveDays: s.leaveDays, leaveEncashment: s.leaveEncashment, gratuity: s.gratuity, noticePay: s.noticePay,
            noticeRecovery: s.noticeRecovery, remarks: s.remarks,
          });
          setTyped({ leaveEncashment: true, gratuity: true, noticePay: true, noticeRecovery: true });
          await loadPreview(s.person.id, { period: s.period, lastWorkingDate: s.lastWorkingDate, noticeDays: s.noticeDays, noticeServedDays: s.noticeServedDays, noticePayDays: s.noticePayDays, leaveDays: s.leaveDays });
        } else {
          const p = await loadPreview(params.get('personId') || '', {});
          if (!live) return;
          if (p.openSettlementId) { navigate(`/payroll/settlements/${p.openSettlementId}`, { replace: true }); return; }
          // A resettlement starts from what was settled before
          const before = p.earlier[p.earlier.length - 1];
          setForm({
            period: p.period, lastWorkingDate: p.lastWorkingDate, resignedOn: '', reason: '',
            payDays: before ? '' : p.payDays ?? '', noticeDays: p.noticeDays, noticeServedDays: p.noticeServedDays, noticePayDays: 0, leaveDays: 0,
            ...(before
              ? { leaveEncashment: before.leaveEncashment, gratuity: before.gratuity, noticePay: before.noticePay, noticeRecovery: before.noticeRecovery }
              : { leaveEncashment: p.computed.leaveEncashment, gratuity: p.computed.gratuity, noticePay: p.computed.noticePay, noticeRecovery: p.computed.noticeRecovery }),
            remarks: '',
          });
          setTyped(before ? { leaveEncashment: true, gratuity: true, noticePay: true, noticeRecovery: true } : {});
        }
        setError('');
      } catch (err: any) {
        if (live) setError(err.response?.data?.error || 'Could not load the settlement');
      }
    })();
    return () => { live = false; };
  }, [settlementId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Change an input: the preview follows shortly, and amounts not typed over follow it
  const change = (patch: any) => {
    const next = { ...form, ...patch };
    setForm(next);
    if (!INPUTS.some(k => k in patch)) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      try {
        const p = await loadPreview(personId, Object.fromEntries(INPUTS.map(k => [k, next[k]])));
        setForm((f: any) => ({
          ...f,
          ...Object.fromEntries(AMOUNTS.filter(k => !typed[k]).map(k => [k, p.computed[k]])),
          ...(saved || p.earlier.length || 'payDays' in patch ? {} : { payDays: p.payDays ?? '' }),
        }));
        setError('');
      } catch (err: any) {
        setError(err.response?.data?.error || 'Could not work out the settlement');
      }
    }, 400);
  };

  const act = async (key: string, call: () => Promise<any>, message?: string) => {
    setBusy(key);
    setSuccess('');
    try {
      const res = await call();
      setError('');
      setSuccess(message || res?.data?.message || '');
      return res;
    } catch (err: any) {
      setError(err.response?.data?.error || 'Action failed');
      return null;
    } finally {
      setBusy('');
    }
  };

  const reload = async (id: string) => {
    const { data: s } = await payrollAPI.getSettlement(id);
    setSaved(s);
    await loadPreview(s.person.id, Object.fromEntries(INPUTS.map(k => [k, form[k]])));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await act('save', () => (saved
      ? payrollAPI.updateSettlement(saved.id, form)
      : payrollAPI.createSettlement({ ...form, personId })));
    if (!res) return;
    setSuccess(res.data.applied
      ? `Saved and put on the ${monthLabel(res.data.period)} draft payslip.`
      : `Saved. ${res.data.why} It will go on the payslip once you apply it.`);
    if (saved) await reload(saved.id);
    else navigate(`/payroll/settlements/${res.data.id}`, { replace: true });
  };

  if (!form || !preview) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading settlement…" />;

  const locked = Boolean(saved?.locked);
  const resettlement = saved ? saved.sequence > 1 : preview.earlier.length > 0;
  const { service, computed } = preview;
  const shortfall = Math.max(0, Number(form.noticeDays || 0) - Number(form.noticeServedDays || 0));
  const net = Number(form.leaveEncashment || 0) + Number(form.gratuity || 0) + Number(form.noticePay || 0) - Number(form.noticeRecovery || 0);
  const loansLater = preview.loans.reduce((s: number, l: any) => s + l.later, 0);

  const num = (key: string, label: string, hint = '', step = '0.5') => (
    <div className="field">
      <label>{label}</label>
      <input className="input" type="number" min={0} step={step} disabled={locked} value={form[key]}
        onChange={e => change({ [key]: e.target.value })} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
  const money = (key: (typeof AMOUNTS)[number], label: string, working: string) => (
    <div className="field">
      <label>{label}</label>
      <div className="input-unit"><span className="unit">₹</span>
        <input className="input" type="number" min={0} step="1" disabled={locked} value={form[key]}
          onChange={e => { setTyped({ ...typed, [key]: true }); setForm({ ...form, [key]: e.target.value }); }} />
      </div>
      <span className="hint">
        {working}
        {typed[key] && !locked && Number(form[key]) !== computed[key] && (
          <> · <button type="button" className="link-button" style={{ fontSize: 'inherit' }}
            onClick={() => { setTyped({ ...typed, [key]: false }); setForm({ ...form, [key]: computed[key] }); }}>
            use {formatINR(computed[key])}
          </button></>
        )}
      </span>
    </div>
  );

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <Link to="/payroll/adjustments?tab=settlements">Final Settlements</Link>
        <span>/</span>
        <span>{preview.person.name}</span>
      </div>

      <PageHeader
        title={`${resettlement ? 'Resettlement' : 'Final Settlement'} — ${preview.person.name}`}
        subtitle={[preview.person.employeeNo, preview.person.designation, saved?.label].filter(Boolean).join(' · ')}
        actions={saved && (<>
          <Link to={`/payroll/reports/settlement-statement?settlementId=${saved.id}`} className="btn btn-secondary">Statement</Link>
          {saved.runId && <Link to={`/payroll/runs/${saved.runId}`} className="btn btn-secondary">Payroll Run</Link>}
          {locked && <Link to={`/payroll/settlements/new?personId=${saved.person.id}`} className="btn btn-primary">Record Resettlement</Link>}
        </>)}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />
      {locked && (
        <div className="alert alert-warning">
          <span>🔒</span>
          <span>This settlement was finalized with {monthLabel(saved.period)} salary. To correct it, record a resettlement: it pays or recovers only the difference.</span>
        </div>
      )}
      {resettlement && !locked && (
        <div className="alert alert-warning">
          <span>ⓘ</span>
          <span>
            This is a resettlement. Enter the amounts as they should finally stand; only the difference from what was
            settled before goes on the {monthLabel(form.period)} payslip.
          </span>
        </div>
      )}
      {saved?.state === 'NOT_APPLIED' && (
        <div className="alert alert-warning">
          <span>◷</span>
          <span style={{ flex: 1 }}>Not on a payslip yet: there is no open payroll run for {monthLabel(saved.period)}. Create the run, then apply.</span>
          <button className="btn btn-secondary btn-sm" disabled={busy === 'apply'}
            onClick={async () => { if (await act('apply', () => payrollAPI.applySettlement(saved.id), 'Put on the draft payslip.')) reload(saved.id); }}>
            Apply
          </button>
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Leaving</h3>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            Joined {preview.person.joinDate ? formatDate(preview.person.joinDate) : 'on a date not on record'} ·
            service {service.years} years, {service.months} months, {service.days} days ·
            monthly gross {formatINR(preview.monthlyGross)}, Basic + DA {formatINR(preview.basicDa)}
          </p>
          <div className="form-grid">
            <div className="field">
              <label>Last working day *</label>
              <input className="input" type="date" required disabled={locked} value={form.lastWorkingDate}
                onChange={e => change({ lastWorkingDate: e.target.value })} />
            </div>
            <div className="field">
              <label>Resigned on</label>
              <input className="input" type="date" disabled={locked} value={form.resignedOn}
                onChange={e => change({ resignedOn: e.target.value })} />
            </div>
            <div className="field">
              <label>Paid with the payroll of *</label>
              <input className="input" type="month" required disabled={locked} value={form.period}
                onChange={e => change({ period: e.target.value })} />
              <span className="hint">
                {preview.run
                  ? preview.run.status === 'DRAFT' ? 'That run is open.' : 'That run is finalized: pick a later month.'
                  : 'No run for that month yet; the settlement waits for it.'}
              </span>
            </div>
            {!resettlement && (
              <div className="field">
                <label>Paid days in that month</label>
                <input className="input" type="number" min={0} max={31} step="0.5" disabled={locked} value={form.payDays}
                  onChange={e => change({ payDays: e.target.value })} />
                <span className="hint">
                  {preview.run?.totalWorkingDays ? `Of ${preview.run.totalWorkingDays} working days. ` : ''}Leave blank to keep the attendance already on the payslip.
                </span>
              </div>
            )}
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Reason for leaving</label>
              <input className="input" disabled={locked} value={form.reason} onChange={e => change({ reason: e.target.value })} />
            </div>
          </div>
        </div>

        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Notice period</h3>
          <div className="form-grid">
            {num('noticeDays', 'Notice required (days)', '', '1')}
            {num('noticeServedDays', 'Notice served (days)', shortfall ? `${shortfall} days short.` : 'Served in full.', '1')}
            {money('noticeRecovery', 'Notice period recovery', `${shortfall} days at ${formatINR(preview.monthlyGross)} a month over ${preview.dayBasis} days.`)}
            {num('noticePayDays', 'Notice paid by the company (days)', 'When the company does not want the notice served.', '1')}
            {money('noticePay', 'Notice pay', `${form.noticePayDays || 0} days at ${formatINR(preview.monthlyGross)} a month over ${preview.dayBasis} days.`)}
          </div>
        </div>

        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Leave encashment and gratuity</h3>
          <div className="form-grid">
            {num('leaveDays', 'Leave days to encash', 'Entered by hand: leave balances are not tracked here.')}
            {money('leaveEncashment', 'Leave encashment', `${form.leaveDays || 0} days on Basic + DA over ${preview.dayBasis} days. Taxed in full.`)}
            {money('gratuity', 'Gratuity', computed.gratuityEligible
              ? `15/26 × ${formatINR(preview.basicDa)} × ${computed.gratuityYears} years. Not taxed.`
              : `Not due: under ${preview.gratuityMinYears} completed years of service.`)}
          </div>
        </div>

        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Also on the last payslip</h3>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.8 }}>
            <li>Salary up to the last working day, with PF, ESI, Professional Tax and TDS. With a leaving date on the employee's record, tax is worked out on the year as it stands, with nothing projected.</li>
            {preview.openArrears > 0 && <li>Arrears of {formatINR(preview.openArrears)}.</li>}
            {preview.approvedClaims > 0 && <li>{preview.approvedClaims} approved expense claim{preview.approvedClaims === 1 ? '' : 's'}: attach on the payroll run.</li>}
            {preview.loans.length === 0 ? <li>No loans outstanding.</li> : preview.loans.map((l: any) => (
              <li key={l.id}>
                Loan {l.loanNo}: {formatINR(l.outstanding)} outstanding, {formatINR(l.dueInPeriod)} of it due in {monthLabel(form.period)}
                {l.later > 0 && <strong> — {formatINR(l.later)} falls due later</strong>}.
              </li>
            ))}
          </ul>
          {saved && !locked && loansLater > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} disabled={busy === 'loans'}
              onClick={async () => {
                if (!await confirmDialog(`Bring the whole loan balance into ${monthLabel(saved.period)} so the last payslip recovers it?`)) return;
                if (await act('loans', () => payrollAPI.recoverSettlementLoans(saved.id))) reload(saved.id);
              }}>
              Recover the Loan Balance in {monthLabel(form.period)}
            </button>
          )}
          {!saved && loansLater > 0 && <p className="text-muted" style={{ fontSize: 12.5, marginTop: 10 }}>Save the settlement to recover the loan balance on the last payslip.</p>}
        </div>

        <div className="card card-pad mb-24">
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Remarks</label>
            <input className="input" disabled={locked} value={form.remarks} onChange={e => change({ remarks: e.target.value })} />
          </div>
          <p style={{ fontSize: 13.5, marginBottom: 14 }}>
            Settlement amounts: <strong>{formatINR(net)}</strong> {net < 0 ? 'to recover' : 'to pay'}, before salary, statutory deductions and tax.
            {saved?.netPayable != null && <> The payslip as it stands: <strong>{formatINR(saved.netPayable)}</strong>.</>}
          </p>
          {!locked && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="submit" className="btn btn-primary" disabled={busy === 'save'}>
                {busy === 'save' ? 'Saving…' : saved ? 'Save Settlement' : 'Create Settlement'}
              </button>
              {saved && (
                <button type="button" className="btn btn-danger" disabled={busy === 'delete'}
                  onClick={async () => {
                    if (!await confirmDialog('Delete this settlement? Its lines come off the draft payslip.')) return;
                    if (await act('delete', () => payrollAPI.deleteSettlement(saved.id))) navigate('/payroll/adjustments?tab=settlements');
                  }}>
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </form>
    </>
  );
}
