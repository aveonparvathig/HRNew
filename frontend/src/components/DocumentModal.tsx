import { useState, useEffect, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import { peopleAPI } from '../api/people';
import { downloadFile } from '../api/files';
import { Modal, ErrorAlert, LoadingBlock } from './ui';
import { Button } from './Button';
import { toast } from './feedback';
import PaperChoice from './PaperChoice';
import { useLetterPaper } from '../utils/letterPaper';

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
  // The letter the form opens on
  docType: string;
  docLabel: string;
  // The letters to choose from; without them the form writes only docType
  letters?: { value: string; label: string }[];
}

type Then = 'pdf' | 'print' | 'open';

// One letter for one person: pick the letter, fill what its template uses,
// see it as it will print, then save it and take the PDF or print it.
export default function DocumentModal({ open, onClose, personId, personName, docType: openOn, docLabel: openLabel, letters }: Props) {
  const navigate = useNavigate();
  const pickId = useId();
  const [docType, setDocType] = useState(openOn);
  const [form, setForm] = useState<any>({});
  const [fields, setFields] = useState<LetterFieldDef[]>([]);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<Then | ''>('');
  const [preview, setPreview] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const [paper, setPaper] = useLetterPaper();
  const docLabel = letters?.find(l => l.value === docType)?.label || openLabel;

  // Each time it opens, it opens on the letter asked for
  useEffect(() => { if (open) setDocType(openOn); }, [open, openOn]);

  useEffect(() => {
    if (!open || !docType) return;
    setLoading(true);
    setError('');
    setPreview('');
    peopleAPI.getDocumentPrefill(personId, docType)
      .then(res => { setForm(res.data.prefill || {}); setFields(res.data.fields || []); })
      .catch(err => { setForm({}); setFields([]); setError(err.response?.data?.error || 'Could not open the letter form'); })
      .finally(() => setLoading(false));
  }, [open, personId, docType]);

  useEffect(() => { if (open) setVisible(false); }, [open]);

  // The letter as it will come out, a moment after the typing stops.
  // Nothing is saved and no reference is taken.
  useEffect(() => {
    if (!open || loading || !docType) return;
    let current = true;
    setPreviewing(true);
    const timer = setTimeout(() => {
      peopleAPI.previewLetter({ code: docType, personId, formData: form, exact: true })
        .then(res => { if (current) setPreview(res.data.html); })
        .catch(() => { /* the form works without a preview */ })
        .finally(() => { if (current) setPreviewing(false); });
    }, 400);
    return () => { current = false; clearTimeout(timer); };
  }, [open, loading, docType, personId, form]);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));

  const generate = async (then: Then) => {
    setSaving(then);
    setError('');
    try {
      const res = await peopleAPI.createDocument(personId, docType, form, visible);
      const id = res.data.id;
      if (then === 'pdf') {
        try {
          await downloadFile(`/people/documents/${id}/file`, { paper });
        } catch (err: any) {
          toast.error(`The letter is saved, but its PDF could not be made: ${err.message}`);
        }
      }
      onClose();
      navigate(`/people/documents/${id}${then === 'print' ? '?print=1' : ''}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate the letter');
    } finally {
      setSaving('');
    }
  };

  return (
    <Modal size="xl" title={`Write a letter — ${personName}`} open={open} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); generate('pdf'); }}>
        <ErrorAlert message={error} />
        <div className="letter-compose">
          <div className="letter-compose-form">
            {letters && letters.length > 1 && (
              <div className="field mb-14">
                <label htmlFor={pickId}>Letter</label>
                <select id={pickId} className="select" value={docType} onChange={e => setDocType(e.target.value)}>
                  {letters.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
                </select>
              </div>
            )}
            {loading ? <LoadingBlock label="Prefilling from record…" /> : (
              <>
                <p className="modal-lede">
                  Prefilled from {personName}'s record and the last {docLabel.toLowerCase()} issued.
                  The letter is saved to their document history.
                </p>
                <LetterFields fields={fields} form={form} set={set} />
                <label className="checkbox-field pl-mt-14">
                  <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />
                  Show this letter to {personName} under My Documents
                </label>
              </>
            )}
          </div>
          <div className="letter-compose-preview">
            <div className="letter-compose-bar">
              <span className="text-sm-muted">{previewing ? 'Updating preview…' : 'Preview — as it will print'}</span>
              <PaperChoice paper={paper} onChange={setPaper} />
            </div>
            <div className={`letter-sheet letter-compose-sheet${paper === 'letterhead' ? ' on-letterhead' : ''}`}>
              {preview ? <div dangerouslySetInnerHTML={{ __html: preview }} /> : <LoadingBlock label="Preparing the preview…" />}
            </div>
          </div>
        </div>
        <div className="form-actions">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => generate('open')} loading={saving === 'open'} disabled={Boolean(saving) || loading || fields.length === 0}>
            Generate only
          </Button>
          <Button icon="printer" onClick={() => generate('print')} loading={saving === 'print'} disabled={Boolean(saving) || loading || fields.length === 0}>
            Generate &amp; print
          </Button>
          <Button type="submit" variant="accent" icon="download" loading={saving === 'pdf'} disabled={Boolean(saving) || loading || fields.length === 0}>
            {saving === 'pdf' ? 'Making the PDF…' : 'Generate & download PDF'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
