import { useState, useEffect, useCallback } from 'react';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert, SuccessAlert } from '../../components/ui';

const ACCOUNT: [string, string, string][] = [
  ['payoutBankName', 'Bank', 'e.g. HDFC Bank'],
  ['payoutBranch', 'Branch', ''],
  ['payoutAccountNumber', 'Account number', ''],
  ['payoutIfsc', 'IFSC', ''],
];

// The account salaries are paid from, what happens on finalizing a run,
// and the ledger accounts of the payroll journal voucher.
export default function PayoutSettingsTab() {
  const [form, setForm] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getPayoutSettings();
      setForm(res.data.settings);
      setAccounts(res.data.accounts);
      setLedgers(Object.fromEntries(res.data.accounts.map((a: any) => [a.key, a.ledgerName])));
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load payout settings');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const save = async (key: string, call: () => Promise<any>, message: string) => {
    setSaving(key);
    setSuccess('');
    try {
      await call();
      setError('');
      setSuccess(message);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving('');
    }
  };

  if (!form) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading payout settings…" />;

  const side = (value: string) => accounts.filter(a => a.side === value);

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} />

      <form onSubmit={e => { e.preventDefault(); save('settings', () => payrollAPI.updatePayoutSettings(form), 'Payout settings saved.'); }}>
        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Salary account</h3>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            The company account salaries are paid from. It is printed on the bank transfer advice.
          </p>
          <div className="form-grid">
            {ACCOUNT.map(([key, label, placeholder]) => (
              <div key={key} className="field">
                <label>{label}</label>
                <input className="input" placeholder={placeholder} value={form[key]}
                  onChange={e => setForm({ ...form, [key]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>

        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>When a run is finalized</h3>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>Both are off unless you turn them on.</p>
          <div style={{ display: 'grid', gap: 12 }}>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.autoReleaseOnFinalize}
                onChange={e => setForm({ ...form, autoReleaseOnFinalize: e.target.checked })} />
              Release the payslips to employees straight away
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={form.autoCreateNextRun}
                onChange={e => setForm({ ...form, autoCreateNextRun: e.target.checked })} />
              Open next month's run as a draft
            </label>
          </div>
        </div>

        <div className="form-actions" style={{ justifyContent: 'flex-start', marginBottom: 24 }}>
          <button type="submit" className="btn btn-primary" disabled={saving === 'settings'}>
            {saving === 'settings' ? 'Saving…' : 'Save Payout Settings'}
          </button>
        </div>
      </form>

      <div className="card mb-24">
        <div className="card-header">
          <div>
            <h3>Journal voucher ledgers</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              The ledger each amount posts to in the month's payroll journal voucher. Type the names exactly as they
              are in your accounting software; leave one blank to use the default. Amounts sharing a ledger are added together.
            </span>
          </div>
        </div>
        {[['DEBIT', 'Debit — expenses'], ['CREDIT', 'Credit — payables and recoveries']].map(([value, title]) => (
          <div key={value} className="table-wrap">
            <table className="table">
              <thead><tr><th style={{ width: '40%' }}>{title}</th><th>Ledger account</th></tr></thead>
              <tbody>
                {side(value).map(a => (
                  <tr key={a.key}>
                    <td>{a.label}</td>
                    <td>
                      <input className="input" style={{ maxWidth: 360 }} placeholder={a.defaultLedger}
                        value={ledgers[a.key] || ''} onChange={e => setLedgers({ ...ledgers, [a.key]: e.target.value })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div style={{ padding: '14px 22px' }}>
          <button type="button" className="btn btn-primary" disabled={saving === 'ledgers'}
            onClick={() => save('ledgers', () => payrollAPI.updateLedgerMapping(ledgers), 'Ledgers saved.')}>
            {saving === 'ledgers' ? 'Saving…' : 'Save Ledgers'}
          </button>
        </div>
      </div>
    </>
  );
}
