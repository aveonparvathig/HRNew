import { useState, useEffect } from 'react';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert, SuccessAlert } from '../../components/ui';
import ImageUpload from '../../components/ImageUpload';

type Field = { key: string; label: string; placeholder?: string; upper?: boolean; type?: string; wide?: boolean };
type Group = { title: string; hint: string; fields: Field[] };

const REGISTRATIONS: Group[] = [
  {
    title: 'Registrations',
    hint: 'Company registration numbers printed on statutory statements and returns.',
    fields: [
      { key: 'panNumber', label: 'Company PAN', placeholder: 'ABCDE1234F', upper: true },
      { key: 'tanNumber', label: 'TAN', placeholder: 'ABCD12345E', upper: true },
      { key: 'gstNumber', label: 'GST number', placeholder: '33ABCDE1234F1Z5', upper: true },
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
];

const SIGNATORIES: Group[] = [
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

// The company's statutory details. Shown in two halves of Company
// Settings: its registrations, and the people who sign its tax forms.
export default function StatutoryProfileTab({ section }: { section: 'registrations' | 'signatories' }) {
  const [form, setForm] = useState<any>(null);
  const [deductorTypes, setDeductorTypes] = useState<string[]>([]);
  const [gst, setGst] = useState<any>(null);        // what the saved GST number says
  const [savedGst, setSavedGst] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const groups = section === 'registrations' ? REGISTRATIONS : SIGNATORIES;

  const apply = (data: any) => {
    setForm(data.profile);
    setDeductorTypes(data.deductorTypes);
    setGst(data.gst);
    setSavedGst(data.profile.gstNumber || '');
  };

  useEffect(() => {
    payrollAPI.getStatutoryProfile()
      .then(res => apply(res.data))
      .catch(() => setError('Failed to load the statutory profile'));
  }, []);

  const set = (key: string, value: string) => setForm((f: any) => ({ ...f, [key]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess('');
    try {
      // Each half saves its own fields
      const keys = [
        ...groups.flatMap(g => g.fields.map(f => f.key)),
        ...(section === 'registrations' ? ['deductorType', 'tdsCircleAddress'] : ['form16SignatureData']),
      ];
      const res = await payrollAPI.updateStatutoryProfile(Object.fromEntries(keys.map(k => [k, form[k]])));
      apply(res.data);
      setError('');
      setSuccess(section === 'registrations' ? 'Registrations saved.' : 'Signatories saved.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading…" />;

  const input = (f: Field) => (
    <div key={f.key} className="field" style={f.wide ? { gridColumn: '1 / -1' } : undefined}>
      <label>{f.label}</label>
      <input className="input" type={f.type || 'text'} placeholder={f.placeholder}
        value={form[f.key] || ''}
        onChange={e => set(f.key, f.upper ? e.target.value.toUpperCase() : e.target.value)} />
      {f.key === 'gstNumber' && gst && form.gstNumber === savedGst && (
        <span className="hint">State code {gst.stateCode}{gst.state ? ` — ${gst.state}` : ''} · PAN {gst.pan}</span>
      )}
    </div>
  );

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} />
      {section === 'registrations' && gst?.notes?.length > 0 && (
        <div className="alert alert-warning" style={{ alignItems: 'flex-start' }}>
          <span>⚠</span>
          <span>{gst.notes.join(' ')} Check the GST number, the company PAN and the company's state.</span>
        </div>
      )}

      <form onSubmit={handleSave}>
        {groups.map((g, i) => (
          <div key={g.title} className="card card-pad mb-24">
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>{g.title}</h3>
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>{g.hint}</p>
            <div className="form-grid">
              {g.fields.map(input)}
              {section === 'registrations' && i === 0 && (
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
              {section === 'signatories' && g.title === 'Form 16 signatory' && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Signature</label>
                  <ImageUpload noun="signature" value={form.form16SignatureData || ''}
                    onChange={data => set('form16SignatureData', data)} max={600} maxChars={380000} width={200} height={72} />
                  <span className="hint">Printed above the signature line of Form 16 and Form 12BA. Leave it out to sign each certificate by hand.</span>
                </div>
              )}
            </div>
          </div>
        ))}

        <div className="form-actions" style={{ justifyContent: 'flex-start', marginBottom: 24 }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </>
  );
}
