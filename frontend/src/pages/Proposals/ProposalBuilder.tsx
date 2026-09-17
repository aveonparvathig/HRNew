import { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { proposalsAPI } from '../../api/proposals';
import { PageHeader, ErrorAlert, LoadingBlock } from '../../components/ui';
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
  pricingModel: 'PER_STUDENT',
  pricePerUnit: '', minimumStudentCommitment: '',
  oneTimePrice: '', amcAmount: '', amcPercent: '',
  oneTimeImplementationFee: '', waiveOneTimeFee: true,
  gstPercent: '18', includeYear1Cost: true,
  authorizedSignatoryName: '', authorizedSignatoryDesignation: '',
  jurisdiction: 'Coimbatore',
  sections: { ...ALL_SECTIONS } as Record<string, boolean>,
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

  // Live totals
  const totals = useMemo(() => {
    const gst = Number(form.gstPercent) || 0;
    const impl = form.waiveOneTimeFee ? 0 : Number(form.oneTimeImplementationFee) || 0;
    let base = 0;
    if (form.pricingModel === 'ONE_TIME') {
      base = Number(form.oneTimePrice) || 0;
    } else {
      base = (Number(form.pricePerUnit) || 0) * (parseInt(form.minimumStudentCommitment) || 0);
    }
    const subtotal = base + impl;
    const gstAmt = subtotal * gst / 100;
    return { subtotal, gstAmt, grand: subtotal + gstAmt };
  }, [form]);

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
        title={revising ? `Revise Proposal — ${form.clientName}` : 'Proposal Builder'}
        subtitle="Pick a bundle or custom modules, set the commercials — the A4 document previews live."
        actions={
          <>
            <button type="button" className="btn btn-secondary"
              onClick={() => setShowPreview(p => !p)}>
              {showPreview ? '◧ Hide Preview' : '◨ Live Preview'}
            </button>
            <Link to="/proposals/history" className="btn btn-secondary">History</Link>
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="builder-layout">
      <form onSubmit={handleGenerate} className="builder-form">
        {/* Client */}
        <div className="card card-pad mb-24">
          <div className="form-section-title"><span className="step-dot">1</span> Client</div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Institution / client name *</label>
              <input className="input" required autoFocus placeholder="e.g. St. Xavier's College"
                value={form.clientName} onChange={e => set('clientName', e.target.value)} />
            </div>
            <div className="field">
              <label>Proposal date</label>
              <input className="input" type="date" value={form.proposalDate}
                onChange={e => set('proposalDate', e.target.value)} />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Client address</label>
              <textarea className="input" rows={2} value={form.clientAddress}
                onChange={e => set('clientAddress', e.target.value)} />
            </div>
            <div className="field">
              <label>Addressed to</label>
              <input className="input" value={form.toAddress}
                onChange={e => set('toAddress', e.target.value)} />
            </div>
            <div className="field">
              <label>Prepared by</label>
              <input className="input" placeholder="Your name" value={form.preparedBy}
                onChange={e => set('preparedBy', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Selection */}
        <div className="card card-pad mb-24">
          <div className="form-section-title"><span className="step-dot">2</span> What are you proposing?</div>
          <div className="segmented" style={{ marginBottom: 18 }}>
            <button type="button" className={form.selectionMode === 'BUNDLE' ? 'active' : ''}
              onClick={() => set('selectionMode', 'BUNDLE')}>Bundle</button>
            <button type="button" className={form.selectionMode === 'CUSTOM' ? 'active' : ''}
              onClick={() => set('selectionMode', 'CUSTOM')}>Custom modules</button>
          </div>

          {form.selectionMode === 'BUNDLE' ? (
            <div className="module-grid">
              {Object.values<any>(catalog.bundles).map(b => (
                <div key={b.code}
                  className="module-card"
                  onClick={() => pickBundle(b.code)}
                  style={{
                    cursor: 'pointer',
                    borderColor: form.bundle === b.code ? b.heroColor : undefined,
                    borderWidth: form.bundle === b.code ? 2 : 1,
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h3 style={{ fontSize: 15 }}>{b.name}</h3>
                    {form.bundle === b.code && <span className="badge badge-success">✓ Selected</span>}
                  </div>
                  <p style={{ marginBottom: 10 }}>{b.tagline}</p>
                  <div style={{ fontSize: 12.5 }}>
                    <strong style={{ color: 'var(--primary)' }}>{formatINR(b.price)}</strong>
                    <span className="text-muted"> / student · {b.modules.length} modules</span>
                    <div className="text-muted" style={{ fontSize: 11.5 }}>
                      standalone value {formatINR(b.standaloneTotal)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div className="toolbar" style={{ marginBottom: 10 }}>
                <span className="badge badge-info">{form.selectedModules.length} selected</span>
                <div className="search-input" style={{ maxWidth: 240 }}>
                  <input className="input" placeholder="Search modules…" value={modSearch}
                    onChange={e => setModSearch(e.target.value)} />
                </div>
                {suggestedCustomPrice > 0 && (
                  <span className="text-muted" style={{ fontSize: 12.5 }}>
                    Suggested rate: {formatINR(suggestedCustomPrice)} / student (sum of module rates)
                  </span>
                )}
              </div>
              {Object.entries(catalog.categories).map(([catCode, catLabel]: any) => {
                const mods = (modulesByCategory[catCode] || []).filter((m: any) =>
                  !modSearch || m.name.toLowerCase().includes(modSearch.toLowerCase()));
                if (!mods.length) return null;
                const allOn = mods.every((m: any) => form.selectedModules.includes(m.code));
                return (
                  <div key={catCode} style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, margin: '10px 0 8px' }}>
                      <div className="section-title" style={{ margin: 0, fontSize: 13 }}>{catLabel}</div>
                      <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 11.5, padding: '2px 8px' }}
                        onClick={() => setForm((f: any) => ({
                          ...f,
                          selectedModules: allOn
                            ? f.selectedModules.filter((cd: string) => !mods.some((m: any) => m.code === cd))
                            : Array.from(new Set([...f.selectedModules, ...mods.map((m: any) => m.code)])),
                        }))}>
                        {allOn ? 'Clear all' : 'Select all'}
                      </button>
                    </div>
                    <div className="chip-row">
                      {mods.map((m: any) => (
                        <button key={m.code} type="button"
                          className={`chip ${form.selectedModules.includes(m.code) ? 'active' : ''}`}
                          title={`${m.shortDesc} · ${formatINR(m.price)}/student`}
                          onClick={() => toggleModule(m.code)}>
                          {m.icon} {m.name}
                          {m.tag && <strong> · {m.tag}</strong>}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>

        {/* Commercials */}
        <div className="card card-pad mb-24">
          <div className="form-section-title"><span className="step-dot">3</span> Commercials</div>
          <div className="segmented" style={{ marginBottom: 18 }}>
            <button type="button" className={!isOneTime ? 'active' : ''}
              onClick={() => set('pricingModel', 'PER_STUDENT')}>Per student / year</button>
            <button type="button" className={isOneTime ? 'active' : ''}
              onClick={() => set('pricingModel', 'ONE_TIME')}>One-time + AMC</button>
          </div>

          <div className="form-grid" style={{ marginBottom: 14 }}>
            {!isOneTime ? (
              <>
                <div className="field">
                  <label>Rate per student / year *</label>
                  <div className="input-unit"><span className="unit">₹</span>
                    <input className="input" type="number" min={0} step="0.01" required
                      value={form.pricePerUnit} onChange={e => set('pricePerUnit', e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label>Minimum student commitment *</label>
                  <input className="input" type="number" min={0} required
                    value={form.minimumStudentCommitment}
                    onChange={e => set('minimumStudentCommitment', e.target.value)} />
                </div>
              </>
            ) : (
              <>
                <div className="field">
                  <label>One-time license fee *</label>
                  <div className="input-unit"><span className="unit">₹</span>
                    <input className="input" type="number" min={0} step="0.01" required
                      value={form.oneTimePrice} onChange={e => set('oneTimePrice', e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label>AMC per year (from Year 2)</label>
                  <div className="input-unit"><span className="unit">₹</span>
                    <input className="input" type="number" min={0} step="0.01"
                      value={form.amcAmount} onChange={e => set('amcAmount', e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label>AMC as % of license</label>
                  <input className="input" type="number" min={0} max={100} placeholder="optional"
                    value={form.amcPercent} onChange={e => set('amcPercent', e.target.value)} />
                </div>
              </>
            )}
            <div className="field">
              <label>One-time implementation fee</label>
              <div className="input-unit"><span className="unit">₹</span>
                <input className="input" type="number" min={0} step="0.01"
                  value={form.oneTimeImplementationFee}
                  onChange={e => set('oneTimeImplementationFee', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>GST %</label>
              <input className="input" type="number" min={0} max={100}
                value={form.gstPercent} onChange={e => set('gstPercent', e.target.value)} />
            </div>
          </div>
          <label className="checkbox-field" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={form.waiveOneTimeFee}
              onChange={e => set('waiveOneTimeFee', e.target.checked)} />
            Waive the implementation fee (shown struck-through in the proposal)
          </label>

          <div className="calc-card">
            <div className="calc-row"><span>Subtotal</span><span className="amount">{formatINR(totals.subtotal)}</span></div>
            <div className="calc-row"><span>GST @ {form.gstPercent || 0}%</span><span className="amount">{formatINR(totals.gstAmt)}</span></div>
            <div className="calc-row total"><span>Year-1 total</span><span className="amount">{formatINR(totals.grand)}</span></div>
          </div>
        </div>

        {/* Document content */}
        <div className="card card-pad mb-24">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div className="form-section-title" style={{ marginBottom: 0 }}>
              <span className="step-dot">4</span> Document content
            </div>
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => set('sections', { ...ALL_SECTIONS })}>All</button>
            <button type="button" className="btn btn-ghost btn-sm"
              onClick={() => set('sections', Object.fromEntries(Object.keys(SECTION_LABELS).map(k => [k, false])))}>None</button>
          </div>
          <p className="text-muted" style={{ fontSize: 12.5, margin: '8px 0 12px' }}>
            Tune the document to the audience — a lean commercial quote or the full company story.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '6px 16px' }}>
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <label key={key} className="checkbox-field" style={{ fontSize: 13 }}>
                <input type="checkbox" checked={form.sections?.[key] !== false}
                  onChange={e => set('sections', { ...form.sections, [key]: e.target.checked })} />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Signatory */}
        <div className="card card-pad mb-24">
          <div className="form-section-title"><span className="step-dot">5</span> Signatory &amp; legal</div>
          <div className="form-grid">
            <div className="field">
              <label>Authorized signatory name</label>
              <input className="input" value={form.authorizedSignatoryName}
                onChange={e => set('authorizedSignatoryName', e.target.value)} />
            </div>
            <div className="field">
              <label>Signatory designation</label>
              <input className="input" placeholder="e.g. Director"
                value={form.authorizedSignatoryDesignation}
                onChange={e => set('authorizedSignatoryDesignation', e.target.value)} />
            </div>
            <div className="field">
              <label>Jurisdiction</label>
              <input className="input" value={form.jurisdiction}
                onChange={e => set('jurisdiction', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ padding: '12px 28px' }}>
            {saving ? 'Generating…' : `Generate Proposal — ${formatINR(totals.grand)}`}
          </button>
        </div>
      </form>

      {showPreview && (
        <aside className="builder-preview">
          <div className="preview-bar">
            <span style={{ fontWeight: 600, fontSize: 13 }}>A4 Preview</span>
            <span className="text-muted" style={{ fontSize: 12 }}>
              {previewBusy ? 'Rendering…' : 'live'}
            </span>
          </div>
          <div className="preview-frame">
            {previewHtml
              ? <iframe title="Proposal preview" srcDoc={previewHtml} />
              : <div className="text-muted" style={{ padding: 24, fontSize: 13 }}>Start typing — the document renders here.</div>}
          </div>
        </aside>
      )}
      </div>
    </>
  );
}
