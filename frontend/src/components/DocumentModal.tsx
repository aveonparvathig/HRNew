import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { peopleAPI } from '../api/people';
import { Modal, ErrorAlert, LoadingBlock } from './ui';

interface Field {
  key: string;
  label: string;
  type?: 'text' | 'date' | 'number' | 'textarea' | 'select';
  placeholder?: string;
  options?: string[];
  unit?: string;
  span2?: boolean;
}

const COMMON_TOP: Field[] = [
  { key: 'refNo', label: 'Reference no.', placeholder: 'e.g. AVN/HR/2026/041' },
  { key: 'letterDate', label: 'Letter date', type: 'date' },
];

const SIGNATORY: Field[] = [
  { key: 'signatoryName', label: 'Signatory name', placeholder: 'e.g. R. Kumar' },
  { key: 'signatoryTitle', label: 'Signatory title', placeholder: 'e.g. HR Manager' },
];

const FIELDS: Record<string, Field[]> = {
  EMPLOYMENT_OFFER: [
    ...COMMON_TOP,
    { key: 'recipientAddress', label: 'Candidate address', type: 'textarea', span2: true },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'joiningDate', label: 'Date of joining', type: 'date' },
    { key: 'workLocation', label: 'Work location' },
    { key: 'annualCtc', label: 'Annual CTC', type: 'number', unit: '₹' },
    { key: 'reportingTo', label: 'Reporting to' },
    { key: 'probationMonths', label: 'Probation (months)', type: 'number' },
    { key: 'acceptDays', label: 'Accept within (days)', type: 'number' },
    { key: 'terms', label: 'Additional terms', type: 'textarea', span2: true },
    ...SIGNATORY,
  ],
  APPOINTMENT: [
    ...COMMON_TOP,
    { key: 'recipientAddress', label: 'Employee address', type: 'textarea', span2: true },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'joiningDate', label: 'Date of appointment', type: 'date' },
    { key: 'workLocation', label: 'Work location' },
    { key: 'annualCtc', label: 'Annual CTC', type: 'number', unit: '₹' },
    { key: 'probationMonths', label: 'Probation (months)', type: 'number' },
    { key: 'noticeDays', label: 'Notice period (days)', type: 'number' },
    { key: 'workingHours', label: 'Working hours', placeholder: 'e.g. 9:30 AM – 6:30 PM' },
    { key: 'terms', label: 'Additional terms', type: 'textarea', span2: true },
    ...SIGNATORY,
  ],
  EXPERIENCE_EMPLOYEE: [
    ...COMMON_TOP,
    { key: 'designation', label: 'Designation' },
    { key: 'pronoun', label: 'Refer to as', type: 'select', options: ['them', 'him', 'her'] },
    { key: 'joinDate', label: 'From', type: 'date' },
    { key: 'leavingDate', label: 'To', type: 'date' },
    { key: 'workSummary', label: 'Work handled', type: 'textarea', span2: true, placeholder: 'e.g. client implementations and technical support' },
    { key: 'conduct', label: 'Conduct remark', span2: true, placeholder: 'sincere, hardworking and professional' },
    ...SIGNATORY,
  ],
  INTERNSHIP_OFFER: [
    ...COMMON_TOP,
    { key: 'recipientAddress', label: 'Student address', type: 'textarea', span2: true },
    { key: 'internshipRole', label: 'Internship role' },
    { key: 'collegeName', label: 'College' },
    { key: 'startDate', label: 'Start date', type: 'date' },
    { key: 'endDate', label: 'End date', type: 'date' },
    { key: 'workLocation', label: 'Location' },
    { key: 'stipend', label: 'Stipend / month', type: 'number', unit: '₹' },
    { key: 'mentor', label: 'Mentor / guide' },
    { key: 'terms', label: 'Additional terms', type: 'textarea', span2: true },
    ...SIGNATORY,
  ],
  EXPERIENCE_INTERNSHIP: [
    ...COMMON_TOP,
    { key: 'internshipRole', label: 'Internship role' },
    { key: 'pronoun', label: 'Refer to as', type: 'select', options: ['them', 'him', 'her'] },
    { key: 'collegeName', label: 'College' },
    { key: 'course', label: 'Course' },
    { key: 'startDate', label: 'From', type: 'date' },
    { key: 'endDate', label: 'To', type: 'date' },
    { key: 'workSummary', label: 'Worked on', type: 'textarea', span2: true, placeholder: 'e.g. the client portal frontend using React' },
    { key: 'performance', label: 'Performance remark', placeholder: 'commendable' },
    { key: 'conduct', label: 'Conduct remark', placeholder: 'dedicated, inquisitive and hardworking' },
    ...SIGNATORY,
  ],
};

interface Props {
  open: boolean;
  onClose: () => void;
  personId: string;
  personName: string;
  docType: string;
  docLabel: string;
}

export default function DocumentModal({ open, onClose, personId, personName, docType, docLabel }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !docType) return;
    setLoading(true);
    setError('');
    peopleAPI.getDocumentPrefill(personId, docType)
      .then(res => setForm(res.data.prefill || {}))
      .catch(() => setForm({}))
      .finally(() => setLoading(false));
  }, [open, personId, docType]);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await peopleAPI.createDocument(personId, docType, form);
      onClose();
      navigate(`/people/documents/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate the letter');
    } finally {
      setSaving(false);
    }
  };

  const fields = FIELDS[docType] || [];

  return (
    <Modal size="lg" title={`${docLabel} — ${personName}`} open={open} onClose={onClose}>
      {loading ? <LoadingBlock label="Prefilling from record…" /> : (
        <form onSubmit={handleSubmit}>
          <ErrorAlert message={error} />
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 18 }}>
            Prefilled from {personName}'s record and the last {docLabel.toLowerCase()} issued.
            The generated letter is saved to their document history.
          </p>
          <div className="form-grid">
            {fields.map(f => (
              <div key={f.key} className="field"
                style={f.span2 ? { gridColumn: '1 / -1' } : undefined}>
                <label>{f.label}</label>
                {f.type === 'textarea' ? (
                  <textarea className="input" rows={2} placeholder={f.placeholder}
                    value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
                ) : f.type === 'select' ? (
                  <select className="select" value={form[f.key] || f.options?.[0] || ''}
                    onChange={e => set(f.key, e.target.value)}>
                    {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : f.unit ? (
                  <div className="input-unit">
                    <span className="unit">{f.unit}</span>
                    <input className="input" type="number" min={0} placeholder={f.placeholder || '0'}
                      value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
                  </div>
                ) : (
                  <input className="input" type={f.type || 'text'} placeholder={f.placeholder}
                    value={form[f.key] || ''} onChange={e => set(f.key, e.target.value)} />
                )}
              </div>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Generating…' : `Generate ${docLabel}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
