import { useState, useEffect } from 'react';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert } from '../../components/ui';

type Field = { key: string; label: string; placeholder?: string; upper?: boolean; type?: string; wide?: boolean };

const GROUPS: { title: string; hint: string; fields: Field[] }[] = [
  {
    title: 'Registrations',
    hint: 'Company registration numbers printed on statutory statements and returns.',
    fields: [
      { key: 'panNumber', label: 'Company PAN', placeholder: 'ABCDE1234F', upper: true },
      { key: 'tanNumber', label: 'TAN', placeholder: 'ABCD12345E', upper: true },
      { key: 'pfCode', label: 'PF establishment code' },
      { key: 'esiCode', label: 'ESI employer code' },
      { key: 'ptRegistrationNo', label: 'Professional Tax registration no.' },
      { key: 'lwfRegistrationNo', label: 'Labour Welfare Fund no.' },
    ],
  },
  {
    title: 'Labour-law registers',
    hint: 'Printed at the head of the registers of employees, wages and attendance.',
    fields: [
      { key: 'shopsRegistrationNo', label: 'Shops and Establishments registration no.' },
      { key: 'labourIdNumber', label: 'Labour Identification Number (LIN)' },
      { key: 'natureOfBusiness', label: 'Nature of business', placeholder: 'e.g. Software services' },
      { key: 'managerName', label: 'Manager or person in charge' },
    ],
  },
  {
    title: 'Person responsible for tax deduction',
    hint: 'Named on the quarterly TDS return.',
    fields: [
      { key: 'responsibleName', label: 'Name' },
      { key: 'responsibleDesignation', label: 'Designation' },
      { key: 'responsiblePan', label: 'PAN', placeholder: 'ABCDE1234F', upper: true },
      { key: 'responsibleEmail', label: 'Email', type: 'email' },
      { key: 'responsiblePhone', label: 'Phone' },
      { key: 'responsibleAddress', label: 'Address', wide: true },
    ],
  },
  {
    title: 'Form 16 signatory',
    hint: 'Signs the annual tax certificate issued to each employee.',
    fields: [
      { key: 'form16SignatoryName', label: 'Name' },
      { key: 'form16SignatoryFatherName', label: "Father's name" },
      { key: 'form16SignatoryDesignation', label: 'Designation' },
      { key: 'form16SigningPlace', label: 'Place of signing' },
    ],
  },
];

export default function StatutoryProfileTab() {
  const [form, setForm] = useState<any>(null);
  const [deductorTypes, setDeductorTypes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    payrollAPI.getStatutoryProfile()
      .then(res => { setForm(res.data.profile); setDeductorTypes(res.data.deductorTypes); })
      .catch(() => setError('Failed to load the statutory profile'));
  }, []);

  const set = (key: string, value: string) => setForm((f: any) => ({ ...f, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess('');
    try {
      const res = await payrollAPI.updateStatutoryProfile(form);
      setForm(res.data.profile);
      setError('');
      setSuccess('Statutory profile saved.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save the statutory profile');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading profile…" />;

  const input = (f: Field) => (
    <div key={f.key} className="field" style={f.wide ? { gridColumn: '1 / -1' } : undefined}>
      <label>{f.label}</label>
      <input className="input" type={f.type || 'text'} placeholder={f.placeholder}
        value={form[f.key] || ''}
        onChange={e => set(f.key, f.upper ? e.target.value.toUpperCase() : e.target.value)} />
    </div>
  );

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {success && <div className="alert alert-success"><span>✓</span>{success}</div>}

      <form onSubmit={handleSave}>
        {GROUPS.map((g, i) => (
          <div key={g.title} className="card card-pad mb-24">
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>{g.title}</h3>
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>{g.hint}</p>
            <div className="form-grid">
              {g.fields.map(input)}
              {i === 0 && (
                <>
                  <div className="field">
                    <label>Deductor type</label>
                    <select className="select" value={form.deductorType || ''}
                      onChange={e => set('deductorType', e.target.value)}>
                      <option value="">—</option>
                      {deductorTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="field" style={{ gridColumn: '1 / -1' }}>
                    <label>Tax office (TDS circle) address</label>
                    <input className="input" value={form.tdsCircleAddress || ''}
                      onChange={e => set('tdsCircleAddress', e.target.value)} />
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </form>
    </>
  );
}
