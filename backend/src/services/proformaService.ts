// Proforma invoices — pure helpers (numbering, GST split, amount in words)
// and the A4 document. No database access here, so it is unit-testable.
import { escapeHtml as esc } from '../utils/html';
import { amountInWords } from './payrollCalc';
import { signatureImg, type OrgBrand } from './orgBrand';
import { GST_STATE_CODES } from './masters';

export const PROFORMA_GST_RATE = 18;
export const DEFAULT_SAC = '998311'; // IT consulting & support services
export const PROFORMA_VALID_DAYS = 7;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// GST state codes (the first two digits of a GSTIN) decide intra-state
// (CGST + SGST) vs inter-state (IGST) supply.
// ---------------------------------------------------------------------------
const codeOfState = (state: string) => GST_STATE_CODES[String(state || '').trim()] || '';

// Supplier state code: the GSTIN prefix wins over the profile state.
export const supplierStateCode = (gstin: string, state: string) =>
  (/^\d{2}/.test(String(gstin || '').trim()) ? String(gstin).trim().slice(0, 2) : codeOfState(state));

// "Tamil Nadu (33)"
export const placeOfSupplyLabel = (state: string) => {
  const code = codeOfState(state);
  return state ? (code ? `${state} (${code})` : state) : '';
};

// Intra-state unless both sides are known and differ.
export function taxTypeFor(supplierCode: string, buyerState: string): 'CGST_SGST' | 'IGST' {
  const buyerCode = codeOfState(buyerState);
  return supplierCode && buyerCode && supplierCode !== buyerCode ? 'IGST' : 'CGST_SGST';
}

// ---------------------------------------------------------------------------
// Numbering: PRO/<FY>/NNN, sequential per (organization, financial year).
// ---------------------------------------------------------------------------
// Indian financial year (April-March) of a YYYY-MM-DD date: "2026-27"
export function fiscalYearOf(date: string): string {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export const proformaPrefix = (fiscalYear: string) => `PRO/${fiscalYear}/`;

// Next number after the highest existing one in the year, never below the
// configured floor (the last number used before this system took over).
// Gaps (deleted invoices) are never reused.
export function nextProformaNumber(fiscalYear: string, existing: string[], floor = 0): string {
  const prefix = proformaPrefix(fiscalYear);
  let max = Math.max(0, Math.floor(Number(floor) || 0));
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue;
    const seq = parseInt(n.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Lines and totals
// ---------------------------------------------------------------------------
export interface ProformaLineInput {
  billingId?: string | null;
  description: string;
  detail?: string;  // second line, e.g. "Academic Year 2025 - 26"
  hsn?: string;
  qty?: number;
  rate?: number;    // per unit; taxable = qty × rate
  gst?: boolean;    // apply GST @18% (default true)
}

export interface ProformaLine {
  billingId: string | null;
  description: string;
  detail: string;
  hsn: string;
  qty: number;
  rate: number;
  taxable: number;
  gstRate: number;
  gst: number;
  total: number;
}

export function buildProformaLines(inputs: ProformaLineInput[]): ProformaLine[] {
  return inputs.map(l => {
    const qty = round2(Number(l.qty ?? 1) || 0);
    const rate = round2(Number(l.rate) || 0);
    const taxable = round2(qty * rate);
    const gstRate = l.gst === false ? 0 : PROFORMA_GST_RATE;
    const gst = round2(taxable * gstRate / 100);
    return {
      billingId: l.billingId || null,
      description: String(l.description || '').trim(),
      detail: String(l.detail || '').trim(),
      hsn: String(l.hsn ?? DEFAULT_SAC).trim(),
      qty, rate, taxable, gstRate, gst,
      total: round2(taxable + gst),
    };
  });
}

export function proformaTotals(lines: ProformaLine[], taxType: 'CGST_SGST' | 'IGST') {
  const subtotal = round2(lines.reduce((s, l) => s + l.taxable, 0));
  const gst = round2(lines.reduce((s, l) => s + l.gst, 0));
  const cgst = taxType === 'CGST_SGST' ? round2(gst / 2) : 0;
  const sgst = taxType === 'CGST_SGST' ? round2(gst - cgst) : 0;
  const igst = taxType === 'IGST' ? gst : 0;
  return { subtotal, gst, cgst, sgst, igst, total: round2(subtotal + gst) };
}

// Taxable value whose amount + 18% GST equals the given balance.
export const taxableForBalance = (balance: number) =>
  Math.max(round2((Number(balance) || 0) / (1 + PROFORMA_GST_RATE / 100)), 0);

// "Academic Year 2025 - 26" for an academic billing row; the label otherwise.
export function periodDetail(b: { periodType?: string; academicYear: string }, periodLabel: string): string {
  const m = /^(\d{4})-(\d{4})$/.exec(b.academicYear || '');
  if (b.periodType !== 'CUSTOM' && m) return `Academic Year ${m[1]} - ${m[2].slice(2)}`;
  return `Period ${periodLabel}`;
}

// "Rupees Fifty Nine Thousand Only" / "... and Fifty Paise Only"
export function proformaAmountInWords(amount: number): string {
  const total = round2(Math.abs(Number(amount) || 0));
  const rupees = Math.floor(total);
  const paise = Math.round((total - rupees) * 100);
  const words = (n: number) => amountInWords(n).replace(/ Rupees Only$/, '');
  return `Rupees ${words(rupees)}${paise ? ` and ${words(paise)} Paise` : ''} Only`;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------
const money2 = (n: number) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Whole quantities as "2,092"; fractional ones to 2 decimals
const fmtQty = (n: number) =>
  Number(n || 0).toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2,
  });

// DD/MM/YYYY
const fmtDate = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v || '');
};

