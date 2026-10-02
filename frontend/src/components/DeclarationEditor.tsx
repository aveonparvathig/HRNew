import { useState, useEffect, useRef } from 'react';
import { ErrorAlert, SuccessAlert } from './ui';
import { formatINR, formatDate } from '../utils/format';
import { confirmDialog } from './feedback';

// The calls differ between HR (any employee) and an employee (their own);
// the page supplies them.
export interface DeclarationActions {
  save: (body: any) => Promise<any>;
  approve?: (body: any) => Promise<any>; // HR only
  addProof: (body: any) => Promise<any>;
  getProof: (proofId: string) => Promise<{ fileName: string; fileData: string }>;
  deleteProof: (proofId: string) => Promise<any>;
  submit: (body: any) => Promise<any>;
  review?: (body: { fyStart: number; action: string }) => Promise<any>;                        // HR only
  requestReopen?: (body: { fyStart: number; reason: string }) => Promise<any>;                 // employee only
  decideReopen?: (requestId: string, body: { approve: boolean; note?: string }) => Promise<any>; // HR only
}

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_LANDLORDS = 4;
const EMPTY_LANDLORD = { name: '', pan: '', address: '', rent: '' };
const regimeName = (regime: string) => (regime === 'OLD' ? 'Old regime' : 'New regime');
const monthName = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};
const STATUS: Record<string, [string, string]> = {
  DRAFT: ['Draft', 'badge-neutral'], SUBMITTED: ['Submitted', 'badge-warning'], REVIEWED: ['Reviewed', 'badge-success'],
};
const DEDUCTIONS = ['SECTION_80C', 'OTHER'];
// [groups, title, hint]
const SECTIONS: [string[], string, string][] = [
  [['SECTION_80C'], 'Section 80C and related', 'Counted together with PF, up to the overall Section 80C limit.'],
  [['OTHER'], 'Other deductions', 'Each up to its own limit.'],
  [['EXEMPTION'], 'Exempt allowances', 'Part of the pay that is not taxed, up to a limit.'],
  [['OTHER_INCOME'], 'Income from other sources', 'Added to taxable income, so that enough tax is deducted through the year.'],
  [['LET_OUT_INCOME', 'LET_OUT_LOSS'], 'Let-out house property', 'Income or loss from a house that is let out. A loss reduces taxable income only under the old regime, within the limit for house property.'],
  [['TAX_CREDIT'], 'Tax already paid elsewhere', 'Tax deducted or collected by others in the year. It counts as tax already paid.'],
];

const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Could not read the file'));
  reader.readAsDataURL(file);
});

// Opens a stored proof (a data URI) in a new tab.
async function openProof(load: () => Promise<{ fileName: string; fileData: string }>) {
  const { fileData } = await load();
  const [head, body] = fileData.split(',');
  const type = /data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream';
  const bytes = Uint8Array.from(atob(body), c => c.charCodeAt(0));
  window.open(URL.createObjectURL(new Blob([bytes], { type })), '_blank');
}

