import { useState, useEffect, useRef } from 'react';
import { orgAPI } from '../../api/org';
import { PageHeader, LoadingBlock, ErrorAlert } from '../../components/ui';

// Logos keep transparency: resize to max 512px, PNG
function resizeLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 512 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

export default function CompanyProfile() {
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    orgAPI.getProfile()
      .then(res => setForm(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load profile'));
  }, []);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const handleLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      set('logoData', await resizeLogo(file));
    } catch {
      setError('Could not read that image');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess('');
    try {
      const res = await orgAPI.updateProfile(form);
      setForm(res.data);
      setError('');
      setSuccess('Profile saved — letters, payslips and proposals now use this branding.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <LoadingBlock label="Loading profile…" />;

  return (
    <>
      <PageHeader
        title="Company Profile"
        subtitle="Identity and branding printed on every letter, payslip and proposal."
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {success && <div className="alert alert-success"><span>✓</span>{success}</div>}

      <form onSubmit={handleSave}>
        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Identity</h3>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Organization name *</label>
              <input className="input" required value={form.name}
                onChange={e => set('name', e.target.value)} />
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
              <input className="input" type="email" value={form.email}
                onChange={e => set('email', e.target.value)} />
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
              <input className="input" value={form.state} onChange={e => set('state', e.target.value)} />
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

        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 16 }}>Branding</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
            <div style={{
              width: 140, height: 72, border: '1px dashed var(--border)', borderRadius: 8,
              display: 'grid', placeItems: 'center', background: 'var(--surface-2)', overflow: 'hidden',
            }}>
              {form.logoData
                ? <img src={form.logoData} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                : <span className="text-muted" style={{ fontSize: 12 }}>No logo</span>}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                {form.logoData ? 'Change logo' : 'Upload logo'}
              </button>
              {form.logoData && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('logoData', '')}>
                  Remove
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleLogo} />
            </div>
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Primary color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.brandPrimary}
                  onChange={e => set('brandPrimary', e.target.value)}
                  style={{ width: 44, height: 38, border: '1px solid var(--border)', borderRadius: 7, padding: 2, background: 'var(--surface)' }} />
                <input className="input" value={form.brandPrimary}
                  onChange={e => set('brandPrimary', e.target.value)} style={{ maxWidth: 120 }} />
              </div>
            </div>
            <div className="field">
              <label>Accent color</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.brandAccent}
                  onChange={e => set('brandAccent', e.target.value)}
                  style={{ width: 44, height: 38, border: '1px solid var(--border)', borderRadius: 7, padding: 2, background: 'var(--surface)' }} />
                <input className="input" value={form.brandAccent}
                  onChange={e => set('brandAccent', e.target.value)} style={{ maxWidth: 120 }} />
              </div>
            </div>
          </div>
        </div>

        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Default signatory</h3>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            Prefills the signature block on letters and proposals when not overridden per document.
          </p>
          <div className="form-grid">
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
        </div>

        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </form>
    </>
  );
}
