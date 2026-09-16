import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { incomeAPI } from '../../api/income';
import { useRole } from '../../store/authStore';
import { PageHeader, ErrorAlert, LoadingBlock, BackButton,
} from '../../components/ui';

const EMPTY = {
  stage: 'ONBOARDING',
  contactPerson: '', contactDesignation: '', contactPhone: '', contactEmail: '',
  institutionType: '', address: '', city: '', studentStrength: '',
  onboardedOn: '', goLiveDate: '', engineer: '',
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
    <div className="field" style={{ marginTop: 14 }}>
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {current ? (
          <span className="badge badge-info" title={current}>
            📎 {current.length > 28 ? current.slice(0, 26) + '…' : current}
            {doc.pending && ' (not saved yet)'}
          </span>
        ) : (
          <span className="text-muted" style={{ fontSize: 12.5 }}>No document</span>
        )}
        <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
          {current ? 'Replace' : 'Upload'}
          <input type="file" accept="application/pdf,image/*" hidden onChange={pick} />
        </label>
        {doc.has && !doc.pending && !doc.remove && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={onDownload}>
            ⤓ Download
          </button>
        )}
        {current && (
          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => onChange({ ...doc, pending: undefined, remove: doc.has })}>
            Remove
          </button>
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
    if (!window.confirm(`Remove "${feature.name}" from tracking?`)) return;
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
      {success && <div className="alert alert-success"><span>✓</span>{success}</div>}

      <form onSubmit={handleSave}>
        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Stage &amp; contact</h3>
          <div className="form-grid mb-16">
            <div className="field">
              <label>Stage</label>
              <select className="select" value={form.stage} onChange={e => set('stage', e.target.value)}>
                {meta.onboardingStages.map((s: string) => (
                  <option key={s} value={s}>{stageLabels[s] || s}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Institution type</label>
              <select className="select" value={form.institutionType} onChange={e => set('institutionType', e.target.value)}>
                <option value="">—</option>
                {meta.institutionTypes.map((t: string) => (
                  <option key={t} value={t}>{typeLabels[t] || t}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Assigned engineer</label>
              <input className="input" list="ob-engineers" value={form.engineer}
                onChange={e => set('engineer', e.target.value)} />
              <datalist id="ob-engineers">
                {meta.engineers.map((e: string) => <option key={e} value={e} />)}
              </datalist>
            </div>
          </div>
          <div className="form-grid mb-16">
            <div className="field">
              <label>Contact person</label>
              <input className="input" value={form.contactPerson}
                onChange={e => set('contactPerson', e.target.value)} />
            </div>
            <div className="field">
              <label>Designation</label>
              <input className="input" value={form.contactDesignation}
                onChange={e => set('contactDesignation', e.target.value)} />
            </div>
            <div className="field">
              <label>Phone</label>
              <input className="input" value={form.contactPhone}
                onChange={e => set('contactPhone', e.target.value)} />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={form.contactEmail}
                onChange={e => set('contactEmail', e.target.value)} />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>City</label>
              <input className="input" value={form.city} onChange={e => set('city', e.target.value)} />
            </div>
            <div className="field">
              <label>Student strength</label>
              <input className="input" type="number" min={0} value={form.studentStrength}
                onChange={e => set('studentStrength', e.target.value)} />
            </div>
            <div className="field">
              <label>Onboarded on</label>
              <input className="input" type="date" value={form.onboardedOn || ''}
                onChange={e => set('onboardedOn', e.target.value)} />
            </div>
            <div className="field">
              <label>Go-live date</label>
              <input className="input" type="date" value={form.goLiveDate || ''}
                onChange={e => set('goLiveDate', e.target.value)} />
            </div>
          </div>
          <div className="field" style={{ marginTop: 16 }}>
            <label>Address</label>
            <textarea className="input" rows={2} value={form.address}
              onChange={e => set('address', e.target.value)} />
          </div>
        </div>

        <div className="grid-2 mb-24">
          <div className="card card-pad">
            <h3 style={{ fontSize: 15, marginBottom: 16 }}>Purchase order</h3>
            <label className="checkbox-field" style={{ marginBottom: 14 }}>
              <input type="checkbox" checked={form.poReceived}
                onChange={e => set('poReceived', e.target.checked)} />
              PO received
            </label>
            <div className="form-grid">
              <div className="field">
                <label>PO number</label>
                <input className="input" value={form.poNumber}
                  onChange={e => set('poNumber', e.target.value)} />
              </div>
              <div className="field">
                <label>PO date</label>
                <input className="input" type="date" value={form.poDate || ''}
                  onChange={e => set('poDate', e.target.value)} />
              </div>
            </div>
            <DocUpload label="PO document" doc={poDoc} onChange={setPoDoc}
              onDownload={() => downloadDoc('po')} />
          </div>

          <div className="card card-pad">
            <h3 style={{ fontSize: 15, marginBottom: 16 }}>Agreement</h3>
            <label className="checkbox-field" style={{ marginBottom: 14 }}>
              <input type="checkbox" checked={form.agreementSigned}
                onChange={e => set('agreementSigned', e.target.checked)} />
              Agreement signed
            </label>
            <div className="form-grid mb-16">
              <div className="field">
                <label>Start date</label>
                <input className="input" type="date" value={form.agreementStart || ''}
                  onChange={e => set('agreementStart', e.target.value)} />
              </div>
              <div className="field">
                <label>Duration (years)</label>
                <input className="input" type="number" min={0} value={form.agreementYears}
                  onChange={e => set('agreementYears', e.target.value)} />
              </div>
            </div>
            <div className="form-grid">
              <div className="field">
                <label>End date</label>
                <input className="input" type="date" value={form.agreementEnd || ''}
                  onChange={e => set('agreementEnd', e.target.value)} />
                <span className="hint">Leave blank to auto-compute from start + years.</span>
              </div>
              <div className="field">
                <label>Reminder (days before)</label>
                <input className="input" type="number" min={0} value={form.reminderDays}
                  onChange={e => set('reminderDays', e.target.value)} />
              </div>
            </div>
            <DocUpload label="Agreement document" doc={agDoc} onChange={setAgDoc}
              onDownload={() => downloadDoc('agreement')} />
          </div>
        </div>

        <div className="card card-pad mb-24">
          <div className="field">
            <label>Notes</label>
            <textarea className="input" rows={3} value={form.notes}
              onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Implementation Details'}
          </button>
        </div>
      </form>

      {/* Feature delivery status */}
      <div className="card" style={{ marginTop: 28 }}>
        <div className="card-header">
          <h3>Feature delivery ({progress.live}/{progress.applicable} live)</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 200 }}>
            <div className="bar-track" style={{ flex: 1 }}>
              <div className="bar-fill green" style={{ width: `${progress.pct}%` }} />
            </div>
            <strong style={{ fontSize: 13 }}>{progress.pct}%</strong>
          </div>
        </div>

        <div style={{ padding: '14px 22px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <form onSubmit={handleAddFeature} style={{ display: 'flex', gap: 10, flex: 1, minWidth: 260 }}>
            <input className="input" placeholder="Feature / module name" value={newFeature}
              onChange={e => setNewFeature(e.target.value)} style={{ flex: 1 }} />
            <button type="submit" className="btn btn-secondary">+ Add</button>
          </form>
          <button type="button" className="btn btn-secondary" onClick={handleSeedFeatures}>
            Seed 25 CMS modules
          </button>
        </div>

        {features.length === 0 ? (
          <div className="empty-state" style={{ padding: '32px 24px' }}>
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
                    <td style={{ fontWeight: 600 }}>{f.name}</td>
                    <td>
                      <select className="select" style={{ width: 130, padding: '5px 8px', fontSize: 12.5 }}
                        value={f.status}
                        onChange={e => handleFeatureChange(f.id, { status: e.target.value })}>
                        {meta.featureStatuses.map((s: any) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input className="input" style={{ width: 130, padding: '5px 8px', fontSize: 12.5 }}
                        list="ob-engineers" defaultValue={f.engineer}
                        onBlur={e => e.target.value !== f.engineer && handleFeatureChange(f.id, { engineer: e.target.value })} />
                    </td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{f.startedOn || '—'}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>{f.completedOn || '—'}</td>
                    <td>
                      <input className="input" style={{ minWidth: 160, padding: '5px 8px', fontSize: 12.5 }}
                        defaultValue={f.remarks} placeholder="—"
                        onBlur={e => e.target.value !== f.remarks && handleFeatureChange(f.id, { remarks: e.target.value })} />
                    </td>
                    <td>
                      <div className="row-actions">
                        {isSA && <button type="button" className="btn btn-danger btn-sm" onClick={() => handleDeleteFeature(f)}>✕</button>}
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
