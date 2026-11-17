import { useState, useEffect, useCallback } from 'react';
import { selfAPI } from '../../api/self';
import { readFileAsDataUri, openDataFile } from '../../api/files';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, Modal } from '../../components/ui';
import { Button } from '../../components/Button';
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
        <div className="cluster between mp-split">
          <div>
            <h3 className="mp-card-title">Your details</h3>
            <p className="text-muted mp-card-sub">
              {needsReview ? 'Review your details and confirm they are up to date, or propose a change.'
                : `Confirmed up to date on ${formatDate(data.detailsConfirmedAt)}.`}
            </p>
          </div>
          <div className="cluster mp-actions">
            <Button onClick={() => setPropose({ section: '', values: {}, file: null })}>Propose a change</Button>
            <Button variant={needsReview ? 'accent' : 'secondary'} icon="checkCircle" onClick={confirmDetails}>My details are correct</Button>
          </div>
        </div>
        {data.myRequests.length > 0 && (
          <div className="mp-requests">
            <div className="mp-requests-title">My change requests</div>
            {data.myRequests.map((r: any) => (
              <div key={r.id} className="mp-request-row">
                <span className={`badge ${STATUS_TONE[r.status]}`}>{r.status.toLowerCase()}</span>{' '}
                {(data.sections.find((s: any) => s.value === r.section) || {}).label || r.section}
                {r.reviewNote && <span className="text-muted"> — {r.reviewNote}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card mb-24">
        <div className="card-header"><h3>Notices <span className="num">({data.bulletins.length})</span></h3></div>
        {data.bulletins.length === 0 ? <EmptyState icon="▦" title="Nothing new" message="" /> : (
          <div className="mp-feed">
            {data.bulletins.map((b: any) => (
              <div key={b.id} className="mp-feed-item">
                <div className="mp-feed-title">{b.title}</div>
                <div className="mp-feed-meta">{formatDate(b.createdAt)}{b.expiresOn ? ` · until ${formatDate(b.expiresOn)}` : ''}</div>
                {b.body && <div className="mp-feed-body">{b.body}</div>}
                {b.hasFile && <Button size="sm" icon="download" className="mp-feed-file" onClick={() => openFile('bulletins', b.id)}>Open {b.fileName}</Button>}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card mb-24">
        <div className="card-header"><h3>Policies <span className="num">({data.policies.length})</span></h3></div>
        {data.policies.length === 0 ? <EmptyState icon="▤" title="No policies" message="" /> : (
          <div className="mp-feed">
            {data.policies.map((p: any) => (
              <div key={p.id} className="mp-feed-item">
                <div className="cluster between mp-split">
                  <div className="mp-feed-title">{p.title}</div>
                  {p.acknowledged ? <span className="badge badge-success">Read</span>
                    : <Button size="sm" icon="checkCircle" onClick={() => acknowledge(p)}>I have read this</Button>}
                </div>
                {p.body && <div className="mp-feed-body mp-feed-body-gap">{p.body}</div>}
                {p.hasFile && <Button size="sm" icon="download" className="mp-feed-file" onClick={() => openFile('policies', p.id)}>Open {p.fileName}</Button>}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal title="Propose a change" open={Boolean(propose)} onClose={() => setPropose(null)}>
        {propose && <form onSubmit={submitPropose}>
          <ErrorAlert message={formError} />
          <div className="field mp-mb-12">
            <label htmlFor="mp-propose-section">What do you want to change?</label>
            <select id="mp-propose-section" className="select" required value={propose.section} onChange={e => setPropose({ section: e.target.value, values: {}, file: null })}>
              <option value="">—</option>
              {data.sections.map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {section && section.value === 'FAMILY' && (
            <div className="form-grid mp-mb-12">
              <div className="field"><label htmlFor="mp-fam-name">Name *</label><input id="mp-fam-name" className="input" required value={propose.values.name || ''} onChange={e => setV('name', e.target.value)} /></div>
              <div className="field"><label htmlFor="mp-fam-relation">Relationship *</label>
                <select id="mp-fam-relation" className="select" required value={propose.values.relation || ''} onChange={e => setV('relation', e.target.value)}>
                  <option value="">—</option>{FAMILY_RELATIONS.map(r => <option key={r}>{r}</option>)}
                </select></div>
              <div className="field"><label htmlFor="mp-fam-dob">Date of birth</label><input id="mp-fam-dob" className="input" type="date" value={propose.values.dateOfBirth || ''} onChange={e => setV('dateOfBirth', e.target.value)} /></div>
            </div>
          )}
          {section && section.value !== 'FAMILY' && (
            <div className="form-grid mp-mb-12">
              {section.fields.map((f: string) => (
                <div className={`field${f === 'address' || f === 'permanentAddress' ? ' mp-span-all' : ''}`} key={f}>
                  <label htmlFor={`mp-f-${f}`}>{FIELD_LABELS[f] || f}</label>
                  {f === 'bankAccountType'
                    ? <select id={`mp-f-${f}`} className="select" value={propose.values[f] || ''} onChange={e => setV(f, e.target.value)}><option value="">—</option><option value="SAVINGS">Savings</option><option value="CURRENT">Current</option></select>
                    : (f === 'address' || f === 'permanentAddress')
                      ? <textarea id={`mp-f-${f}`} className="input" rows={2} value={propose.values[f] || ''} onChange={e => setV(f, e.target.value)} />
                      : <input id={`mp-f-${f}`} className="input" value={propose.values[f] || ''} onChange={e => setV(f, e.target.value)} />}
                </div>
              ))}
            </div>
          )}
          {section?.proof && (
            <div className="field mp-mb-12">
              <label htmlFor="mp-proof">Proof * (cancelled cheque or bank statement)</label>
              <input id="mp-proof" className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setPropose((p: any) => ({ ...p, file: e.target.files?.[0] || null }))} />
            </div>
          )}
          <p className="text-sm-muted">Nothing changes until HR approves your request.</p>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setPropose(null)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving} disabled={!propose.section}>{saving ? 'Sending…' : 'Send to HR'}</Button>
          </div>
        </form>}
      </Modal>
    </>
  );
}
