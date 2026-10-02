// Shared letterhead shell for printable payroll reports.
import { OrgBrand } from '../orgBrand';

export const esc = (v: any) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const inr = (n: number) =>
  (Number(n || 0) < 0 ? '−' : '') + '₹' + Math.abs(Number(n || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Whole-rupee figure for wide tables; blank-looking dash for zero.
export const amt = (n: number) =>
  Math.abs(Number(n || 0)) < 0.005 ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const monthShort = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
};

export const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

// The head of a report: company on one side and the report's title on the
// other, or everything centred, as the company's logo position says.
function reportHeader(brand: OrgBrand, title: string, subtitle: string, primary: string, accent: string): string {
  const logo = brand.logoData ? `<img src="${brand.logoData}" alt="" style="height:48px;max-width:140px;object-fit:contain;"/>` : '';
  const company = `<div>
        <div style="font-size:22px;font-weight:bold;color:${accent};">${esc(brand.name)}</div>
        ${brand.addressLine ? `<div style="font-size:11.5px;color:#666;">${esc(brand.addressLine)}</div>` : ''}
      </div>`;
  const heading = (align: string) => `<div style="text-align:${align};">
      <div style="font-size:16px;font-weight:700;">${esc(title)}</div>
      <div style="font-size:12.5px;color:#555;">${esc(subtitle)}</div>
    </div>`;
  const rule = `border-bottom:3px solid ${primary};padding-bottom:12px;margin-bottom:14px;`;
  if (brand.logoPosition === 'CENTER') {
    return `<div style="${rule}text-align:center;">
    ${logo ? `<div style="margin-bottom:6px;display:flex;justify-content:center;">${logo}</div>` : ''}
    ${company}
    <div style="margin-top:8px;">${heading('center')}</div>
  </div>`;
  }
  const right = brand.logoPosition === 'RIGHT';
  const block = `<div style="display:flex;align-items:center;gap:14px;${right ? 'flex-direction:row-reverse;text-align:right;' : ''}">${logo}${company}</div>`;
  return `<div style="${rule}display:flex;justify-content:space-between;align-items:flex-end;${right ? 'flex-direction:row-reverse;' : ''}">
    ${block}
    ${heading(right ? 'left' : 'right')}
  </div>`;
}

export function reportShell(brand: OrgBrand, title: string, subtitle: string, body: string): string {
  const primary = brand.brandPrimary || '#4f46e5';
  const accent = brand.brandAccent || '#312e81';
  return `
<div style="font-family:'Segoe UI',-apple-system,sans-serif;color:#1a1a2e;font-size:13.5px;line-height:1.6;">
  <style>
    .st-table { width:100%; border-collapse:collapse; margin-bottom:22px; }
    .st-table th, .st-table td { border:1px solid #d6dbe3; padding:5px 8px; font-size:12px; vertical-align:top; }
    .st-table th { background:#eef2ff; color:${accent}; text-align:left; white-space:nowrap; }
    .st-table .nw { white-space:nowrap; }
    .st-table .muted { color:#6b7280; }
    .st-table .amt { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .st-table th.amt { text-align:right; }
    .st-table .ctr { text-align:center; white-space:nowrap; }
    .st-table .tot td { font-weight:700; background:#f8fafc; }
    .st-table .sub td { font-weight:600; background:#fafbff; }
    .st-h { font-size:15px; font-weight:700; color:${accent}; margin:18px 0 8px; }
    @media print { @page { size: A4 landscape; margin: 10mm; } .st-table th, .st-table td { font-size: 10.5px; padding: 4px 7px; } }
  </style>
  ${reportHeader(brand, title, subtitle, primary, accent)}
  ${body}
</div>`;
}
