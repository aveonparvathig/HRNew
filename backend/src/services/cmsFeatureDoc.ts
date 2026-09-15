// Print-ready CMS ERP product specifications document.
// Faithful port of the Django template payslip/proposals/feature_list.html:
// 16 chapters, every module's full 9-part spec, featured clients — for demos,
// tenders and RFP responses. Returns a complete standalone HTML document.
import { CMS_SPEC } from '../data/cmsSpec';
import { FEATURED_CLIENTS } from '../data/cmsClients';
import type { OrgBrand } from './orgBrand';

const esc = (v: any) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const list = (items: string[], cls: string, tag: 'ul' | 'ol' = 'ul') =>
  `<${tag} class="${cls}">${items.map(i => `<li>${esc(i)}</li>`).join('')}</${tag}>`;

const section = (n: number, title: string, body: string) =>
  `<div class="ms-h"><span class="ms-n">${n}</span> ${title}</div>${body}`;

function moduleSpec(mod: any): string {
  const parts: string[] = [];
  parts.push(section(1, 'Module Overview', `<p class="body-p">${esc(mod.overview)}</p>`));
  if (mod.objectives?.length) parts.push(section(2, 'Objectives', list(mod.objectives, 'ms-list')));
  if (mod.features?.length) {
    parts.push(section(3, 'Key Features',
      `<div class="feat-grid">${mod.features.map((f: string) => `<div class="feat-item">${esc(f)}</div>`).join('')}</div>`));
  }
  if (mod.benefits?.length) parts.push(section(4, 'Business Benefits', list(mod.benefits, 'ms-list')));
  if (mod.workflow?.length) parts.push(section(5, 'Workflow', list(mod.workflow, 'ms-steps', 'ol')));
  if (mod.roles?.length) {
    parts.push(section(6, 'User Roles',
      `<div class="roles-tbl"><div class="roles-hdr"><span>Role</span><span>Responsibility</span></div>` +
      mod.roles.map(([role, resp]: [string, string]) =>
        `<div class="roles-row"><div class="roles-role">${esc(role)}</div><div class="roles-resp">${esc(resp)}</div></div>`).join('') +
      `</div>`));
  }
  if (mod.reports?.length) parts.push(section(7, 'Reports &amp; Dashboards', list(mod.reports, 'ms-list')));
  if (mod.integrations?.length) parts.push(section(8, 'Integrations', list(mod.integrations, 'ms-list')));
  if (mod.compliance?.length) {
    parts.push(section(9, 'Compliance Support',
      `<div class="comp-callout">${mod.compliance.map((c: string) => `<div>${esc(c)}</div>`).join('')}</div>`));
  }
  return `<div class="mod-spec">
    <div class="mod-banner">
      <span class="mod-banner-num">MODULE ${esc(mod.num)}</span>
      <span class="mod-banner-name">${esc(mod.title)}</span>
    </div>
    <div class="mod-inner">${parts.join('\n')}</div>
  </div>`;
}

function chapter(ch: any): string {
  const intro = (ch.intro || []).map((p: string) => `<p class="body-p">${esc(p)}</p>`).join('');
  const narrative = (ch.narrative || []).map((n: any) =>
    `<h3 class="narr-h">${esc(n.heading)}</h3>` +
    (n.body || []).map((p: string) => `<p class="body-p">${esc(p)}</p>`).join('') +
    (n.cards?.length
      ? `<div class="cards-g">${n.cards.map((c: any) =>
          `<div class="card-c"><div class="card-t">${esc(c.title)}</div><div class="card-d">${esc(c.desc)}</div></div>`).join('')}</div>`
      : '')).join('');
  const modules = (ch.modules || []).map(moduleSpec).join('');
  const flow = ch.flow?.length
    ? `<div class="flow-wrap">${ch.flow.map((b: string) => `<span class="flow-box">${esc(b)}</span>`)
        .join('<span class="flow-arrow">→</span>')}</div>`
    : '';
  const callout = ch.callout?.length
    ? `<div class="comp-callout" style="margin-top:18px;">${ch.callout.map((c: string) => `<div>${esc(c)}</div>`).join('')}</div>`
    : '';
  return `<div class="ch-hdr">
    <div class="ch-kicker">Chapter ${esc(ch.num)}</div>
    <div class="ch-title">${esc(ch.title)}</div>
    <div class="ch-big">${esc(ch.num)}</div>
  </div>
  <div class="sec">${intro}${narrative}${modules}${flow}${callout}</div>`;
}

