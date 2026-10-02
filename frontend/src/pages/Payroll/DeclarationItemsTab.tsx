import { useState, useEffect, useCallback } from 'react';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert, Modal, StatusBadge } from '../../components/ui';
import { formatINR } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';

const EMPTY = { name: '', section: '', sectionNew: '', group: 'OTHER', maxAmount: '', deductPercent: 100, proofRequired: false, isActive: true };

// The investments and expenses an employee can declare for income tax.
export default function DeclarationItemsTab() {
  const [items, setItems] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<any>(null); // item being edited, or {} for new
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getDeclarationItems();
      setItems(res.data.items);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load declaration items');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const open = (item?: any) => {
    setForm(item
      ? {
        name: item.name, section: item.section, sectionNew: item.sectionNew, group: item.group,
        maxAmount: item.maxAmount ?? '', deductPercent: item.deductPercent, proofRequired: item.proofRequired, isActive: item.isActive,
      }
      : EMPTY);
    setEditing(item || {});
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing.id) await payrollAPI.updateDeclarationItem(editing.id, form);
      else await payrollAPI.createDeclarationItem(form);
      setEditing(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save the item');
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: any) => {
    if (!await confirmDialog(`Delete "${item.name}"?`)) return;
    try {
      await payrollAPI.deleteDeclarationItem(item.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete the item');
    }
  };

  if (!items) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading declaration items…" />;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="alert alert-warning">
        <span>ⓘ</span>
        <span>
          This starter list uses the commonly applied limits. Check the sections and limits against the
          current law with your tax adviser before employees declare. Rent and housing-loan interest are
          on the declaration itself and are not listed here.
        </span>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Declaration items</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              What employees can declare under the old regime. Items in the Section 80C pool share one
              overall limit with PF; the others each have their own.
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => open()}>+ Add Item</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Section</th><th>Item</th><th>Counts in</th><th className="num">Limit</th>
                <th className="num">Deductible</th><th className="num">Declared by</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <tr key={i.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {i.section}
                    {i.sectionNew && <div className="text-muted" style={{ fontSize: 11 }}>new Act {i.sectionNew}</div>}
                  </td>
                  <td style={{ fontWeight: 600 }}>{i.name}</td>
                  <td>{i.group === 'SECTION_80C' ? 'Section 80C pool' : 'Own limit'}</td>
                  <td className="num">{i.maxAmount == null ? 'No limit' : formatINR(i.maxAmount)}</td>
                  <td className="num">
                    {i.deductPercent}%
                    {i.proofRequired && <div className="text-muted" style={{ fontSize: 11.5 }}>proof needed</div>}
                  </td>
                  <td className="num">{i.usedCount || '—'}</td>
                  <td><StatusBadge status={i.isActive ? 'active' : 'inactive'} /></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => open(i)}>Edit</button>
                      {i.usedCount === 0 && (
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(i)}>Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal title={editing?.id ? 'Edit Declaration Item' : 'Add Declaration Item'} open={Boolean(editing)}
        onClose={() => setEditing(null)}>
        <form onSubmit={handleSave}>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Name *</label>
              <input className="input" required placeholder="e.g. Medical insurance premium" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>Section *</label>
              <input className="input" required placeholder="e.g. 80D" value={form.section}
                onChange={e => setForm({ ...form, section: e.target.value })} />
            </div>
            <div className="field">
              <label>Section in the new Act</label>
              <input className="input" value={form.sectionNew}
                onChange={e => setForm({ ...form, sectionNew: e.target.value })} />
              <span className="hint">Income-tax Act, 2025. Printed beside the old number.</span>
            </div>
            <div className="field">
              <label>Counts in *</label>
              <select className="select" value={form.group} onChange={e => setForm({ ...form, group: e.target.value })}>
                <option value="SECTION_80C">Section 80C pool (shared limit, with PF)</option>
                <option value="OTHER">Its own limit</option>
              </select>
            </div>
            <div className="field">
              <label>Limit</label>
              <div className="input-unit"><span className="unit">₹</span>
                <input className="input" type="number" min={0} step="0.01" value={form.maxAmount}
                  onChange={e => setForm({ ...form, maxAmount: e.target.value })} />
              </div>
              <span className="hint">Leave empty for no limit.</span>
            </div>
            <div className="field">
              <label>Deductible share</label>
              <div className="input-unit"><span className="unit">%</span>
                <input className="input" type="number" min={1} max={100} step="1" value={form.deductPercent}
                  onChange={e => setForm({ ...form, deductPercent: e.target.value })} />
              </div>
              <span className="hint">100 unless only part of the amount is deductible, as with some donations.</span>
            </div>
          </div>
          <label className="checkbox-field" style={{ marginBottom: 14, alignItems: 'flex-start' }}>
            <input type="checkbox" style={{ marginTop: 2 }} checked={Boolean(form.proofRequired)}
              onChange={e => setForm({ ...form, proofRequired: e.target.checked })} />
            <span>
              A proof is required
              <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>
                While proof submission is open, an employee cannot save an amount here without a proof attached, and HR cannot approve one.
              </span>
            </span>
          </label>
          {editing?.id && (
            <label className="checkbox-field" style={{ marginBottom: 14 }}>
              <input type="checkbox" checked={form.isActive}
                onChange={e => setForm({ ...form, isActive: e.target.checked })} />
              Active (offered on new declarations)
            </label>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Item'}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
