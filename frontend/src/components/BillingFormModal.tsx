import { useState, useEffect, useMemo } from 'react';
import { incomeAPI } from '../api/income';
import { Modal, ErrorAlert } from './ui';
import { formatINR } from '../utils/format';

const GST_RATE = 0.18;

interface Props {
  open: boolean;
  onClose: () => void;
  clientId: string;
  billing?: any | null; // null = create
  meta: { academicYears: any[]; engineers: string[]; invoiceStatuses: { value: string; label: string }[] };
  onSaved: () => void;
}

const EMPTY = {
  periodType: 'ACADEMIC', periodStart: '', periodEnd: '',
  academicYear: '', engineer: '', studentCount: '', rate: '', oneTimePayment: '',
  overrideAmounts: false, taxableValue: '', gstAmount: '', netAmount: '',
  previousPending: '', invoiceStatus: '', remarks: '', nextFollowupDate: '', followupNote: '',
};

// end = start + 1 year - 1 day (e.g. 01-02-2026 -> 31-01-2027).
// UTC arithmetic throughout - local-midnight dates shift a day through
// toISOString() in timezones ahead of UTC (IST included).
const cycleEnd = (start: string) => {
  const [y, m, d] = start.split('-').map(Number);
  const dt = new Date(Date.UTC(y + 1, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().split('T')[0];
};

const addDays = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};
const monthEnd = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
};

const FOLLOWUP_PRESETS = [
  { label: 'Tomorrow', value: () => addDays(1) },
  { label: 'In 1 week', value: () => addDays(7) },
  { label: 'In 2 weeks', value: () => addDays(14) },
  { label: 'Month end', value: () => monthEnd() },
];

