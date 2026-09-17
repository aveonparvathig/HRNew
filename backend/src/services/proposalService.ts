import { CATALOG } from '../data/proposalCatalog';
import { COMPANY_PROFILE } from '../data/companyProfile';
import { FEATURED_CLIENTS } from '../data/cmsClients';

// Optional document sections — the builder can switch each off.
export const SECTION_DEFAULTS: Record<string, boolean> = {
  about: true, milestones: true, awards: true, clients: true,
  pillars: true, benefits: true, implementation: true, roadmap: true,
  whyUs: true, whyNow: true, transformation: true, nextSteps: true, terms: true,
};

const esc = (v: any) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmtINR = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const fmtDate = (v: any) => {
  if (!v) return '';
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v)
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

// ---------------------------------------------------------------------------
// Selection / pricing / presentation - direct ports of proposal_catalog.py
// ---------------------------------------------------------------------------
export function resolveSelection(selectionMode: string, bundleCode: string | null, moduleCodes: string[]): any[] {
  const codes = selectionMode === 'BUNDLE' && bundleCode
    ? CATALOG.bundles[bundleCode]?.modules || []
    : moduleCodes || [];
  return codes.filter((c: string) => CATALOG.modules[c]).map((c: string) => CATALOG.modules[c]);
}

export function computePricing(d: any): any {
  const gstPct = Number(d.gstPercent || 0);
  const implFee = Number(d.oneTimeImplementationFee || 0);
  const waive = Boolean(d.waiveOneTimeFee);
  const implLine = {
    label: 'Server setup, installation, implementation, data migration, data cleansing & ERP configuration - Per Institution (One-time)',
    amount: waive ? 0 : implFee,
    originalAmount: implFee,
    waived: waive,
  };
  const pres = CATALOG.presentations[d.bundle || ''] || CATALOG.customPresentation;

  if (d.pricingModel === 'ONE_TIME') {
    const oneTime = Number(d.oneTimePrice || 0);
    const amc = Number(d.amcAmount || 0);
    const bundleName = d.bundle ? CATALOG.bundles[d.bundle]?.name : null;
    const amcGst = amc * gstPct / 100;
    const subtotal = oneTime + implLine.amount;
    const gst = subtotal * gstPct / 100;
    return {
      model: 'ONE_TIME',
      oneTime: {
        label: bundleName
          ? `${bundleName} - One-Time License Fee - Per Institution`
          : 'One-Time License Fee (selected modules) - Per Institution',
        bonus: pres.commercial_bonus_label,
        amount: oneTime,
      },
      implementation: implLine,
      amc: {
        label: 'Annual Maintenance Contract (AMC) - from Year 2 onwards - Per Year',
        amount: amc,
        percent: d.amcPercent ? Number(d.amcPercent) : null,
        gstAmount: amcGst,
        totalWithGst: amc + amcGst,
      },
      subtotal, gstPercent: gstPct, gstAmount: gst, grandTotal: subtotal + gst,
    };
  }

  const students = Math.max(parseInt(d.minimumStudentCommitment) || 0, 0);
  const price = Number(d.pricePerUnit || 0);
  const annual = price * students;
  const subtotal = annual + implLine.amount;
  const gst = subtotal * gstPct / 100;
  return {
    model: 'PER_STUDENT',
    annual: {
      label: pres.commercial_line_label || 'Annual Subscription - Per Unit / Per Year',
      bonus: pres.commercial_bonus_label,
      amount: annual,
      perUnit: price,
      students,
    },
    implementation: implLine,
    subtotal, gstPercent: gstPct, gstAmount: gst, grandTotal: subtotal + gst,
  };
}

