import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, ErrorAlert, BackButton,
} from '../../components/ui';
import StatutoryProfileTab from './StatutoryProfileTab';
import WorkLocationsTab from './WorkLocationsTab';
import PayComponentsTab from './PayComponentsTab';
import StatutoryPoliciesTab from './StatutoryPoliciesTab';
import IncomeTaxTab from './IncomeTaxTab';
import DeclarationItemsTab from './DeclarationItemsTab';
import PayoutSettingsTab from './PayoutSettingsTab';

const TABS = [
  { key: 'rates', label: 'Salary & statutory rates' },
  { key: 'components', label: 'Pay components' },
  { key: 'policies', label: 'PT & LWF' },
  { key: 'tax', label: 'Income tax' },
  { key: 'declarations', label: 'Declaration items' },
  { key: 'payout', label: 'Payout & journal' },
  { key: 'statutory', label: 'Statutory profile' },
  { key: 'locations', label: 'Work locations' },
];

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
    hint: 'By default ESI applies to employees flagged ESI-eligible, and the wage ceiling only drives the warnings on a payroll run.',
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
  {
    title: 'Loans',
    hint: 'A loan charged below the benchmark rate is a taxable benefit, unless everything lent to the employee is within the exempt limit. Leave the benchmark at 0 if you do not want it worked out.',
    fields: [
      ['loanBenchmarkRate', 'Benchmark interest rate', '%'],
      ['loanPerquisiteExemptLimit', 'Exempt up to', '₹'],
    ],
  },
  {
    title: 'Arrears and final settlement',
    hint: 'Leave encashment is on Basic + DA and notice pay or recovery on the monthly gross, both by the day. Gratuity is 15/26 of Basic + DA for each year of service.',
    fields: [
      ['lopReversalMonths', 'Loss of pay can be reversed for (months)', '#'],
      ['noticePeriodDays', 'Usual notice period (days)', '#'],
      ['settlementDayBasis', 'Days in a month for encashment and notice', '#'],
      ['gratuityMinYears', 'Service needed for gratuity (years)', '#'],
      ['gratuityCap', 'Gratuity limit', '₹'],
    ],
  },
  {
    title: 'PF return — pension, insurance and charges',
    hint: 'Used to split the employer share in the PF statement and ECR file, and to work out what is payable. None of this is deducted from pay.',
    fields: [
      ['epsPercent', 'Pension (EPS) share', '%'],
      ['epsWageCap', 'Pension wage cap', '₹'],
      ['edliPercent', 'Insurance (EDLI)', '%'],
      ['edliWageCap', 'Insurance wage cap', '₹'],
      ['pfAdminPercent', 'Administration charge', '%'],
      ['pfAdminMinimum', 'Administration charge minimum', '₹'],
    ],
  },
];

export default function PayrollSettings() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab')! : 'rates';

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <span>Settings</span>
      </div>

      <PageHeader
        title="Payroll Settings"
        subtitle="Salary split, statutory rates, company registrations and work locations."
      />

      <div className="tabs">
        {TABS.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setParams(t.key === 'rates' ? {} : { tab: t.key }, { replace: true })}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'rates' && <RatesTab />}
      {tab === 'components' && <PayComponentsTab />}
      {tab === 'policies' && <StatutoryPoliciesTab />}
      {tab === 'tax' && <IncomeTaxTab />}
      {tab === 'declarations' && <DeclarationItemsTab />}
      {tab === 'payout' && <PayoutSettingsTab />}
      {tab === 'statutory' && <StatutoryProfileTab />}
      {tab === 'locations' && <WorkLocationsTab />}
    </>
  );
}

function RatesTab() {
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
            {g.title === 'ESI' && (
              <>
                <label className="checkbox-field" style={{ marginTop: 14 }}>
                  <input type="checkbox" checked={form.esiAutoCoverage}
                    onChange={e => setForm({ ...form, esiAutoCoverage: e.target.checked })} />
                  Decide ESI automatically in new runs
                </label>
                <p className="text-muted" style={{ fontSize: 12.5, marginTop: 6 }}>
                  When on, a new run covers every employee whose full-month wage is within the ceiling, and keeps
                  them covered until the contribution period (April–September or October–March) ends, even after
                  a raise. The employee flag is then ignored; you can still change ESI on an individual payslip.
                </p>
              </>
            )}
            {g.title === 'Provident Fund' && (
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 14 }}>
                <label className="checkbox-field">
                  <input type="checkbox" checked={form.pfEmployerMatchesEmployee}
                    onChange={e => setForm({ ...form, pfEmployerMatchesEmployee: e.target.checked })} />
                  Employer PF matches the employee share exactly
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={form.pfRoundToRupee}
                    onChange={e => setForm({ ...form, pfRoundToRupee: e.target.checked })} />
                  Round PF to the nearest rupee
                </label>
              </div>
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
