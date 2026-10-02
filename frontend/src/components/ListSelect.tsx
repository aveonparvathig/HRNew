import { useEffect, useState } from 'react';
import { mastersAPI, loadLists, forgetLists } from '../api/masters';

// A picker over one of the company's value lists (department, designation,
// bank, reasons…). Staff can add a value without leaving the form; the
// value a record already holds stays selectable even if it has since been
// switched off.
export default function ListSelect({ listType, value, onChange, required, autoFocus, placeholder = '—' }: {
  listType: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const [canAdd, setCanAdd] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    loadLists().then(data => {
      if (!live) return;
      const list = data.lists.find((l: any) => l.type === listType);
      setOptions((list?.values || []).filter((v: any) => v.isActive).map((v: any) => v.label));
      setCanAdd(Boolean(data.canManage));
    }).catch(() => { /* the current value still shows */ });
    return () => { live = false; };
  }, [listType]);

  const shown = value && !options.includes(value) ? [...options, value] : options;

  const add = async () => {
    const label = draft.trim().replace(/\s+/g, ' ');
    if (!label) return;
    // Typing a value the list already has just picks it
    const existing = options.find(o => o.toLowerCase() === label.toLowerCase());
    if (existing) { onChange(existing); setAdding(false); setDraft(''); return; }
    setSaving(true);
    try {
      const res = await mastersAPI.addListValue(listType, label);
      forgetLists();
      setOptions(o => [...o, res.data.label]);
      onChange(res.data.label);
      setAdding(false);
      setDraft('');
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not add the value');
    } finally {
      setSaving(false);
    }
  };

  if (adding) {
    return (
      <>
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="input" autoFocus value={draft} placeholder="New value"
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); add(); }
              if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); setError(''); }
            }} />
          <button type="button" className="btn btn-secondary btn-sm" disabled={saving || !draft.trim()} onClick={add}>Add</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); setError(''); }}>Cancel</button>
        </div>
        {error && <span className="hint" style={{ color: 'var(--danger)' }}>{error}</span>}
      </>
    );
  }

  return (
    <select className="select" value={value || ''} required={required} autoFocus={autoFocus}
      onChange={e => (e.target.value === '__add__' ? setAdding(true) : onChange(e.target.value))}>
      <option value="">{placeholder}</option>
      {shown.map(o => <option key={o} value={o}>{o}</option>)}
      {canAdd && <option value="__add__">+ Add new…</option>}
    </select>
  );
}
