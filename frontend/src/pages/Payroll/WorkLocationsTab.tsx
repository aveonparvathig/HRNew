import { useState, useEffect, useCallback } from 'react';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert, EmptyState, Modal, StatusBadge } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';

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
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              The state of an employee's location decides Professional Tax and Labour Welfare Fund rules; where
              the town sets its own Professional Tax, the city decides the slabs. Assign a location on each employee's profile.
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => open()}>+ Add Location</button>
        </div>
        {data.locations.length === 0 ? (
          <EmptyState icon="⌖" title="No work locations yet"
            message="Add the offices or branches your employees work from." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Location</th><th>City</th><th>State</th><th className="num">Employees</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {data.locations.map((l: any) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600 }}>{l.name}</td>
                    <td>{l.city || '—'}</td>
                    <td>
                      {l.state}
                      {l.excludeFromPt && <div className="text-muted" style={{ fontSize: 11.5 }}>No Professional Tax</div>}
                    </td>
                    <td className="num">{l.employeeCount}</td>
                    <td><StatusBadge status={l.isActive ? 'active' : 'inactive'} /></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => open(l)}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(l)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title={editing?.id ? 'Edit Location' : 'Add Location'} open={Boolean(editing)}
        onClose={() => setEditing(null)}>
        <form onSubmit={handleSave}>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Location name *</label>
              <input className="input" required placeholder="e.g. Coimbatore Office" value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field">
              <label>City</label>
              <input className="input" value={form.city}
                onChange={e => setForm({ ...form, city: e.target.value })} />
              <span className="hint">The town whose Professional Tax slabs apply, where the local body sets them.</span>
            </div>
            <div className="field">
              <label>State *</label>
              <select className="select" required value={form.state}
                onChange={e => setForm({ ...form, state: e.target.value })}>
                <option value="">—</option>
                {data.states.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <label className="checkbox-field" style={{ marginBottom: 14 }}>
            <input type="checkbox" checked={Boolean(form.excludeFromPt)}
              onChange={e => setForm({ ...form, excludeFromPt: e.target.checked })} />
            No Professional Tax here: employees at this location are left out, whatever the state's policy
          </label>
          {editing?.id && (
            <label className="checkbox-field" style={{ marginBottom: 14 }}>
              <input type="checkbox" checked={form.isActive}
                onChange={e => setForm({ ...form, isActive: e.target.checked })} />
              Active — inactive locations cannot be assigned to employees
            </label>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Location'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
