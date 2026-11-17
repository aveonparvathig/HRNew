import { useState, useEffect, useCallback } from 'react';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert, Modal, StatusBadge } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';
import { Button } from '../../components/Button';

const EMPTY = { name: '', type: 'EARNING', taxable: true, isActive: true };

export default function PayComponentsTab() {
  const [components, setComponents] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<any>(null); // component being edited, or {} for new
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getComponents();
      setComponents(res.data.components);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load pay components');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const open = (component?: any) => {
    setForm(component
      ? { name: component.name, type: component.type, taxable: component.taxable, isActive: component.isActive }
      : EMPTY);
    setEditing(component || {});
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing.id) await payrollAPI.updateComponent(editing.id, form);
      else await payrollAPI.createComponent(form);
      setEditing(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save the component');
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (component: any) => {
    if (!await confirmDialog(`Delete the component "${component.name}"?`)) return;
    try {
      await payrollAPI.deleteComponent(component.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete the component');
    }
  };

  if (!components) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading components…" />;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Pay components</h3>
            <span className="text-sm-muted">
              Extra earnings and deductions you can add to any payslip in a draft run. Basic, DA, HRA,
              Transport, Food, ESI and PF come from the rates tab and are not listed here.
            </span>
          </div>
          <Button variant="accent" icon="plus" onClick={() => open()}>Add component</Button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Component</th><th>Type</th><th>Taxable</th><th className="num">On payslips</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
            </thead>
            <tbody>
              {components.map(c => (
                <tr key={c.id}>
                  <td className="ps-strong">{c.name}</td>
                  <td>
                    <span className={`badge ${c.type === 'EARNING' ? 'badge-success' : 'badge-warning'}`}>
                      {c.type === 'EARNING' ? 'Earning' : 'Deduction'}
                    </span>
                  </td>
                  <td>{c.type === 'EARNING' ? (c.taxable ? 'Yes' : 'No') : '—'}</td>
                  <td className="num">{c.usedCount}</td>
                  <td><StatusBadge status={c.isActive ? 'active' : 'inactive'} /></td>
                  <td>
                    <div className="row-actions">
                      <Button size="sm" onClick={() => open(c)}>Edit</Button>
                      {c.usedCount === 0 && (
                        <Button variant="danger" size="sm" onClick={() => handleDelete(c)}>Delete</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal title={editing?.id ? 'Edit component' : 'Add component'} open={Boolean(editing)}
        onClose={() => setEditing(null)}>
        <form onSubmit={handleSave}>
          <div className="form-grid mb-14">
            <div className="field">
              <label htmlFor="ps-comp-name">Name *</label>
              <input id="ps-comp-name" className="input" required placeholder="e.g. Shift allowance" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ps-comp-type">Type *</label>
              <select id="ps-comp-type" className="select" value={form.type} disabled={Boolean(editing?.id)}
                onChange={e => setForm({ ...form, type: e.target.value })}>
                <option value="EARNING">Earning — adds to gross</option>
                <option value="DEDUCTION">Deduction — reduces net pay</option>
              </select>
              {editing?.id && <span className="hint">The type cannot change once the component exists.</span>}
            </div>
          </div>
          <div className="cluster ps-check-row-b">
            {form.type === 'EARNING' && (
              <label className="checkbox-field">
                <input type="checkbox" checked={form.taxable}
                  onChange={e => setForm({ ...form, taxable: e.target.checked })} />
                Taxable income
              </label>
            )}
            {editing?.id && (
              <label className="checkbox-field">
                <input type="checkbox" checked={form.isActive}
                  onChange={e => setForm({ ...form, isActive: e.target.checked })} />
                Active
              </label>
            )}
          </div>
          <p className="text-sm-muted mb-14">
            PF and ESI are calculated on the fixed salary components only, not on these.
          </p>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>
              {saving ? 'Saving…' : 'Save component'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