export function buildPresentation(bundleCode: string | null, modules: any[], clientName: string) {
  // Catalog copy is trusted HTML; only the user-supplied client name is escaped.
  const safeClient = esc(clientName);
  if (bundleCode && CATALOG.bundles[bundleCode]) {
    const bundle = CATALOG.bundles[bundleCode];
    const pres = CATALOG.presentations[bundleCode] || CATALOG.customPresentation;
    return {
      hero: {
        color: bundle.hero_color,
        gradientEnd: bundle.hero_gradient_end,
        kicker: pres.kicker,
        title: String(pres.title_template).replace('{client}', safeClient),
        subtitle: pres.subtitle,
      },
      stats: pres.stats_template,
      pres,
    };
  }
  const pres = CATALOG.customPresentation;
  return {
    hero: {
      color: '#1565C0',
      gradientEnd: '#E65100',
      kicker: pres.kicker,
      title: String(pres.title_template).replace('{client}', safeClient),
      subtitle: pres.subtitle,
    },
    stats: [
      { value: String(modules.length), label: 'Modules Selected' },
      { value: '5-6', label: 'Weeks to Go-Live' },
      { value: 'Tailored', label: 'Per Institution' },
    ],
    pres,
  };
}

// ---------------------------------------------------------------------------
// HTML renderer - standalone branded document
// ---------------------------------------------------------------------------
const priceRow = (label: string, amount: string, opts: { bonus?: string; strike?: string; note?: string } = {}) => `
  <tr>
    <td>${label}${opts.bonus ? `<div class="bonus">🎁 ${esc(opts.bonus)}</div>` : ''}${opts.note ? `<div class="note">${opts.note}</div>` : ''}</td>
    <td class="amt">${opts.strike ? `<span class="strike">${opts.strike}</span> ` : ''}${amount}</td>
  </tr>`;

