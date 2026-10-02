import { useState, useEffect, useCallback } from 'react';
import { mastersAPI, forgetLists } from '../../api/masters';
import { EmptyState, LoadingBlock, ErrorAlert, SuccessAlert, Modal } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';

// The company's value lists: what the pickers on forms offer. Renaming a
// value renames it on the records that hold it; renaming it to a value
// that already exists merges the two.
export default function ListsTab() {
  const [lists, setLists] = useState<any[] | null>(null);
  const [type, setType] = useState('');
  const [draft, setDraft] = useState('');
  const [rename, setRename] = useState<any>(null); // { id, from, label }
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      forgetLists();
      const res = await mastersAPI.getLists();
      setLists(res.data.lists);
      setType(t => t || res.data.lists[0]?.type || '');
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the lists');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const act = async (fn: () => Promise<any>, message?: string) => {
    setSaving(true);
    try {
      const res = await fn();
      setSuccess(message || res?.data?.message || '');
      setError('');
      await fetchData();
      return true;
    } catch (err: any) {
      setSuccess('');
      setError(err.response?.data?.error || 'Action failed');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    if (await act(() => mastersAPI.addListValue(type, draft), `"${draft.trim()}" added.`)) setDraft('');
  };

  // A rename that lands on an existing value is offered as a merge
  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await mastersAPI.updateListValue(rename.id, { label: rename.label });
      setSuccess(res.data.message);
      setError('');
      setRename(null);
      await fetchData();
    } catch (err: any) {
      if (err.response?.status === 409) {
        const merge = await confirmDialog({
          title: `Merge "${rename.from}" into the existing value?`,
          message: `${err.response.data.error} Every record with "${rename.from}" moves to it, and "${rename.from}" is removed from the list. This cannot be undone.`,
          confirmLabel: 'Merge',
        });
        if (merge && await act(() => mastersAPI.updateListValue(rename.id, { label: rename.label, merge: true }))) setRename(null);
      } else {
        setError(err.response?.data?.error || 'Could not rename the value');
        setRename(null);
      }
    } finally {
      setSaving(false);
    }
  };

  if (!lists) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading lists…" />;

  const current = lists.find(l => l.type === type);

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <div className="chip-row mb-16">
        {lists.map(l => (
          <button key={l.type} className={`chip ${l.type === type ? 'active' : ''}`} onClick={() => { setType(l.type); setDraft(''); }}>
            {l.label} <span style={{ opacity: 0.7 }}>· {l.values.length}</span>
          </button>
        ))}
      </div>

      {current && (
        <div className="card mb-24">
          <div className="card-header">
            <div>
              <h3>{current.label}</h3>
              <span className="text-muted" style={{ fontSize: 12.5 }}>Picked on: {current.usedFor}.</span>
            </div>
            <form onSubmit={handleAdd} style={{ display: 'flex', gap: 8 }}>
              <input className="input" style={{ width: 220 }} placeholder={`New ${current.label.toLowerCase()}`}
                value={draft} onChange={e => setDraft(e.target.value)} />
              <button type="submit" className="btn btn-primary" disabled={saving || !draft.trim()}>Add</button>
            </form>
          </div>
          {current.values.length === 0 ? (
            <EmptyState icon="☰" title="Nothing in this list yet" message="Add the first value above. Values typed on forms are added here too." />
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Value</th><th className="num">People</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {current.values.map((v: any) => (
                    <tr key={v.id}>
                      <td style={{ fontWeight: 600 }}>{v.label}</td>
                      <td className="num">{v.inUse || <span className="text-muted">—</span>}</td>
                      <td>
                        <span className={`badge ${v.isActive ? 'badge-success' : 'badge-neutral'}`}>{v.isActive ? 'Offered' : 'Switched off'}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => setRename({ id: v.id, from: v.label, label: v.label })}>Rename</button>
                          <button className="btn btn-ghost btn-sm" disabled={saving}
                            title={v.isActive ? 'Stop offering this value on forms; records keep it' : 'Offer this value on forms again'}
                            onClick={() => act(() => mastersAPI.updateListValue(v.id, { isActive: !v.isActive }), v.isActive ? `"${v.label}" is no longer offered.` : `"${v.label}" is offered again.`)}>
                            {v.isActive ? 'Switch Off' : 'Switch On'}
                          </button>
                          {v.inUse === 0 && (
                            <button className="btn btn-danger btn-sm" disabled={saving}
                              onClick={async () => await confirmDialog(`Delete "${v.label}" from the ${current.label.toLowerCase()} list?`)
                                && act(() => mastersAPI.deleteListValue(v.id))}>
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
      )}

      <Modal title="Rename" open={Boolean(rename)} onClose={() => setRename(null)}>
        {rename && (
          <form onSubmit={handleRename}>
            <div className="field" style={{ marginBottom: 12 }}>
              <label>{current?.label}</label>
              <input className="input" required autoFocus value={rename.label}
                onChange={e => setRename({ ...rename, label: e.target.value })} />
            </div>
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              Records holding “{rename.from}” take the new name. To fold two spellings into one, rename the wrong one to the right one.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setRename(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving || !rename.label.trim()}>Rename</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
