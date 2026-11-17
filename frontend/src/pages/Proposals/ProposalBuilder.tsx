import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { proposalsAPI } from '../../api/proposals';
import { PageHeader, ErrorAlert, LoadingBlock } from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
import { formatINR } from '../../utils/format';

// Optional document sections (mirrors SECTION_DEFAULTS on the server)
export const SECTION_LABELS: Record<string, string> = {
  about: 'About the company', milestones: 'Company journey', awards: 'Awards & recognition',
  clients: 'Client logo wall', pillars: 'Five pillars', benefits: 'Key benefits',
  implementation: 'Implementation & support', roadmap: 'Roadmap', whyUs: 'Why us',
  whyNow: 'Why now', transformation: 'Before / after', nextSteps: 'Next steps', terms: 'Terms & conditions',
};
const ALL_SECTIONS = Object.fromEntries(Object.keys(SECTION_LABELS).map(k => [k, true]));

const EMPTY = {
  clientName: '', clientAddress: '', toAddress: 'The Principal / The Management',
  preparedBy: '', proposalDate: new Date().toISOString().split('T')[0],
  selectionMode: 'BUNDLE', bundle: 'CMS_FULL', selectedModules: [] as string[],
  addonsCharged: [] as string[],
  pricingModel: 'PER_STUDENT',
  pricePerUnit: '', minimumStudentCommitment: '',
  oneTimePrice: '', amcAmount: '', amcPercent: '',
  oneTimeImplementationFee: '', waiveOneTimeFee: true,
  gstPercent: '18', includeYear1Cost: true,
  authorizedSignatoryName: '', authorizedSignatoryDesignation: '',
  jurisdiction: 'Coimbatore',
  sections: { ...ALL_SECTIONS } as Record<string, boolean>,
  hiddenClients: [] as string[],
};

