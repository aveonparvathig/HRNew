import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { peopleAPI } from '../api/people';
import { Modal, ErrorAlert, LoadingBlock } from './ui';

export interface LetterFieldDef {
  key: string;
  label: string;
  type: 'text' | 'date' | 'money' | 'number' | 'textarea' | 'select';
  placeholder?: string;
  options?: string[];
}

// The inputs of a letter form: one for each field its template uses.
export function LetterFields({ fields, form, set }: { fields: LetterFieldDef[]; form: any; set: (key: string, value: any) => void }) {
  return (
    <div className="form-grid">
      {fields.map(f => (
        <div key={f.key} className="field" style={f.type === 'textarea' ? { gridColumn: '1 / -1' } : undefined}>
          <label>{f.label}</label>
          {f.type === 'textarea' ? (
            <textarea className="input" rows={2} placeholder={f.placeholder}
              value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
          ) : f.type === 'select' ? (
            <select className="select" value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}>
              <option value="">—</option>
              {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.type === 'money' ? (
            <div className="input-unit">
              <span className="unit">₹</span>
              <input className="input" type="number" min={0} placeholder={f.placeholder || '0'}
                value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
            </div>
          ) : (
            <input className="input" type={f.type === 'number' ? 'number' : f.type} min={f.type === 'number' ? 0 : undefined}
              placeholder={f.placeholder} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
          )}
        </div>
      ))}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  personId: string;
  personName: string;
  docType: string;
  docLabel: string;
}

// One letter for one person. The form asks for what the letter's template uses.
export default function DocumentModal({ open, onClose, personId, personName, docType, docLabel }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState<any>({});
  const [fields, setFields] = useState<LetterFieldDef[]>([]);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !docType) return;
    setLoading(true);
    setError('');
    setVisible(false);
    peopleAPI.getDocumentPrefill(personId, docType)
      .then(res => { setForm(res.data.prefill || {}); setFields(res.data.fields || []); })
      .catch(err => { setForm({}); setFields([]); setError(err.response?.data?.error || 'Could not open the letter form'); })
      .finally(() => setLoading(false));
  }, [open, personId, docType]);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await peopleAPI.createDocument(personId, docType, form, visible);
      onClose();
      navigate(`/people/documents/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate the letter');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal size="lg" title={`${docLabel} — ${personName}`} open={open} onClose={onClose}>
      {loading ? <LoadingBlock label="Prefilling from record…" /> : (
        <form onSubmit={handleSubmit}>
          <ErrorAlert message={error} />
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 18 }}>
            Prefilled from {personName}'s record and the last {docLabel.toLowerCase()} issued.
            The generated letter is saved to their document history.
          </p>
          <LetterFields fields={fields} form={form} set={set} />
          <label className="checkbox" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '14px 0 0', fontSize: 13.5 }}>
            <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />
            Show this letter to {personName} under My Documents
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || fields.length === 0}>
              {saving ? 'Generating…' : `Generate ${docLabel}`}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
