import { useState, useEffect, useCallback } from 'react';
import { selfAPI } from '../../api/self';
import { readFileAsDataUri, openDataFile } from '../../api/files';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, Modal } from '../../components/ui';
import { toast } from '../../components/feedback';
import { formatDate } from '../../utils/format';

const FIELD_LABELS: Record<string, string> = {
  email: 'Personal email', phone: 'Contact number', address: 'Present address', permanentAddress: 'Permanent address',
  emergencyName: 'Emergency contact', emergencyRelation: 'Relationship', emergencyNo: 'Emergency number',
  bankName: 'Bank', bankAccountName: 'Name as per bank', bankAccountNumber: 'Account number',
  bankBranch: 'Branch', bankAccountType: 'Account type', ifscCode: 'IFSC',
};
const STATUS_TONE: Record<string, string> = { PENDING: 'badge-warning', APPROVED: 'badge-success', REJECTED: 'badge-danger' };
const FAMILY_RELATIONS = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Other'];

export default function MyUpdates() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [propose, setPropose] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    try { setData((await selfAPI.getUpdates()).data); } catch (e: any) { setError(e.response?.data?.error || 'Failed to load'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const confirmDetails = async () => { try { await selfAPI.confirmDetails(); toast.success('Thanks — noted'); load(); } catch { setError('Could not confirm'); } };
  const acknowledge = async (p: any) => { try { await selfAPI.acknowledgePolicy(p.id); toast.success('Marked as read'); load(); } catch { setError('Could not record'); } };
  const openFile = async (kind: 'bulletins' | 'policies', id: string) => {
    try { openDataFile((await (kind === 'bulletins' ? selfAPI.getBulletinFile(id) : selfAPI.getPolicyFile(id))).data.fileData); } catch { setError('Could not open the file'); }
  };

  const section = propose?.section ? (data.sections.find((s: any) => s.value === propose.section)) : null;
  const submitPropose = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError('');
    if (section?.proof && !propose.file) { setFormError('Attach a proof (a cancelled cheque or a bank statement)'); return; }
    setSaving(true);
    try {
      const body: any = { section: propose.section, ...propose.values };
      if (propose.file) { body.fileData = await readFileAsDataUri(propose.file); body.fileName = propose.file.name; }
      await selfAPI.proposeChange(body);
      toast.success('Sent to HR for approval'); setPropose(null); load();
    } catch (e: any) { setFormError(e.response?.data?.error || 'Could not send'); } finally { setSaving(false); }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading…" />;
  const needsReview = !data.detailsConfirmedAt;
  const setV = (k: string, v: string) => setPropose((p: any) => ({ ...p, values: { ...p.values, [k]: v } }));

  return (
    <>
      <PageHeader title="Updates" subtitle="Notices, policies to read, and your own details." />
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="card card-pad mb-24">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h3 style={{ fontSize: 15, margin: '0 0 4px' }}>Your details</h3>
            <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
              {needsReview ? 'Please review your details and confirm they are up to date, or propose a change.'
                : `Confirmed up to date on ${formatDate(data.detailsConfirmedAt)}.`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setPropose({ section: '', values: {}, file: null })}>Propose a change</button>
            <button className="btn btn-primary" onClick={confirmDetails}>My details are correct</button>
          </div>
        </div>
        {data.myRequests.length > 0 && (
          <div style={{ marginTop: 14, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>My change requests</div>
            {data.myRequests.map((r: any) => (
              <div key={r.id} style={{ fontSize: 12.5, padding: '2px 0' }}>
                <span className={`badge ${STATUS_TONE[r.status]}`}>{r.status.toLowerCase()}</span>{' '}
                {(data.sections.find((s: any) => s.value === r.section) || {}).label || r.section}
                {r.reviewNote && <span className="text-muted"> — {r.reviewNote}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card mb-24">
        <div className="card-header"><h3>Notices ({data.bulletins.length})</h3></div>
        {data.bulletins.length === 0 ? <EmptyState icon="▦" title="Nothing new" message="" /> : (
          <div style={{ padding: '4px 22px 16px' }}>
            {data.bulletins.map((b: any) => (
              <div key={b.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontWeight: 600 }}>{b.title}</div>
                <div className="text-muted" style={{ fontSize: 11.5, marginBottom: 4 }}>{formatDate(b.createdAt)}{b.expiresOn ? ` · until ${formatDate(b.expiresOn)}` : ''}</div>
                {b.body && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{b.body}</div>}
                {b.hasFile && <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => openFile('bulletins', b.id)}>Open {b.fileName}</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card mb-24">
        <div className="card-header"><h3>Policies ({data.policies.length})</h3></div>
        {data.policies.length === 0 ? <EmptyState icon="▤" title="No policies" message="" /> : (
          <div style={{ padding: '4px 22px 16px' }}>
            {data.policies.map((p: any) => (
              <div key={p.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontWeight: 600 }}>{p.title}</div>
                  {p.acknowledged ? <span className="badge badge-success">Read</span>
                    : <button className="btn btn-primary btn-sm" onClick={() => acknowledge(p)}>I have read this</button>}
                </div>
                {p.body && <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4 }}>{p.body}</div>}
                {p.hasFile && <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => openFile('policies', p.id)}>Open {p.fileName}</button>}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal title="Propose a change" open={Boolean(propose)} onClose={() => setPropose(null)}>
        {propose && <form onSubmit={submitPropose}>
          <ErrorAlert message={formError} />
          <div className="field" style={{ marginBottom: 12 }}>
            <label>What do you want to change?</label>
            <select className="select" required value={propose.section} onChange={e => setPropose({ section: e.target.value, values: {}, file: null })}>
              <option value="">—</option>
              {data.sections.map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {section && section.value === 'FAMILY' && (
            <div className="form-grid" style={{ marginBottom: 12 }}>
              <div className="field"><label>Name *</label><input className="input" required value={propose.values.name || ''} onChange={e => setV('name', e.target.value)} /></div>
              <div className="field"><label>Relationship *</label>
                <select className="select" required value={propose.values.relation || ''} onChange={e => setV('relation', e.target.value)}>
                  <option value="">—</option>{FAMILY_RELATIONS.map(r => <option key={r}>{r}</option>)}
                </select></div>
              <div className="field"><label>Date of birth</label><input className="input" type="date" value={propose.values.dateOfBirth || ''} onChange={e => setV('dateOfBirth', e.target.value)} /></div>
            </div>
          )}
          {section && section.value !== 'FAMILY' && (
            <div className="form-grid" style={{ marginBottom: 12 }}>
              {section.fields.map((f: string) => (
                <div className="field" key={f} style={f === 'address' || f === 'permanentAddress' ? { gridColumn: '1 / -1' } : undefined}>
                  <label>{FIELD_LABELS[f] || f}</label>
                  {f === 'bankAccountType'
                    ? <select className="select" value={propose.values[f] || ''} onChange={e => setV(f, e.target.value)}><option value="">—</option><option value="SAVINGS">Savings</option><option value="CURRENT">Current</option></select>
                    : (f === 'address' || f === 'permanentAddress')
                      ? <textarea className="input" rows={2} value={propose.values[f] || ''} onChange={e => setV(f, e.target.value)} />
                      : <input className="input" value={propose.values[f] || ''} onChange={e => setV(f, e.target.value)} />}
                </div>
              ))}
            </div>
          )}
          {section?.proof && (
            <div className="field" style={{ marginBottom: 12 }}>
              <label>Proof * (cancelled cheque or bank statement)</label>
              <input className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setPropose((p: any) => ({ ...p, file: e.target.files?.[0] || null }))} />
            </div>
          )}
          <p className="text-muted" style={{ fontSize: 12.5 }}>Nothing changes until HR approves your request.</p>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setPropose(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !propose.section}>{saving ? 'Sending…' : 'Send to HR'}</button>
          </div>
        </form>}
      </Modal>
    </>
  );
}