export function renderCmsFeatureDoc(brand: OrgBrand): string {
  const spec = CMS_SPEC;
  const heroStats = spec.cover_stats.map((s: any) =>
    `<div class="h-stat"><div class="h-stat-val">${esc(s.value)}</div><div class="h-stat-lbl">${esc(s.label)}</div></div>`).join('');
  const docControl = spec.document_control.map(([k, v]: [string, string]) =>
    `<div class="dc-row"><div class="dc-k">${esc(k)}</div><div class="dc-v">${esc(v)}</div></div>`).join('');
  const toc = spec.chapters.map((ch: any) =>
    `<div class="toc-row"><span class="toc-num">${esc(ch.num)}</span><span class="toc-title">${esc(ch.title)}</span><span class="toc-dots"></span></div>`).join('');
  const chapters = spec.chapters.map(chapter).join('\n');
  const about = (spec.about?.paragraphs || []).map((p: string) => `<p class="body-p">${esc(p)}</p>`).join('');
  const clients = FEATURED_CLIENTS.map(c =>
    `<div class="card-c" style="text-align:center;">
      ${c.logoUri ? `<img src="${c.logoUri}" alt="${esc(c.name)} logo" style="max-height:60px;max-width:100%;margin-bottom:12px;object-fit:contain;">` : ''}
      <div class="card-t">${esc(c.name)}</div>
    </div>`).join('');
  const contact = [
    brand.phone ? `<span>Phone: <strong>${esc(brand.phone)}</strong></span>` : '',
    brand.email ? `<span>Email: <strong>${esc(brand.email)}</strong></span>` : '',
    brand.website ? `<span>Website: <strong>${esc(brand.website)}</strong></span>` : '',
  ].join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Aveon CMS ERP - Product Features &amp; Functional Specifications</title>
<style>
  *,*::before,*::after { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:'Segoe UI', Arial, sans-serif; background:#F5F7FA; color:#1A1A2E; line-height:1.6; }
  .page { max-width:1100px; margin:0 auto; background:#fff; box-shadow:0 0 30px rgba(15,30,70,0.08); }

  /* ===== Cover ===== */
  .hero { background:linear-gradient(135deg, #1565C0F0 0%, #1565C0DE 45%, #E65100B8 100%); position:relative; overflow:hidden; }
  .hero-bar { display:flex; align-items:center; justify-content:space-between; padding:20px 60px; border-bottom:1px solid rgba(255,255,255,0.15); }
  .hero-brand { display:flex; align-items:center; gap:14px; }
  .hero-logo { width:48px; height:48px; object-fit:contain; background:#fff; border-radius:10px; padding:5px; flex-shrink:0; }
  .hero-company { font-size:18px; font-weight:800; color:#fff; }
  .hero-tagline { font-size:12px; color:rgba(255,255,255,0.85); margin-top:2px; }
  .hero-body { padding:60px 60px 56px; text-align:center; }
  .hero-kicker { display:inline-flex; align-items:center; gap:8px; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.35); border-radius:20px; padding:5px 16px; font-size:11px; font-weight:700; letter-spacing:3px; text-transform:uppercase; color:#fff; margin-bottom:24px; }
  .hero h1 { font-size:38px; font-weight:900; color:#fff; line-height:1.2; margin-bottom:6px; letter-spacing:0.5px; }
  .hero .h1-sub { font-size:22px; font-weight:800; color:#FFB300; letter-spacing:4px; margin-bottom:18px; }
  .hero-sub { font-size:16.5px; color:rgba(255,255,255,0.96); margin-bottom:14px; }
  .hero-ver { display:inline-block; font-size:12.5px; font-weight:800; letter-spacing:2px; color:#fff; background:rgba(13,27,62,0.35); border:1px solid rgba(255,255,255,0.3); border-radius:16px; padding:4px 16px; margin-bottom:34px; }
  .hero-stats { display:grid; grid-template-columns:repeat(4, 1fr); gap:1px; background:rgba(255,255,255,0.15); border-radius:12px; overflow:hidden; border:1px solid rgba(255,255,255,0.2); }
  .h-stat { background:rgba(13,27,62,0.22); padding:16px 20px; text-align:center; }
  .h-stat-val { font-size:26px; font-weight:900; color:#FFB300; }
  .h-stat-lbl { font-size:12px; color:rgba(255,255,255,0.95); margin-top:4px; line-height:1.4; }

  /* ===== Sections ===== */
  .sec { padding:36px 60px; background:#fff; }
  .sec.tint { background:#F5F7FA; }
  .st { font-size:24px; font-weight:900; color:#1A1A2E; margin-bottom:14px; line-height:1.2; }
  .body-p { font-size:15px; color:#4A5568; line-height:1.85; text-align:justify; margin-bottom:10px; }
  .dc-table { border:1px solid #E2E8F0; border-radius:10px; overflow:hidden; }
  .dc-row { display:grid; grid-template-columns:220px 1fr; border-top:1px solid #E8EDF5; }
  .dc-row:first-child { border-top:none; }
  .dc-k { padding:10px 16px; background:#F8FAFC; font-size:13.5px; font-weight:800; color:#334155; }
  .dc-v { padding:10px 16px; font-size:14px; color:#475569; }
  .toc { display:grid; grid-template-columns:1fr 1fr; gap:6px 36px; }
  .toc-row { display:flex; align-items:baseline; gap:12px; font-size:14.5px; color:#334155; padding:7px 0; }
  .toc-num { width:30px; height:30px; border-radius:50%; flex-shrink:0; background:#EEF4FF; color:#1565C0; display:inline-flex; align-items:center; justify-content:center; font-size:12px; font-weight:900; font-family:monospace; align-self:center; }
  .toc-title { font-weight:600; }
  .toc-dots { flex:1; border-bottom:2px dotted #CBD5E1; margin:0 4px 5px; min-width:20px; }
  .ch-hdr { background:linear-gradient(135deg, #1565C0, #1E3A5F); color:#fff; padding:28px 60px; position:relative; overflow:hidden; }
  .ch-kicker { font-size:11px; font-weight:800; letter-spacing:3px; text-transform:uppercase; color:#FFB300; margin-bottom:4px; }
  .ch-title { font-size:25px; font-weight:900; position:relative; }
  .ch-big { position:absolute; right:44px; top:50%; transform:translateY(-50%); font-size:74px; font-weight:900; color:rgba(255,255,255,0.12); font-family:monospace; line-height:1; pointer-events:none; }
  .narr-h { font-size:17px; font-weight:800; color:#1565C0; margin:18px 0 8px; }
  .cards-g { display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-top:14px; }
  .card-c { border:1.5px solid #DCE4EF; border-radius:12px; padding:16px 18px; background:#fff; }
  .card-t { font-size:14.5px; font-weight:800; color:#1A1A2E; margin-bottom:4px; }
  .card-d { font-size:13.5px; color:#5A6478; line-height:1.7; }
  .mod-spec { margin-top:18px; border:1.5px solid #DCE4EF; border-radius:14px; overflow:hidden; box-shadow:0 2px 8px rgba(15,30,70,0.05); }
  .mod-spec:first-of-type { margin-top:8px; }
  .mod-banner { display:flex; align-items:center; gap:12px; background:linear-gradient(90deg, #EEF4FF, #F8FAFF); border-left:5px solid #1565C0; padding:14px 20px; }
  .mod-banner-num { font-size:11px; font-weight:900; letter-spacing:1.5px; font-family:monospace; color:#fff; background:#1565C0; border-radius:6px; padding:4px 10px; flex-shrink:0; }
  .mod-banner-name { font-size:17px; font-weight:800; color:#1A1A2E; }
  .mod-inner { padding:16px 22px 20px; }
  .ms-h { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:800; letter-spacing:1px; text-transform:uppercase; color:#1565C0; margin:14px 0 6px; }
  .ms-h:first-child { margin-top:0; }
  .ms-h .ms-n { width:22px; height:22px; border-radius:50%; background:#1565C0; color:#fff; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:900; flex-shrink:0; }
  .ms-list { list-style:none; }
  .ms-list li { font-size:14px; color:#374151; line-height:1.65; padding:3px 0 3px 18px; position:relative; }
  .ms-list li::before { content:"•"; position:absolute; left:4px; color:#1565C0; font-weight:900; }
  .ms-steps { list-style:none; counter-reset:step; }
  .ms-steps li { counter-increment:step; font-size:14px; color:#374151; line-height:1.65; padding:3px 0 3px 30px; position:relative; }
  .ms-steps li::before { content:counter(step); position:absolute; left:0; top:5px; width:20px; height:20px; border-radius:50%; background:#EEF4FF; color:#1565C0; font-size:11px; font-weight:900; display:flex; align-items:center; justify-content:center; }
  .feat-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:8px; }
  .feat-item { display:flex; align-items:center; gap:9px; background:#F8FAFC; border:1px solid #E8EDF5; border-radius:9px; padding:8px 12px; font-size:13.5px; font-weight:600; color:#334155; line-height:1.45; }
  .feat-item::before { content:"✓"; width:18px; height:18px; border-radius:50%; flex-shrink:0; background:#E8F5E9; color:#2E7D32; display:inline-flex; align-items:center; justify-content:center; font-size:11px; font-weight:900; }
  .roles-tbl { border:1px solid #E2E8F0; border-radius:8px; overflow:hidden; }
  .roles-hdr { display:grid; grid-template-columns:240px 1fr; background:#1565C0; color:#fff; font-size:11.5px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase; }
  .roles-hdr span { padding:8px 14px; }
  .roles-row { display:grid; grid-template-columns:240px 1fr; border-top:1px solid #E8EDF5; font-size:13.5px; }
  .roles-role { padding:8px 14px; font-weight:700; color:#1A1A2E; background:#F8FAFC; }
  .roles-resp { padding:8px 14px; color:#475569; }
  .comp-callout { background:linear-gradient(135deg,#E8F5E9,#EEF4FF); border-left:4px solid #2E7D32; border-radius:10px; padding:12px 18px; }
  .comp-callout div { font-size:13.5px; color:#1A1A2E; line-height:1.7; padding:2px 0 2px 18px; position:relative; }
  .comp-callout div::before { content:"✓"; position:absolute; left:0; color:#2E7D32; font-weight:900; }
  .flow-wrap { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:16px; }
  .flow-box { background:#EEF4FF; border:1.5px solid #1565C055; border-radius:8px; padding:7px 14px; font-size:13px; font-weight:700; color:#1A3C6E; white-space:nowrap; }
  .flow-arrow { color:#E65100; font-weight:900; font-size:14px; }
  .ns-contact { display:flex; align-items:center; gap:24px; flex-wrap:wrap; background:#1A1A2E; color:#E2E8F0; border-radius:10px; padding:16px 22px; font-size:14.5px; margin:28px 60px 40px; }
  .ns-contact strong { color:#fff; }
  .ns-talk { font-size:15px; font-weight:900; color:#FFD54F; }

  /* ===== A4 print pagination (compact flow) ===== */
  @page { size: A4; margin: 12mm 10mm 14mm; }
  @media print {
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { background:#fff; }
    .page { max-width:100%; box-shadow:none; }
    .sec, .hero-body, .hero-bar, .ch-hdr { padding-left:32px; padding-right:32px; }
    .hero-body { padding-top:30px; padding-bottom:34px; }
    .sec { padding-top:22px; padding-bottom:22px; }
    .ns-contact { margin-left:32px; margin-right:32px; }
    .mod-spec { margin-top:12px; box-shadow:none; }
    .mod-inner { padding:12px 18px 16px; }
    .ch-hdr { padding-top:18px; padding-bottom:18px; page-break-inside:avoid; break-inside:avoid; page-break-after:avoid; break-after:avoid; }
    .mod-banner { page-break-inside:avoid; break-inside:avoid; page-break-after:avoid; break-after:avoid; }
    .feat-grid { grid-template-columns:repeat(3, 1fr); gap:6px; }
    .feat-item { padding:5px 9px; font-size:12px; border-radius:7px; }
    .feat-grid, .roles-tbl, .comp-callout, .cards-g, .dc-table, .hero-stats, .ns-contact, .flow-wrap { page-break-inside:avoid; break-inside:avoid; }
    .ms-h, .st, .narr-h { page-break-after:avoid; break-after:avoid; }
    p, li { orphans:3; widows:3; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="hero">
    <div class="hero-bar">
      <div class="hero-brand">
        ${brand.logoData ? `<img class="hero-logo" src="${brand.logoData}" alt="Aveon logo">` : ''}
        <div>
          <div class="hero-company">Aveon Infotech Private Limited</div>
          <div class="hero-tagline">Empowering Educational Institutions Through Digital Innovation</div>
        </div>
      </div>
    </div>
    <div class="hero-body">
      <div class="hero-kicker">Aveon Complete</div>
      <h1>Campus Management System</h1>
      <div class="h1-sub">( C M S &nbsp; E R P )</div>
      <p class="hero-sub">Complete Product Features &amp; Functional Specifications</p>
      <p class="hero-ver">Version 2026</p>
      <div class="hero-stats">${heroStats}</div>
    </div>
  </div>

  <div class="sec">
    <h2 class="st">Document Control</h2>
    <div class="dc-table">${docControl}</div>
    ${spec.purpose ? `<p class="body-p" style="margin-top:16px;">${esc(spec.purpose)}</p>` : ''}
  </div>

  <div class="sec tint">
    <h2 class="st">Table of Contents</h2>
    <div class="toc">${toc}</div>
  </div>

  ${chapters}

  <div class="sec tint">
    <h2 class="st">About Aveon Infotech</h2>
    ${about}
  </div>

  <div class="sec">
    <h2 class="st">Featured Clients</h2>
    <div class="cards-g">${clients}</div>
  </div>

  <div class="ns-contact">
    <span class="ns-talk">Let&rsquo;s talk.</span>
    ${contact}
  </div>

</div>
</body>
</html>`;
}
