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

export function renderProformaHtml(brand: OrgBrand, d: ProformaDoc): string {
  const accent = brand.brandPrimary || '#0e7490';
  const totals = proformaTotals(d.lines, d.taxType);
  const advance = round2(Math.max(Number(d.advanceReceived) || 0, 0));
  const intra = d.taxType === 'CGST_SGST';
  const seller: ProformaParty = {
    name: brand.name, address: brand.address, city: brand.city, state: brand.state,
    pincode: brand.pincode, country: brand.country, gstin: brand.gstin,
  };
  const sellerMeta = [
    brand.gstin ? `GSTIN: ${esc(brand.gstin)}` : '',
    brand.phone ? `Ph: ${esc(brand.phone)}` : '',
  ].filter(Boolean).join(' &nbsp;•&nbsp; ');

  const partyBox = (label: string) => `
    <div class="pf-party">
      <div class="pf-label">${label}</div>
      <div class="pf-pname">${esc(d.buyer.name)}</div>
      ${addressLines(d.buyer).map(l => `<div>${esc(l)}</div>`).join('')}
      ${d.buyer.gstin ? `<div class="pf-gstin">GSTIN: ${esc(d.buyer.gstin)}</div>` : ''}
    </div>`;

  const rows = d.lines.map((l, i) => `
    <tr>
      <td class="pf-n">${i + 1}.</td>
      <td><div class="pf-desc">${esc(l.description)}</div>${l.detail ? `<div class="pf-detail">${esc(l.detail)}</div>` : ''}</td>
      <td>${esc(l.hsn)}</td>
      <td class="r">${fmtQty(l.qty)}</td>
      <td class="r">${money2(l.rate)}</td>
      <td class="r">${money2(l.taxable)}</td>
      <td class="r">${l.gstRate ? `${money2(l.gst)}<div class="pf-rate">@ ${l.gstRate}%</div>` : '<span class="pf-muted">—</span>'}</td>
      <td class="r pf-strong">${money2(l.total)}</td>
    </tr>`).join('');

  const totalRow = (label: string, v: number) =>
    `<tr><td>${label}</td><td class="r pf-strong">Rs.${money2(v)}</td></tr>`;

  return `
<div class="pf-doc">
  <style>
    .pf-doc { font-family: Arial, 'Helvetica Neue', sans-serif; color:#111827; font-size:11.5px; line-height:1.45;
      background:#fff; padding:6mm 7mm 4mm; min-height:272mm; box-sizing:border-box; display:flex; flex-direction:column; }
    .pf-doc table { border-collapse:collapse; width:100%; }
    .pf-head { display:flex; justify-content:space-between; gap:16px; padding-bottom:14px; border-bottom:1px solid #e5e7eb; }
    .pf-org { font-size:19px; font-weight:700; margin-bottom:6px; }
    .pf-small { font-size:10.5px; color:#4b5563; }
    .pf-orgmeta { font-size:10.5px; font-weight:700; margin-top:2px; }
    .pf-title { font-size:30px; font-weight:800; line-height:1.05; text-align:right; letter-spacing:.01em; }
    .pf-bar { height:4px; width:150px; background:${accent}; margin:8px 0 10px auto; }
    .pf-meta td { padding:2px 0; font-size:11.5px; }
    .pf-meta .k { color:#9ca3af; font-size:9.5px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; text-align:right; padding-right:22px; }
    .pf-meta .v { font-weight:700; text-align:right; white-space:nowrap; }
    .pf-parties { display:flex; gap:18px; margin:22px 0 26px; }
    .pf-party { flex:1; border:1px solid #e5e7eb; border-radius:8px; padding:14px 20px 18px; color:#4b5563; }
    .pf-label { color:${accent}; font-size:10px; font-weight:700; letter-spacing:.08em; margin-bottom:6px; }
    .pf-pname { color:#111827; font-size:14.5px; font-weight:700; margin-bottom:6px; line-height:1.3; }
    .pf-gstin { color:#111827; font-weight:700; margin-top:4px; }
    .pf-items th { background:#f9fafb; color:#9ca3af; font-size:9.5px; font-weight:700; text-transform:uppercase;
      letter-spacing:.04em; text-align:left; padding:9px 6px; }
    .pf-items td { padding:10px 6px; vertical-align:top; border-bottom:1px solid #e5e7eb; }
    .pf-items tr { page-break-inside:avoid; }
    .pf-items .r { text-align:right; white-space:nowrap; }
    .pf-n { width:22px; }
    .pf-desc { font-weight:700; }
    .pf-detail { color:#4b5563; }
    .pf-rate { color:${accent}; font-size:9.5px; font-weight:700; }
    .pf-strong { font-weight:700; }
    .pf-muted { color:#9ca3af; }
    .pf-bottom { display:flex; gap:18px; margin-top:22px; align-items:stretch; page-break-inside:avoid; }
    .pf-words { flex:1.15; background:#fefce8; border:1px solid #fde68a; border-radius:8px; padding:14px 20px; }
    .pf-words .pf-label { color:#9a3412; }
    .pf-words .w { font-size:13px; font-weight:700; }
    .pf-tot { flex:1; border:1px solid #e5e7eb; border-radius:8px; padding:10px 20px; }
    .pf-tot td { padding:6px 0; font-size:12.5px; color:#4b5563; }
    .pf-tot .pf-strong { color:#111827; font-size:13px; }
    .pf-tot .grand td { border-top:1px solid #e5e7eb; color:#111827; font-size:15px; font-weight:700; padding-top:8px; }
    .pf-tot .r { text-align:right; }
    .pf-tot .adv td { padding-top:8px; }
    .pf-due { display:flex; justify-content:space-between; background:${accent}; color:#fff; font-size:14px;
      font-weight:700; border-radius:6px; padding:7px 12px; margin:4px -12px 2px; }
    .pf-foot { margin-top:auto; padding-top:40px; page-break-inside:avoid; }
    .pf-signs { display:flex; gap:90px; }
    .pf-sign { flex:1; text-align:center; font-size:11px; color:#4b5563; }
    .pf-sign .line { border-top:1px solid #111827; padding-top:6px; }
    .pf-sigimg { height:48px; display:flex; justify-content:center; align-items:flex-end; margin-bottom:4px; }
    .pf-note { text-align:center; font-style:italic; color:#9ca3af; font-size:10px; margin-top:20px; }
  </style>

  <div class="pf-head">
    <div style="display:flex;gap:12px;min-width:0;">
      ${brand.logoData ? `<img src="${brand.logoData}" alt="" style="height:52px;max-width:120px;object-fit:contain;"/>` : ''}
      <div style="min-width:0;">
        <div class="pf-org">${esc(brand.name)}</div>
        ${addressLines(seller).map(l => `<div class="pf-small">${esc(l)}</div>`).join('')}
        ${sellerMeta ? `<div class="pf-orgmeta">${sellerMeta}</div>` : ''}
      </div>
    </div>
    <div style="flex:none;">
      <div class="pf-title">PROFORMA<br/>INVOICE</div>
      <div class="pf-bar"></div>
      <table class="pf-meta" style="width:auto;margin-left:auto;">
        <tr><td class="k">Proforma No.</td><td class="v">${esc(d.number)}</td></tr>
        <tr><td class="k">Date</td><td class="v">${esc(fmtDate(d.invoiceDate))}</td></tr>
        ${d.validUntil ? `<tr><td class="k">Valid Until</td><td class="v">${esc(fmtDate(d.validUntil))}</td></tr>` : ''}
        ${d.placeOfSupply ? `<tr><td class="k">Place of Supply</td><td class="v">${esc(placeOfSupplyLabel(d.placeOfSupply))}</td></tr>` : ''}
      </table>
    </div>
  </div>

  <div class="pf-parties">${partyBox('BILL TO')}${partyBox('SHIP TO')}</div>

  <table class="pf-items">
    <tr><th>#</th><th>Item / Description</th><th>HSN/SAC</th><th class="r">Qty</th><th class="r">Rate</th>
      <th class="r">Taxable</th><th class="r">${intra ? 'CGST + SGST' : 'IGST'}</th><th class="r">Total</th></tr>
    ${rows}
  </table>

  <div class="pf-bottom">
    <div class="pf-words">
      <div class="pf-label">AMOUNT IN WORDS</div>
      <div class="w">${esc(proformaAmountInWords(totals.total))}</div>
    </div>
    <div class="pf-tot">
      <table>
        ${totalRow('Subtotal', totals.subtotal)}
        ${intra ? totalRow('CGST', totals.cgst) + totalRow('SGST', totals.sgst) : totalRow('IGST', totals.igst)}
        <tr class="grand"><td>Grand Total</td><td class="r">Rs.${money2(totals.total)}</td></tr>
        ${advance > 0 ? `<tr class="adv"><td>Advance Received</td><td class="r pf-strong">Rs.-${money2(advance)}</td></tr>` : ''}
      </table>
      ${advance > 0 ? `<div class="pf-due"><span>Balance Due</span><span>Rs.${money2(round2(totals.total - advance))}</span></div>` : ''}
    </div>
  </div>

  <div class="pf-foot">
    <div class="pf-signs">
      <div class="pf-sign"><div class="pf-sigimg"></div><div class="line">Receiver's Signature</div></div>
      <div class="pf-sign">
        <div class="pf-sigimg">${signatureImg(brand.signatureData)}</div>
        <div class="line">Authorized Signatory${brand.signatoryName ? `<br/><span style="color:#111827;font-weight:700;">${esc(brand.signatoryName)}</span>` : ''}</div>
      </div>
    </div>
    <div class="pf-note">This is a computer-generated proforma invoice and does not require a physical signature.</div>
  </div>
</div>`;
}