export default function ProposalBuilder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [catalog, setCatalog] = useState<any>(null);
  const [form, setForm] = useState<any>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [revising, setRevising] = useState(false);
  const [modSearch, setModSearch] = useState('');
  const [showPreview, setShowPreview] = useState(true);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewTimer = useRef<any>(null);

  // Debounced live preview — re-renders the document as the form changes
  useEffect(() => {
    if (!showPreview || loading) return;
    clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(() => {
      setPreviewBusy(true);
      proposalsAPI.preview(form)
        .then(res => setPreviewHtml(res.data.html))
        .catch(() => {})
        .finally(() => setPreviewBusy(false));
    }, 700);
    return () => clearTimeout(previewTimer.current);
  }, [form, showPreview, loading]);

  useEffect(() => {
    const from = params.get('from');
    Promise.all([
      proposalsAPI.getCatalog(),
      from ? proposalsAPI.getRecord(from) : Promise.resolve(null),
    ])
      .then(([catRes, recordRes]) => {
        setCatalog(catRes.data);
        if (recordRes) {
          const fd = recordRes.data.formData || {};
          setForm({
            ...EMPTY, ...fd,
            sections: { ...ALL_SECTIONS, ...(fd.sections || {}) },
            proposalDate: EMPTY.proposalDate,
          });
          setRevising(true);
        }
      })
      .catch(() => setError('Failed to load the catalog'))
      .finally(() => setLoading(false));
  }, [params]);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const pickBundle = (code: string) => {
    const b = catalog.bundles[code];
    setForm((f: any) => ({
      ...f,
      selectionMode: 'BUNDLE',
      bundle: code,
      pricePerUnit: f.pricePerUnit || String(b.price),
      oneTimeImplementationFee: f.oneTimeImplementationFee || String(b.oneTimeFee),
      waiveOneTimeFee: f.oneTimeImplementationFee ? f.waiveOneTimeFee : b.waiveDefault,
    }));
  };

  const toggleModule = (code: string) => {
    setForm((f: any) => ({
      ...f,
      selectedModules: f.selectedModules.includes(code)
        ? f.selectedModules.filter((c: string) => c !== code)
        : [...f.selectedModules, code],
    }));
  };

  // Mark a selected add-on as free (default) or charged at its catalog rate.
  const setAddonFree = (code: string, free: boolean) => {
    setForm((f: any) => ({
      ...f,
      addonsCharged: free
        ? (f.addonsCharged || []).filter((c: string) => c !== code)
        : Array.from(new Set([...(f.addonsCharged || []), code])),
    }));
  };

  // Show / hide an individual client logo on the "Institutions That Trust Us" wall.
  const toggleClient = (name: string) => {
    setForm((f: any) => ({
      ...f,
      hiddenClients: (f.hiddenClients || []).includes(name)
        ? (f.hiddenClients || []).filter((n: string) => n !== name)
        : [...(f.hiddenClients || []), name],
    }));
  };

  // Upload / remove custom client logos (saved per organization).
  const [logoName, setLogoName] = useState('');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const refreshCatalog = async () => { const cat = await proposalsAPI.getCatalog(); setCatalog(cat.data); };
  const addLogo = async () => {
    if (!logoName.trim() || !logoFile) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await proposalsAPI.addClientLogo({ name: logoName.trim(), logoUri: String(reader.result) });
        await refreshCatalog(); setLogoName(''); setLogoFile(null);
      } catch (e: any) { setError(e.response?.data?.error || 'Could not add the logo'); }
    };
    reader.readAsDataURL(logoFile);
  };
  const removeLogo = async (name: string) => {
    try { await proposalsAPI.deleteClientLogo(name); await refreshCatalog(); }
    catch (e: any) { setError(e.response?.data?.error || 'Could not remove the logo'); }
  };

  // Live totals
  const totals = useMemo(() => {
    const gst = Number(form.gstPercent) || 0;
    const impl = form.waiveOneTimeFee ? 0 : Number(form.oneTimeImplementationFee) || 0;
    let base = 0;
    if (form.pricingModel === 'ONE_TIME') {
      base = Number(form.oneTimePrice) || 0;
    } else {
      const students = parseInt(form.minimumStudentCommitment) || 0;
      const addonPerUnit = (form.addonsCharged || []).reduce(
        (s: number, c: string) => s + (catalog?.modules[c]?.addonPrice || 0), 0);
      base = ((Number(form.pricePerUnit) || 0) + addonPerUnit) * students;
    }
    const subtotal = base + impl;
    const gstAmt = subtotal * gst / 100;
    return { subtotal, gstAmt, grand: subtotal + gstAmt };
  }, [form, catalog]);

  const suggestedCustomPrice = useMemo(() => {
    if (!catalog || form.selectionMode !== 'CUSTOM') return 0;
    return form.selectedModules.reduce(
      (s: number, c: string) => s + (catalog.modules[c]?.price || 0), 0);
  }, [catalog, form.selectionMode, form.selectedModules]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await proposalsAPI.generate(form);
      navigate(`/proposals/history/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate the proposal');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading catalog…" />;
  if (!catalog) return <ErrorAlert message={error || 'Catalog unavailable'} />;

  const modulesByCategory: Record<string, any[]> = {};
  for (const m of Object.values<any>(catalog.modules)) {
    (modulesByCategory[m.category] ||= []).push(m);
  }
  const isOneTime = form.pricingModel === 'ONE_TIME';

  return (
    <>
      <PageHeader
        title={revising ? `Revise proposal — ${form.clientName}` : 'Proposal builder'}
        subtitle="Pick a bundle or custom modules, set the commercials — the A4 document previews live."
        actions={
          <>
            <Button icon="browser" aria-pressed={showPreview}
              onClick={() => setShowPreview(p => !p)}>
              {showPreview ? 'Hide preview' : 'Live preview'}
            </Button>
            <ButtonLink to="/proposals/history" icon="history">History</ButtonLink>
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="builder-layout">
      <form onSubmit={handleGenerate} className="builder-form">
        {/* Client */}
        <div className="card card-pad mb-24">
          <div className="form-section-title"><span className="step-dot">1</span> Client</div>
          <div className="form-grid mb-14">
            <div className="field mp-span-2">
              <label htmlFor="pb-client-name">Institution / client name *</label>
              <input id="pb-client-name" className="input" required autoFocus placeholder="e.g. St. Xavier's College"
                value={form.clientName} onChange={e => set('clientName', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pb-date">Proposal date</label>
              <input id="pb-date" className="input" type="date" value={form.proposalDate}
                onChange={e => set('proposalDate', e.target.value)} />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pb-client-address">Client address</label>
              <textarea id="pb-client-address" className="input" rows={2} value={form.clientAddress}
                onChange={e => set('clientAddress', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pb-to">Addressed to</label>
              <input id="pb-to" className="input" value={form.toAddress}
                onChange={e => set('toAddress', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pb-prepared-by">Prepared by</label>
              <input id="pb-prepared-by" className="input" placeholder="Your name" value={form.preparedBy}
                onChange={e => set('preparedBy', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Selection */}
        <div className="card card-pad mb-24">
          <div className="form-section-title"><span className="step-dot">2</span> What are you proposing?</div>
          <div className="segmented mp-segmented" role="group" aria-label="Selection mode">
            <button type="button" className={form.selectionMode === 'BUNDLE' ? 'active' : ''} aria-pressed={form.selectionMode === 'BUNDLE'}
              onClick={() => set('selectionMode', 'BUNDLE')}>Bundle</button>
            <button type="button" className={form.selectionMode === 'CUSTOM' ? 'active' : ''} aria-pressed={form.selectionMode === 'CUSTOM'}
              onClick={() => set('selectionMode', 'CUSTOM')}>Custom modules</button>
          </div>

          {form.selectionMode === 'BUNDLE' ? (
            <div className="module-grid">
              {Object.values<any>(catalog.bundles).map(b => {
                const picked = form.bundle === b.code;
                return (
                  <button key={b.code} type="button" aria-pressed={picked}
                    className={`module-card mp-bundle${picked ? ' selected' : ''}`}
                    onClick={() => pickBundle(b.code)}>
                    <div className="cluster between mp-bundle-head">
                      <h3 className="mp-bundle-name">
                        {/* the bundle's own brand colour, from the catalog */}
                        <span className="mp-bundle-swatch" style={{ background: b.heroColor }} aria-hidden="true" />
                        {b.name}
                      </h3>
                      {picked && <span className="badge badge-success"><Icon name="checkCircle" size={13} className="mp-badge-icon" />Selected</span>}
                    </div>
                    <p className="mp-bundle-tagline">{b.tagline}</p>
                    <div className="mp-bundle-price">
                      <strong className="num">{formatINR(b.price)}</strong>
                      <span className="text-muted"> / student · <span className="num">{b.modules.length}</span> modules</span>
                      <div className="mp-cell-sub">
                        standalone value <span className="num">{formatINR(b.standaloneTotal)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="toolbar">
                <span className="badge badge-info"><span className="num">{form.selectedModules.length}</span> selected</span>
                <div className="search-input mp-search">
                  <input className="input" aria-label="Search modules" placeholder="Search modules…" value={modSearch}
                    onChange={e => setModSearch(e.target.value)} />
                </div>
                {suggestedCustomPrice > 0 && (
                  <span className="text-sm-muted">
                    Suggested rate: <span className="num">{formatINR(suggestedCustomPrice)}</span> / student (sum of module rates)
                  </span>
                )}
              </div>
              {Object.entries(catalog.categories).map(([catCode, catLabel]: any) => {
                const mods = (modulesByCategory[catCode] || []).filter((m: any) =>
                  !modSearch || m.name.toLowerCase().includes(modSearch.toLowerCase()));
                if (!mods.length) return null;
                const allOn = mods.every((m: any) => form.selectedModules.includes(m.code));
                return (
                  <div key={catCode} className="mp-category">
                    <div className="cluster mp-category-head">
                      <div className="mp-category-title">{catLabel}</div>
                      <Button variant="ghost" size="sm"
                        onClick={() => setForm((f: any) => ({
                          ...f,
                          selectedModules: allOn
                            ? f.selectedModules.filter((cd: string) => !mods.some((m: any) => m.code === cd))
                            : Array.from(new Set([...f.selectedModules, ...mods.map((m: any) => m.code)])),
                        }))}>
                        {allOn ? 'Clear all' : 'Select all'}
                      </Button>
                    </div>
                    <div className="chip-row">
                      {mods.map((m: any) => (
                        <button key={m.code} type="button"
                          className={`chip ${form.selectedModules.includes(m.code) ? 'active' : ''}`}
                          aria-pressed={form.selectedModules.includes(m.code)}
                          title={`${m.shortDesc} · ${formatINR(m.price)}/student`}
                          onClick={() => toggleModule(m.code)}>
                          {m.icon} {m.name}
                          {m.category === 'ADDON'
                            ? <strong> · {(form.addonsCharged || []).includes(m.code) ? `₹${m.addonPrice}/student` : 'FREE'}</strong>
                            : (m.tag && <strong> · {m.tag}</strong>)}
                        </button>
                      ))}
                    </div>
                    {catCode === 'ADDON' && mods.some((m: any) => form.selectedModules.includes(m.code)) && (
                      <div className="stack mp-addons">
                        {mods.filter((m: any) => form.selectedModules.includes(m.code)).map((m: any) => {
                          const charged = (form.addonsCharged || []).includes(m.code);
                          return (
                            <div key={m.code} className="cluster mp-addon-row">
                              <span className="mp-addon-name">{m.name}</span>
                              <div className="segmented" role="group" aria-label={`${m.name} pricing`}>
                                <button type="button" className={!charged ? 'active' : ''} aria-pressed={!charged}
                                  onClick={() => setAddonFree(m.code, true)}>Free</button>
                                <button type="button" className={charged ? 'active' : ''} aria-pressed={charged}
                                  onClick={() => setAddonFree(m.code, false)}>Charged · {formatINR(m.addonPrice)}/student</button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Commercials */}
        <div className="card card-pad mb-24">
          <div className="form-section-title"><span className="step-dot">3</span> Commercials</div>
          <div className="segmented mp-segmented" role="group" aria-label="Pricing model">
            <button type="button" className={!isOneTime ? 'active' : ''} aria-pressed={!isOneTime}
              onClick={() => set('pricingModel', 'PER_STUDENT')}>Per student / year</button>
            <button type="button" className={isOneTime ? 'active' : ''} aria-pressed={isOneTime}
              onClick={() => set('pricingModel', 'ONE_TIME')}>One-time + AMC</button>
          </div>

          <div className="form-grid mb-14">
            {!isOneTime ? (
              <>
                <div className="field">
                  <label htmlFor="pb-rate">Rate per student / year *</label>
                  <div className="input-unit"><span className="unit">₹</span>
                    <input id="pb-rate" className="input" type="number" min={0} step="0.01" required
                      value={form.pricePerUnit} onChange={e => set('pricePerUnit', e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="pb-min-students">Minimum student commitment *</label>
                  <input id="pb-min-students" className="input" type="number" min={0} required
                    value={form.minimumStudentCommitment}
                    onChange={e => set('minimumStudentCommitment', e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label htmlFor="pb-license">One-time license fee *</label>
                  <div className="input-unit"><span className="unit">₹</span>
                    <input id="pb-license" className="input" type="number" min={0} step="0.01" required
                      value={form.oneTimePrice} onChange={e => set('oneTimePrice', e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="pb-amc">AMC per year (from year 2)</label>
                  <div className="input-unit"><span className="unit">₹</span>
                    <input id="pb-amc" className="input" type="number" min={0} step="0.01"
                      value={form.amcAmount} onChange={e => set('amcAmount', e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="pb-amc-pct">AMC as % of license</label>
                  <input id="pb-amc-pct" className="input" type="number" min={0} max={100} placeholder="optional"
                    value={form.amcPercent} onChange={e => set('amcPercent', e.target.value)} />
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="pb-impl-fee">One-time implementation fee</label>
              <div className="input-unit"><span className="unit">₹</span>
                <input id="pb-impl-fee" className="input" type="number" min={0} step="0.01"
                  value={form.oneTimeImplementationFee}
                  onChange={e => set('oneTimeImplementationFee', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label htmlFor="pb-gst">GST %</label>
              <input id="pb-gst" className="input" type="number" min={0} max={100}
                value={form.gstPercent} onChange={e => set('gstPercent', e.target.value)} />
            </div>
          </div>
          <div className="field mb-14">
            <label id="pb-waive-label">One-time setup / implementation fee</label>
            <div className="segmented" role="group" aria-labelledby="pb-waive-label">
              <button type="button" className={form.waiveOneTimeFee ? 'active' : ''} aria-pressed={form.waiveOneTimeFee}
                onClick={() => set('waiveOneTimeFee', true)}>Waived off</button>
              <button type="button" className={!form.waiveOneTimeFee ? 'active' : ''} aria-pressed={!form.waiveOneTimeFee}
                onClick={() => set('waiveOneTimeFee', false)}>Not waived off</button>
            </div>
            <span className="hint">Waived off shows “(One-time) – Currently Waived Off” in the document and is not added to the total; not waived off charges the fee.</span>
          </div>

          <div className="calc-card">
            <div className="calc-row"><span>Subtotal</span><span className="amount num">{formatINR(totals.subtotal)}</span></div>
            <div className="calc-row"><span>GST @ {form.gstPercent || 0}%</span><span className="amount num">{formatINR(totals.gstAmt)}</span></div>
            <div className="calc-row total"><span>Year-1 total</span><span className="amount num">{formatINR(totals.grand)}</span></div>
          </div>
        </div>

        {/* Document content */}
        <div className="card card-pad mb-24">
          <div className="cluster mp-content-head">
            <div className="form-section-title mp-flush">
              <span className="step-dot">4</span> Document content
            </div>
            <Button variant="ghost" size="sm"
              onClick={() => set('sections', { ...ALL_SECTIONS })}>All</Button>
            <Button variant="ghost" size="sm"
              onClick={() => set('sections', Object.fromEntries(Object.keys(SECTION_LABELS).map(k => [k, false])))}>None</Button>
          </div>
          <p className="text-sm-muted mp-content-lede">
            Tune the document to the audience — a lean commercial quote or the full company story.
          </p>
          <div className="mp-check-grid">
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <label key={key} className="checkbox-field mp-check">
                <input type="checkbox" checked={form.sections?.[key] !== false}
                  onChange={e => set('sections', { ...form.sections, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
          {form.sections?.clients !== false && (catalog.clients?.length || 0) > 0 && (
            <div className="mp-logos">
              <div className="mp-logos-title">
                Client logos — <span className="num">{catalog.clients.length - (form.hiddenClients?.length || 0)}</span> of <span className="num">{catalog.clients.length}</span> shown
              </div>
              <div className="cluster mp-logo-add">
                <input className="input mp-logo-name" aria-label="New client name" placeholder="New client name"
                  value={logoName} onChange={e => setLogoName(e.target.value)} />
                <input type="file" accept="image/*" aria-label="Client logo image" className="mp-logo-file"
                  onChange={e => setLogoFile(e.target.files?.[0] || null)} />
                <Button size="sm" icon="plus" disabled={!logoName.trim() || !logoFile}
                  onClick={addLogo}>Add logo</Button>
              </div>
              {(catalog.customLogos?.length || 0) > 0 && (
                <div className="cluster mp-logo-chips">
                  {catalog.customLogos.map((cl: any) => (
                    <span key={cl.name} className="chip mp-logo-chip">
                      {cl.name}
                      <button type="button" onClick={() => removeLogo(cl.name)} title="Remove" aria-label={`Remove ${cl.name}`}
                        className="mp-logo-remove">✕</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="mp-check-grid mp-client-list">
                {catalog.clients.map((name: string) => (
                  <label key={name} className="checkbox-field mp-check mp-check-sm">
                    <input type="checkbox" checked={!(form.hiddenClients || []).includes(name)}
                      onChange={() => toggleClient(name)} />
                    {name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Signatory */}
        <div className="card card-pad mb-24">
          <div className="form-section-title"><span className="step-dot">5</span> Signatory &amp; legal</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pb-sig-name">Authorized signatory name</label>
              <input id="pb-sig-name" className="input" value={form.authorizedSignatoryName}
                onChange={e => set('authorizedSignatoryName', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pb-sig-designation">Signatory designation</label>
              <input id="pb-sig-designation" className="input" placeholder="e.g. Director"
                value={form.authorizedSignatoryDesignation}
                onChange={e => set('authorizedSignatoryDesignation', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="pb-jurisdiction">Jurisdiction</label>
              <input id="pb-jurisdiction" className="input" value={form.jurisdiction}
                onChange={e => set('jurisdiction', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-actions mp-generate-bar">
          <Button type="submit" variant="accent" icon="sparkles" loading={saving} className="mp-generate">
            {saving ? 'Generating…' : <>Generate proposal — <span className="num">{formatINR(totals.grand)}</span></>}
          </Button>
        </div>
      </form>

      {showPreview && (
        <aside className="builder-preview">
          <div className="preview-bar">
            <span className="mp-preview-label">A4 preview</span>
            <span className="text-sm-muted" aria-live="polite">
              {previewBusy ? 'Rendering…' : 'Live'}
            </span>
          </div>
          <div className="preview-frame">
            {previewHtml
              ? <iframe title="Proposal preview" srcDoc={previewHtml} />
              : <div className="text-sm-muted mp-preview-empty">Start typing — the document renders here.</div>}
          </div>
        </aside>
      )}
      </div>
    </>
  );
}