export default function DeclarationEditor({ data, mode, actions, onChanged }: {
  data: any;
  mode: 'hr' | 'self';
  actions: DeclarationActions;
  onChanged: () => void; // the page reloads the declaration
}) {
  const isHr = mode === 'hr';
  const status: string = STATUS[data.profile.status] ? data.profile.status : 'DRAFT';
  const canEdit = isHr || data.self.canEdit;
  const canUpload = isHr || data.control.proofOpen;
  const canPickRegime = isHr || data.control.employeeCanChooseRegime;
  const pendingRequest = (data.reopenRequests || []).find((r: any) => r.status === 'PENDING');
  const lastRequest = (data.reopenRequests || [])[0];

  const initial = () => ({
    regime: data.profile.regime || '',
    prevEmployerIncome: data.profile.prevEmployerIncome, prevEmployerTds: data.profile.prevEmployerTds,
    otherIncome: data.profile.otherIncome,
    annualRentPaid: data.profile.annualRentPaid, isMetro: data.profile.isMetro,
    rentMonthly: Boolean(data.profile.rentByMonth),
    rentByMonth: Object.fromEntries(data.periods.map((p: string) => [p, data.profile.rentByMonth?.[p] || ''])),
    landlords: data.profile.landlords.length ? data.profile.landlords.map((l: any) => ({ ...l, rent: l.rent || '' })) : [{ ...EMPTY_LANDLORD }],
    housingLoanInterest: data.profile.housingLoanInterest,
    lenderName: data.profile.lenderName, lenderPan: data.profile.lenderPan, lenderAddress: data.profile.lenderAddress,
    rentApproved: data.profile.rentApproved ?? '', housingInterestApproved: data.profile.housingInterestApproved ?? '',
    poiConsidered: data.profile.poiConsidered,
    lines: Object.fromEntries(data.lines.map((l: any) => [l.itemId, { declared: l.declaredAmount || '', approved: l.approvedAmount ?? '' }])),
  });
  const [form, setForm] = useState<any>(initial);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState('');
  const [reason, setReason] = useState('');     // employee: why the declaration should be reopened
  const [note, setNote] = useState('');         // HR: note when declining a request
  const messages = useRef<HTMLDivElement>(null);

  // Fresh data from the server (after a save, or a change of year) resets the form
  useEffect(() => { setForm(initial()); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const setLine = (itemId: string, patch: any) =>
    setForm((f: any) => ({ ...f, lines: { ...f.lines, [itemId]: { ...f.lines[itemId], ...patch } } }));
  const setLandlord = (index: number, patch: any) =>
    set({ landlords: form.landlords.map((l: any, i: number) => (i === index ? { ...l, ...patch } : l)) });

  const run = async (key: string, call: () => Promise<any>, message: string) => {
    setBusy(key);
    setSuccess('');
    try {
      await call();
      setError('');
      setSuccess(message);
      onChanged();
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Could not save');
    } finally {
      setBusy('');
      // the page is long: bring the outcome into view
      messages.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const yearRent = form.rentMonthly
    ? Math.round(data.periods.reduce((s: number, p: string) => s + Number(form.rentByMonth[p] || 0), 0) * 100) / 100
    : Number(form.annualRentPaid || 0);

  const declaredBody = () => {
    const named = form.landlords.filter((l: any) => l.name || l.pan || l.address || Number(l.rent));
    return {
      fyStart: data.fyStart,
      ...(canPickRegime ? { regime: form.regime } : {}),
      prevEmployerIncome: form.prevEmployerIncome, prevEmployerTds: form.prevEmployerTds, otherIncome: form.otherIncome,
      annualRentPaid: yearRent, isMetro: form.isMetro,
      rentByMonth: form.rentMonthly ? form.rentByMonth : null,
      // One landlord takes the whole of the year's rent
      landlords: named.length === 1 ? [{ ...named[0], rent: yearRent }] : named,
      housingLoanInterest: form.housingLoanInterest,
      lenderName: form.lenderName, lenderPan: form.lenderPan, lenderAddress: form.lenderAddress,
      lines: data.lines.map((l: any) => ({ itemId: l.itemId, declaredAmount: form.lines[l.itemId]?.declared || 0 })),
    };
  };

  const saveDeclared = () => run('save', () => actions.save(declaredBody()), 'Declaration saved.');

  // Submitting saves what is on the screen first
  const submit = async () => {
    if (!await confirmDialog({
      title: 'Submit the declaration?',
      message: isHr
        ? 'It is marked as submitted for the employee. They can no longer change it unless you send it back.'
        : 'Once submitted you cannot change it unless HR reopens it for you.',
      confirmLabel: 'Submit',
    })) return;
    await run('submit', async () => {
      await actions.save(declaredBody());
      await actions.submit({ fyStart: data.fyStart });
    }, 'Declaration submitted.');
  };

  const review = (action: string, message: string) => run(action, () => actions.review!({ fyStart: data.fyStart, action }), message);

  const saveApproved = () => run('approve', () => actions.approve!({
    fyStart: data.fyStart,
    rentApproved: form.rentApproved, housingInterestApproved: form.housingInterestApproved,
    poiConsidered: form.poiConsidered,
    lines: data.lines.map((l: any) => ({ itemId: l.itemId, approvedAmount: form.lines[l.itemId]?.approved })),
  }), 'Approvals saved. Recalculate any open draft run so the TDS picks them up.');

  const upload = async (kind: string, itemId: string | null, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setError('The file is too large. Keep each proof under 3 MB.'); return; }
    await run(`proof-${kind}-${itemId}`, async () => actions.addProof({
      fyStart: data.fyStart, kind, itemId, fileName: file.name, fileData: await readFile(file),
    }), 'Proof attached.');
  };

  const proofChips = (proofs: any[], kind: string, itemId: string | null) => (
    <div className="proof-list">
      {proofs.map(p => (
        <span key={p.id} className="proof-chip">
          <button type="button" className="proof-open" title="Open"
            onClick={() => openProof(() => actions.getProof(p.id)).catch(() => setError('Could not open the proof'))}>
            {p.fileName}
          </button>
          {canUpload && (
            <button type="button" className="proof-remove" aria-label={`Remove ${p.fileName}`}
              onClick={async () => await confirmDialog(`Remove ${p.fileName}?`)
                && run('remove', () => actions.deleteProof(p.id), 'Proof removed.')}>✕</button>
          )}
        </span>
      ))}
      {canUpload && (
        <label className="proof-add">
          + Attach
          <input type="file" accept=".pdf,image/png,image/jpeg,image/webp" hidden
            onChange={e => { upload(kind, itemId, e.target.files?.[0]); e.target.value = ''; }} />
        </label>
      )}
      {!canUpload && proofs.length === 0 && <span className="text-muted">—</span>}
    </div>
  );

  const money = (key: string, label: string, hint = '', disabled = !canEdit) => (
    <div className="field">
      <label>{label}</label>
      <div className="input-unit"><span className="unit">₹</span>
        <input className="input" type="number" min={0} step="0.01" disabled={disabled}
          value={form[key]} onChange={e => set({ [key]: e.target.value })} />
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
  const text = (key: string, label: string, props: any = {}, hint = '') => (
    <div className="field" style={props.wide ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      <input className="input" disabled={!canEdit} placeholder={props.placeholder} value={form[key] || ''}
        onChange={e => set({ [key]: props.upper ? e.target.value.toUpperCase() : e.target.value })} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );

  const otherProofs = (kind: string) => data.otherProofs.filter((p: any) => p.kind === kind);
  const effectiveRegime = form.regime || data.defaultTaxRegime;
  const [statusLabel, statusClass] = STATUS[status];
  const limitText = (l: any) => (l.maxAmount == null ? 'No limit'
    : l.group === 'EXEMPTION' ? `${formatINR(l.maxAmount)} a ${l.limitPeriod === 'MONTH' ? 'month' : 'year'}` : formatINR(l.maxAmount));

  return (
    <>
      <div ref={messages}>
        <ErrorAlert message={error} onDismiss={() => setError('')} />
        <SuccessAlert message={success} />
      </div>

      <div className="card card-pad mb-24">
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13.5 }}>
            <span className={`badge ${statusClass}`} style={{ marginRight: 8 }}>{statusLabel}</span>
            {status === 'DRAFT' && (isHr
              ? (data.profile.editGranted ? 'With the employee to correct. They can change it even though the window is closed.' : 'Not submitted yet.')
              : data.self.canEdit
                ? (data.profile.editGranted ? 'HR has reopened your declaration. Change what you need to and submit it again.' : 'You can change your declaration. Submit it when it is complete.')
                : data.self.why)}
            {status === 'SUBMITTED' && (isHr
              ? `Submitted${data.profile.submittedAt ? ` on ${formatDate(data.profile.submittedAt)}` : ''}. Check it and mark it as reviewed, or send it back.`
              : `Submitted${data.profile.submittedAt ? ` on ${formatDate(data.profile.submittedAt)}` : ''}. HR will review it.`)}
            {status === 'REVIEWED' && `Reviewed${data.profile.reviewedBy ? ` by ${data.profile.reviewedBy}` : ''}${data.profile.reviewedAt ? ` on ${formatDate(data.profile.reviewedAt)}` : ''}.`}
            {!isHr && <span className="text-muted"> {canUpload ? 'Proofs can be attached now.' : 'Proof submission is not open yet.'}</span>}
          </div>
          {isHr && actions.review && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {status === 'SUBMITTED' && (
                <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'REVIEW'}
                  onClick={() => review('REVIEW', 'Marked as reviewed.')}>Mark as Reviewed</button>
              )}
              {status !== 'DRAFT' && (
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy === 'SEND_BACK'}
                  onClick={async () => await confirmDialog({
                    title: 'Send the declaration back?',
                    message: 'It becomes a draft again and the employee can change it, even with the declaration window closed.',
                    confirmLabel: 'Send Back',
                  }) && review('SEND_BACK', 'Sent back to the employee.')}>Send Back to Employee</button>
              )}
            </div>
          )}
        </div>

        {pendingRequest && (
          <div className="alert alert-warning" style={{ marginTop: 14, marginBottom: 0, alignItems: 'flex-start' }}>
            <span>↺</span>
            <div style={{ flex: 1 }}>
              {isHr ? 'The employee has asked for this declaration to be reopened' : 'You asked HR to reopen this declaration'}
              {' '}on {formatDate(pendingRequest.createdAt)}: “{pendingRequest.reason}”
              {!isHr && <div className="text-muted" style={{ fontSize: 12.5 }}>Waiting for HR to decide.</div>}
              {isHr && actions.decideReopen && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
                  <button type="button" className="btn btn-primary btn-sm" disabled={busy === 'decide'}
                    onClick={() => run('decide', () => actions.decideReopen!(pendingRequest.id, { approve: true }), 'Declaration reopened for the employee.')}>
                    Reopen for the Employee
                  </button>
                  <input className="input input-sm" style={{ maxWidth: 260 }} placeholder="Reason for declining (optional)" value={note}
                    onChange={e => setNote(e.target.value)} />
                  <button type="button" className="btn btn-secondary btn-sm" disabled={busy === 'decide'}
                    onClick={() => run('decide', () => actions.decideReopen!(pendingRequest.id, { approve: false, note }), 'Request declined.')}>
                    Decline
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {!isHr && !pendingRequest && lastRequest?.status === 'DECLINED' && !data.self.canEdit && (
          <p className="text-muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            HR declined your request of {formatDate(lastRequest.createdAt)}{lastRequest.decisionNote ? `: “${lastRequest.decisionNote}”` : '.'}
          </p>
        )}
        {!isHr && actions.requestReopen && !data.self.canEdit && !pendingRequest && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
            <input className="input" style={{ flex: 1, minWidth: 220 }} maxLength={500} placeholder="What do you need to change?" value={reason}
              onChange={e => setReason(e.target.value)} />
            <button type="button" className="btn btn-secondary" disabled={busy === 'reopen' || !reason.trim()}
              onClick={() => run('reopen', async () => { await actions.requestReopen!({ fyStart: data.fyStart, reason }); setReason(''); }, 'Your request has gone to HR.')}>
              Ask HR to Reopen It
            </button>
          </div>
        )}
      </div>

      {effectiveRegime === 'NEW' && (
        <div className="alert alert-warning">
          <span>ⓘ</span>
          <span>
            Under the new regime, rent, housing-loan interest and the deductions below do not reduce tax.
            They are kept in case the regime changes. Previous-employer and other income always count.
          </span>
        </div>
      )}

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Regime and other income</h3>
        <div className="form-grid">
          <div className="field">
            <label>Tax regime</label>
            <select className="select" disabled={!canEdit || !canPickRegime} value={form.regime}
              onChange={e => set({ regime: e.target.value })}>
              <option value="">Organization default ({regimeName(data.defaultTaxRegime)})</option>
              <option value="NEW">New regime</option>
              <option value="OLD">Old regime</option>
            </select>
            {!canPickRegime && <span className="hint">Set by HR.</span>}
          </div>
          {money('prevEmployerIncome', 'Salary from previous employer', 'In this financial year, before joining.')}
          {money('prevEmployerTds', 'Tax deducted by previous employer')}
          {money('otherIncome', 'Other income', 'A single figure; or use the lines under “Income from other sources” below.')}
        </div>
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          <span className="text-muted">Previous-employer documents (Form 16 or final payslip): </span>
          {proofChips(otherProofs('PREVIOUS_EMPLOYER'), 'PREVIOUS_EMPLOYER', null)}
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>House rent</h3>
        <label className="checkbox-field" style={{ marginBottom: 12 }}>
          <input type="checkbox" disabled={!canEdit} checked={form.rentMonthly}
            onChange={e => set({ rentMonthly: e.target.checked })} />
          The rent was not the same every month (enter it month by month)
        </label>
        {form.rentMonthly ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(128px, 1fr))', gap: 10 }}>
              {data.periods.map((p: string) => (
                <div key={p} className="field">
                  <label>{monthName(p)}</label>
                  <input className="input" type="number" min={0} step="0.01" disabled={!canEdit} aria-label={`Rent for ${monthName(p)}`}
                    value={form.rentByMonth[p]} onChange={e => set({ rentByMonth: { ...form.rentByMonth, [p]: e.target.value } })} />
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, margin: '10px 0 0' }}>
              Rent for the year: <strong>{formatINR(yearRent)}</strong>
              <span className="text-muted"> · the exemption is worked out for each month on its own</span>
            </p>
          </>
        ) : (
          <div className="form-grid">
            {money('annualRentPaid', 'Rent paid in the year', 'For the House Rent Allowance exemption.')}
          </div>
        )}
        {isHr && (
          <div className="form-grid" style={{ marginTop: 12 }}>
            {money('rentApproved', 'Rent approved', 'Against rent receipts, for the year.', false)}
          </div>
        )}

        <h4 style={{ fontSize: 13.5, margin: '18px 0 4px' }}>Landlord{form.landlords.length > 1 ? 's' : ''}</h4>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
          The PAN is required when the year's rent is above ₹1,00,000. Add each landlord if you moved house during the year.
        </p>
        {form.landlords.map((l: any, i: number) => (
          <div key={i} className="form-grid" style={{ marginBottom: 10, alignItems: 'end' }}>
            <div className="field">
              <label>Name</label>
              <input className="input" disabled={!canEdit} value={l.name} onChange={e => setLandlord(i, { name: e.target.value })} />
            </div>
            <div className="field">
              <label>PAN</label>
              <input className="input" disabled={!canEdit} placeholder="ABCDE1234F" maxLength={10} value={l.pan}
                onChange={e => setLandlord(i, { pan: e.target.value.toUpperCase() })} />
            </div>
            <div className="field">
              <label>Address</label>
              <input className="input" disabled={!canEdit} value={l.address} onChange={e => setLandlord(i, { address: e.target.value })} />
            </div>
            {form.landlords.length > 1 && (
              <div className="field">
                <label>Rent paid to them</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="input" type="number" min={0} step="0.01" disabled={!canEdit} value={l.rent}
                    onChange={e => setLandlord(i, { rent: e.target.value })} />
                  {canEdit && (
                    <button type="button" className="btn btn-ghost btn-sm" aria-label={`Remove landlord ${i + 1}`}
                      onClick={() => set({ landlords: form.landlords.filter((_: any, n: number) => n !== i) })}>✕</button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {canEdit && form.landlords.length < MAX_LANDLORDS && (
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => set({ landlords: [...form.landlords, { ...EMPTY_LANDLORD }] })}>+ Add another landlord</button>
        )}

        <label className="checkbox-field" style={{ marginTop: 12 }}>
          <input type="checkbox" disabled={!canEdit} checked={form.isMetro} onChange={e => set({ isMetro: e.target.checked })} />
          Lives in a metro city (exemption up to 50% of salary instead of 40%)
        </label>
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          <span className="text-muted">Rent receipts or agreement: </span>
          {proofChips(otherProofs('RENT'), 'RENT', null)}
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Housing loan</h3>
        <div className="form-grid">
          {money('housingLoanInterest', 'Interest on housing loan', 'Self-occupied property, for the year.')}
          {isHr && money('housingInterestApproved', 'Interest approved', 'Against the lender’s certificate.', false)}
          {text('lenderName', 'Lender’s name', { placeholder: 'Bank or housing finance company' })}
          {text('lenderPan', 'Lender’s PAN', { placeholder: 'ABCDE1234F', upper: true }, 'Asked for on Form 12BB and the annual return.')}
          {text('lenderAddress', 'Lender’s address', { wide: true })}
        </div>
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          <span className="text-muted">Lender's interest certificate: </span>
          {proofChips(otherProofs('HOUSING_LOAN'), 'HOUSING_LOAN', null)}
        </div>
      </div>

      {SECTIONS.map(([keys, title, hint]) => {
        const lines = data.lines.filter((l: any) => keys.includes(l.group));
        if (lines.length === 0) return null;
        const deduction = DEDUCTIONS.includes(keys[0]);
        const exemption = keys[0] === 'EXEMPTION';
        return (
          <div key={keys[0]} className="card mb-24">
            <div className="card-header">
              <div>
                <h3>{title}</h3>
                <span className="text-muted" style={{ fontSize: 12.5 }}>{hint}</span>
              </div>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{deduction ? 'Section' : 'Head'}</th><th>{deduction ? 'Investment or expense' : exemption ? 'Allowance' : 'Particulars'}</th>
                    <th className="num">Limit</th>
                    <th className="num">{exemption ? 'Amount spent' : 'Declared'}</th><th className="num">Approved</th><th>Proofs</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l: any) => {
                    // An exemption that needs no proof is applied without anything being declared
                    const automatic = exemption && !l.proofRequired;
                    return (
                      <tr key={l.itemId}>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {l.section}
                          {l.sectionNew && <div className="text-muted" style={{ fontSize: 11 }}>new Act {l.sectionNew}</div>}
                        </td>
                        <td>
                          {l.name}
                          {l.proofRequired && <span className="badge badge-neutral" style={{ marginLeft: 6 }} title="An amount here needs a proof attached">proof needed</span>}
                          {l.deductPercent < 100 && !l.name.includes('%')
                            && <span className="text-muted"> ({l.deductPercent}% deductible)</span>}
                          {exemption && (
                            <div className="text-muted" style={{ fontSize: 11.5 }}>
                              {l.componentLabel ? `On ${l.componentLabel}` : 'Pay component no longer exists'} · {l.itemRegime === 'BOTH' ? 'both regimes' : 'old regime only'}
                            </div>
                          )}
                        </td>
                        <td className="num text-muted">{limitText(l)}</td>
                        <td className="num">
                          {automatic ? <span className="text-muted">Applied automatically</span> : (
                            <input className="input input-sm" type="number" min={0} step="0.01" disabled={!canEdit} aria-label={`${l.name}: amount`}
                              value={form.lines[l.itemId]?.declared ?? ''}
                              onChange={e => setLine(l.itemId, { declared: e.target.value })} />
                          )}
                        </td>
                        <td className="num">
                          {automatic ? <span className="text-muted">—</span> : isHr ? (
                            <input className="input input-sm" type="number" min={0} step="0.01" aria-label={`${l.name}: approved amount`}
                              value={form.lines[l.itemId]?.approved ?? ''}
                              onChange={e => setLine(l.itemId, { approved: e.target.value })} />
                          ) : l.approvedAmount == null ? <span className="text-muted">—</span> : formatINR(l.approvedAmount)}
                        </td>
                        <td style={{ fontSize: 12.5 }}>{automatic ? <span className="text-muted">—</span> : proofChips(l.proofs, 'ITEM', l.itemId)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      <div className="card card-pad mb-24">
        <p style={{ fontSize: 13, marginBottom: 12 }}>
          Counted for tax now ({data.profile.poiConsidered ? 'approved amounts' : 'declared amounts'}):
          {' '}Section 80C pool <strong>{formatINR(data.totals.section80C)}</strong>,
          other deductions <strong>{formatINR(data.totals.otherDeductions)}</strong>
          {data.totals.otherIncome > 0 && <>, other income <strong>{formatINR(data.totals.otherIncome + data.profile.otherIncome)}</strong></>}
          {(data.totals.letOutIncome > 0 || data.totals.letOutLoss > 0)
            && <>, let-out property {data.totals.letOutIncome >= data.totals.letOutLoss ? 'income' : 'loss'}
              {' '}<strong>{formatINR(Math.abs(data.totals.letOutIncome - data.totals.letOutLoss))}</strong></>}
          {data.totals.taxCredit > 0 && <>, tax paid elsewhere <strong>{formatINR(data.totals.taxCredit)}</strong></>}.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {canEdit && (
            <button type="button" className={`btn ${isHr || status !== 'DRAFT' ? 'btn-primary' : 'btn-secondary'}`} disabled={busy === 'save'} onClick={saveDeclared}>
              {busy === 'save' ? 'Saving…' : isHr ? 'Save Declaration' : 'Save as Draft'}
            </button>
          )}
          {canEdit && status === 'DRAFT' && (
            <button type="button" className={`btn ${isHr ? 'btn-secondary' : 'btn-primary'}`} disabled={busy === 'submit'} onClick={submit}>
              {busy === 'submit' ? 'Submitting…' : isHr ? 'Save and Submit for the Employee' : 'Save and Submit'}
            </button>
          )}
          {isHr && actions.approve && (
            <>
              <button type="button" className="btn btn-secondary" disabled={busy === 'approve'} onClick={saveApproved}>
                {busy === 'approve' ? 'Saving…' : 'Save Approvals'}
              </button>
              <label className="checkbox-field">
                <input type="checkbox" checked={form.poiConsidered} onChange={e => set({ poiConsidered: e.target.checked })} />
                Tax uses the approved amounts (anything not approved counts as nil)
              </label>
            </>
          )}
        </div>
      </div>
    </>
  );
}
