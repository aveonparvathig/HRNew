import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { incomeAPI } from '../../api/income';
import { useRole } from '../../store/authStore';
import { formatDate } from '../../utils/format';
import { PageHeader, ErrorAlert, LoadingBlock, BackButton, SuccessAlert } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';

const EMPTY = {
  stage: 'ONBOARDING',
  contactPerson: '', contactDesignation: '', contactPhone: '', contactEmail: '',
  institutionType: '', address: '', city: '', state: '', pincode: '', gstin: '', studentStrength: '',
  onboardedOn: '', goLiveDate: '', engineer: '', supportEngineer: '',
  poReceived: false, poNumber: '', poDate: '',
  agreementSigned: false, agreementYears: '', agreementStart: '', agreementEnd: '',
  reminderDays: 90, notes: '',
};

interface DocState {
  has: boolean;
  filename: string;
  pending?: { data: string; name: string };
  remove?: boolean;
}

function DocUpload({ label, doc, onChange, onDownload }: {
  label: string;
  doc: DocState;
  onChange: (d: DocState) => void;
  onDownload: () => void;
}) {
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('The document must be under 8 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange({
      ...doc, remove: false,
      pending: { data: String(reader.result), name: file.name },
    });
    reader.readAsDataURL(file);
  };
  const current = doc.pending?.name || (doc.has && !doc.remove ? doc.filename || 'document' : '');
  return (
    <div className="field im-doc">
      <label>{label}</label>
      <div className="cluster">
        {current ? (
          <span className="badge badge-info im-doc-badge" title={current}>
            <Icon name="layers" size={13} className="" />{current.length > 28 ? current.slice(0, 26) + '…' : current}
            {doc.pending && ' (not saved yet)'}
          </span>
        ) : (
          <span className="text-sm-muted">No document</span>
        )}
        {/* A label (not <Button>) so the click opens the hidden file input. */}
        <label className="btn btn-secondary btn-sm">
          {current ? 'Replace' : 'Upload'}
          <input type="file" accept="application/pdf,image/*" hidden onChange={pick} />
        </label>
        {doc.has && !doc.pending && !doc.remove && (
          <Button size="sm" icon="download" onClick={onDownload}>
            Download
          </Button>
        )}
        {current && (
          <Button variant="ghost" size="sm"
            onClick={() => onChange({ ...doc, pending: undefined, remove: doc.has })}>
            Remove
          </Button>
        )}
      </div>
      <span className="hint">PDF or image, up to 8 MB. Saved with the form below.</span>
    </div>
  );
}

