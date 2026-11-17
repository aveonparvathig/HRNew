import { useState, useEffect } from 'react';
import { payrollAPI } from '../api/payroll';
import { Modal, LoadingBlock, ErrorAlert } from './ui';
import { toast } from './feedback';
import { Button } from './Button';
import { formatINR } from '../utils/format';

// One employee's perquisites for a financial year, by the lines of Form
// 12BA. Their taxable value is added to salary when tax is worked out.
export default function PerquisitesModal({ personId, fy, open, onClose, onSaved }: {
  personId: string;
  fy: string | number;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setData(null);
    setError('');
    payrollAPI.getPerquisites(personId, String(fy))
      .then(res => {
        setData(res.data);
        setRows(res.data.rows.map((r: any) => ({ ...r, value: r.value || '', recovered: r.recovered || '' })));
      })
      .catch(err => setError(err.response?.data?.error || 'Failed to load perquisites'));
  }, [open, personId, fy]);

  const setRow = (head: number, patch: any) => setRows(list => list.map(r => (r.head === head ? { ...r, ...patch } : r)));
  const taxable = (r: any) => Math.max(0, Number(r.value || 0) - Number(r.recovered || 0));
  const total = rows.reduce((s, r) => s + taxable(r), 0);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await payrollAPI.savePerquisites(personId, {
        fyStart: data.fyStart,
        values: rows.filter(r => !r.automatic).map(r => ({ head: r.head, value: r.value || 0, recovered: r.recovered || 0 })),
      });
      toast.success('Perquisites saved. Recalculate any open draft run so the TDS picks them up.');
      onSaved?.();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save perquisites');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal size="lg" title={data ? `Perquisites — ${data.person.name} — FY ${data.financialYear}` : 'Perquisites'} open={open} onClose={onClose}>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {!data ? (!error && <LoadingBlock label="Loading perquisites…" />) : (
        <form onSubmit={save}>
          <p className="text-sm-muted ps-mb-12">
            Enter the value of each benefit for the year as the tax rules value it, and anything the employee paid towards it.
            The difference is taxed as salary and printed on the perquisites statement.
          </p>
          <div className="table-wrap ps-perq-scroll">
            <table className="table">
              <thead>
                <tr><th className="num">No.</th><th>Perquisite</th><th className="num">Value for the year</th><th className="num">Paid by the employee</th><th className="num">Taxable</th></tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.head}>
                    <td className="num">{r.head}</td>
                    <td>
                      {r.label}
                      {r.automatic && <div className="ps-sub">From the loan ledger</div>}
                    </td>
                    <td className="num">
                      {r.automatic ? (r.value ? formatINR(Number(r.value)) : '—') : (
                        <input className="input input-sm num" type="number" min={0} step="0.01" aria-label={`${r.label}: value`}
                          value={r.value} onChange={e => setRow(r.head, { value: e.target.value })} />
                      )}
                    </td>
                    <td className="num">
                      {r.automatic ? '—' : (
                        <input className="input input-sm num" type="number" min={0} step="0.01" aria-label={`${r.label}: paid by the employee`}
                          value={r.recovered} onChange={e => setRow(r.head, { recovered: e.target.value })} />
                      )}
                    </td>
                    <td className="num">{taxable(r) ? formatINR(taxable(r)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ps-perq-total">Taxable perquisites for the year: <strong className="num">{formatINR(total)}</strong></p>
          <div className="form-actions">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save perquisites'}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
