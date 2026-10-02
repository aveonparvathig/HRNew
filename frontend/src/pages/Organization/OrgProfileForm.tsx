import { useState, useEffect } from 'react';
import { orgAPI } from '../../api/org';
import { LoadingBlock, ErrorAlert, SuccessAlert } from '../../components/ui';
import ImageUpload from '../../components/ImageUpload';

// What each section of the company's profile holds. A section saves only
// its own fields.
const SECTION_FIELDS: Record<string, string[]> = {
  identity: ['name', 'tagline', 'phone', 'email', 'website', 'address', 'city', 'state', 'country', 'jurisdiction'],
  branding: ['logoData', 'logoPosition', 'brandPrimary', 'brandAccent'],
  signatory: ['signatoryName', 'signatoryDesignation', 'signatureData'],
};

const SAVED: Record<string, string> = {
  identity: 'Company details saved.',
  branding: 'Branding saved. Letters, payslips, reports and proposals now use it.',
  signatory: 'Signatory saved.',
};

// Signature pictures are kept small: about 300 KB at most
const SIGNATURE_CHARS = 380_000;

export default function OrgProfileForm({ section }: { section: 'identity' | 'branding' | 'signatory' }) {
  const [form, setForm] = useState<any>(null);
  const [states, setStates] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    orgAPI.getProfile()
      .then(res => { setForm(res.data); setStates(res.data.states || []); })
      .catch(err => setError(err.response?.data?.error || 'Failed to load the company profile'));
  }, []);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess('');
    try {
      const res = await orgAPI.updateProfile(Object.fromEntries(SECTION_FIELDS[section].map(f => [f, form[f]])));
      setForm(res.data);
      setError('');
      setSuccess(SAVED[section]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading…" />;

  const inIndia = !form.country || form.country.trim().toLowerCase() === 'india';
  const stateOffList = Boolean(form.state) && !states.includes(form.state);

  return (
    <form onSubmit={handleSave}>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} />

      {section === 'identity' && (
        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Identity</h3>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            Printed at the head of every letter, payslip, report and proposal.
          </p>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Organization name *</label>
              <input className="input" required value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="field">
              <label>Tagline</label>
              <input className="input" placeholder="e.g. Campus ERP for modern institutions"
                value={form.tagline} onChange={e => set('tagline', e.target.value)} />
            </div>
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Phone</label>
              <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="field">
              <label>Website</label>
              <input className="input" placeholder="www.example.com" value={form.website}
                onChange={e => set('website', e.target.value)} />
            </div>
          </div>
          <div className="form-grid">
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Address</label>
              <input className="input" value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
            <div className="field">
              <label>City</label>
              <input className="input" value={form.city} onChange={e => set('city', e.target.value)} />
            </div>
            <div className="field">
              <label>State</label>
              {inIndia ? (
                <select className="select" value={form.state} onChange={e => set('state', e.target.value)}>
                  <option value="">—</option>
                  {stateOffList && <option value={form.state}>{form.state} (not in the list)</option>}
                  {states.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <input className="input" value={form.state} onChange={e => set('state', e.target.value)} />
              )}
              {inIndia && stateOffList && (
                <span className="hint" style={{ color: 'var(--warning)' }}>
                  Pick the state from the list so it matches work locations and tax policies.
                </span>
              )}
            </div>
            <div className="field">
              <label>Country</label>
              <input className="input" value={form.country} onChange={e => set('country', e.target.value)} />
            </div>
            <div className="field">
              <label>Jurisdiction</label>
              <input className="input" placeholder="e.g. Coimbatore" value={form.jurisdiction}
                onChange={e => set('jurisdiction', e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {section === 'branding' && (
        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Branding</h3>
          <div style={{ marginBottom: 18 }}>
            <ImageUpload noun="logo" value={form.logoData} onChange={data => set('logoData', data)} />
          </div>
          <div className="field" style={{ marginBottom: 18 }}>
            <label>Logo and company name in headers</label>
            <div>
              <div className="segmented">
                {[['LEFT', 'Left'], ['CENTER', 'Centre'], ['RIGHT', 'Right']].map(([value, label]) => (
                  <button key={value} type="button" className={form.logoPosition === value ? 'active' : ''}
                    onClick={() => set('logoPosition', value)}>{label}</button>
                ))}
              </div>
            </div>
            <span className="hint">Where they sit at the head of letters and payroll reports.</span>
          </div>
          <div className="form-grid">
            {[['brandPrimary', 'Primary color'], ['brandAccent', 'Accent color']].map(([key, label]) => (
              <div key={key} className="field">
                <label>{label}</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="color" value={form[key]} onChange={e => set(key, e.target.value)}
                    style={{ width: 44, height: 38, border: '1px solid var(--border)', borderRadius: 7, padding: 2, background: 'var(--surface)' }} />
                  <input className="input" value={form[key]} onChange={e => set(key, e.target.value)} style={{ maxWidth: 120 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === 'signatory' && (
        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Default signatory</h3>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            Signs letters, proposals, the bank transfer advice and settlement statements unless a document names someone else.
          </p>
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>Name</label>
              <input className="input" placeholder="e.g. R. Kumar" value={form.signatoryName}
                onChange={e => set('signatoryName', e.target.value)} />
            </div>
            <div className="field">
              <label>Designation</label>
              <input className="input" placeholder="e.g. Director" value={form.signatoryDesignation}
                onChange={e => set('signatoryDesignation', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Signature</label>
            <ImageUpload noun="signature" value={form.signatureData} onChange={data => set('signatureData', data)}
              max={600} maxChars={SIGNATURE_CHARS} width={200} height={72} />
            <span className="hint">
              A photo or scan of the signature on white paper. It is printed above the signatory's name; a letter signed by someone else does not carry it.
            </span>
          </div>
        </div>
      )}

      <div className="form-actions" style={{ justifyContent: 'flex-start', marginBottom: 24 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}
