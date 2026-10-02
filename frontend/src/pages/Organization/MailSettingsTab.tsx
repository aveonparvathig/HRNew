import { useState, useEffect, useCallback } from 'react';
import { orgAPI } from '../../api/org';
import { EmptyState, LoadingBlock, ErrorAlert, SuccessAlert, Pagination } from '../../components/ui';

const PAGE_SIZE = 15;
const dateTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// The mail server the system sends through, a test, and what was sent.
export default function MailSettingsTab() {
  const [form, setForm] = useState<any>(null);
  const [options, setOptions] = useState<any[]>([]);
  const [problem, setProblem] = useState('');
  const [testTo, setTestTo] = useState('');
  const [log, setLog] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState('');

  const apply = (data: any) => {
    setForm({ ...data.settings, password: '' });
    setOptions(data.securityOptions);
    setProblem(data.problem || '');
  };

  useEffect(() => {
    orgAPI.getMailSettings().then(res => apply(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load the email settings'));
  }, []);

  const fetchLog = useCallback(async () => {
    try {
      setLog((await orgAPI.getMailLog({ limit: PAGE_SIZE, offset: page * PAGE_SIZE })).data);
    } catch { /* the settings above still work */ }
  }, [page]);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('save');
    setSuccess('');
    try {
      const res = await orgAPI.updateMailSettings(form);
      apply(res.data);
      setError('');
      setSuccess(res.data.settings.enabled ? 'Email settings saved. Email is on.' : 'Email settings saved. Email is off: nothing is sent until you switch it on.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save the email settings');
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    setSuccess('');
    try {
      const res = await orgAPI.testMail(testTo);
      if (res.data.ok) { setError(''); setSuccess(`Test mail sent to ${testTo}. Check that it arrived.`); }
      else setError(`The test mail was not sent: ${res.data.error}.`);
      fetchLog();
    } catch (err: any) {
      setError(err.response?.data?.error || 'The test mail was not sent');
    } finally {
      setBusy('');
    }
  };

  if (!form) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading…" />;

  const set = (key: string, value: any) => setForm({ ...form, [key]: value });

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <form className="card card-pad mb-24" onSubmit={save}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Mail server</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
          Payslips are sent through your own mail service over SMTP: your mail host, Google Workspace, Microsoft 365
          or a sending service. Its help pages give the host, port and the user name and password to use here.
        </p>
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>Mail server (host)</label>
            <input className="input" placeholder="smtp.example.com" value={form.host} onChange={e => set('host', e.target.value)} />
          </div>
          <div className="field">
            <label>Port</label>
            <input className="input" type="number" min={1} max={65535} value={form.port} onChange={e => set('port', e.target.value)} />
          </div>
          <div className="field">
            <label>Connection security</label>
            <select className="select" value={form.security} onChange={e => set('security', e.target.value)}>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>User name</label>
            <input className="input" autoComplete="off" value={form.username} onChange={e => set('username', e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input className="input" type="password" autoComplete="new-password" value={form.password}
              placeholder={form.hasPassword ? 'Saved. Type a new one to change it' : ''}
              onChange={e => set('password', e.target.value)} />
            <span className="hint">Stored encrypted and never shown again. Many services want an app password here, not your sign-in password.</span>
          </div>
        </div>

        <h3 style={{ fontSize: 15, margin: '6px 0 12px' }}>Sender</h3>
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>From name</label>
            <input className="input" placeholder="e.g. Aveon HR" value={form.fromName} onChange={e => set('fromName', e.target.value)} />
          </div>
          <div className="field">
            <label>From address</label>
            <input className="input" type="email" placeholder="payroll@example.com" value={form.fromEmail} onChange={e => set('fromEmail', e.target.value)} />
            <span className="hint">An address the mail server lets this user send as.</span>
          </div>
          <div className="field">
            <label>Replies go to</label>
            <input className="input" type="email" placeholder="hr@example.com" value={form.replyTo} onChange={e => set('replyTo', e.target.value)} />
            <span className="hint">Leave blank for replies to reach the From address.</span>
          </div>
          <div className="field">
            <label>Sign-in address</label>
            <input className="input" type="url" placeholder="https://hr.example.com" value={form.appUrl || ''} onChange={e => set('appUrl', e.target.value)} />
            <span className="hint">Where employees sign in. Written into welcome mails and payslip notices.</span>
          </div>
        </div>

        <label className="checkbox-field" style={{ marginBottom: 10, alignItems: 'flex-start' }}>
          <input type="checkbox" style={{ marginTop: 2 }} checked={Boolean(form.welcomeMail)} onChange={e => set('welcomeMail', e.target.checked)} />
          <span>
            Mail a new login its sign-in address and temporary password
            <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>
              Sent when a login is added on the Team page or generated for employees. The password must be changed at first sign-in.
            </span>
          </span>
        </label>

        <label className="checkbox-field" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
          Email is on: the system may send mail
        </label>
        {problem && !form.enabled && <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>{problem}.</p>}

        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" disabled={busy === 'save'}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
      </form>

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Send a test</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          Uses the saved settings, whether email is on or off. Save first if you changed anything above.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input className="input" type="email" style={{ maxWidth: 320 }} placeholder="Send the test to" value={testTo}
            onChange={e => setTestTo(e.target.value)} />
          <button type="button" className="btn btn-secondary" disabled={busy === 'test' || !testTo.trim()} onClick={test}>
            {busy === 'test' ? 'Sending…' : 'Send Test Mail'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3>Mail sent</h3></div>
        {!log ? <LoadingBlock label="Loading…" /> : log.rows.length === 0 ? (
          <EmptyState icon="✉" title="Nothing sent yet" />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Result</th><th>By</th></tr></thead>
                <tbody>
                  {log.rows.map((r: any) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{dateTime(r.createdAt)}</td>
                      <td>{r.toEmail}{r.personName && <div className="text-muted" style={{ fontSize: 11.5 }}>{r.personName}</div>}</td>
                      <td>{r.subject}</td>
                      <td>
                        <span className={`badge ${r.status === 'SENT' ? 'badge-success' : 'badge-danger'}`}>{r.status === 'SENT' ? 'Sent' : 'Failed'}</span>
                        {r.error && <div style={{ fontSize: 11.5, color: 'var(--danger)' }}>{r.error}</div>}
                      </td>
                      <td className="text-muted">{r.sentBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={log.total} onPageChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
