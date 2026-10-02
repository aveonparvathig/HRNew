import { useState, useEffect, useCallback } from 'react';
import { orgAPI } from '../../api/org';
import { PageHeader, EmptyState, LoadingBlock, ErrorAlert, SuccessAlert, Pagination } from '../../components/ui';

// The rules, in the order they are read on the screen. `off` is what a
// zero means for a rule that can be switched off.
const RULES: { key: string; label: string; unit: string; hint: string; off?: string }[] = [
  { key: 'minLength', label: 'Minimum password length', unit: 'characters', hint: 'Applies the next time a password is set or changed.' },
  { key: 'lockoutAttempts', label: 'Lock the account after', unit: 'wrong passwords in a row', hint: 'The count starts again after a successful sign-in.', off: 'Accounts never lock' },
  { key: 'lockoutMinutes', label: 'Keep it locked for', unit: 'minutes', hint: 'A Super Admin is locked for 30 minutes at most, so someone can always unlock the others.', off: 'Until an admin unlocks it' },
  { key: 'expiryDays', label: 'A password must be changed every', unit: 'days', hint: 'Counted from the day each password was set. Existing passwords count from the day this rule was installed.', off: 'Passwords never expire' },
  { key: 'expiryReminderDays', label: 'Remind before it expires', unit: 'days ahead', hint: 'Shown at sign-in.' },
  { key: 'historyCount', label: 'Do not allow reuse of the last', unit: 'passwords', hint: 'Only passwords changed from now on are remembered.', off: 'Old passwords may be reused' },
  { key: 'tempPasswordDays', label: 'A temporary password works for', unit: 'days', hint: 'For passwords set by an admin: new logins and resets. After that the admin must set another.', off: 'No time limit' },
];

const RESULT_TONES: Record<string, string> = {
  SUCCESS: 'badge-success', WRONG_PASSWORD: 'badge-warning', LOCKED: 'badge-danger',
  DISABLED: 'badge-neutral', TEMP_EXPIRED: 'badge-neutral',
};

const PAGE_SIZE = 25;

const dateTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// Sign-in rules for every login of the organization, and the record of
// sign-in attempts.
export default function Security() {
  const [form, setForm] = useState<any>(null);
  const [limits, setLimits] = useState<Record<string, [number, number]>>({});
  const [history, setHistory] = useState<any>(null);
  const [page, setPage] = useState(0);
  const [failedOnly, setFailedOnly] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    orgAPI.getSecurity()
      .then(res => { setForm(res.data.policy); setLimits(res.data.limits); })
      .catch(err => setError(err.response?.data?.error || 'Failed to load the sign-in rules'));
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await orgAPI.getLoginHistory({ limit: PAGE_SIZE, offset: page * PAGE_SIZE, failed: failedOnly ? '1' : undefined });
      setHistory(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the sign-in history');
    }
  }, [page, failedOnly]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess('');
    try {
      const res = await orgAPI.updateSecurity(form);
      setForm(res.data.policy);
      setError('');
      setSuccess('Sign-in rules saved.');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save the sign-in rules');
    } finally {
      setSaving(false);
    }
  };

  if (!form) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading…" />;

  return (
    <>
      <PageHeader title="Security" subtitle="Rules for signing in, and who has signed in." />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <form className="card card-pad mb-24" onSubmit={handleSave}>
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Sign-in rules</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
          These apply to every login of the organization. A rule set to 0 is switched off.
        </p>
        <div className="rule-list">
          {RULES.map(r => {
            const value = form[r.key];
            const disabled = (r.key === 'lockoutMinutes' && Number(form.lockoutAttempts) === 0)
              || (r.key === 'expiryReminderDays' && Number(form.expiryDays) === 0);
            return (
              <div key={r.key} className="rule-row">
                <label htmlFor={r.key}>{r.label}</label>
                <div className="rule-input">
                  <input id={r.key} className="input" type="number" disabled={disabled}
                    min={limits[r.key]?.[0]} max={limits[r.key]?.[1]} step={1} required
                    value={value} onChange={e => setForm({ ...form, [r.key]: e.target.value })} />
                  <span>{r.unit}</span>
                </div>
                <span className="hint">
                  {r.off && Number(value) === 0 && !disabled && <strong>{r.off}. </strong>}
                  {r.hint}
                </span>
              </div>
            );
          })}
        </div>
        <div className="form-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Rules'}</button>
        </div>
      </form>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Sign-in history</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              Every sign-in attempt on a login of this organization{history ? `, kept for ${history.keptDays} days` : ''}.
            </span>
          </div>
          <div className="segmented">
            {[[false, 'All'], [true, 'Refused or wrong']].map(([value, label]) => (
              <button key={String(value)} className={failedOnly === value ? 'active' : ''}
                onClick={() => { setFailedOnly(value as boolean); setPage(0); }}>{label as string}</button>
            ))}
          </div>
        </div>
        {!history ? <LoadingBlock label="Loading history…" /> : history.rows.length === 0 ? (
          <EmptyState icon="◷" title="Nothing recorded yet" message="Sign-ins are recorded from the day this page was installed." />
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>When</th><th>Login</th><th>Result</th><th>Network address</th><th>Browser</th></tr></thead>
                <tbody>
                  {history.rows.map((r: any) => (
                    <tr key={r.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>{dateTime(r.createdAt)}</td>
                      <td>{r.email}</td>
                      <td><span className={`badge ${RESULT_TONES[r.result] || 'badge-neutral'}`}>{r.resultLabel}</span></td>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>{r.ip || <span className="text-muted">—</span>}</td>
                      <td className="text-muted" style={{ fontSize: 12, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={r.userAgent}>{r.userAgent || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={history.total} onPageChange={setPage} />
          </>
        )}
      </div>
    </>
  );
}
