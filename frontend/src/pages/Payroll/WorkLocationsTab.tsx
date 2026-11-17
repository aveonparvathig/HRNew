import { useState, useEffect, useCallback } from 'react';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert, EmptyState, Modal, StatusBadge } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';
import { Button } from '../../components/Button';

const EMPTY = { name: '', city: '', state: '', isActive: true };

export default function WorkLocationsTab() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<any>(null); // location being edited, or {} for new
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getLocations();
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load work locations');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const open = (location?: any) => {
    setForm(location
      ? { name: location.name, city: location.city, state: location.state, isActive: location.isActive, excludeFromPt: location.excludeFromPt }
      : EMPTY);
    setEditing(location || {});
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing.id) await payrollAPI.updateLocation(editing.id, form);
      else await payrollAPI.createLocation(form);
      setEditing(null);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save the location');
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (location: any) => {
    if (!await confirmDialog(`Delete the location "${location.name}"?`)) return;
    try {
      await payrollAPI.deleteLocation(location.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete the location');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading locations…" />;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="card">
        <div className="card-header">
          <div>
            <h3>Work locations</h3>
            <span className="text-sm-muted">
              The state of an employee's location decides Professional Tax and Labour Welfare Fund rules; where
              the town sets its own Professional Tax, the city decides the slabs. Assign a location on each employee's profile.
            </span>
          </div>
          <Button variant="accent" icon="plus" onClick={() => open()}>Add location</Button>
        </div>
        {data.locations.length === 0 ? (
          <EmptyState icon="⌖" title="No work locations yet"
            message="Add the offices or branches your employees work from." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Location</th><th>City</th><th>State</th><th className="num">Employees</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {data.locations.map((l: any) => (
                  <tr key={l.id}>
                    <td className="ps-strong">{l.name}</td>
                    <td>{l.city || '—'}</td>
                    <td>
                      {l.state}
                      {l.excludeFromPt && <div className="ps-sub">No Professional Tax</div>}
                    </td>
                    <td className="num">{l.employeeCount}</td>
                    <td><StatusBadge status={l.isActive ? 'active' : 'inactive'} /></td>
                    <td>
                      <div className="row-actions">
                        <Button size="sm" onClick={() => open(l)}>Edit</Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(l)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title={editing?.id ? 'Edit location' : 'Add location'} open={Boolean(editing)}
        onClose={() => setEditing(null)}>
        <form onSubmit={handleSave}>
          <div className="form-grid mb-14">
            <div className="field">
              <label htmlFor="ps-loc-name">Location name *</label>
              <input id="ps-loc-name" className="input" required placeholder="e.g. Coimbatore office" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="ps-loc-city">City</label>
              <input id="ps-loc-city" className="input" value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })} />
              <span className="hint">The town whose Professional Tax slabs apply, where the local body sets them.</span>
            </div>
            <div className="field">
              <label htmlFor="ps-loc-state">State *</label>
              <select id="ps-loc-state" className="select" required value={form.state}
                onChange={e => setForm({ ...form, state: e.target.value })}>
                <option value="">—</option>
                {data.states.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <label className="checkbox-field mb-14">
            <input type="checkbox" checked={Boolean(form.excludeFromPt)}
              onChange={e => setForm({ ...form, excludeFromPt: e.target.checked })} />
            No Professional Tax here: employees at this location are left out, whatever the state's policy
          </label>
          {editing?.id && (
            <label className="checkbox-field mb-14">
              <input type="checkbox" checked={form.isActive}
                onChange={e => setForm({ ...form, isActive: e.target.checked })} />
              Active — inactive locations cannot be assigned to employees
            </label>
          )}
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>
              {saving ? 'Saving…' : 'Save location'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
