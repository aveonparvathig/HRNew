// Proforma invoices — pure helpers (numbering, GST math, amount in words) and
// the branded A4 document. No database access here, so it is unit-testable.
import { escapeHtml as esc } from '../utils/html';
import { amountInWords } from './payrollCalc';
import { signatureImg, brandContactLine, type OrgBrand } from './orgBrand';

export const PROFORMA_GST_RATE = 0.18;

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Numbering: PI/<academicYear>/NNN, sequential per (organization, period).
// ---------------------------------------------------------------------------
export const proformaPrefix = (academicYear: string) => `PI/${academicYear}/`;

// Next number after the highest existing one for this period. Gaps (deleted
// invoices) are never reused, so a reissued number can't collide with paper.
export function nextProformaNumber(academicYear: string, existing: string[]): string {
  const prefix = proformaPrefix(academicYear);
  let max = 0;
  for (const n of existing) {
    if (!n.startsWith(prefix)) continue;
    const seq = parseInt(n.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(3, '0')}`;
}

// ---------------------------------------------------------------------------
// Amounts: GST @18% on the taxable value. The one-time fee carries GST only
// when the user opts in (`oneTimeGst`) — decided per invoice.
// `gst` is the total GST; `oneTimeGstAmount` is the one-time line's share.
// ---------------------------------------------------------------------------
export function computeProformaAmounts(taxable: number, oneTime = 0, oneTimeGst = false) {
  const t = round2(Number(taxable) || 0);
  const o = round2(Number(oneTime) || 0);
  const subscriptionGst = round2(t * PROFORMA_GST_RATE);
  const oneTimeGstAmount = oneTimeGst ? round2(o * PROFORMA_GST_RATE) : 0;
  const gst = round2(subscriptionGst + oneTimeGstAmount);
  return {
    taxable: t, gst, oneTime: o, oneTimeGst: Boolean(oneTimeGst) && o > 0, oneTimeGstAmount,
    total: round2(t + o + gst),
  };
}

// Taxable value whose amount + 18% GST equals the given balance.
export const taxableForBalance = (balance: number) =>
  Math.max(round2((Number(balance) || 0) / (1 + PROFORMA_GST_RATE)), 0);

// Rupees and paise in words, Indian numbering ("... Rupees and Fifty Paise Only").
export function proformaAmountInWords(amount: number): string {
  const total = round2(Math.abs(Number(amount) || 0));
  const rupees = Math.floor(total);
  const paise = Math.round((total - rupees) * 100);
  if (!paise) return amountInWords(rupees);
  const paiseWords = amountInWords(paise).replace(/ Rupees Only$/, '');
  return `${amountInWords(rupees).replace(/ Only$/, '')} and ${paiseWords} Paise Only`;
}

// ---------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------
const money2 = (n: number) =>
  Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (v: string) => {
  const d = new Date(`${v}T00:00:00Z`);
  return isNaN(d.getTime()) ? String(v)
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export interface ProformaDoc {
  number: string;
  invoiceDate: string; // YYYY-MM-DD
  periodLabel: string;
  clientName: string;
  onboarding?: {
    contactPerson?: string; contactDesignation?: string; contactPhone?: string;
    contactEmail?: string; address?: string; city?: string;
  } | null;
  lineDescription: string;
  taxable: number;
  gst: number; // total GST (subscription + one-time when taxed)
  oneTime: number;
  oneTimeGst?: boolean;
  oneTimeGstAmount?: number;
  total: number;
}

export const proformaFilename = (number: string, clientName: string) =>
  `Proforma_${number.replace(/[^\w]+/g, '-')}_${String(clientName).replace(/[^\w]+/g, '_').slice(0, 50)}.pdf`;

export function renderProformaHtml(brand: OrgBrand, d: ProformaDoc): string {
  const primary = brand.brandPrimary || '#4f46e5';
  const accent = brand.brandAccent || '#312e81';
  const ob = d.onboarding || {};
  const contact = brandContactLine(brand);
  const buyerLines = [
    ob.contactPerson ? `Attn: ${esc(ob.contactPerson)}${ob.contactDesignation ? `, ${esc(ob.contactDesignation)}` : ''}` : '',
    esc(ob.address || ''),
    esc(ob.city || ''),
    [ob.contactPhone, ob.contactEmail].filter(Boolean).map(esc).join(' · '),
  ].filter(Boolean).map(l => `<div>${l}</div>`).join('');

  const otTaxed = Boolean(d.oneTimeGst) && d.oneTime > 0;
  const otGst = otTaxed ? (d.oneTimeGstAmount ?? round2(d.oneTime * PROFORMA_GST_RATE)) : 0;
  const lineGst = round2(d.gst - otGst); // subscription line's GST
  const oneTimeRow = d.oneTime > 0 ? `
      <tr><td class="c">2</td><td>One-time fee${otTaxed ? '' : ' (not subject to GST)'}</td>
        <td class="amt">${money2(d.oneTime)}</td><td class="amt">${otTaxed ? money2(otGst) : '—'}</td>
        <td class="amt">${money2(d.oneTime + otGst)}</td></tr>` : '';
  // Totals: a taxed one-time fee joins the taxable value; an untaxed one sits apart
  const taxableTotal = round2(d.taxable + (otTaxed ? d.oneTime : 0));

  return `
<div class="pi-doc" style="font-family:'Segoe UI',-apple-system,sans-serif;color:#1a1a2e;font-size:12.5px;line-height:1.55;background:#fff;padding:2px;">
  <style>
    .pi-doc table { width:100%; border-collapse:collapse; }
    .pi-items th, .pi-items td { border:1px solid #d6dbe3; padding:6px 8px; }
    .pi-items th { background:#eef2ff; color:${accent}; text-align:left; font-size:11px; }
    .pi-items .amt { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .pi-items .c { text-align:center; width:34px; }
    .pi-tot td { padding:4px 8px; }
    .pi-tot .amt { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .pi-tot .grand td { border-top:2px solid ${primary}; font-weight:700; font-size:14px; padding-top:7px; }
    .pi-label { font-size:10.5px; text-transform:uppercase; letter-spacing:.06em; color:#6b7280; font-weight:700; margin-bottom:4px; }
    .pi-doc tr { page-break-inside:avoid; }
  </style>

  <div style="border-bottom:3px solid ${primary};padding-bottom:12px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;">
    <div style="display:flex;align-items:center;gap:12px;min-width:0;">
      ${brand.logoData ? `<img src="${brand.logoData}" alt="" style="height:44px;max-width:120px;object-fit:contain;"/>` : ''}
      <div style="min-width:0;">
        <div style="font-size:18px;font-weight:bold;color:${accent};">${esc(brand.name)}</div>
        ${brand.addressLine ? `<div style="font-size:10.5px;color:#666;">${esc(brand.addressLine)}</div>` : ''}
        ${contact ? `<div style="font-size:10.5px;color:#666;">${esc(contact)}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right;flex:none;">
      <div style="font-size:19px;font-weight:800;color:${accent};letter-spacing:.02em;">PROFORMA INVOICE</div>
      <div style="display:inline-block;margin-top:4px;padding:2px 8px;border:1px solid #b91c1c;color:#b91c1c;border-radius:4px;font-size:10.5px;font-weight:700;">
        Proforma Invoice — Not a Tax Invoice
      </div>
    </div>
  </div>

  <table style="margin-bottom:18px;">
    <tr>
      <td style="vertical-align:top;width:58%;padding-right:16px;">
        <div class="pi-label">Bill To</div>
        <div style="font-size:14px;font-weight:700;">${esc(d.clientName)}</div>
        <div style="color:#444;">${buyerLines}</div>
      </td>
      <td style="vertical-align:top;">
        <table>
          <tr><td style="color:#6b7280;padding:2px 0;">Proforma No.</td><td style="font-weight:700;text-align:right;">${esc(d.number)}</td></tr>
          <tr><td style="color:#6b7280;padding:2px 0;">Date</td><td style="text-align:right;">${esc(fmtDate(d.invoiceDate))}</td></tr>
          <tr><td style="color:#6b7280;padding:2px 0;">Billing period</td><td style="text-align:right;">${esc(d.periodLabel)}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <table class="pi-items" style="margin-bottom:10px;">
    <tr><th class="c">#</th><th>Description</th><th class="amt">Taxable (Rs.)</th>
      <th class="amt">GST @ 18% (Rs.)</th><th class="amt">Amount (Rs.)</th></tr>
    <tr><td class="c">1</td><td>${esc(d.lineDescription)}</td>
      <td class="amt">${money2(d.taxable)}</td><td class="amt">${money2(lineGst)}</td>
      <td class="amt">${money2(d.taxable + lineGst)}</td></tr>${oneTimeRow}
  </table>

  <table class="pi-tot" style="width:46%;margin-left:auto;margin-bottom:14px;">
    <tr><td>Taxable value</td><td class="amt">${money2(taxableTotal)}</td></tr>
    <tr><td>GST @ 18%</td><td class="amt">${money2(d.gst)}</td></tr>
    ${d.oneTime > 0 && !otTaxed ? `<tr><td>One-time fee (no GST)</td><td class="amt">${money2(d.oneTime)}</td></tr>` : ''}
    <tr class="grand"><td>Total Payable</td><td class="amt">₹${money2(d.total)}</td></tr>
  </table>

  <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;padding:8px 12px;margin-bottom:18px;">
    <span class="pi-label" style="display:inline;margin-right:6px;">Amount in words:</span>
    <strong>${esc(proformaAmountInWords(d.total))}</strong>
  </div>

  <div style="font-size:11px;color:#555;margin-bottom:26px;">
    This is a proforma invoice issued for payment purposes only. It is not a tax invoice and
    cannot be used to claim input tax credit. A tax invoice will be issued on receipt of payment.
  </div>

  <div style="display:flex;justify-content:flex-end;">
    <div style="text-align:center;min-width:200px;">
      <div style="font-size:11px;color:#555;margin-bottom:6px;">For ${esc(brand.name)}</div>
      <div style="height:48px;display:flex;justify-content:center;align-items:flex-end;">${signatureImg(brand.signatureData)}</div>
      <div style="border-top:1px solid #9ca3af;padding-top:4px;font-size:11.5px;">
        <strong>${esc(brand.signatoryName || '')}</strong><br/>${esc(brand.signatoryDesignation || 'Authorised Signatory')}
      </div>
    </div>
  </div>
</div>`;
}
