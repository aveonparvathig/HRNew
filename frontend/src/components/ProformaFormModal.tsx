import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { incomeAPI } from '../api/income';
import { Modal, ErrorAlert } from './ui';
import { formatINR } from '../utils/format';
import { downloadHtmlAsPdf } from '../utils/htmlToPdf';
import { fiscalYearOf } from '../utils/fiscalYear';

const GST_RATE = 18;
const round2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
};
const SUBSCRIPTION_TEXT = 'CMS Software Subscription Charges for';

// "Academic Year 2025 - 26" (matches the server's periodDetail)
const periodDetail = (b: any) => {
  const m = /^(\d{4})-(\d{4})$/.exec(b.academicYear || '');
  return b.periodType !== 'CUSTOM' && m ? `Academic Year ${m[1]} - ${m[2].slice(2)}` : `Period ${b.periodLabel}`;
};

interface Line {
  key: string;
  billingId: string | null;
  include: boolean;
  description: string;
  detail: string;
  rate: string;
  gst: boolean;
}

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
  const [validUntil, setValidUntil] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [hsn, setHsn] = useState('998311');
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const preselectKey = preselect.join(',');

  useEffect(() => {
    if (!open || !client) return;
    setError('');
    const date = today();
    setInvoiceDate(date);
    setValidUntil(addDays(date, 7));
    setPlaceOfSupply(client.onboarding?.state || '');
    const picked = new Set(preselectKey ? preselectKey.split(',') : []);
    setLines((client.billings || []).map((b: any) => ({
      key: b.id,
      billingId: b.id,
      include: picked.has(b.id),
      description: SUBSCRIPTION_TEXT,
      detail: periodDetail(b),
      // Default: taxable + 18% GST = the period's outstanding balance
      rate: b.balance > 0 ? String(round2(b.balance / (1 + GST_RATE / 100))) : '',
      gst: true,
    })));
    incomeAPI.getProformaSettings(fiscalYearOf(date)).then(res => {
      setSettings(res.data);
      setHsn(res.data.defaultSac || '998311');
      setValidUntil(addDays(date, res.data.validDays || 7));
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

  const update = (key: string, patch: Partial<Line>) =>
    setLines(ls => ls.map(l => (l.key === key ? { ...l, ...patch } : l)));

  const addExtra = () => setLines(ls => [...ls, {
    key: `extra-${++extraSeq}`, billingId: null, include: true,
    description: 'One-time implementation charges', detail: '', rate: '', gst: true,
  }]);

  const chosen = lines.filter(l => l.include);
  const computed = chosen.map(l => {
    const taxable = round2(Number(l.rate) || 0);
    const gst = l.gst ? round2(taxable * GST_RATE / 100) : 0;
    return { taxable, gst };
  });
  const subtotal = round2(computed.reduce((s, c) => s + c.taxable, 0));
  const gstTotal = round2(computed.reduce((s, c) => s + c.gst, 0));
  const supplierState = settings?.supplier?.taxState || '';
  const intra = !placeOfSupply || !supplierState || placeOfSupply === supplierState;
  const cgst = intra ? round2(gstTotal / 2) : 0;
  const total = round2(subtotal + gstTotal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;
    if (!chosen.length) { setError('Tick at least one period or add a line'); return; }
    const bad = chosen.find(l => !(Number(l.rate) > 0) || !l.description.trim());
    if (bad) { setError(`Enter a description and an amount for "${bad.detail || bad.description || 'each line'}"`); return; }
    setSaving(true);
    setError('');
    let generated = false;
    try {
      const res = await incomeAPI.generateProforma(client.id, {
        invoiceDate, validUntil, placeOfSupply,
        lines: chosen.map(l => ({
          billingId: l.billingId, description: l.description.trim(), detail: l.detail.trim(),
          hsn, qty: 1, rate: round2(Number(l.rate)), gst: l.gst,
        })),
      });
      generated = true;
      await downloadHtmlAsPdf(res.data.html, res.data.filename);
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

  const lineRow = (l: Line) => (
    <div key={l.key} style={{
      border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px',
      opacity: l.include ? 1 : 0.6, display: 'grid', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {l.billingId ? (
          <label className="checkbox-field" style={{ fontWeight: 600, flex: 1, minWidth: 180 }}>
            <input type="checkbox" checked={l.include} onChange={e => update(l.key, { include: e.target.checked })} />
            {l.detail}
            {(() => {
              const b = client.billings.find((x: any) => x.id === l.billingId);
              return b ? <span className="text-muted" style={{ fontWeight: 400, marginLeft: 6 }}>· balance {formatINR(b.balance)}</span> : null;
            })()}
          </label>
        ) : (
          <span style={{ fontWeight: 600, flex: 1 }}>Extra line</span>
        )}
        {!l.billingId && (
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => setLines(ls => ls.filter(x => x.key !== l.key))}>Remove</button>
        )}
      </div>
      {l.include && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2fr) minmax(0,1.3fr) minmax(0,1fr) auto', gap: 8, alignItems: 'center' }}>
          <input className="input" placeholder="Description" value={l.description}
            onChange={e => update(l.key, { description: e.target.value })} />
          <input className="input" placeholder="Second line (optional)" value={l.detail}
            onChange={e => update(l.key, { detail: e.target.value })} />
          <div className="input-unit">
            <span className="unit">₹</span>
            <input className="input" type="number" min={0.01} step="0.01" placeholder="Taxable"
              value={l.rate} onChange={e => update(l.key, { rate: e.target.value })} />
          </div>
          <label className="checkbox-field" style={{ whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={l.gst} onChange={e => update(l.key, { gst: e.target.checked })} />
            GST 18%
          </label>
        </div>
      )}
    </div>
  );

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
              <label>Valid until *</label>
              <input className="input" type="date" required min={invoiceDate} value={validUntil}
                onChange={e => setValidUntil(e.target.value)} />
            </div>
            <div className="field">
              <label>Place of supply</label>
              <select className="select" value={placeOfSupply} onChange={e => setPlaceOfSupply(e.target.value)}>
                <option value="">—</option>
                {(settings?.states || []).map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="hint">{intra ? 'Same state: CGST + SGST' : 'Other state: IGST'}</span>
            </div>
            <div className="field">
              <label>HSN / SAC</label>
              <input className="input" value={hsn} maxLength={20} onChange={e => setHsn(e.target.value)} />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>Billing periods — tick one or more</label>
            <div style={{ display: 'grid', gap: 8 }}>
              {lines.length === 0 && <p className="text-muted">This client has no billing periods yet — add an extra line.</p>}
              {lines.map(lineRow)}
            </div>
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={addExtra}>+ Add line (one-time fee, etc.)</button>
            </div>
          </div>

          <div className="calc-card">
            <div className="calc-row"><span>Subtotal</span><span className="amount">{formatINR(subtotal)}</span></div>
            {intra ? (
              <>
                <div className="calc-row"><span>CGST</span><span className="amount">{formatINR(cgst)}</span></div>
                <div className="calc-row"><span>SGST</span><span className="amount">{formatINR(round2(gstTotal - cgst))}</span></div>
              </>
            ) : (
              <div className="calc-row"><span>IGST</span><span className="amount">{formatINR(gstTotal)}</span></div>
            )}
            <div className="calc-row total grand"><span>Grand total</span><span className="amount">{formatINR(total)}</span></div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !chosen.length}>
              {saving ? 'Generating…' : `Generate & Download — ${formatINR(total)}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
