import { useState, useEffect } from 'react';
import { recruitmentAPI } from '../api/recruitment';
import { Modal, ErrorAlert } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  posting?: any | null; // null = create
  meta: { employmentTypes: any[]; postingStatuses: any[] };
  onSaved: (posting: any) => void;
}

const EMPTY = {
  title: '', department: '', location: '', description: '', requirements: '',
  employmentType: 'FULL_TIME', experienceRange: '', salaryRange: '',
  status: 'OPEN', postedDate: new Date().toISOString().split('T')[0],
  closingDate: '', positionsCount: 1,
};

export default function PostingFormModal({ open, onClose, posting, meta, onSaved }: Props) {
  const [form, setForm] = useState<any>(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const isEdit = Boolean(posting);

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(posting ? {
      title: posting.title || '',
      department: posting.department || '',
      location: posting.location || '',
      description: posting.description || '',
      requirements: posting.requirements || '',
      employmentType: posting.employmentType || 'FULL_TIME',
      experienceRange: posting.experienceRange || '',
      salaryRange: posting.salaryRange || '',
      status: posting.status || 'DRAFT',
      postedDate: posting.postedDate || '',
      closingDate: posting.closingDate || '',
      positionsCount: posting.positionsCount || 1,
    } : EMPTY);
  }, [open, posting]);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = isEdit
        ? await recruitmentAPI.updatePosting(posting.id, form)
        : await recruitmentAPI.createPosting(form);
      onSaved(res.data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save posting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal size="lg" title={isEdit ? `Edit — ${posting?.title}` : 'New Job Posting'} open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <ErrorAlert message={error} />

        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">1</span> Role</div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Job title *</label>
            <input className="input" required autoFocus placeholder="e.g. Implementation Engineer"
              value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label>Department</label>
              <input className="input" placeholder="e.g. Delivery"
                value={form.department} onChange={e => set('department', e.target.value)} />
            </div>
            <div className="field">
              <label>Location</label>
              <input className="input" placeholder="e.g. Coimbatore / Remote"
                value={form.location} onChange={e => set('location', e.target.value)} />
            </div>
            <div className="field">
              <label>Employment type</label>
              <select className="select" value={form.employmentType}
                onChange={e => set('employmentType', e.target.value)}>
                {meta.employmentTypes.map((t: any) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">2</span> Compensation &amp; capacity</div>
          <div className="form-grid">
            <div className="field">
              <label>Experience range</label>
              <input className="input" placeholder="e.g. 2–4 years"
                value={form.experienceRange} onChange={e => set('experienceRange', e.target.value)} />
            </div>
            <div className="field">
              <label>Salary range</label>
              <input className="input" placeholder="e.g. ₹4–6 LPA"
                value={form.salaryRange} onChange={e => set('salaryRange', e.target.value)} />
            </div>
            <div className="field">
              <label>Open positions</label>
              <input className="input" type="number" min={1}
                value={form.positionsCount} onChange={e => set('positionsCount', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">3</span> Status &amp; dates</div>
          <div className="form-grid">
            <div className="field">
              <label>Status</label>
              <select className="select" value={form.status} onChange={e => set('status', e.target.value)}>
                {meta.postingStatuses.map((s: any) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Posted date</label>
              <input className="input" type="date" value={form.postedDate || ''}
                onChange={e => set('postedDate', e.target.value)} />
            </div>
            <div className="field">
              <label>Closing date</label>
              <input className="input" type="date" value={form.closingDate || ''}
                onChange={e => set('closingDate', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">4</span> Description</div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Role description</label>
            <textarea className="input" rows={4} placeholder="What the role involves day to day"
              value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="field">
            <label>Requirements</label>
            <textarea className="input" rows={3} placeholder="Skills, qualifications, must-haves"
              value={form.requirements} onChange={e => set('requirements', e.target.value)} />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Posting'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