export interface ProformaParty {
  name: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gstin?: string;
}

export interface ProformaDoc {
  number: string;
  invoiceDate: string;
  validUntil: string; // '' = not printed
  placeOfSupply: string; // buyer state name
  taxType: 'CGST_SGST' | 'IGST';
  buyer: ProformaParty;
  lines: ProformaLine[];
  advanceReceived?: number; // > 0 prints "Advance Received" + "Balance Due"
}

export const proformaFilename = (number: string) =>
  `proforma-${number.replace(/^PRO\//, 'PRO_').replace(/\//g, '_')}.pdf`;

// Address block lines: street (one line per line break), "City, State, PIN", country
export function addressLines(p: ProformaParty): string[] {
  const street = String(p.address || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const cityLine = [p.city, [p.state, p.pincode].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  return [...street, cityLine, p.country || 'India'].filter(Boolean);
}

// "#4f46e5" -> "rgba(79,70,229,a)"; html2canvas handles rgba() everywhere,
// 8-digit hex less reliably.
const tint = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = parseInt(m ? m[1] : '4f46e5', 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function renderProformaHtml(brand: OrgBrand, d: ProformaDoc): string {
  const accent = /^#[0-9a-f]{6}$/i.test(brand.brandPrimary || '') ? brand.brandPrimary : '#4f46e5';
  const soft = tint(accent, 0.07);
  const line = tint(accent, 0.18);
  const totals = proformaTotals(d.lines, d.taxType);
  const received = round2(Math.max(Number(d.advanceReceived) || 0, 0));
  const intra = d.taxType === 'CGST_SGST';
  const seller: ProformaParty = {
    name: brand.name, address: brand.address, city: brand.city, state: brand.state,
    pincode: brand.pincode, country: brand.country, gstin: brand.gstin,
  };
  const sellerMeta = [
    brand.gstin ? `<strong>GSTIN:</strong> ${esc(brand.gstin)}` : '',
    brand.phone ? `<strong>Ph:</strong> ${esc(brand.phone)}` : '',
    brand.email ? esc(brand.email) : '',
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const partyBox = (label: string) => `
    <div class="pf-party">
      <div class="pf-label">${label}</div>
      <div class="pf-pname">${esc(d.buyer.name)}</div>
      ${addressLines(d.buyer).map(l => `<div>${esc(l)}</div>`).join('')}
      ${d.buyer.gstin ? `<div class="pf-gstin">GSTIN: ${esc(d.buyer.gstin)}</div>` : ''}
    </div>`;

  const rows = d.lines.map((l, i) => `
    <tr>
      <td class="pf-n">${i + 1}</td>
      <td><div class="pf-desc">${esc(l.description)}</div>${l.detail ? `<div class="pf-detail">${esc(l.detail)}</div>` : ''}</td>
      <td class="c">${esc(l.hsn)}</td>
      <td class="r">${fmtQty(l.qty)}</td>
      <td class="r">${money2(l.rate)}</td>
      <td class="r">${money2(l.taxable)}</td>
      <td class="r">${l.gstRate ? `${money2(l.gst)}<div class="pf-rate">@ ${l.gstRate}%</div>` : '<span class="pf-muted">—</span>'}</td>
      <td class="r pf-strong">${money2(l.total)}</td>
    </tr>`).join('');

  const totalRow = (label: string, v: number, cls = '') =>
    `<tr class="${cls}"><td>${label}</td><td class="r">Rs.${money2(v)}</td></tr>`;

  const meta = [
    ['Proforma No.', esc(d.number)],
    ['Date', esc(fmtDate(d.invoiceDate))],
    ...(d.validUntil ? [['Valid Until', esc(fmtDate(d.validUntil))]] : []),
    ...(d.placeOfSupply ? [['Place of Supply', esc(placeOfSupplyLabel(d.placeOfSupply))]] : []),
  ].map(([k, v]) => `<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join('');

  return `
<div class="pf-doc">
  <style>
    .pf-doc { font-family: 'Segoe UI', Arial, 'Helvetica Neue', sans-serif; color:#1f2937; font-size:11.5px; line-height:1.5;
      background:#fff; padding:0 7mm 4mm; min-height:276mm; box-sizing:border-box; display:flex; flex-direction:column; }
    .pf-doc table { border-collapse:collapse; width:100%; }
    .pf-topbar { height:5px; background:${accent}; margin:0 -7mm 18px; }
    .pf-head { display:flex; justify-content:space-between; align-items:flex-start; gap:20px; }
    .pf-brand { min-width:0; }
    .pf-org { font-size:18px; font-weight:700; color:#111827; line-height:1.25; margin-bottom:4px; }
    .pf-small { font-size:10.5px; color:#6b7280; line-height:1.45; }
    .pf-orgmeta { font-size:10.5px; color:#374151; margin-top:4px; }
    .pf-titlebox { flex:none; text-align:right; }
    .pf-title { font-size:24px; font-weight:800; color:#111827; letter-spacing:.06em; line-height:1.1; }
    .pf-rule { height:3px; width:64px; background:${accent}; margin:8px 0 12px auto; border-radius:2px; }
    .pf-meta { width:auto !important; margin-left:auto; background:${soft}; border-radius:8px; }
    .pf-meta td { padding:4px 12px; font-size:11.5px; }
    .pf-meta tr:first-child td { padding-top:9px; }
    .pf-meta tr:last-child td { padding-bottom:9px; }
    .pf-meta .k { color:#6b7280; font-size:9.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; text-align:left; }
    .pf-meta .v { font-weight:700; color:#111827; text-align:right; white-space:nowrap; }
    .pf-sep { height:1px; background:#e5e7eb; margin:18px 0; }
    .pf-parties { display:flex; gap:16px; margin-bottom:22px; }
    .pf-party { flex:1; background:#f9fafb; border:1px solid #eef0f3; border-left:3px solid ${accent};
      border-radius:8px; padding:12px 18px 14px; color:#4b5563; }
    .pf-label { color:${accent}; font-size:9.5px; font-weight:700; letter-spacing:.1em; margin-bottom:5px; text-transform:uppercase; }
    .pf-pname { color:#111827; font-size:14px; font-weight:700; margin-bottom:4px; line-height:1.3; }
    .pf-gstin { color:#111827; font-weight:700; margin-top:4px; }
    .pf-items { border:1px solid #e5e7eb; border-radius:8px; overflow:hidden; border-collapse:separate !important; border-spacing:0; }
    .pf-items th { background:${soft}; color:#374151; font-size:9.5px; font-weight:700; text-transform:uppercase;
      letter-spacing:.05em; text-align:left; padding:10px 8px; border-bottom:1px solid ${line}; }
    .pf-items td { padding:10px 8px; vertical-align:top; border-bottom:1px solid #f0f1f4; }
    .pf-items tr:last-child td { border-bottom:none; }
    .pf-items tr:nth-child(odd) td { background:#fcfcfd; }
    .pf-items tr { page-break-inside:avoid; }
    .pf-items .r { text-align:right; white-space:nowrap; }
    .pf-items .c { white-space:nowrap; }
    .pf-n { width:20px; color:#9ca3af; }
    .pf-desc { font-weight:700; color:#111827; }
    .pf-detail { color:#6b7280; font-size:11px; }
    .pf-rate { color:${accent}; font-size:9.5px; font-weight:700; }
    .pf-strong { font-weight:700; color:#111827; }
    .pf-muted { color:#9ca3af; }
    .pf-bottom { display:flex; gap:16px; margin-top:20px; align-items:flex-start; page-break-inside:avoid; }
    .pf-words { flex:1.1; background:${soft}; border-radius:8px; padding:14px 18px; }
    .pf-words .w { font-size:13px; font-weight:700; color:#111827; line-height:1.45; }
    .pf-tot { flex:1; border:1px solid #e5e7eb; border-radius:8px; padding:8px 18px 10px; }
    .pf-tot td { padding:5px 0; font-size:12px; color:#4b5563; }
    .pf-tot td.r { text-align:right; color:#111827; font-weight:600; }
    .pf-tot .grand td { border-top:1px solid #e5e7eb; padding-top:9px; font-size:14.5px; font-weight:800; color:#111827; }
    .pf-tot .recv td { color:#047857; }
    .pf-tot .recv td.r { color:#047857; }
    .pf-due { display:flex; justify-content:space-between; align-items:center; background:${accent}; color:#fff;
      font-size:14px; font-weight:700; border-radius:6px; padding:8px 12px; margin:6px -10px 0; }
    .pf-foot { margin-top:auto; padding-top:36px; page-break-inside:avoid; }
    .pf-signs { display:flex; gap:80px; }
    .pf-sign { flex:1; text-align:center; font-size:11px; color:#4b5563; }
    .pf-sign .line { border-top:1px solid #9ca3af; padding-top:6px; }
    .pf-for { font-size:10.5px; color:#6b7280; margin-bottom:2px; height:16px; }
    .pf-sigimg { height:48px; display:flex; justify-content:center; align-items:flex-end; margin-bottom:4px; }
    .pf-note { text-align:center; color:#9ca3af; font-size:9.5px; margin-top:18px; padding-top:10px; border-top:1px solid #f0f1f4; }
  </style>

  <div class="pf-topbar"></div>

  <div class="pf-head">
    <!-- No logo on the proforma, by choice: the company name heads the page -->
    <div class="pf-brand">
      <div class="pf-org">${esc(brand.name)}</div>
      ${addressLines(seller).map(l => `<div class="pf-small">${esc(l)}</div>`).join('')}
      ${sellerMeta ? `<div class="pf-orgmeta">${sellerMeta}</div>` : ''}
    </div>
    <div class="pf-titlebox">
      <div class="pf-title">PROFORMA<br/>INVOICE</div>
      <div class="pf-rule"></div>
      <table class="pf-meta">${meta}</table>
    </div>
  </div>

  <div class="pf-sep"></div>

  <div class="pf-parties">${partyBox('Bill To')}${partyBox('Ship To')}</div>

  <table class="pf-items">
    <tr><th>#</th><th>Item / Description</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th>
      <th class="r">Taxable</th><th class="r">${intra ? 'CGST + SGST' : 'IGST'}</th><th class="r">Total</th></tr>
    ${rows}
  </table>

  <div class="pf-bottom">
    <div class="pf-words">
      <div class="pf-label">Amount in words</div>
      <div class="w">${esc(proformaAmountInWords(totals.total))}</div>
    </div>
    <div class="pf-tot">
      <table>
        ${totalRow('Subtotal', totals.subtotal)}
        ${intra ? totalRow('CGST @ 9%', totals.cgst) + totalRow('SGST @ 9%', totals.sgst) : totalRow('IGST @ 18%', totals.igst)}
        ${totalRow('Grand Total', totals.total, 'grand')}
        ${received > 0 ? `<tr class="recv"><td>Received Amount</td><td class="r">Rs.-${money2(received)}</td></tr>` : ''}
      </table>
      ${received > 0 ? `<div class="pf-due"><span>Balance Due</span><span>Rs.${money2(round2(totals.total - received))}</span></div>` : ''}
    </div>
  </div>

  <div class="pf-foot">
    <div class="pf-signs">
      <div class="pf-sign">
        <div class="pf-for">&nbsp;</div>
        <div class="pf-sigimg"></div><div class="line">Receiver's Signature</div>
      </div>
      <div class="pf-sign">
        <div class="pf-for">For ${esc(brand.name)}</div>
        <div class="pf-sigimg">${signatureImg(brand.signatureData)}</div>
        <div class="line">Authorized Signatory${brand.signatoryName ? `<br/><span style="color:#111827;font-weight:700;">${esc(brand.signatoryName)}</span>` : ''}</div>
      </div>
    </div>
    <div class="pf-note">This is a computer-generated proforma invoice and does not require a physical signature.</div>
  </div>
</div>`;
}
