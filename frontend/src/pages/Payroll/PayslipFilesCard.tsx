import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { ErrorAlert, SuccessAlert } from '../../components/ui';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';

// How payslips leave the system as files: their password, their file
// name, and the address they are mailed to.
export default function PayslipFilesCard() {
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    payrollAPI.getPayslipFileSettings()
      .then(res => { setData(res.data); setForm(res.data.settings); })
      .catch(err => setError(err.response?.data?.error || 'Failed to load the payslip file settings'));
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess('');
    try {
      const res = await payrollAPI.updatePayslipFileSettings(form);
      setForm(res.data.settings);
      setError('');
      setSuccess('Payslip file settings saved.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <ErrorAlert message={error} />;

  const { employees, engine, mail } = data;
  // Employees the chosen password would leave without a payslip file
  const lacking = form.payslipPdfPassword === 'PAN' ? employees.withoutPan
    : form.payslipPdfPassword === 'DOB' ? employees.withoutBirthDate : 0;
  const example = [form.payslipFilePrefix || 'Payslip',
    form.payslipFileContext === 'NAME' ? 'Arun-Kumar' : form.payslipFileContext === 'EMPNO_NAME' ? 'EMP-0002_Arun-Kumar' : 'EMP-0002',
    '2026-06'].join('_') + '.pdf';

  return (
    <form className="card card-pad mb-24" onSubmit={save}>
      <h3 className="pr-card-title">Payslip files and email</h3>
      <p className="text-sm-muted pr-mb-16">
        For payslips downloaded as PDF and sent by email. Email itself is set up in{' '}
        <Link to="/organization?tab=email">Company Settings → Email</Link>
        {mail.enabled && !mail.problem ? ' and is on.' : ' and is not on yet.'}
      </p>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} />
      {!engine.pdf && (
        <div className="alert alert-warning"><Icon name="alert" size={16} className="pr-alert-icon" /><span>PDF files cannot be made on this server. Printing to PDF from the browser still works.</span></div>
      )}

      <div className="form-grid mb-14">
        <div className="field">
          <label htmlFor="psf-password">Password on a payslip file</label>
          <select id="psf-password" className="select" value={form.payslipPdfPassword} onChange={e => setForm({ ...form, payslipPdfPassword: e.target.value })}>
            {data.passwordModes.map((m: any) => <option key={m.value} value={m.value} disabled={m.value !== 'NONE' && !engine.password}>{m.label}</option>)}
          </select>
          <span className={`hint${lacking ? ' pr-hint-warn' : ''}`}>
            {form.payslipPdfPassword === 'NONE' ? 'Anyone holding the file can open it.'
              : lacking ? `${lacking} of ${employees.total} current employees have no ${form.payslipPdfPassword === 'PAN' ? 'valid PAN' : 'date of birth'} on record. No file is made or mailed for them until it is added.`
              : 'The mail tells the employee how the password is made up, never the password itself.'}
          </span>
        </div>
        <div className="field">
          <label htmlFor="psf-email-to">Email payslips to</label>
          <select id="psf-email-to" className="select" value={form.payslipEmailTo} onChange={e => setForm({ ...form, payslipEmailTo: e.target.value })}>
            {data.emailTargets.map((t: any) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <span className="hint">
            The other address is used when this one is blank.
            {employees.withoutAnyEmail > 0 && ` ${employees.withoutAnyEmail} of ${employees.total} current employees have no address at all.`}
          </span>
        </div>
        <div className="field">
          <label htmlFor="psf-release-mail">When payslips are released, mail employees</label>
          <select id="psf-release-mail" className="select" value={form.releaseMail || 'NONE'} onChange={e => setForm({ ...form, releaseMail: e.target.value })}>
            {(data.releaseMails || []).map((m: any) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <span className="hint">
            {data.mail?.enabled ? 'Sent one after another in the background; the mail log shows each.' : 'Nothing is sent while email is switched off in Company Settings → Email.'}
          </span>
        </div>
      </div>
      <div className="form-grid mb-14">
        <div className="field">
          <label htmlFor="psf-prefix">Payslip file name starts with</label>
          <input id="psf-prefix" className="input" maxLength={30} value={form.payslipFilePrefix} onChange={e => setForm({ ...form, payslipFilePrefix: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="psf-context">Then the employee's</label>
          <select id="psf-context" className="select" value={form.payslipFileContext} onChange={e => setForm({ ...form, payslipFileContext: e.target.value })}>
            {data.fileContexts.map((c: any) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <span className="hint">For example {example}</span>
        </div>
        <div className="field">
          <label htmlFor="psf-jv-prefix">Journal voucher file name starts with</label>
          <input id="psf-jv-prefix" className="input" maxLength={30} value={form.jvFilePrefix} onChange={e => setForm({ ...form, jvFilePrefix: e.target.value })} />
          <span className="hint">For example {form.jvFilePrefix || 'JV'}_2026-06.xlsx</span>
        </div>
      </div>
      <Button type="submit" variant="primary" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
    </form>
  );
}