export function renderProposalHtml(brand: any, d: any): { html: string; pricing: any; selectionLabel: string } {
  const orgName = brand.name || 'Organization';
  const bundleCode = d.selectionMode === 'BUNDLE' ? (d.bundle || null) : null;
  const modules = resolveSelection(d.selectionMode, bundleCode, d.selectedModules || []);
  const pricing = computePricing({ ...d, bundle: bundleCode });
  const { hero, stats, pres } = buildPresentation(bundleCode, modules, d.clientName);
  const bundle = bundleCode ? CATALOG.bundles[bundleCode] : null;

  const execParagraphs = (pres.executive_paragraphs || [])
    .map((p: string) => p.replace(/\{client\}/g, esc(d.clientName)));
  const terms = d.pricingModel === 'ONE_TIME' ? CATALOG.defaultTermsOneTime : CATALOG.defaultTerms;

  let selectionLabel = bundle ? bundle.name : `Custom (${modules.length} modules)`;
  if (pricing.model === 'ONE_TIME') selectionLabel += ' · One-time + AMC';

  const c = hero.color;
  const g = hero.gradientEnd;

  const pricingRows =
    pricing.model === 'ONE_TIME'
      ? [
          priceRow(esc(pricing.oneTime.label), fmtINR(pricing.oneTime.amount), { bonus: pricing.oneTime.bonus }),
          priceRow(esc(pricing.implementation.label),
            pricing.implementation.waived ? '<span class="waived">WAIVED</span>' : fmtINR(pricing.implementation.amount),
            pricing.implementation.waived ? { strike: fmtINR(pricing.implementation.originalAmount) } : {}),
        ].join('')
      : [
          priceRow(
            `${esc(pricing.annual.label)}`,
            fmtINR(pricing.annual.amount),
            { note: `${fmtINR(pricing.annual.perUnit)} × ${pricing.annual.students.toLocaleString('en-IN')} (minimum commitment)` }),
          priceRow(esc(pricing.implementation.label),
            pricing.implementation.waived ? '<span class="waived">WAIVED</span>' : fmtINR(pricing.implementation.amount),
            pricing.implementation.waived ? { strike: fmtINR(pricing.implementation.originalAmount) } : {}),
        ].join('');

  const S = { ...SECTION_DEFAULTS, ...(d.sections || {}) };
  const cp = COMPANY_PROFILE;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(orgName)} Proposal — ${esc(d.clientName)}</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  html { background: #E9ECF2; }
  body { font-family: 'Segoe UI', -apple-system, Roboto, sans-serif; color: #212936; background: #E9ECF2; line-height: 1.6; font-size: 13.5px; }
  /* A4 paper emulation on screen; true A4 pages in print */
  .paper { width: 210mm; margin: 0 auto; background: #fff; box-shadow: 0 2px 24px rgba(16,24,40,.14); }
  .page { padding: 0 13mm 12mm; }
  @page { size: A4; margin: 12mm 13mm; }
  @page :first { margin: 0; }
  h2.sec { font-size: 21px; color: ${c}; margin: 40px 0 6px; break-after: avoid; }
  .sec-sub { color: #6b7280; margin-bottom: 20px; font-size: 14px; }
  .hero { background: linear-gradient(135deg, ${c}, ${g}); color: #fff; padding: 26mm 13mm 18mm; min-height: 297mm; display: flex; flex-direction: column; justify-content: flex-start; }
  .hero .org { font-size: 15px; font-weight: 600; letter-spacing: 2px; text-transform: uppercase; opacity: .9; }
  .hero .kicker { display: inline-block; margin-top: 26px; background: rgba(255,255,255,.18); padding: 5px 16px; border-radius: 99px; font-size: 12.5px; font-weight: 600; letter-spacing: 1px; }
  .hero h1 { font-size: 34px; line-height: 1.25; margin: 16px 0 12px; max-width: 700px; }
  .hero .sub { font-size: 16px; opacity: .92; max-width: 640px; }
  .hero .meta { margin-top: 26px; font-size: 13px; opacity: .85; }
  .stats { display: flex; gap: 14px; flex-wrap: wrap; margin-top: 30px; }
  .stat { background: rgba(255,255,255,.14); border-radius: 12px; padding: 14px 22px; min-width: 130px; }
  .stat .v { font-size: 24px; font-weight: 700; }
  .stat .l { font-size: 12px; opacity: .85; }
  .addr { display: flex; justify-content: space-between; gap: 24px; padding: 26px 0; border-bottom: 1px solid #e5e7eb; flex-wrap: wrap; }
  .addr .to strong { display: block; font-size: 16px; }
  .modgrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
  .mod { border: 1px solid #e5e7eb; border-left: 4px solid var(--mc); border-radius: 10px; padding: 14px 16px; break-inside: avoid; }
  .mod h4 { font-size: 14.5px; margin-bottom: 4px; }
  .mod .d { font-size: 12.5px; color: #6b7280; margin-bottom: 8px; }
  .mod ul { padding-left: 16px; font-size: 12px; color: #4b5563; columns: 1; }
  .mod li { margin-bottom: 2px; }
  .pill { display: flex; gap: 14px; margin-bottom: 14px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 14px 18px; break-inside: avoid; }
  .pill .ic { font-size: 26px; }
  .pill h4 { font-size: 14.5px; }
  .pill p { font-size: 13px; color: #4b5563; }
  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  table.price { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.price td, table.price th { border: 1px solid #d9dee6; padding: 12px 16px; font-size: 13.5px; }
  table.price th { background: ${c}; color: #fff; text-align: left; font-size: 13px; }
  table.price .amt { text-align: right; white-space: nowrap; font-weight: 700; width: 180px; }
  table.price .total td { background: #f1f5ff; font-size: 15px; font-weight: 700; }
  .strike { text-decoration: line-through; color: #9ca3af; font-weight: 400; }
  .waived { color: #059669; font-weight: 700; }
  .bonus { color: #b45309; font-size: 12px; margin-top: 4px; }
  .note { color: #6b7280; font-size: 12px; margin-top: 4px; font-weight: 400; }
  .phase { display: flex; gap: 16px; margin-bottom: 12px; }
  .phase .n { flex: 0 0 34px; height: 34px; border-radius: 50%; background: ${c}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; }
  .phase h4 { font-size: 14px; }
  .phase p { font-size: 12.5px; color: #6b7280; }
  table.ba { width: 100%; border-collapse: collapse; }
  table.ba td, table.ba th { border: 1px solid #e5e7eb; padding: 9px 14px; font-size: 13px; }
  table.ba th { background: #f3f4f6; text-align: left; }
  ol.terms { padding-left: 20px; font-size: 13px; color: #4b5563; }
  ol.terms li { margin-bottom: 7px; }
  .sign { display: flex; justify-content: space-between; gap: 40px; margin-top: 56px; flex-wrap: wrap; }
  .sign .blk { min-width: 240px; }
  .sign .line { border-top: 1.5px solid #9ca3af; margin-top: 64px; padding-top: 8px; font-size: 13px; }
  .footer { padding: 20px 13mm; background: #111827; color: #d1d5db; font-size: 12.5px; text-align: center; }
  /* Company profile & extras */
  .vm { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 14px 0; }
  .vm .box { border: 1px solid #e5e7eb; border-top: 3px solid ${c}; border-radius: 10px; padding: 14px 16px; break-inside: avoid; }
  .vm h4 { font-size: 13.5px; color: ${c}; margin-bottom: 4px; letter-spacing: .4px; text-transform: uppercase; }
  .vm p { font-size: 13px; color: #4b5563; }
  .cstats { display: flex; gap: 12px; flex-wrap: wrap; margin: 16px 0 4px; }
  .cstat { flex: 1; min-width: 110px; background: #f6f8fc; border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px 14px; text-align: center; break-inside: avoid; }
  .cstat .v { font-size: 20px; font-weight: 700; color: ${c}; }
  .cstat .l { font-size: 11.5px; color: #6b7280; }
  .tl { border-left: 2.5px solid ${c}; margin: 8px 0 0 8px; padding-left: 22px; }
  .tl .ev { position: relative; padding-bottom: 16px; break-inside: avoid; }
  .tl .ev::before { content: ''; position: absolute; left: -29px; top: 4px; width: 11px; height: 11px; border-radius: 50%; background: ${c}; border: 2.5px solid #fff; box-shadow: 0 0 0 2px ${c}; }
  .tl .when { font-size: 11.5px; font-weight: 700; color: ${c}; letter-spacing: .6px; }
  .tl h4 { font-size: 14px; }
  .tl p { font-size: 12.5px; color: #6b7280; }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
  .chips span { border: 1px solid #d9dee6; background: #f6f8fc; border-radius: 99px; padding: 4px 14px; font-size: 12.5px; color: #374151; }
  .award { display: flex; gap: 10px; align-items: flex-start; margin-bottom: 8px; font-size: 13px; color: #374151; break-inside: avoid; }
  .logowall { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-top: 10px; }
  .logowall .lg { border: 1px solid #eef0f4; border-radius: 10px; padding: 10px 8px 7px; text-align: center; break-inside: avoid; }
  .logowall img { height: 40px; max-width: 100%; object-fit: contain; }
  .logowall .nm { font-size: 9px; color: #6b7280; line-height: 1.25; margin-top: 5px; }
  .avoid { break-inside: avoid; page-break-inside: avoid; }
  .pagebreak { break-before: page; page-break-before: always; }
  @media print {
    html, body { background: #fff; }
    .paper { width: auto; box-shadow: none; margin: 0; }
    .page { padding: 0; }
    .hero { -webkit-print-color-adjust: exact; print-color-adjust: exact; min-height: 297mm; height: 297mm; page-break-after: always; }
    body { font-size: 12px; }
    .mod, .pill, .phase, table.price, table.ba, .cstat, .vm .box { break-inside: avoid; }
    .footer { display: none; }
  }
  @media (max-width: 840px) {
    .paper { width: 100%; }
    .hero { min-height: 0; }
    .logowall { grid-template-columns: repeat(3, 1fr); }
    .grid2, .vm { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
<div class="paper">

<div class="hero">
  <div style="display:flex;align-items:center;gap:14px;">
    ${brand.logoData ? `<img src="${brand.logoData}" alt="" style="height:44px;max-width:150px;object-fit:contain;background:rgba(255,255,255,.9);border-radius:8px;padding:4px 8px;"/>` : ''}
    <div class="org">${esc(orgName)}</div>
  </div>
  <div class="kicker">${hero.kicker || 'PROPOSAL'}</div>
  <h1>${hero.title}</h1>
  <div class="sub">${hero.subtitle || ''}</div>
  <div class="stats">
    ${(stats || []).map((s: any) => `<div class="stat"><div class="v">${esc(s.value)}</div><div class="l">${esc(s.label)}</div></div>`).join('')}
  </div>
  <div class="meta">
    ${d.proposalDate ? `Proposal date: <strong>${fmtDate(d.proposalDate)}</strong>` : ''}
    ${d.preparedBy ? ` · Prepared by: <strong>${esc(d.preparedBy)}</strong>` : ''}
  </div>
</div>

<div class="page">
  <div class="addr">
    <div class="to">
      ${d.toAddress ? `<div style="font-size:12px;color:#6b7280;">To</div>` : ''}
      <strong>${esc(d.clientName)}</strong>
      ${String(d.clientAddress || '').split('\n').filter((l: string) => l.trim())
        .map((l: string) => `<div style="color:#4b5563;font-size:13px;">${esc(l)}</div>`).join('')}
    </div>
    <div style="text-align:right;font-size:13px;color:#4b5563;">
      <strong style="color:#111827;">${esc(orgName)}</strong>
      ${d.jurisdiction ? `<div>Jurisdiction: ${esc(d.jurisdiction)}</div>` : ''}
    </div>
  </div>

  <p style="margin-top:24px;color:#374151;">${esc(CATALOG.salutation)}</p>

  <h2 class="sec">${esc(pres.executive_title || 'Executive Summary')}</h2>
  ${execParagraphs.map((p: string) => `<p style="margin-bottom:12px;color:#374151;text-align:justify;">${p}</p>`).join('')}

  ${S.about ? `
  <h2 class="sec">About ${esc(orgName)}</h2>
  <div class="sec-sub">${esc(cp.tagline)} — ${esc(cp.established)}.</div>
  ${cp.about.map(p => `<p style="margin-bottom:12px;color:#374151;text-align:justify;">${esc(p)}</p>`).join('')}
  <div class="vm">
    <div class="box"><h4>Vision</h4><p>${esc(cp.vision)}</p></div>
    <div class="box"><h4>Mission</h4><p>${esc(cp.mission)}</p></div>
  </div>
  <div class="cstats">
    ${cp.stats.map(s => `<div class="cstat"><div class="v">${esc(s.value)}</div><div class="l">${esc(s.label)}</div></div>`).join('')}
  </div>
  <p style="margin-top:10px;font-size:12.5px;color:#6b7280;">Core values: ${esc(cp.values)}</p>
  <div class="chips" style="margin-top:12px;">
    ${cp.industries.map(i => `<span>${esc(i)}</span>`).join('')}
  </div>
  <p style="margin-top:12px;font-size:12.5px;color:#6b7280;">Technology partners: <strong style="color:#374151;">${esc(cp.partners.join(' · '))}</strong></p>
  ` : ''}

  ${S.milestones ? `
  <h2 class="sec">Our Journey</h2>
  <div class="sec-sub">A decade of dependable delivery for institutions and government bodies.</div>
  <div class="tl">
    ${cp.milestones.map(m => `
      <div class="ev"><div class="when">${esc(m.period)}</div>
        <h4>${esc(m.title)}</h4><p>${esc(m.desc)}</p></div>`).join('')}
  </div>
  ` : ''}

  ${S.awards ? `
  <h2 class="sec">Awards &amp; Recognition</h2>
  ${cp.awards.map(a => `<div class="award"><span style="color:${c};">🏅</span><span>${esc(a)}</span></div>`).join('')}
  ` : ''}

  ${S.clients && FEATURED_CLIENTS.length ? `
  <h2 class="sec pagebreak">Institutions That Trust Us</h2>
  <div class="sec-sub">${FEATURED_CLIENTS.length} leading institutions run on our platforms.</div>
  <div class="logowall">
    ${FEATURED_CLIENTS.map(cl => `
      <div class="lg"><img src="${cl.logoUri}" alt=""/><div class="nm">${esc(cl.name)}</div></div>`).join('')}
  </div>
  ` : ''}

  <h2 class="sec">${esc(pres.modules_section_title || `${modules.length} Integrated Modules`)}</h2>
  <div class="sec-sub">${esc(pres.modules_section_desc || 'Every capability included in your proposal.')}</div>
  <div class="modgrid">
    ${modules.map((m: any) => `
      <div class="mod" style="--mc:${m.color || c}">
        <h4>${m.icon || ''} ${esc(m.name)}</h4>
        <div class="d">${esc(m.short_desc || '')}</div>
        <ul>${(m.sub_features || []).slice(0, 8).map((f: string) => `<li>${esc(f)}</li>`).join('')}
          ${(m.sub_features || []).length > 8 ? `<li style="list-style:none;color:#9ca3af;">+ ${(m.sub_features).length - 8} more</li>` : ''}
        </ul>
      </div>`).join('')}
  </div>

  ${S.pillars ? `
  <h2 class="sec">Five Pillars of the Platform</h2>
  <div class="grid2">
    ${(CATALOG.fivePillars || []).map((p: any) => `
      <div class="pill"><div class="ic">${p.icon || '⭐'}</div>
        <div><h4>${esc(p.title)}</h4><p>${esc(p.desc || p.description || '')}</p></div>
      </div>`).join('')}
  </div>` : ''}

  ${S.benefits ? `
  <h2 class="sec">Key Benefits</h2>
  <div class="grid2">
    ${(CATALOG.benefits || []).map((b: any) => `
      <div class="pill"><div class="ic">${b.icon || '✅'}</div>
        <div><h4>${esc(b.title)}</h4>
          <ul style="padding-left:16px;font-size:12.5px;color:#4b5563;margin-top:4px;">
            ${(b.items || []).map((i: string) => `<li style="margin-bottom:3px;">${esc(i)}</li>`).join('')}
          </ul>
        </div>
      </div>`).join('')}
  </div>` : ''}

  <h2 class="sec pagebreak">Commercial Proposal</h2>
  <table class="price">
    <tr><th>Description</th><th style="text-align:right;">Amount</th></tr>
    ${pricingRows}
    <tr><td>Subtotal</td><td class="amt">${fmtINR(pricing.subtotal)}</td></tr>
    <tr><td>GST @ ${pricing.gstPercent}%</td><td class="amt">${fmtINR(pricing.gstAmount)}</td></tr>
    <tr class="total"><td>${d.includeYear1Cost === false ? 'Total Payable' : 'Total Year-1 Cost'}</td><td class="amt">${fmtINR(pricing.grandTotal)}</td></tr>
    ${pricing.model === 'ONE_TIME' ? `
      <tr><td>${esc(pricing.amc.label)}${pricing.amc.percent ? `<div class="note">${pricing.amc.percent}% of license fee</div>` : ''}</td>
        <td class="amt">${fmtINR(pricing.amc.amount)} <div class="note">+ GST = ${fmtINR(pricing.amc.totalWithGst)}</div></td></tr>` : ''}
  </table>
  ${bundle ? `<p class="note" style="margin-top:8px;">Bundle value: standalone total ${fmtINR(bundle.standalone_total)} per student — offered at ${fmtINR(bundle.bundle_price_per_student)} per student.</p>` : ''}

  ${S.implementation ? `
  <h2 class="sec">Implementation & Support</h2>
  <div class="grid2">
    ${(CATALOG.implementationComponents || []).map((x: any) => `
      <div class="pill"><div class="ic">${x.icon || '🛠️'}</div>
        <div><h4>${esc(x.title)}</h4><p>${esc(x.desc || x.description || '')}</p></div>
      </div>`).join('')}
  </div>` : ''}

  ${S.roadmap ? `
  <h2 class="sec">Implementation Roadmap</h2>
  ${(CATALOG.defaultPhases || []).map((p: any, i: number) => `
    <div class="phase"><div class="n">${i + 1}</div>
      <div><h4>${esc(p.title || p.name)} ${p.duration ? `<span style="color:#6b7280;font-weight:400;">· ${esc(p.duration)}</span>` : ''}</h4>
      <p>${esc(p.desc || p.description || (Array.isArray(p.items) ? p.items.join(', ') : ''))}</p></div>
    </div>`).join('')}` : ''}

  ${S.whyUs ? `
  <h2 class="sec">Why ${esc(orgName)}</h2>
  <div class="grid2">
    ${(CATALOG.whyAveon || []).map((x: any) => `
      <div class="pill"><div class="ic">${x.icon || '🏆'}</div>
        <div><h4>${esc(x.title)}</h4><p>${esc(x.desc || x.description || '')}</p></div>
      </div>`).join('')}
  </div>
  <div class="grid2" style="margin-top:14px;">
    ${cp.advantages.map(a => `
      <div class="pill"><div class="ic">💪</div>
        <div><h4>${esc(a.title)}</h4><p>${esc(a.desc)}</p></div>
      </div>`).join('')}
  </div>` : ''}

  ${S.whyNow && CATALOG.whyNow ? `
  <h2 class="sec">Why Now</h2>
  <div class="grid2">
    <div class="pill"><div class="ic">⚠️</div><div><h4>The Challenge</h4><p>${esc(CATALOG.whyNow.challenge || '')}</p></div></div>
    <div class="pill"><div class="ic">🚀</div><div><h4>The Opportunity</h4><p>${esc(CATALOG.whyNow.opportunity || '')}</p></div></div>
  </div>
  <p style="color:#374151;margin-top:6px;font-weight:600;">${esc(CATALOG.whyNow.bottom_line || '')}</p>` : ''}

  ${S.transformation ? `
  <h2 class="sec">The Transformation</h2>
  <table class="ba">
    <tr><th>Before</th><th>After ${esc(orgName)}</th></tr>
    ${(CATALOG.beforeAfter || []).map((row: any) => `<tr><td>${esc(row[0])}</td><td>${esc(row[1])}</td></tr>`).join('')}
  </table>` : ''}

  ${S.nextSteps ? `
  <h2 class="sec">Next Steps</h2>
  ${(CATALOG.nextSteps || []).map((s: any, i: number) => `
    <div class="phase"><div class="n">${i + 1}</div>
      <div><h4>${esc(s.title)}</h4><p>${esc(s.desc || s.description || '')}</p></div>
    </div>`).join('')}` : ''}

  ${S.terms ? `
  <h2 class="sec">Terms &amp; Conditions</h2>
  <ol class="terms">
    ${(terms || []).map((t: string) => `<li>${esc(t)}</li>`).join('')}
  </ol>` : ''}

  <div class="sign">
    <div class="blk">
      <div style="font-size:13px;color:#6b7280;">For <strong style="color:#111827;">${esc(orgName)}</strong></div>
      <div class="line">
        <strong>${esc(d.authorizedSignatoryName || brand.signatoryName || '')}</strong><br/>
        ${esc(d.authorizedSignatoryDesignation || brand.signatoryDesignation || 'Authorised Signatory')}
      </div>
    </div>
    <div class="blk">
      <div style="font-size:13px;color:#6b7280;">Accepted for <strong style="color:#111827;">${esc(d.clientName)}</strong></div>
      <div class="line">Signature &amp; Seal<br/>Name, Designation &amp; Date</div>
    </div>
  </div>
</div>

<div class="footer">
  ${esc(orgName)}${brand.addressLine ? ` · ${esc(brand.addressLine)}` : ''}
  ${[brand.phone, brand.email, brand.website].filter(Boolean).length
    ? `<br/>${esc([brand.phone, brand.email, brand.website].filter(Boolean).join(' · '))}` : ''}
  <br/>This proposal is valid for 30 days from the proposal date.
</div>

</div>
</body>
</html>`;

  return { html, pricing, selectionLabel };
}
