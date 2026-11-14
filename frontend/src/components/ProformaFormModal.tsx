import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { incomeAPI } from '../api/income';
import { Modal, ErrorAlert } from './ui';
import { formatINR } from '../utils/format';
import { downloadHtmlAsPdf } from '../utils/htmlToPdf';
import { fiscalYearOf } from '../utils/fiscalYear';
import {
  type DraftLine, periodLines, lineAmounts, draftTotals, advanceFor, previousPendingFor,
} from '../utils/proformaLines';

const round2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD

interface Props {
  open: boolean;
  onClose: () => void;
  client: any | null;          // client detail: id, name, billings[], onboarding
  preselect?: string[];        // billing ids ticked when the form opens
  onSaved: () => void;
}

let extraSeq = 0;

export default function ProformaFormModal({ open, onClose, client, preselect = [], onSaved }: Props) {
  const [settings, setSettings] = useState<any>(null);
  const [invoiceDate, setInvoiceDate] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [hsn, setHsn] = useState('998311');
  const [lines, setLines] = useState<DraftLine[]>([]);      // every period's lines + extra lines
  const [ticked, setTicked] = useState<Set<string>>(new Set()); // billing ids on the invoice
  const [advance, setAdvance] = useState('');
  const [advanceEdited, setAdvanceEdited] = useState(false);
  const [pending, setPending] = useState('');              // previous pending (carry-forward)
  const [pendingEdited, setPendingEdited] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const preselectKey = preselect.join(',');
  const billings: any[] = client?.billings || [];

  useEffect(() => {
    if (!open || !client) return;
    setError('');
    const date = today();
    setInvoiceDate(date);
    setPlaceOfSupply(client.onboarding?.state || '');
    const picked = new Set(preselectKey ? preselectKey.split(',') : []);
    setTicked(picked);
    setLines((client.billings || []).flatMap((b: any) => periodLines(b)));
    setAdvance(String(advanceFor(client.billings || [], picked) || ''));
    setAdvanceEdited(false);
    setPending(String(previousPendingFor(client.billings || [], picked) || ''));
    setPendingEdited(false);
    incomeAPI.getProformaSettings(fiscalYearOf(date)).then(res => {
      setSettings(res.data);
      setHsn(res.data.defaultSac || '998311');
      setPlaceOfSupply(p => p || res.data.supplier?.taxState || '');
    }).catch(() => setSettings(null));
    // Keyed on the client's id, not the object: a data refresh after saving
    // must not reset the form (or clear its error) while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, client?.id, preselectKey]);

  // The number preview follows the invoice date's financial year
  const fy = /^\d{4}-\d{2}-\d{2}$/.test(invoiceDate) ? fiscalYearOf(invoiceDate) : '';
  useEffect(() => {
    if (!open || !fy || !settings || settings.fiscalYear === fy) return;
    incomeAPI.getProformaSettings(fy).then(res => setSettings(res.data)).catch(() => {});
  }, [open, fy, settings]);

  const update = (key: string, patch: Partial<DraftLine>) =>
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));

  // Ticking a period adds its lines; the received amount and the previous
  // pending follow the ticked periods until each is edited by hand.
  const toggle = (billingId: string, on: boolean) => {
    const next = new Set(ticked);
    if (on) next.add(billingId); else next.delete(billingId);
    setTicked(next);
    if (!advanceEdited) setAdvance(String(advanceFor(billings, next) || ''));
    if (!pendingEdited) setPending(String(previousPendingFor(billings, next) || ''));
  };

  const addExtra = () => setLines(ls => [...ls, {
    key: `extra-${++extraSeq}`, billingId: null, description: 'One-time implementation charges',
    detail: '', qty: '1', rate: '', gst: true,
  }]);

  const chosen = lines.filter(l => (l.billingId ? ticked.has(l.billingId) : true));
  const supplierState = settings?.supplier?.taxState || '';
  const intra = !placeOfSupply || !supplierState || placeOfSupply === supplierState;
  const t = draftTotals(chosen, intra, Number(advance) || 0, Number(pending) || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    if (!chosen.length) { setError('Tick at least one period or add a line'); return; }
    const bad = chosen.find(l => !(Number(l.qty) > 0) || !(Number(l.rate) > 0) || !l.description.trim());
    if (bad) { setError(`Enter a description, quantity and rate for "${bad.detail || bad.description || 'each line'}"`); return; }
    if (t.advance > t.totalDue) { setError('The received amount cannot be more than the total due'); return; }
    setSaving(true);
    setError('');
    let generated = false;
    try {
      const res = await incomeAPI.generateProforma(client.id, {
        invoiceDate, validUntil: '', placeOfSupply, advanceReceived: t.advance, previousPending: t.previousPending,
        lines: chosen.map(l => ({
          billingId: l.billingId, description: l.description.trim(), detail: l.detail.trim(),
          hsn, qty: Number(l.qty), rate: round2(Number(l.rate)), gst: l.gst,
        })),
      });
      generated = true;
      await downloadHtmlAsPdf(res.data.html, res.data.filename, { crisp: true });
      onClose();
    } catch (err: any) {
      setError(generated
        ? 'The proforma was saved, but the PDF download failed — reprint it from the Proforma page.'
        : err.response?.data?.error || 'Failed to generate the proforma invoice');
    } finally {
      setSaving(false);
      // Refresh after the download so the reload doesn't reset the open form mid-way
      if (generated) onSaved();
    }
  };

  // One editable line: description / second line, then qty × rate, GST, amount
  const lineEditor = (l: DraftLine, removable: boolean) => {
    const a = lineAmounts(l);
    return (
      <div key={l.key} style={{ display: 'grid', gap: 6, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr) auto', gap: 8, alignItems: 'center' }}>
          <input className="input" placeholder="Description" value={l.description}
            onChange={e => update(l.key, { description: e.target.value })} />
          <input className="input" placeholder="Second line (optional)" value={l.detail}
            onChange={e => update(l.key, { detail: e.target.value })} />
          {removable ? (
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}>Remove</button>
          ) : <span />}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) auto minmax(0,1.1fr)', gap: 8, alignItems: 'center' }}>
          <div className="input-unit">
            <span className="unit">Qty</span>
            <input className="input" type="number" min={0.01} step="any" placeholder="Students"
              value={l.qty} onChange={e => update(l.key, { qty: e.target.value })} />
          </div>
          <div className="input-unit">
            <span className="unit">₹</span>
            <input className="input" type="number" min={0.01} step="0.01" placeholder="Rate"
              value={l.rate} onChange={e => update(l.key, { rate: e.target.value })} />
          </div>
          <label className="checkbox-field" style={{ whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={l.gst} onChange={e => update(l.key, { gst: e.target.checked })} />
            GST 18%
          </label>
          <span className="text-muted" style={{ fontSize: 12.5, textAlign: 'right' }}>
            {formatINR(a.taxable)}{l.gst ? ` + ${formatINR(a.gst)}` : ''} = <strong>{formatINR(a.total)}</strong>
          </span>
        </div>
      </div>
    );
  };

  const extras = lines.filter(l => !l.billingId);

  return (
    <Modal size="lg" title={client ? `Proforma Invoice — ${client.name}` : ''} open={open && Boolean(client)} onClose={onClose}>
      {client && (
        <form onSubmit={handleSubmit}>
          <ErrorAlert message={error} />

          {settings && !settings.supplier?.gstin && (
            <div className="alert alert-error" style={{ marginBottom: 12 }}>
              <span>⚠</span>
              <span>Your company GSTIN is not set, so it won't print. Add it under <Link to="/organization">Organization</Link> settings.</span>
            </div>
          )}

          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>Invoice date *</label>
              <input className="input" type="date" required value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)} />
              {settings?.nextNumber && <span className="hint">Next number: {settings.nextNumber}</span>}
            </div>
            <div className="field">
              <label>Place of supply</label>
              <select className="select" value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)}>
                <option value="">—</option>
                {(settings?.states || []).map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="hint">{intra ? 'Same state: CGST + SGST' : 'Other state: IGST'} · not printed</span>
            </div>
            <div className="field">
              <label>HSN / SAC</label>
              <input className="input" value={hsn} maxLength={20} onChange={e => setHsn(e.target.value)} />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>Billing periods — tick one or more</label>
            <div style={{ display: 'grid', gap: 8 }}>
              {billings.length === 0 && <p className="text-muted">This client has no billing periods yet — add a line.</p>}
              {billings.map(b => {
                const on = ticked.has(b.id);
                return (
                  <div key={b.id} style={{
                    border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px',
                    opacity: on ? 1 : 0.65, display: 'grid', gap: 8,
                  }}>
                    <label className="checkbox-field" style={{ fontWeight: 600 }}>
                      <input type="checkbox" checked={on} onChange={e => toggle(b.id, e.target.checked)} />
                      {b.periodLabel || b.academicYear}
                      <span className="text-muted" style={{ fontWeight: 400, marginLeft: 6 }}>
                        · {b.studentCount && !b.overrideAmounts ? `${b.studentCount} × ${formatINR(b.rate)}` : 'fixed fee'}
                        {' '}· received {formatINR(b.received)}
                      </span>
                    </label>
                    {on && lines.filter(l => l.billingId === b.id).map(l => lineEditor(l, false))}
                  </div>
                );
              })}
              {extras.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', display: 'grid', gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>Extra lines</span>
                  {extras.map(l => lineEditor(l, true))}
                </div>
              )}
            </div>
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addExtra}>+ Add line</button>
            </div>
          </div>

          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>Received amount</label>
              <div className="input-unit">
                <span className="unit">₹</span>
                <input className="input" type="number" min={0} step="0.01" placeholder="0" value={advance}
                  onChange={e => { setAdvance(e.target.value); setAdvanceEdited(true); }} />
              </div>
              <span className="hint">
                Payments already recorded on the ticked periods: {formatINR(advanceFor(billings, ticked))}.
                {advanceEdited && (
                  <> · <a style={{ cursor: 'pointer' }} onClick={() => { setAdvance(String(advanceFor(billings, ticked) || '')); setAdvanceEdited(false); }}>use that</a></>
                )}
              </span>
            </div>
            <div className="field">
              <label>Previous pending (carry-forward)</label>
              <div className="input-unit">
                <span className="unit">₹</span>
                <input className="input" type="number" min={0} step="0.01" placeholder="0" value={pending}
                  onChange={e => { setPending(e.target.value); setPendingEdited(true); }} />
              </div>
              <span className="hint">
                On the ticked periods: {formatINR(previousPendingFor(billings, ticked))}. Added after the grand total, no GST.
                {pendingEdited && (
                  <> · <a style={{ cursor: 'pointer' }} onClick={() => { setPending(String(previousPendingFor(billings, ticked) || '')); setPendingEdited(false); }}>use that</a></>
                )}
              </span>
            </div>
          </div>

          <div className="calc-card">
            <div className="calc-row"><span>Subtotal</span><span className="amount">{formatINR(t.subtotal)}</span></div>
            {intra ? (
              <>
                <div className="calc-row"><span>CGST</span><span className="amount">{formatINR(t.cgst)}</span></div>
                <div className="calc-row"><span>SGST</span><span className="amount">{formatINR(t.sgst)}</span></div>
              </>
            ) : (
              <div className="calc-row"><span>IGST</span><span className="amount">{formatINR(t.igst)}</span></div>
            )}
            <div className="calc-row total"><span>Grand total</span><span className="amount">{formatINR(t.total)}</span></div>
            {t.previousPending > 0 && (
              <div className="calc-row"><span>Previous pending</span><span className="amount">{formatINR(t.previousPending)}</span></div>
            )}
            {t.previousPending > 0 && t.advance > 0 && (
              <div className="calc-row total"><span>Total due</span><span className="amount">{formatINR(t.totalDue)}</span></div>
            )}
            {t.advance > 0 && (
              <div className="calc-row"><span>Received amount</span><span className="amount">−{formatINR(t.advance)}</span></div>
            )}
            {(t.advance > 0 || t.previousPending > 0) && (
              <div className="calc-row total grand"><span>Balance due</span><span className="amount">{formatINR(t.balanceDue)}</span></div>
            )}
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !chosen.length}>
              {saving ? 'Generating…' : `Generate & Download — ${formatINR(t.total)}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
