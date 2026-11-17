import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert, SuccessAlert } from '../../components/ui';
import { Button } from '../../components/Button';
import PayslipFilesCard from './PayslipFilesCard';

// What happens on finalizing a run, and the ledger accounts of the
// payroll journal voucher.
export default function PayoutSettingsTab() {
  const [form, setForm] = useState<any>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [ledgers, setLedgers] = useState<Record<string, string>>({});
  const [journal, setJournal] = useState<any>({ jvSplits: [], ledgerOverrides: [], ledgerGroups: {} });
  const [override, setOverride] = useState({ groupName: '', key: '', ledgerName: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getPayoutSettings();
      setForm(res.data.settings);
      setAccounts(res.data.accounts);
      setLedgers(Object.fromEntries(res.data.accounts.map((a: any) => [a.key, a.ledgerName])));
      setJournal({ jvSplits: res.data.jvSplits, ledgerOverrides: res.data.ledgerOverrides, ledgerGroups: res.data.ledgerGroups });
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
  const splitBy: string = form.jvSplitBy || '';
  const groupWord = splitBy === 'LOCATION' ? 'work location' : 'department';
  const overrides = journal.ledgerOverrides.filter((o: any) => o.dimension === splitBy);
  const accountLabel = (key: string) => accounts.find(a => a.key === key)?.label || key;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} />

      <form onSubmit={e => { e.preventDefault(); save('settings', () => payrollAPI.updatePayoutSettings({ autoReleaseOnFinalize: form.autoReleaseOnFinalize, autoCreateNextRun: form.autoCreateNextRun }), 'Payout settings saved.'); }}>
        <div className="card card-pad mb-24">
          <h3 className="ps-group-title">Salary account</h3>
          <p className="text-sm-muted">
            The accounts salaries are paid from are kept with the company's other details, in{' '}
            <Link to="/organization?tab=bank">Company settings → Bank accounts</Link>. The account picked for a
            payment batch is printed on its bank transfer advice.
          </p>
        </div>

        <div className="card card-pad mb-24">
          <h3 className="ps-group-title">When a run is finalized</h3>
          <p className="text-sm-muted mb-14">Both are off unless you turn them on.</p>
          <div className="stack">
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

        <div className="form-actions ps-actions-start mb-24">
          <Button type="submit" variant="accent" loading={saving === 'settings'}>
            {saving === 'settings' ? 'Saving…' : 'Save payout settings'}
          </Button>
        </div>
      </form>

      <PayslipFilesCard />

      <div className="card mb-24">
        <div className="card-header">
          <div>
            <h3>Journal voucher ledgers</h3>
            <span className="text-sm-muted">
              The ledger each amount posts to in the month's payroll journal voucher. Type the names exactly as they
              are in your accounting software; leave one blank to use the default. Amounts sharing a ledger are added together.
            </span>
          </div>
        </div>
        <div className="cluster ps-jv-split">
          <label htmlFor="jv-split" className="ps-label-inline">Prepare the voucher as</label>
          <select id="jv-split" className="select ps-w-auto" value={splitBy}
            onChange={e => save('split', () => payrollAPI.updatePayoutSettings({ jvSplitBy: e.target.value }), 'Journal voucher layout saved.')}>
            {journal.jvSplits.map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {splitBy && (
            <span className="text-sm-muted">
              Each {groupWord} gets its own balanced voucher, in the report and in the file. Employees with no {groupWord} are grouped as “Not assigned”.
            </span>
          )}
        </div>
        {[['DEBIT', 'Debit — expenses'], ['CREDIT', 'Credit — payables and recoveries']].map(([value, title]) => (
          <div key={value} className="table-wrap">
            <table className="table">
              <thead><tr><th className="ps-col-40">{title}</th><th>Ledger account</th></tr></thead>
              <tbody>
                {side(value).map(a => (
                  <tr key={a.key}>
                    <td>{a.label}</td>
                    <td>
                      <input className="input ps-max-360" aria-label={`Ledger for ${a.label}`} placeholder={a.defaultLedger}
                        value={ledgers[a.key] || ''} onChange={e => setLedgers({ ...ledgers, [a.key]: e.target.value })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
        <div className="ps-card-foot">
          <Button loading={saving === 'ledgers'}
            onClick={() => save('ledgers', () => payrollAPI.updateLedgerMapping(ledgers), 'Ledgers saved.')}>
            {saving === 'ledgers' ? 'Saving…' : 'Save ledgers'}
          </Button>
        </div>
      </div>

      {splitBy && (
        <div className="card mb-24">
          <div className="card-header">
            <div>
              <h3>Ledgers of a {groupWord}</h3>
              <span className="text-sm-muted">
                Where a {groupWord} posts an amount to a ledger of its own. Anything not listed here uses the ledger above.
              </span>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{splitBy === 'LOCATION' ? 'Work location' : 'Department'}</th><th>Amount</th><th>Ledger account</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {overrides.map((o: any) => (
                  <tr key={`${o.groupName}|${o.key}`}>
                    <td>{o.groupName}</td><td>{accountLabel(o.key)}</td><td className="ps-strong">{o.ledgerName}</td>
                    <td>
                      <div className="row-actions">
                        <Button variant="danger" size="sm"
                          onClick={() => save('override', () => payrollAPI.updateLedgerOverride({ dimension: splitBy, groupName: o.groupName, key: o.key, ledgerName: '' }), 'Ledger removed.')}>
                          Remove
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>
                    <select className="select" aria-label={splitBy === 'LOCATION' ? 'Work location' : 'Department'} value={override.groupName}
                      onChange={e => setOverride({ ...override, groupName: e.target.value })}>
                      <option value="">Pick…</option>
                      {(journal.ledgerGroups[splitBy] || []).map((g: string) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </td>
                  <td>
                    <select className="select" aria-label="Amount" value={override.key} onChange={e => setOverride({ ...override, key: e.target.value })}>
                      <option value="">Pick…</option>
                      {accounts.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <input className="input" aria-label="Ledger account" placeholder="Ledger name in your accounts" value={override.ledgerName}
                      onChange={e => setOverride({ ...override, ledgerName: e.target.value })} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <Button size="sm" icon="plus"
                        disabled={saving === 'override' || !override.groupName || !override.key || !override.ledgerName.trim()}
                        onClick={() => save('override', async () => {
                          await payrollAPI.updateLedgerOverride({ dimension: splitBy, ...override });
                          setOverride({ groupName: '', key: '', ledgerName: '' });
                        }, 'Ledger saved.')}>
                        Add
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
