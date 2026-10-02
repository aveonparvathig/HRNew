import { useState, useEffect, useCallback } from 'react';
import { mastersAPI } from '../../api/masters';
import { EmptyState, LoadingBlock, ErrorAlert, SuccessAlert, Modal } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';
import ListSelect from '../../components/ListSelect';

const EMPTY = { label: '', bankName: '', branch: '', accountNumber: '', ifsc: '', isDefault: false };

// The company's bank accounts. A salary batch is paid from one of them and
// the bank transfer advice is addressed to its bank.
export default function BankAccountsTab() {
  const [accounts, setAccounts] = useState<any[] | null>(null);
  const [form, setForm] = useState<any>(null); // account being added or edited
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await mastersAPI.getBankAccounts();
      setAccounts(res.data.accounts);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the bank accounts');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const act = async (fn: () => Promise<any>, message: string) => {
    setSaving(true);
    try {
      await fn();
      setSuccess(message);
      setError('');
      await fetchData();
    } catch (err: any) {
      setSuccess('');
      setError(err.response?.data?.error || 'Action failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (form.id) await mastersAPI.updateBankAccount(form.id, form);
      else await mastersAPI.createBankAccount(form);
      setForm(null);
      setFormError('');
      setSuccess(form.id ? 'Account saved.' : 'Account added.');
      await fetchData();
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Failed to save the account');
    } finally {
      setSaving(false);
    }
  };

  if (!accounts) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading accounts…" />;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <div className="card mb-24">
        <div className="card-header">
          <div>
            <h3>Company bank accounts</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              Salaries are paid from one of these. The default is offered first when a payment batch is made.
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY, isDefault: accounts.length === 0 }); setFormError(''); }}>+ Add Account</button>
        </div>
        {accounts.length === 0 ? (
          <EmptyState icon="🏦" title="No bank account yet"
            message="Add the account salaries are paid from. It is printed on the bank transfer advice." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Account</th><th>Bank</th><th>Branch</th><th>Account number</th><th>IFSC</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {accounts.map(a => (
                  <tr key={a.id}>
                    <td style={{ fontWeight: 600 }}>
                      {a.label || <span className="text-muted">—</span>}
                      {a.isDefault && <span className="badge badge-info" style={{ marginLeft: 8 }}>Default</span>}
                    </td>
                    <td>{a.bankName}</td>
                    <td>{a.branch || <span className="text-muted">—</span>}</td>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{a.accountNumber}</td>
                    <td>{a.ifsc || <span className="text-muted">—</span>}</td>
                    <td>
                      <span className={`badge ${a.isActive ? 'badge-success' : 'badge-neutral'}`}>{a.isActive ? 'In use' : 'Switched off'}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {a.isActive && !a.isDefault && (
                          <button className="btn btn-ghost btn-sm" disabled={saving}
                            onClick={() => act(() => mastersAPI.updateBankAccount(a.id, { isDefault: true }), 'Default account changed.')}>
                            Make Default
                          </button>
                        )}
                        <button className="btn btn-secondary btn-sm" onClick={() => { setForm({ ...a }); setFormError(''); }}>Edit</button>
                        <button className="btn btn-ghost btn-sm" disabled={saving}
                          onClick={() => act(() => mastersAPI.updateBankAccount(a.id, { isActive: !a.isActive }), a.isActive ? 'Account switched off.' : 'Account switched on.')}>
                          {a.isActive ? 'Switch Off' : 'Switch On'}
                        </button>
                        {a.batchCount === 0 && (
                          <button className="btn btn-danger btn-sm" disabled={saving}
                            onClick={async () => await confirmDialog(`Delete the account ${a.label || a.bankName} ending ${a.accountNumber.slice(-4)}?`)
                              && act(() => mastersAPI.deleteBankAccount(a.id), 'Account deleted.')}>
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title={form?.id ? 'Edit Bank Account' : 'Add Bank Account'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={handleSave}>
            <ErrorAlert message={formError} onDismiss={() => setFormError('')} />
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Bank *</label>
                <ListSelect listType="BANK" required value={form.bankName} onChange={v => setForm({ ...form, bankName: v })} />
              </div>
              <div className="field">
                <label>Branch</label>
                <input className="input" value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })} />
              </div>
              <div className="field">
                <label>Account number *</label>
                <input className="input" required value={form.accountNumber}
                  onChange={e => setForm({ ...form, accountNumber: e.target.value })} />
              </div>
              <div className="field">
                <label>IFSC</label>
                <input className="input" placeholder="HDFC0001234" value={form.ifsc} maxLength={11}
                  onChange={e => setForm({ ...form, ifsc: e.target.value.toUpperCase() })} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Called</label>
                <input className="input" placeholder="e.g. Salary account" value={form.label}
                  onChange={e => setForm({ ...form, label: e.target.value })} />
                <span className="hint">A name for the account in-house, shown when picking it for a payment batch.</span>
              </div>
            </div>
            <label className="checkbox-field" style={{ marginBottom: 14 }}>
              <input type="checkbox" checked={Boolean(form.isDefault)} disabled={Boolean(form.id) && form.isDefault}
                onChange={e => setForm({ ...form, isDefault: e.target.checked })} />
              Default account for salary payments
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Account'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
