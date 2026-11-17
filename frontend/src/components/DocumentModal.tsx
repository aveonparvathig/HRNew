import { useState, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { peopleAPI } from '../api/people';
import { Modal, ErrorAlert, LoadingBlock } from './ui';
import { Button } from './Button';

export interface LetterFieldDef {
  key: string;
  label: string;
  type: 'text' | 'date' | 'money' | 'number' | 'textarea' | 'select';
  placeholder?: string;
  options?: string[];
}

// The inputs of a letter form: one for each field its template uses.
export function LetterFields({ fields, form, set }: { fields: LetterFieldDef[]; form: any; set: (key: string, value: any) => void }) {
  const base = useId();
  return (
    <div className="form-grid">
      {fields.map(f => {
        const id = `${base}-${f.key}`;
        return (
        <div key={f.key} className={f.type === 'textarea' ? 'field pl-span-all' : 'field'}>
          <label htmlFor={id}>{f.label}</label>
          {f.type === 'textarea' ? (
            <textarea id={id} className="input" rows={2} placeholder={f.placeholder}
              value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
          ) : f.type === 'select' ? (
            <select id={id} className="select" value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)}>
              <option value="">—</option>
              {(f.options || []).map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : f.type === 'money' ? (
            <div className="input-unit">
              <span className="unit">₹</span>
              <input id={id} className="input num" type="number" min={0} placeholder={f.placeholder || '0'}
                value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
            </div>
          ) : (
            <input id={id} className={f.type === 'number' ? 'input num' : 'input'} type={f.type === 'number' ? 'number' : f.type} min={f.type === 'number' ? 0 : undefined}
              placeholder={f.placeholder} value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} />
          )}
        </div>
        );
      })}
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
          <p className="modal-lede">
            Prefilled from {personName}'s record and the last {docLabel.toLowerCase()} issued.
            The generated letter is saved to their document history.
          </p>
          <LetterFields fields={fields} form={form} set={set} />
          <label className="checkbox-field pl-mt-14">
            <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />
            Show this letter to {personName} under My Documents
          </label>
          <div className="form-actions">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="accent" icon="pen" loading={saving} disabled={fields.length === 0}>
              {saving ? 'Generating…' : `Generate ${docLabel}`}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
