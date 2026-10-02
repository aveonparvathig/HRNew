import { useState, useEffect, useRef } from 'react';
import { ErrorAlert, SuccessAlert } from './ui';
import { formatINR } from '../utils/format';
import { confirmDialog } from './feedback';

// The calls differ between HR (any employee) and an employee (their own);
// the page supplies them.
export interface DeclarationActions {
  save: (body: any) => Promise<any>;
  approve?: (body: any) => Promise<any>; // HR only
  addProof: (body: any) => Promise<any>;
  getProof: (proofId: string) => Promise<{ fileName: string; fileData: string }>;
  deleteProof: (proofId: string) => Promise<any>;
}

const MAX_FILE_BYTES = 3 * 1024 * 1024;
const regimeName = (regime: string) => (regime === 'OLD' ? 'Old regime' : 'New regime');

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
  const canEdit = isHr || data.control.declarationOpen;
  const canUpload = isHr || data.control.proofOpen;
  const canPickRegime = isHr || data.control.employeeCanChooseRegime;

  const initial = () => ({
    regime: data.profile.regime || '',
    prevEmployerIncome: data.profile.prevEmployerIncome, prevEmployerTds: data.profile.prevEmployerTds,
    otherIncome: data.profile.otherIncome,
    annualRentPaid: data.profile.annualRentPaid, isMetro: data.profile.isMetro,
    landlordName: data.profile.landlordName, landlordPan: data.profile.landlordPan,
    housingLoanInterest: data.profile.housingLoanInterest,
    rentApproved: data.profile.rentApproved ?? '', housingInterestApproved: data.profile.housingInterestApproved ?? '',
    poiConsidered: data.profile.poiConsidered,
    lines: Object.fromEntries(data.lines.map((l: any) => [l.itemId, { declared: l.declaredAmount || '', approved: l.approvedAmount ?? '' }])),
  });
  const [form, setForm] = useState<any>(initial);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState('');
  const messages = useRef<HTMLDivElement>(null);

  // Fresh data from the server (after a save, or a change of year) resets the form
  useEffect(() => { setForm(initial()); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (patch: any) => setForm((f: any) => ({ ...f, ...patch }));
  const setLine = (itemId: string, patch: any) =>
    setForm((f: any) => ({ ...f, lines: { ...f.lines, [itemId]: { ...f.lines[itemId], ...patch } } }));

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

  const saveDeclared = () => run('save', () => actions.save({
    fyStart: data.fyStart,
    ...(canPickRegime ? { regime: form.regime } : {}),
    prevEmployerIncome: form.prevEmployerIncome, prevEmployerTds: form.prevEmployerTds, otherIncome: form.otherIncome,
    annualRentPaid: form.annualRentPaid, isMetro: form.isMetro,
    landlordName: form.landlordName, landlordPan: form.landlordPan,
    housingLoanInterest: form.housingLoanInterest,
    lines: data.lines.map((l: any) => ({ itemId: l.itemId, declaredAmount: form.lines[l.itemId]?.declared || 0 })),
  }), 'Declaration saved.');

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

  const otherProofs = (kind: string) => data.otherProofs.filter((p: any) => p.kind === kind);
  const effectiveRegime = form.regime || data.defaultTaxRegime;
  const groups: [string, string, string][] = [
    ['SECTION_80C', 'Section 80C and related', 'Counted together with PF, up to the overall Section 80C limit.'],
    ['OTHER', 'Other deductions', 'Each up to its own limit.'],
  ];

  return (
    <>
      <div ref={messages}>
        <ErrorAlert message={error} onDismiss={() => setError('')} />
        <SuccessAlert message={success} />
      </div>

      {!isHr && (
        <div className={`alert ${canEdit ? 'alert-success' : 'alert-warning'}`}>
          <span>{canEdit ? '✎' : '🔒'}</span>
          <span>
            {canEdit ? 'The declaration window is open: you can change your declaration.' : 'The declaration window is closed. Ask HR if you need to make a change.'}
            {' '}{canUpload ? 'Proofs can be attached now.' : 'Proof submission is not open yet.'}
          </span>
        </div>
      )}
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
          {money('otherIncome', 'Other income', 'Interest, rent received and the like.')}
        </div>
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          <span className="text-muted">Previous-employer documents (Form 16 or final payslip): </span>
          {proofChips(otherProofs('PREVIOUS_EMPLOYER'), 'PREVIOUS_EMPLOYER', null)}
        </div>
      </div>

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>House rent</h3>
        <div className="form-grid">
          {money('annualRentPaid', 'Rent paid in the year', 'For the House Rent Allowance exemption.')}
          <div className="field">
            <label>Landlord's name</label>
            <input className="input" disabled={!canEdit} value={form.landlordName}
              onChange={e => set({ landlordName: e.target.value })} />
          </div>
          <div className="field">
            <label>Landlord's PAN</label>
            <input className="input" disabled={!canEdit} placeholder="ABCDE1234F" value={form.landlordPan}
              onChange={e => set({ landlordPan: e.target.value.toUpperCase() })} />
            <span className="hint">Required when the year's rent is above ₹1,00,000.</span>
          </div>
          {isHr && money('rentApproved', 'Rent approved', 'Against rent receipts.', false)}
        </div>
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
        </div>
        <div style={{ marginTop: 12, fontSize: 12.5 }}>
          <span className="text-muted">Lender's interest certificate: </span>
          {proofChips(otherProofs('HOUSING_LOAN'), 'HOUSING_LOAN', null)}
        </div>
      </div>

      {groups.map(([key, title, hint]) => {
        const lines = data.lines.filter((l: any) => l.group === key);
        if (lines.length === 0) return null;
        return (
          <div key={key} className="card mb-24">
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
                    <th>Section</th><th>Investment or expense</th><th className="num">Limit</th>
                    <th className="num">Declared</th><th className="num">Approved</th><th>Proofs</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l: any) => (
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
                      </td>
                      <td className="num text-muted">{l.maxAmount == null ? 'No limit' : formatINR(l.maxAmount)}</td>
                      <td className="num">
                        <input className="input input-sm" type="number" min={0} step="0.01" disabled={!canEdit}
                          value={form.lines[l.itemId]?.declared ?? ''}
                          onChange={e => setLine(l.itemId, { declared: e.target.value })} />
                      </td>
                      <td className="num">
                        {isHr ? (
                          <input className="input input-sm" type="number" min={0} step="0.01"
                            value={form.lines[l.itemId]?.approved ?? ''}
                            onChange={e => setLine(l.itemId, { approved: e.target.value })} />
                        ) : l.approvedAmount == null ? <span className="text-muted">—</span> : formatINR(l.approvedAmount)}
                      </td>
                      <td style={{ fontSize: 12.5 }}>{proofChips(l.proofs, 'ITEM', l.itemId)}</td>
                    </tr>
                  ))}
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
          other deductions <strong>{formatINR(data.totals.otherDeductions)}</strong>.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {canEdit && (
            <button type="button" className="btn btn-primary" disabled={busy === 'save'} onClick={saveDeclared}>
              {busy === 'save' ? 'Saving…' : 'Save Declaration'}
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