export default function ClientOnboarding() {
  const { isSA } = useRole();
  const { clientId } = useParams<{ clientId: string }>();
  const [clientName, setClientName] = useState('');
  const [poDoc, setPoDoc] = useState<DocState>({ has: false, filename: '' });
  const [agDoc, setAgDoc] = useState<DocState>({ has: false, filename: '' });
  const [form, setForm] = useState<any>(EMPTY);
  const [agreement, setAgreement] = useState<any>(null);
  const [features, setFeatures] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [progress, setProgress] = useState<any>({ total: 0, applicable: 0, live: 0, pct: 0 });
  const [newFeature, setNewFeature] = useState('');
  const [meta, setMeta] = useState<any>({ engineers: [], onboardingStages: [], institutionTypes: [], featureStatuses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [obRes, metaRes] = await Promise.all([
        incomeAPI.getOnboarding(clientId!),
        incomeAPI.getMeta(),
      ]);
      setClientName(obRes.data.client.name);
      setMeta(metaRes.data);
      setFeatures(obRes.data.features || []);
      setVisits(obRes.data.visits || []);
      setProgress(obRes.data.progress || { total: 0, applicable: 0, live: 0, pct: 0 });
      const ob = obRes.data.onboarding;
      if (ob) {
        setForm({
          ...EMPTY,
          ...Object.fromEntries(
            Object.keys(EMPTY).map(k => [k, ob[k] ?? (EMPTY as any)[k] ?? ''])
          ),
        });
        setAgreement(ob.agreement);
        setPoDoc({ has: Boolean(ob.poHasDocument), filename: ob.poFilename || '' });
        setAgDoc({ has: Boolean(ob.agreementHasDocument), filename: ob.agreementFilename || '' });
      } else if (obRes.data.latestBillingEngineer) {
        // No implementation record yet — start from the billing assignment
        setForm((f: any) => ({ ...f, engineer: obRes.data.latestBillingEngineer }));
      }
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load onboarding');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const downloadDoc = async (kind: 'po' | 'agreement') => {
    try {
      const res = await incomeAPI.getOnboardingDocument(clientId!, kind);
      const a = document.createElement('a');
      a.href = res.data.dataUri;
      a.download = res.data.filename;
      a.click();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to download the document');
    }
  };

  const docPayload = (doc: DocState, dataKey: string, nameKey: string) =>
    doc.pending
      ? { [dataKey]: doc.pending.data, [nameKey]: doc.pending.name }
      : doc.remove
        ? { [dataKey]: '', [nameKey]: '' }
        : {}; // untouched -> keep what the server has

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess('');
    try {
      const res = await incomeAPI.saveOnboarding(clientId!, {
        ...form,
        ...docPayload(poDoc, 'poDocumentData', 'poFilename'),
        ...docPayload(agDoc, 'agreementDocumentData', 'agreementFilename'),
      });
      setPoDoc({ has: Boolean(res.data.poHasDocument), filename: res.data.poFilename || '' });
      setAgDoc({ has: Boolean(res.data.agreementHasDocument), filename: res.data.agreementFilename || '' });
      setAgreement(res.data.agreement);
      setForm((f: any) => ({ ...f, agreementEnd: res.data.agreementEnd || f.agreementEnd }));
      setError('');
      setSuccess('Implementation details saved.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFeature.trim()) return;
    try {
      await incomeAPI.addFeature(clientId!, newFeature.trim());
      setNewFeature('');
      setError('');
      refreshFeatures();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add feature');
    }
  };

  const refreshFeatures = async () => {
    const res = await incomeAPI.getOnboarding(clientId!);
    setFeatures(res.data.features || []);
    setProgress(res.data.progress || { total: 0, applicable: 0, live: 0, pct: 0 });
  };

  const handleSeedFeatures = async () => {
    try {
      const res = await incomeAPI.seedFeatures(clientId!);
      setFeatures(res.data.features);
      setProgress(res.data.progress);
      setSuccess(`Added ${res.data.created} default module(s).`);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to seed features');
    }
  };

  const handleFeatureChange = async (featureId: string, data: any) => {
    try {
      const res = await incomeAPI.updateFeature(featureId, data);
      setFeatures(fs => fs.map(f => (f.id === featureId ? res.data.feature : f)));
      setProgress(res.data.progress);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update feature');
    }
  };

  const handleDeleteFeature = async (feature: any) => {
    if (!await confirmDialog(`Remove "${feature.name}" from tracking?`)) return;
    try {
      await incomeAPI.deleteFeature(feature.id);
      refreshFeatures();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove feature');
    }
  };

  if (loading) return <LoadingBlock label="Loading…" />;

  const stageLabels: Record<string, string> = {
    ONBOARDING: 'Onboarding', IMPLEMENTATION: 'Implementation', LIVE: 'Live',
    ON_HOLD: 'On hold', DISCONTINUED: 'Discontinued',
  };
  const typeLabels: Record<string, string> = {
    COLLEGE: 'College', SCHOOL: 'School', UNIVERSITY: 'University',
    POLYTECHNIC: 'Polytechnic', OTHER: 'Other',
  };

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/income/implementation">Implementation</Link>
        <span>/</span>
        <Link to={`/income/clients/${clientId}`}>{clientName}</Link>
      </div>

      <PageHeader
        title={`Implementation — ${clientName}`}
        subtitle="Onboarding, purchase order and agreement tracking."
        actions={agreement && (
          <span className={`badge ${agreement.expired ? 'badge-danger' : agreement.expiring ? 'badge-warning' : 'badge-success'}`}>
            {agreement.label}
          </span>
        )}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} />

      <form onSubmit={handleSave}>
        <div className="card card-pad mb-24">
          <h3 className="im-section-title">Stage &amp; contact</h3>
          <div className="form-grid mb-16">
            <div className="field">
              <label htmlFor="ob-stage">Stage</label>
              <select id="ob-stage" className="select" value={form.stage} onChange={e => set('stage', e.target.value)}>
                {meta.onboardingStages.map((s: string) => (
                  <option key={s} value={s}>{stageLabels[s] || s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ob-institutionType">Institution type</label>
              <select id="ob-institutionType" className="select" value={form.institutionType} onChange={e => set('institutionType', e.target.value)}>
                <option value="">—</option>
                {meta.institutionTypes.map((t: string) => (
                  <option key={t} value={t}>{typeLabels[t] || t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ob-engineer">Assigned engineer</label>
              <input id="ob-engineer" className="input" list="ob-engineers" value={form.engineer}
                onChange={e => set('engineer', e.target.value)} />
              <span className="hint">Also updates the client's engineer on the Clients page.</span>
              <datalist id="ob-engineers">
                {meta.engineers.map((e: string) => <option key={e} value={e} />)}
              </datalist>
            </div>
            <div className="field">
              <label htmlFor="ob-supportEngineer">Additional engineer</label>
              <input id="ob-supportEngineer" className="input" list="ob-engineers" value={form.supportEngineer}
                placeholder="Optional — second engineer"
                onChange={e => set('supportEngineer', e.target.value)} />
              <span className="hint">For institutions handled by two engineers.</span>
            </div>
          </div>
          <div className="form-grid mb-16">
            <div className="field">
              <label htmlFor="ob-contactPerson">Contact person</label>
              <input id="ob-contactPerson" className="input" value={form.contactPerson}
                onChange={e => set('contactPerson', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ob-contactDesignation">Designation</label>
              <input id="ob-contactDesignation" className="input" value={form.contactDesignation}
                onChange={e => set('contactDesignation', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ob-contactPhone">Phone</label>
              <input id="ob-contactPhone" className="input" value={form.contactPhone}
                onChange={e => set('contactPhone', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ob-contactEmail">Email</label>
              <input id="ob-contactEmail" className="input" type="email" value={form.contactEmail}
                onChange={e => set('contactEmail', e.target.value)} />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="ob-city">City</label>
              <input id="ob-city" className="input" value={form.city} onChange={e => set('city', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ob-studentStrength">Student strength</label>
              <input id="ob-studentStrength" className="input" type="number" min={0} value={form.studentStrength}
                onChange={e => set('studentStrength', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ob-onboardedOn">Onboarded on</label>
              <input id="ob-onboardedOn" className="input" type="date" value={form.onboardedOn || ''}
                onChange={e => set('onboardedOn', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="ob-goLiveDate">Go-live date</label>
              <input id="ob-goLiveDate" className="input" type="date" value={form.goLiveDate || ''}
                onChange={e => set('goLiveDate', e.target.value)} />
            </div>
          </div>
          <div className="field im-mt-16">
            <label htmlFor="ob-address">Address</label>
            <textarea id="ob-address" className="input" rows={2} value={form.address}
              placeholder="One line per row — printed as-is on proforma invoices"
              onChange={e => set('address', e.target.value)} />
          </div>
          <div className="form-grid im-mt-16">
            <div className="field">
              <label htmlFor="ob-state">State</label>
              <select id="ob-state" className="select" value={form.state} onChange={e => set('state', e.target.value)}>
                <option value="">—</option>
                {(meta.states || []).map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="hint">Place of supply on proforma invoices.</span>
            </div>
            <div className="field">
              <label htmlFor="ob-pincode">PIN code</label>
              <input id="ob-pincode" className="input" inputMode="numeric" maxLength={6} value={form.pincode}
                onChange={e => set('pincode', e.target.value.replace(/\D/g, ''))} />
            </div>
            <div className="field">
              <label htmlFor="ob-gstin">GSTIN</label>
              <input id="ob-gstin" className="input" maxLength={15} placeholder="Optional" value={form.gstin}
                onChange={e => set('gstin', e.target.value.toUpperCase())} />
            </div>
          </div>
        </div>

        <div className="grid-2 mb-24">
          <div className="card card-pad">
            <h3 className="im-section-title">Purchase order</h3>
            <label className="checkbox-field mb-14">
              <input type="checkbox" checked={form.poReceived}
                onChange={e => set('poReceived', e.target.checked)} />
              PO received
            </label>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ob-poNumber">PO number</label>
                <input id="ob-poNumber" className="input" value={form.poNumber}
                  onChange={e => set('poNumber', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ob-poDate">PO date</label>
                <input id="ob-poDate" className="input" type="date" value={form.poDate || ''}
                  onChange={e => set('poDate', e.target.value)} />
              </div>
            </div>
            <DocUpload label="PO document" doc={poDoc} onChange={setPoDoc}
              onDownload={() => downloadDoc('po')} />
          </div>

          <div className="card card-pad">
            <h3 className="im-section-title">Agreement</h3>
            <label className="checkbox-field mb-14">
              <input type="checkbox" checked={form.agreementSigned}
                onChange={e => set('agreementSigned', e.target.checked)} />
              Agreement signed
            </label>
            <div className="form-grid mb-16">
              <div className="field">
                <label htmlFor="ob-agreementStart">Start date</label>
                <input id="ob-agreementStart" className="input" type="date" value={form.agreementStart || ''}
                  onChange={e => set('agreementStart', e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ob-agreementYears">Duration (years)</label>
                <input id="ob-agreementYears" className="input" type="number" min={0} value={form.agreementYears}
                  onChange={e => set('agreementYears', e.target.value)} />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="ob-agreementEnd">End date</label>
                <input id="ob-agreementEnd" className="input" type="date" value={form.agreementEnd || ''}
                  onChange={e => set('agreementEnd', e.target.value)} />
                <span className="hint">Leave blank to auto-compute from start + years.</span>
              </div>
              <div className="field">
                <label htmlFor="ob-reminderDays">Reminder (days before)</label>
                <input id="ob-reminderDays" className="input" type="number" min={0} value={form.reminderDays}
                  onChange={e => set('reminderDays', e.target.value)} />
              </div>
            </div>
            <DocUpload label="Agreement document" doc={agDoc} onChange={setAgDoc}
              onDownload={() => downloadDoc('agreement')} />
          </div>
        </div>

        <div className="card card-pad mb-24">
          <div className="field">
            <label htmlFor="ob-notes">Notes</label>
            <textarea id="ob-notes" className="input" rows={3} value={form.notes}
              onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <div className="form-actions im-actions-start">
          <Button type="submit" variant="accent" loading={saving}>
            {saving ? 'Saving…' : 'Save implementation details'}
          </Button>
        </div>
      </form>

      {/* Recent site visits */}
      <div className="card im-section">
        <div className="card-header">
          <h3>Recent visits</h3>
          <ButtonLink to={`/income/implementation/visits?client=${clientId}`} size="sm" icon="pin">
            Log / view all
          </ButtonLink>
        </div>
        {visits.length === 0 ? (
          <p className="im-empty-note">
            No site visits logged for this client yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Engineer</th><th>Time</th><th>Work done</th><th>Met</th></tr>
              </thead>
              <tbody>
                {visits.map((v: any) => (
                  <tr key={v.id}>
                    <td className="num im-strong">{formatDate(v.visitDate)}</td>
                    <td>{v.engineerName || '—'}</td>
                    <td className="text-muted num im-cell-sm">
                      {v.timeIn || v.timeOut ? `${v.timeIn || '?'} – ${v.timeOut || '?'}` : '—'}
                    </td>
                    <td className="im-cell-sm">{v.workDone || '—'}</td>
                    <td className="text-muted im-cell-sm">{v.metPersons || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Feature delivery status */}
      <div className="card im-section">
        <div className="card-header">
          <h3>Feature delivery (<span className="num">{progress.live}/{progress.applicable}</span> live)</h3>
          <div className="im-progress im-progress-wide">
            <div className="bar-track">
              {/* Width is data-driven, so it stays inline. */}
              <div className="bar-fill green" style={{ width: `${progress.pct}%` }} />
            </div>
            <strong className="num">{progress.pct}%</strong>
          </div>
        </div>

        <div className="im-feature-bar">
          <form onSubmit={handleAddFeature} className="im-feature-form">
            <input className="input im-grow" placeholder="Feature / module name" aria-label="Feature or module name"
              value={newFeature} onChange={e => setNewFeature(e.target.value)} />
            <Button type="submit" icon="plus">Add</Button>
          </form>
          <Button onClick={handleSeedFeatures}>
            Seed 25 CMS modules
          </Button>
        </div>

        {features.length === 0 ? (
          <div className="empty-state im-empty-pad">
            <p>No features tracked yet — add one or seed the standard CMS module list.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Feature</th><th>Status</th><th>Engineer</th>
                  <th>Started</th><th>Completed</th><th>Remarks</th><th />
                </tr>
              </thead>
              <tbody>
                {features.map(f => (
                  <tr key={f.id}>
                    <td className="im-strong">{f.name}</td>
                    <td>
                      <select className="select im-cell-input" aria-label={`${f.name} status`}
                        value={f.status}
                        onChange={e => handleFeatureChange(f.id, { status: e.target.value })}>
                        {meta.featureStatuses.map((s: any) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="input im-cell-input" aria-label={`${f.name} engineer`}
                        list="ob-engineers" defaultValue={f.engineer}
                        onBlur={e => e.target.value !== f.engineer && handleFeatureChange(f.id, { engineer: e.target.value })} />
                    </td>
                    <td className="text-muted num im-cell-sm">{f.startedOn || '—'}</td>
                    <td className="text-muted num im-cell-sm">{f.completedOn || '—'}</td>
                    <td>
                      <input className="input im-cell-input im-cell-remarks" aria-label={`${f.name} remarks`}
                        defaultValue={f.remarks} placeholder="—"
                        onBlur={e => e.target.value !== f.remarks && handleFeatureChange(f.id, { remarks: e.target.value })} />
                    </td>
                    <td>
                      <div className="row-actions">
                        {isSA && <Button variant="danger" size="sm" aria-label={`Remove ${f.name}`} onClick={() => handleDeleteFeature(f)}>✕</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
