import { useEffect, useState } from 'react';
import { incomeAPI } from '../api/income';
import type { ClientAddress } from '../utils/clientAddress';

let statesCache: string[] | null = null;

export function ClientAddressFields({ value, onChange, states }: {
  value: ClientAddress;
  onChange: (next: ClientAddress) => void;
  states?: string[]; // pass when the page already has meta.states
}) {
  const [list, setList] = useState<string[]>(states || statesCache || []);

  useEffect(() => {
    if (states?.length) { setList(states); return; }
    if (statesCache) return;
    incomeAPI.getMeta()
      .then(res => { statesCache = res.data.states || []; setList(statesCache!); })
      .catch(() => { /* the select stays empty; typing other fields still works */ });
  }, [states]);

  const set = (k: keyof ClientAddress, v: string) => onChange({ ...value, [k]: v });

  return (
    <>
      <div className="field" style={{ marginBottom: 12 }}>
        <label>Address <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(optional)</span></label>
        <textarea className="input" rows={2} value={value.address}
          placeholder="Door no, street, area — one line per row, printed on proforma invoices"
          onChange={e => set('address', e.target.value)} />
      </div>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div className="field">
          <label>City</label>
          <input className="input" value={value.city} onChange={e => set('city', e.target.value)} />
        </div>
        <div className="field">
          <label>State</label>
          <select className="select" value={value.state} onChange={e => set('state', e.target.value)}>
            <option value="">—</option>
            {list.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label>PIN code</label>
          <input className="input" inputMode="numeric" maxLength={6} value={value.pincode}
            onChange={e => set('pincode', e.target.value.replace(/\D/g, ''))} />
        </div>
        <div className="field">
          <label>GSTIN</label>
          <input className="input" maxLength={15} placeholder="Optional" value={value.gstin}
            onChange={e => set('gstin', e.target.value.toUpperCase())} />
        </div>
      </div>
    </>
  );
}
