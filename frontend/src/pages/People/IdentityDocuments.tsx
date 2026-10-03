import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { peopleAPI } from '../../api/people';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState } from '../../components/ui';
import { formatDate } from '../../utils/format';

const VERIFIED = [{ value: '', label: 'All' }, { value: 'yes', label: 'Verified' }, { value: 'no', label: 'Not verified' }];

// Every employee's identity documents in one place, for HR: filter by type,
// by whether they are verified, and those expiring in the next 60 days.
export default function IdentityDocuments() {
  const [docs, setDocs] = useState<any[] | null>(null);
  const [types, setTypes] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [type, setType] = useState('');
  const [verified, setVerified] = useState('');
  const [expiring, setExpiring] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await peopleAPI.listIdentityDocuments({ type, verified, expiring: expiring ? '1' : '' });
      setDocs(res.data.docs); setTypes(res.data.types); setError('');
    } catch (e: any) { setError(e.response?.data?.error || 'Failed to load'); }
  }, [type, verified, expiring]);
  useEffect(() => { load(); }, [load]);

  const typeLabel = (v: string) => types.find(t => t.value === v)?.label || v;

  return (
    <>
      <PageHeader title="Identity Documents"
        subtitle={<>PAN, Aadhaar, passport, driving licence and voter ID across all employees. <Link to="/people">Back to People</Link></>} />

      <div className="card card-pad mb-24">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ minWidth: 180 }}>
            <label>Type</label>
            <select className="select" value={type} onChange={e => setType(e.target.value)}>
              <option value="">All types</option>
              {types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label>Verified</label>
            <select className="select" value={verified} onChange={e => setVerified(e.target.value)}>
              {VERIFIED.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>
          <label className="checkbox-field" style={{ marginBottom: 6 }}>
            <input type="checkbox" checked={expiring} onChange={e => setExpiring(e.target.checked)} />
            Expiring in the next 60 days
          </label>
        </div>
      </div>

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {!docs ? <LoadingBlock label="Loading…" /> : docs.length === 0 ? (
        <div className="card"><EmptyState icon="▤" title="No documents match" message="Try different filters." /></div>
      ) : (
        <div className="card mb-24">
          <div className="card-header"><h3>{docs.length} document{docs.length === 1 ? '' : 's'}</h3></div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Employee</th><th>Type</th><th>Number</th><th>Expiry</th><th>Verified</th></tr></thead>
            <tbody>{docs.map(d => (
              <tr key={d.id}>
                <td><Link to={`/people/${d.person.id}`} style={{ fontWeight: 600 }}>{d.person.name}</Link>
                  <div className="text-muted" style={{ fontSize: 11.5 }}>{d.person.employeeNo}</div></td>
                <td>{typeLabel(d.docType)}{d.hasFile && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>File</span>}</td>
                <td>{d.number}</td>
                <td>{d.expiryDate ? <span className={d.expired ? 'text-danger' : ''}>{formatDate(d.expiryDate)}{d.expired && ' (expired)'}</span> : '—'}</td>
                <td>{d.verified
                  ? <span className="badge badge-success">Verified{d.verifiedByName ? ` · ${d.verifiedByName}` : ''}</span>
                  : <span className="badge badge-warning">Not verified</span>}</td>
              </tr>))}</tbody>
          </table></div>
        </div>
      )}
    </>
  );
}
