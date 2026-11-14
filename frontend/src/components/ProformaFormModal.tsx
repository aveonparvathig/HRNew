import { useState, useEffect } from 'react';
import { incomeAPI } from '../api/income';
import { Modal, ErrorAlert } from './ui';
import { formatINR } from '../utils/format';
import { downloadHtmlAsPdf } from '../utils/htmlToPdf';

const GST_RATE = 0.18;
const round2 = (n: number) => Math.round(n * 100) / 100;
const today = () => new Date().toLocaleDateString('en-CA'); // local YYYY-MM-DD

interface Props {
  open: boolean;
  onClose: () => void;
  billing: any | null; // billing row (billingJSON shape: balance, periodLabel, …)
  clientName: string;
  onSaved: () => void;
}

export default function ProformaFormModal({ open, onClose, billing, clientName, onSaved }: Props) {
  const [form, setForm] = useState({ invoiceDate: '', lineDescription: '', taxableAmount: '', oneTimePayment: '' });
  const [oneTimeGst, setOneTimeGst] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Default: taxable + 18% GST = the row's outstanding balance
  const defaultTaxable = billing ? Math.max(round2(Number(billing.balance || 0) / (1 + GST_RATE)), 0) : 0;

  useEffect(() => {
    if (!open || !billing) return;
    setError('');
    setForm({
      invoiceDate: today(),
      lineDescription: `${clientName} — ${billing.periodLabel || billing.academicYear} subscription`,
      taxableAmount: defaultTaxable ? String(defaultTaxable) : '',
      oneTimePayment: '',
    });
    setOneTimeGst(false);
  }, [open, billing, clientName, defaultTaxable]);

  const set = (key: keyof typeof form, value: string) => setForm(f => ({ ...f, [key]: value }));

  const taxable = round2(Number(form.taxableAmount) || 0);
  const oneTime = round2(Number(form.oneTimePayment) || 0);
  const oneTimeTaxed = oneTimeGst && oneTime > 0;
  // Same rounding as the server: each line's GST rounded, then summed
  const oneTimeGstAmount = oneTimeTaxed ? round2(oneTime * GST_RATE) : 0;
  const gst = round2(round2(taxable * GST_RATE) + oneTimeGstAmount);
  const total = round2(taxable + oneTime + gst);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billing) return;
    setSaving(true);
    setError('');
    let generated = false;
    try {
      const res = await incomeAPI.generateProforma(billing.id, {
        invoiceDate: form.invoiceDate,
        lineDescription: form.lineDescription,
        taxableAmount: taxable,
        oneTimePayment: oneTime || undefined,
        oneTimeGst: oneTimeTaxed,
      });
      generated = true;
      onSaved();
      await downloadHtmlAsPdf(res.data.html, res.data.filename);
      onClose();
    } catch (err: any) {
      setError(generated
        ? 'The proforma was saved, but the PDF download failed — reprint it from the Proforma page.'
        : err.response?.data?.error || 'Failed to generate the proforma invoice');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={billing ? `Proforma Invoice — ${billing.periodLabel || billing.academicYear}` : ''}
      open={open && Boolean(billing)} onClose={onClose}>
      {billing && (
        <form onSubmit={handleSubmit}>
          <ErrorAlert message={error} />

          <div className="calc-card" style={{ marginBottom: 16 }}>
            <div className="calc-row">
              <span>Outstanding balance</span>
              <span className="amount">{formatINR(billing.balance)}</span>
            </div>
          </div>

          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>Invoice date *</label>
              <input className="input" type="date" required value={form.invoiceDate}
                onChange={e => set('invoiceDate', e.target.value)} />
            </div>
            <div className="field">
              <label>Taxable amount *</label>
              <div className="input-unit">
                <span className="unit">₹</span>
                <input className="input" type="number" min={0.01} step="0.01" required autoFocus
                  value={form.taxableAmount} onChange={e => set('taxableAmount', e.target.value)} />
              </div>
              {defaultTaxable > 0 && Number(form.taxableAmount) !== defaultTaxable && (
                <div className="chip-row" style={{ marginTop: 8 }}>
                  <button type="button" className="chip" onClick={() => set('taxableAmount', String(defaultTaxable))}>
                    Full balance — {formatINR(defaultTaxable)} + GST
                  </button>
                </div>
              )}
            </div>
            <div className="field">
              <label>One-time fee</label>
              <div className="input-unit">
                <span className="unit">₹</span>
                <input className="input" type="number" min={0} step="0.01" placeholder="0"
                  value={form.oneTimePayment} onChange={e => set('oneTimePayment', e.target.value)} />
              </div>
              <label className="checkbox-field" style={{ marginTop: 8 }}>
                <input type="checkbox" checked={oneTimeGst} disabled={oneTime <= 0}
                  onChange={e => setOneTimeGst(e.target.checked)} />
                Add GST (18%) on one-time fee
              </label>
              <span className="hint">
                {oneTime <= 0 ? 'Optional.' : oneTimeGst
                  ? `GST ${formatINR(oneTimeGstAmount)} added on the one-time fee.`
                  : 'Billed without GST.'}
              </span>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label>Description *</label>
            <input className="input" required maxLength={500} value={form.lineDescription}
              onChange={e => set('lineDescription', e.target.value)} />
          </div>

          <div className="calc-card">
            <div className="calc-row">
              <span>Taxable value{oneTimeTaxed ? ' (incl. one-time fee)' : ''}</span>
              <span className="amount">{formatINR(taxable + (oneTimeTaxed ? oneTime : 0))}</span>
            </div>
            <div className="calc-row">
              <span>GST (18%)</span>
              <span className="amount">{formatINR(gst)}</span>
            </div>
            {oneTime > 0 && !oneTimeTaxed && (
              <div className="calc-row">
                <span>One-time fee (no GST)</span>
                <span className="amount">{formatINR(oneTime)}</span>
              </div>
            )}
            <div className="calc-row total grand">
              <span>Total payable</span>
              <span className="amount">{formatINR(total)}</span>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || taxable <= 0}>
              {saving ? 'Generating…' : `Generate & Download — ${formatINR(total)}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