export default function BillingFormModal({ open, onClose, clientId, billing, meta, onSaved }: Props) {
  const [form, setForm] = useState<any>(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(billing);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (billing) {
      setForm({
        periodType: billing.periodType || 'ACADEMIC',
        periodStart: billing.periodStart || '',
        periodEnd: billing.periodEnd || '',
        academicYear: billing.periodType === 'CUSTOM' ? '' : (billing.academicYear || ''),
        engineer: billing.engineer || '',
        studentCount: billing.studentCount ?? '',
        rate: billing.rate ?? '',
        oneTimePayment: billing.oneTimePayment || '',
        overrideAmounts: Boolean(billing.overrideAmounts),
        taxableValue: billing.taxableValue ?? '',
        gstAmount: billing.gstAmount ?? '',
        netAmount: billing.netAmount ?? '',
        previousPending: billing.previousPending || '',
        invoiceStatus: billing.invoiceStatus || '',
        remarks: billing.remarks || '',
        nextFollowupDate: billing.nextFollowupDate || '',
        followupNote: billing.followupNote || '',
      });
    } else {
      setForm(EMPTY);
      incomeAPI.getBillingPrefill(clientId).then(res => {
        const p = res.data.prefill;
        if (p) {
          setForm((f: any) => ({
            ...f,
            periodType: p.periodType || 'ACADEMIC',
            periodStart: p.periodStart || '',
            periodEnd: p.periodEnd || '',
            academicYear: p.academicYear || '',
            engineer: p.engineer || '',
            studentCount: p.studentCount ?? '',
            rate: p.rate ?? '',
            previousPending: p.previousPending || '',
          }));
        }
      }).catch(() => {});
    }
  }, [open, billing, clientId]);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  // Suggested year chips: active configured years + the next few calendar years
  const yearChips = useMemo(() => {
    const set = new Set<string>();
    meta.academicYears.filter(y => y.isActive).forEach(y => set.add(y.label));
    const thisYear = new Date().getFullYear();
    for (let i = -1; i <= 2; i++) set.add(`${thisYear + i}-${thisYear + i + 1}`);
    return Array.from(set).sort().slice(-5);
  }, [meta.academicYears]);

  // Live calculation
  const students = Number(form.studentCount) || 0;
  const rate = Number(form.rate) || 0;
  const oneTime = Number(form.oneTimePayment) || 0;
  const prevPending = Number(form.previousPending) || 0;
  const isFixed = form.overrideAmounts;

  const taxable = isFixed ? Number(form.taxableValue) || 0 : students * rate;
  const gst = isFixed ? Number(form.gstAmount) || 0 : taxable * GST_RATE;
  const net = isFixed ? Number(form.netAmount) || 0 : taxable + gst + oneTime;
  const totalDue = net + prevPending;

  const switchMode = (fixed: boolean) => {
    if (fixed && !form.taxableValue && taxable > 0) {
      // Carry the computed figures into the manual fields as a starting point
      setForm((f: any) => ({
        ...f, overrideAmounts: true,
        taxableValue: taxable || '', gstAmount: Math.round(gst * 100) / 100 || '',
        netAmount: Math.round(net * 100) / 100 || '',
      }));
    } else {
      set('overrideAmounts', fixed);
    }
  };

  const handleFixedTaxable = (value: string) => {
    const t = Number(value) || 0;
    const g = Math.round(t * GST_RATE * 100) / 100;
    setForm((f: any) => ({
      ...f, taxableValue: value,
      gstAmount: value === '' ? f.gstAmount : g,
      netAmount: value === '' ? f.netAmount : Math.round((t + g) * 100) / 100,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, nextFollowupDate: form.nextFollowupDate || null };
      if (isEdit) await incomeAPI.updateBilling(billing.id, payload);
      else await incomeAPI.createBilling(clientId, payload);
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save billing');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal size="lg" title={isEdit ? `Edit ${billing?.periodLabel || billing?.academicYear}` : 'Add Billing Period'} open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <ErrorAlert message={error} />

        {/* 1 — Billing period & engineer */}
        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">1</span> Billing period &amp; engineer</div>
          <div className="segmented" style={{ marginBottom: 12 }}>
            <button type="button" className={form.periodType !== 'CUSTOM' ? 'active' : ''}
              onClick={() => set('periodType', 'ACADEMIC')}>
              Academic year
            </button>
            <button type="button" className={form.periodType === 'CUSTOM' ? 'active' : ''}
              onClick={() => set('periodType', 'CUSTOM')}>
              Custom period
            </button>
          </div>

          {form.periodType !== 'CUSTOM' ? (
            <>
              <div className="chip-row" style={{ marginBottom: 10 }}>
                {yearChips.map(y => (
                  <button key={y} type="button"
                    className={`chip ${form.academicYear === y ? 'active' : ''}`}
                    onClick={() => set('academicYear', y)}>
                    {y}
                  </button>
                ))}
              </div>
              <div className="form-grid">
                <div className="field">
                  <label>Year *</label>
                  <input className="input" required placeholder="e.g. 2026-2027"
                    value={form.academicYear} onChange={e => set('academicYear', e.target.value)} />
                </div>
                <div className="field">
                  <label>Engineer</label>
                  <input className="input" list="engineer-options" placeholder="Pick or type a name"
                    value={form.engineer} onChange={e => set('engineer', e.target.value)} />
                  <datalist id="engineer-options">
                    {meta.engineers.map(e => <option key={e} value={e} />)}
                  </datalist>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="form-grid">
                <div className="field">
                  <label>Period start *</label>
                  <input className="input" type="date" required
                    value={form.periodStart}
                    onChange={e => {
                      const start = e.target.value;
                      setForm((f: any) => ({
                        ...f,
                        periodStart: start,
                        // Auto-suggest a 12-month cycle when the end is untouched
                        periodEnd: f.periodEnd && f.periodEnd > start ? f.periodEnd : (start ? cycleEnd(start) : ''),
                      }));
                    }} />
                </div>
                <div className="field">
                  <label>Period end *</label>
                  <input className="input" type="date" required min={form.periodStart || undefined}
                    value={form.periodEnd}
                    onChange={e => set('periodEnd', e.target.value)} />
                  {form.periodStart && (
                    <span className="hint">
                      12-month cycle: {cycleEnd(form.periodStart)}
                      {form.periodEnd !== cycleEnd(form.periodStart) && (
                        <> · <a style={{ cursor: 'pointer' }}
                          onClick={() => set('periodEnd', cycleEnd(form.periodStart))}>apply</a></>
                      )}
                    </span>
                  )}
                </div>
                <div className="field">
                  <label>Engineer</label>
                  <input className="input" list="engineer-options" placeholder="Pick or type a name"
                    value={form.engineer} onChange={e => set('engineer', e.target.value)} />
                  <datalist id="engineer-options">
                    {meta.engineers.map(e => <option key={e} value={e} />)}
                  </datalist>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 2 — Pricing */}
        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">2</span> Pricing</div>
          <div className="segmented" style={{ marginBottom: 14 }}>
            <button type="button" className={!isFixed ? 'active' : ''} onClick={() => switchMode(false)}>
              Per student
            </button>
            <button type="button" className={isFixed ? 'active' : ''} onClick={() => switchMode(true)}>
              Fixed fee
            </button>
          </div>

          {!isFixed ? (
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Students</label>
                <input className="input" type="number" min={0} placeholder="0"
                  value={form.studentCount} onChange={e => set('studentCount', e.target.value)} />
              </div>
              <div className="field">
                <label>Rate / student</label>
                <div className="input-unit">
                  <span className="unit">₹</span>
                  <input className="input" type="number" min={0} step="0.01" placeholder="0"
                    value={form.rate} onChange={e => set('rate', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>One-time fee</label>
                <div className="input-unit">
                  <span className="unit">₹</span>
                  <input className="input" type="number" min={0} step="0.01" placeholder="0"
                    value={form.oneTimePayment} onChange={e => set('oneTimePayment', e.target.value)} />
                </div>
              </div>
            </div>
          ) : (
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Taxable value</label>
                <div className="input-unit">
                  <span className="unit">₹</span>
                  <input className="input" type="number" min={0} step="0.01" placeholder="0"
                    value={form.taxableValue} onChange={e => handleFixedTaxable(e.target.value)} />
                </div>
                <span className="hint">GST &amp; net auto-fill at 18% — adjust freely.</span>
              </div>
              <div className="field">
                <label>GST</label>
                <div className="input-unit">
                  <span className="unit">₹</span>
                  <input className="input" type="number" min={0} step="0.01" placeholder="0"
                    value={form.gstAmount} onChange={e => set('gstAmount', e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label>Net amount *</label>
                <div className="input-unit">
                  <span className="unit">₹</span>
                  <input className="input" type="number" min={0} step="0.01" placeholder="0" required
                    value={form.netAmount} onChange={e => set('netAmount', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          <div className="calc-card">
            {!isFixed && (
              <div className="calc-row">
                <span>Taxable ({students || 0} × {formatINR(rate)})</span>
                <span className="amount">{formatINR(taxable)}</span>
              </div>
            )}
            {isFixed && (
              <div className="calc-row">
                <span>Taxable value</span>
                <span className="amount">{formatINR(taxable)}</span>
              </div>
            )}
            <div className="calc-row">
              <span>GST {isFixed ? '' : '(18%)'}</span>
              <span className="amount">{formatINR(gst)}</span>
            </div>
            {!isFixed && oneTime > 0 && (
              <div className="calc-row">
                <span>One-time fee</span>
                <span className="amount">{formatINR(oneTime)}</span>
              </div>
            )}
            <div className="calc-row total">
              <span>Net amount</span>
              <span className="amount">{formatINR(net)}</span>
            </div>
            {prevPending !== 0 && (
              <>
                <div className="calc-row">
                  <span>Previous pending (carry-forward)</span>
                  <span className="amount">{formatINR(prevPending)}</span>
                </div>
                <div className="calc-row total grand">
                  <span>Total due this year</span>
                  <span className="amount">{formatINR(totalDue)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 3 — Carry-forward & invoice */}
        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">3</span> Carry-forward &amp; invoice</div>
          <div className="form-grid">
            <div className="field">
              <label>Previous pending</label>
              <div className="input-unit">
                <span className="unit">₹</span>
                <input className="input" type="number" step="0.01" placeholder="0"
                  value={form.previousPending} onChange={e => set('previousPending', e.target.value)} />
              </div>
              <span className="hint">Balance carried from earlier years — stays editable.</span>
            </div>
            <div className="field">
              <label>Invoice status</label>
              <select className="select" value={form.invoiceStatus}
                onChange={e => set('invoiceStatus', e.target.value)}>
                <option value="">Not set</option>
                {meta.invoiceStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* 4 — Follow-up & remarks */}
        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">4</span> Follow-up &amp; remarks <span style={{ textTransform: 'none', fontWeight: 500 }}>(optional)</span></div>
          <div className="chip-row" style={{ marginBottom: 10 }}>
            {FOLLOWUP_PRESETS.map(p => (
              <button key={p.label} type="button"
                className={`chip ${form.nextFollowupDate === p.value() ? 'active' : ''}`}
                onClick={() => set('nextFollowupDate', p.value())}>
                {p.label}
              </button>
            ))}
            {form.nextFollowupDate && (
              <button type="button" className="chip" onClick={() => set('nextFollowupDate', '')}>
                ✕ Clear
              </button>
            )}
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Follow-up date</label>
              <input className="input" type="date" value={form.nextFollowupDate}
                onChange={e => set('nextFollowupDate', e.target.value)} />
            </div>
            <div className="field">
              <label>Follow-up note</label>
              <input className="input" placeholder="e.g. call accounts after 15th"
                value={form.followupNote} onChange={e => set('followupNote', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Remarks</label>
            <textarea className="input" rows={2} placeholder="Anything worth remembering about this year"
              value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : `Add Year — ${formatINR(totalDue)}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
