// Shared letterhead shell for printable payroll reports.
import { OrgBrand } from '../orgBrand';

export const esc = (v: any) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

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
    @media print { @page { size: A4 landscape; margin: 10mm; } .st-table th, .st-table td { font-size: 10.5px; padding: 4px 7px; } }
  </style>
  <div style="border-bottom:3px solid ${primary};padding-bottom:12px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div style="display:flex;align-items:center;gap:14px;">
      ${brand.logoData ? `<img src="${brand.logoData}" alt="" style="height:48px;max-width:140px;object-fit:contain;"/>` : ''}
      <div>
        <div style="font-size:22px;font-weight:bold;color:${accent};">${esc(brand.name)}</div>
        ${brand.addressLine ? `<div style="font-size:11.5px;color:#666;">${esc(brand.addressLine)}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:16px;font-weight:700;">${esc(title)}</div>
      <div style="font-size:12.5px;color:#555;">${esc(subtitle)}</div>
    </div>
  </div>
  ${body}
</div>`;
}
