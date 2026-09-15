import { useState, useEffect, useCallback } from 'react';
import { peopleAPI } from '../../api/people';
import {
  PageHeader, EmptyState, LoadingBlock, ErrorAlert, StatusBadge, Modal,
} from '../../components/ui';

const EMPTY = { title: '', department: '', positions: 1, location: '', description: '', status: 'OPEN' };

export default function JobOpenings() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [show, setShow] = useState('open');
  const [modal, setModal] = useState<{ open: boolean; opening: any | null }>({ open: false, opening: null });
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await peopleAPI.getOpenings(show);
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load job openings');
    } finally {
      setLoading(false);
    }
  }, [show]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openModal = (opening: any | null) => {
    setForm(opening ? {
      title: opening.title, department: opening.department, positions: opening.positions,
      location: opening.location, description: opening.description, status: opening.status,
    } : EMPTY);
    setModal({ open: true, opening });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal.opening) await peopleAPI.updateOpening(modal.opening.id, form);
      else await peopleAPI.createOpening(form);
      setModal({ open: false, opening: null });
      setError('');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save opening');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <LoadingBlock label="Loading openings…" />;

  return (
    <>
      <PageHeader
        title="Job Openings"
        subtitle="Positions candidates in the pipeline can apply against."
        actions={
          <button className="btn btn-primary" onClick={() => openModal(null)}>+ Add Opening</button>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="toolbar">
        <div className="segmented">
          {['open', 'closed', 'all'].map(v => (
            <button key={v} className={show === v ? 'active' : ''} onClick={() => setShow(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <span className="toolbar-count">
          {data?.openings.length || 0} opening{data?.openings.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="card">
        {(data?.openings || []).length === 0 ? (
          <EmptyState icon="◫" title="No job openings"
            message="Add an opening so pipeline candidates can be linked to it."
            action={<button className="btn btn-primary" onClick={() => openModal(null)}>+ Add Opening</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th><th>Department</th><th>Location</th>
                  <th className="num">Positions</th><th className="num">Applicants</th>
                  <th className="num">Selected</th><th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {data.openings.map((o: any) => (
                  <tr key={o.id}>
                    <td style={{ fontWeight: 600 }}>{o.title}</td>
                    <td className="text-muted">{o.department || '—'}</td>
                    <td className="text-muted">{o.location || '—'}</td>
                    <td className="num">{o.positions}</td>
                    <td className="num">{o.applicantCount}</td>
                    <td className={`num ${o.selectedCount >= o.positions ? 'text-success' : ''}`}>
                      {o.selectedCount}/{o.positions}
                    </td>
                    <td><StatusBadge status={o.status === 'ON_HOLD' ? 'pending' : o.status.toLowerCase()} /></td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-sm" onClick={() => openModal(o)}>Edit</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal size="lg" title={modal.opening ? `Edit — ${modal.opening.title}` : 'Add Job Opening'}
        open={modal.open} onClose={() => setModal({ open: false, opening: null })}>
        <form onSubmit={handleSave}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Title *</label>
            <input className="input" required autoFocus placeholder="e.g. Support Engineer"
              value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Department</label>
              <input className="input" value={form.department}
                onChange={e => setForm({ ...form, department: e.target.value })} />
            </div>
            <div className="field">
              <label>Location</label>
              <input className="input" value={form.location}
                onChange={e => setForm({ ...form, location: e.target.value })} />
            </div>
            <div className="field">
              <label>Positions</label>
              <input className="input" type="number" min={1} value={form.positions}
                onChange={e => setForm({ ...form, positions: e.target.value })} />
            </div>
            <div className="field">
              <label>Status</label>
              <select className="select" value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="OPEN">Open</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea className="input" rows={3} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost"
              onClick={() => setModal({ open: false, opening: null })}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : modal.opening ? 'Save Changes' : 'Add Opening'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
