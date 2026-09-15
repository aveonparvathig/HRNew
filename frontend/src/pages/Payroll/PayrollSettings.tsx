import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, ErrorAlert } from '../../components/ui';

const GROUPS: { title: string; hint: string; fields: [string, string, string][] }[] = [
  {
    title: 'Salary split',
    hint: 'How the monthly package divides into components. Basic is % of package; the rest are % of Basic.',
    fields: [
      ['basicPercentOfPackage', 'Basic — % of package', '%'],
      ['daPercentOfBasic', 'DA — % of basic', '%'],
      ['hraPercentOfBasic', 'HRA — % of basic', '%'],
      ['transportPercentOfBasic', 'Transport — % of basic', '%'],
      ['foodPercentOfBasic', 'Food — % of basic', '%'],
    ],
  },
  {
    title: 'ESI',
    hint: 'Applied only to employees flagged ESI-eligible (a sticky per-employee decision).',
    fields: [
      ['esiEmployeePercent', 'Employee share', '%'],
      ['esiEmployerPercent', 'Employer share', '%'],
      ['esiWageCeiling', 'Wage ceiling', '₹'],
    ],
  },
  {
    title: 'Provident Fund',
    hint: 'PF wage base = (Basic + DA) × wage factor, capped. Applied only to PF-enrolled employees.',
    fields: [
      ['pfEmployeePercent', 'Employee share', '%'],
      ['pfEmployerPercent', 'Employer share', '%'],
      ['pfWageFactor', 'Wage factor', '%'],
      ['pfWageCap', 'Wage cap', '₹'],
    ],
  },
];

export default function PayrollSettings() {
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    payrollAPI.getSettings()
      .then(res => setForm(res.data))
      .catch(() => setError('Failed to load settings'));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess('');
    try {
      const res = await payrollAPI.updateSettings(form);
      setForm(res.data);
      setError('');
      setSuccess('Settings saved. Recalculate any open draft run to apply them.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <LoadingBlock label="Loading settings…" />;

  return (
    <>
      <div className="breadcrumb">
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <span>Settings</span>
      </div>

      <PageHeader
        title="Payroll Settings"
        subtitle="Org-level salary split and statutory rates. Defaults reproduce the source salary sheet exactly."
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {success && <div className="alert alert-success"><span>✓</span>{success}</div>}

      <form onSubmit={handleSave}>
        {GROUPS.map(g => (
          <div key={g.title} className="card card-pad mb-24">
            <h3 style={{ fontSize: 15, marginBottom: 4 }}>{g.title}</h3>
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>{g.hint}</p>
            <div className="form-grid">
              {g.fields.map(([key, label, unit]) => (
                <div key={key} className="field">
                  <label>{label}</label>
                  <div className="input-unit"><span className="unit">{unit}</span>
                    <input className="input" type="number" min={0} step="0.01"
                      value={form[key]}
                      onChange={e => setForm({ ...form, [key]: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
            {g.title === 'Provident Fund' && (
              <label className="checkbox-field" style={{ marginTop: 14 }}>
                <input type="checkbox" checked={form.pfEmployerMatchesEmployee}
                  onChange={e => setForm({ ...form, pfEmployerMatchesEmployee: e.target.checked })} />
                Employer PF matches the employee share exactly
              </label>
            )}
          </div>
        ))}

        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </>
  );
}
