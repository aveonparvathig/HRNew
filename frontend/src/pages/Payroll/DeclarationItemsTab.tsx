import { useState, useEffect, useCallback } from 'react';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert, Modal, StatusBadge } from '../../components/ui';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
import { formatINR } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';

const EMPTY = {
  name: '', section: '', sectionNew: '', group: 'OTHER', maxAmount: '', deductPercent: 100, proofRequired: false, isActive: true,
  componentKey: '', limitPeriod: 'MONTH', regime: 'OLD',
};
const SHORT_GROUP: Record<string, string> = {
  SECTION_80C: 'Section 80C pool', OTHER: 'Own limit', OTHER_INCOME: 'Other income', LET_OUT_INCOME: 'Let-out income',
  LET_OUT_LOSS: 'Let-out loss', TAX_CREDIT: 'Tax paid elsewhere', EXEMPTION: 'Exempt allowance',
};
const isDeduction = (group: string) => group === 'SECTION_80C' || group === 'OTHER';

// The investments and expenses an employee can declare for income tax.
export default function DeclarationItemsTab() {
  const [items, setItems] = useState<any[] | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [components, setComponents] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<any>(null); // item being edited, or {} for new
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getDeclarationItems();
      setItems(res.data.items);
      setGroups(res.data.groups);
      setComponents(res.data.components);
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
        componentKey: item.componentKey || '', limitPeriod: item.limitPeriod || 'YEAR', regime: item.regime || 'OLD',
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
  const componentName = (key: string) => components.find(c => c.key === key)?.label || 'a pay component that no longer exists';
  const exemption = form.group === 'EXEMPTION';

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="alert alert-warning">
        <Icon name="alert" size={16} className="pt-alert-icon" />
        <span>
          This starter list uses the commonly applied limits. Check the sections and limits against the
          current law with your tax adviser before employees declare. Rent and housing-loan interest are
          on the declaration itself and are not listed here. No allowance is exempt until you add an
          “Exempt allowance” item for it.
        </span>
      </div>

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Declaration items</h3>
            <span className="text-sm-muted">
              What employees can declare. Deductions count under the old regime: items in the Section 80C
              pool share one overall limit with PF, the others each have their own. Other income and tax
              paid elsewhere count under both regimes. An exempt allowance is a rule on a pay component.
            </span>
          </div>
          <Button variant="accent" icon="plus" onClick={() => open()}>Add item</Button>
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
                  <td className="pt-nowrap">
                    {i.section}
                    {i.sectionNew && <div className="pt-sub">new Act {i.sectionNew}</div>}
                  </td>
                  <td className="pt-strong">{i.name}</td>
                  <td>
                    {SHORT_GROUP[i.group] || i.group}
                    {i.group === 'EXEMPTION' && (
                      <div className="pt-sub">
                        on {componentName(i.componentKey)} · {i.regime === 'BOTH' ? 'both regimes' : 'old regime'}
                      </div>
                    )}
                  </td>
                  <td className="num">
                    {i.maxAmount == null ? 'No limit' : formatINR(i.maxAmount)}
                    {i.group === 'EXEMPTION' && i.maxAmount != null && <div className="pt-sub">a {i.limitPeriod === 'MONTH' ? 'month' : 'year'}</div>}
                  </td>
                  <td className="num">
                    {isDeduction(i.group) ? `${i.deductPercent}%` : '—'}
                    {i.proofRequired && <div className="pt-sub">proof needed</div>}
                  </td>
                  <td className="num">{i.usedCount || '—'}</td>
                  <td><StatusBadge status={i.isActive ? 'active' : 'inactive'} /></td>
                  <td>
                    <div className="row-actions">
                      <Button size="sm" onClick={() => open(i)}>Edit</Button>
                      {i.usedCount === 0 && (
                        <Button variant="danger" size="sm" onClick={() => handleDelete(i)}>Delete</Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal title={editing?.id ? 'Edit declaration item' : 'Add declaration item'} open={Boolean(editing)}
        onClose={() => setEditing(null)}>
        <form onSubmit={handleSave}>
          <div className="form-grid mb-14">
            <div className="field pt-span-all">
              <label htmlFor="pt-item-name">Name *</label>
              <input id="pt-item-name" className="input" required placeholder="e.g. Medical insurance premium" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pt-item-section">{isDeduction(form.group) ? 'Section *' : 'Head or section *'}</label>
              <input id="pt-item-section" className="input" required placeholder={exemption ? 'e.g. 10(14)' : 'e.g. 80D'} value={form.section}
                onChange={e => setForm({ ...form, section: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="pt-item-section-new">Section in the new Act</label>
              <input id="pt-item-section-new" className="input" value={form.sectionNew}
                onChange={e => setForm({ ...form, sectionNew: e.target.value })} />
              <span className="hint">Income-tax Act, 2025. Printed beside the old number.</span>
            </div>
            <div className="field">
              <label htmlFor="pt-item-group">Counts in *</label>
              <select id="pt-item-group" className="select" value={form.group} onChange={e => setForm({ ...form, group: e.target.value })}>
                {groups.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            {exemption && (
              <>
                <div className="field">
                  <label htmlFor="pt-item-component">Pay component *</label>
                  <select id="pt-item-component" className="select" required value={form.componentKey} onChange={e => setForm({ ...form, componentKey: e.target.value })}>
                    <option value="">Pick the allowance…</option>
                    {components.filter(c => c.isActive || c.key === form.componentKey).map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <span className="hint">The exempt part of what is paid on it is left out of taxable salary.</span>
                </div>
                <div className="field">
                  <label htmlFor="pt-item-limit-period">The limit is for</label>
                  <select id="pt-item-limit-period" className="select" value={form.limitPeriod} onChange={e => setForm({ ...form, limitPeriod: e.target.value })}>
                    <option value="MONTH">Each month</option>
                    <option value="YEAR">The year</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pt-item-regime">Applies under</label>
                  <select id="pt-item-regime" className="select" value={form.regime} onChange={e => setForm({ ...form, regime: e.target.value })}>
                    <option value="OLD">The old regime only</option>
                    <option value="BOTH">Both regimes</option>
                  </select>
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="pt-item-limit">Limit</label>
              <div className="input-unit"><span className="unit">₹</span>
                <input id="pt-item-limit" className="input" type="number" min={0} step="0.01" value={form.maxAmount}
                  onChange={e => setForm({ ...form, maxAmount: e.target.value })} />
              </div>
              <span className="hint">{exemption ? 'Leave empty to exempt whatever is paid (or proved).' : 'Leave empty for no limit.'}</span>
            </div>
            <div className={`field${isDeduction(form.group) ? '' : ' pt-hidden'}`}>
              <label htmlFor="pt-item-percent">Deductible share</label>
              <div className="input-unit"><span className="unit">%</span>
                <input id="pt-item-percent" className="input" type="number" min={1} max={100} step="1" value={form.deductPercent}
                  onChange={e => setForm({ ...form, deductPercent: e.target.value })} />
              </div>
              <span className="hint">100 unless only part of the amount is deductible, as with some donations.</span>
            </div>
          </div>
          <label className="checkbox-field pt-check mb-14">
            <input type="checkbox" checked={Boolean(form.proofRequired)}
              onChange={e => setForm({ ...form, proofRequired: e.target.checked })} />
            <span>
              A proof is required
              <span className="pt-check-hint">
                {exemption
                  ? 'The exemption is then limited to what the employee says they spent (and, once proofs are considered, to what HR approves). Without this, it is applied to everyone paid the allowance.'
                  : 'While proof submission is open, an employee cannot save an amount here without a proof attached, and HR cannot approve one.'}
              </span>
            </span>
          </label>
          {editing?.id && (
            <label className="checkbox-field mb-14">
              <input type="checkbox" checked={form.isActive}
                onChange={e => setForm({ ...form, isActive: e.target.checked })} />
              Active (offered on new declarations)
            </label>
          )}
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save item'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
