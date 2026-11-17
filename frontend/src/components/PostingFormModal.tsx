import { useState, useEffect } from 'react';
import { recruitmentAPI } from '../api/recruitment';
import { Modal, ErrorAlert } from './ui';
import { Button } from './Button';

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
    <Modal size="lg" title={isEdit ? `Edit — ${posting?.title}` : 'New job posting'} open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <ErrorAlert message={error} />

        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">1</span> Role</div>
          <div className="field mb-14">
            <label htmlFor="re-pf-job-title">Job title *</label>
            <input id="re-pf-job-title" className="input" required autoFocus placeholder="e.g. Implementation Engineer"
              value={form.title} onChange={e => set('title', e.target.value)} />
          </div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="re-pf-department">Department</label>
              <input id="re-pf-department" className="input" placeholder="e.g. Delivery"
                value={form.department} onChange={e => set('department', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="re-pf-location">Location</label>
              <input id="re-pf-location" className="input" placeholder="e.g. Coimbatore / Remote"
                value={form.location} onChange={e => set('location', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="re-pf-employment-type">Employment type</label>
              <select id="re-pf-employment-type" className="select" value={form.employmentType}
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
              <label htmlFor="re-pf-experience-range">Experience range</label>
              <input id="re-pf-experience-range" className="input" placeholder="e.g. 2–4 years"
                value={form.experienceRange} onChange={e => set('experienceRange', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="re-pf-salary-range">Salary range</label>
              <input id="re-pf-salary-range" className="input" placeholder="e.g. ₹4–6 LPA"
                value={form.salaryRange} onChange={e => set('salaryRange', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="re-pf-open-positions">Open positions</label>
              <input id="re-pf-open-positions" className="input" type="number" min={1}
                value={form.positionsCount} onChange={e => set('positionsCount', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">3</span> Status &amp; dates</div>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="re-pf-status">Status</label>
              <select id="re-pf-status" className="select" value={form.status} onChange={e => set('status', e.target.value)}>
                {meta.postingStatuses.map((s: any) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="re-pf-posted-date">Posted date</label>
              <input id="re-pf-posted-date" className="input" type="date" value={form.postedDate || ''}
                onChange={e => set('postedDate', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="re-pf-closing-date">Closing date</label>
              <input id="re-pf-closing-date" className="input" type="date" value={form.closingDate || ''}
                onChange={e => set('closingDate', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">4</span> Description</div>
          <div className="field mb-14">
            <label htmlFor="re-pf-role-description">Role description</label>
            <textarea id="re-pf-role-description" className="input" rows={4} placeholder="What the role involves day to day"
              value={form.description} onChange={e => set('description', e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="re-pf-requirements">Requirements</label>
            <textarea id="re-pf-requirements" className="input" rows={3} placeholder="Skills, qualifications, must-haves"
              value={form.requirements} onChange={e => set('requirements', e.target.value)} />
          </div>
        </div>

        <div className="form-actions">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="accent" loading={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create posting'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
