import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { peopleAPI } from '../../api/people';
import { readFileAsDataUri, openDataFile } from '../../api/files';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, Modal } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';
import { formatDate } from '../../utils/format';

const TABS = [
  { key: 'requests', label: 'Change Requests' },
  { key: 'mail', label: 'Mail' },
  { key: 'bulletins', label: 'Bulletins' },
  { key: 'policies', label: 'Policies' },
];
const dateTime = (v: string) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// Scope picker shared by mail, bulletins and policies.
function AudiencePicker({ meta, value, onChange, allowChosen }: any) {
  const [people, setPeople] = useState<any[] | null>(null);
  useEffect(() => {
    if (value.scope === 'CHOSEN' && !people) peopleAPI.getPeople().then(r => setPeople(r.data.employees || []));
  }, [value.scope, people]);
  const scopes = (allowChosen ? meta.audienceScopes : meta.groupScopes) || [];
  return (
    <div>
      <div className="form-grid" style={{ marginBottom: 10 }}>
        <div className="field">
          <label>Who is this for?</label>
          <select className="select" value={value.scope} onChange={e => onChange({ ...value, scope: e.target.value, scopeValue: '' })}>
            {scopes.map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        {value.scope === 'DEPARTMENT' && (
          <div className="field"><label>Department</label>
            <select className="select" value={value.scopeValue} onChange={e => onChange({ ...value, scopeValue: e.target.value })}>
              <option value="">—</option>{(meta.departments || []).map((d: string) => <option key={d}>{d}</option>)}
            </select></div>
        )}
        {value.scope === 'LOCATION' && (
          <div className="field"><label>Work location</label>
            <select className="select" value={value.scopeValue} onChange={e => onChange({ ...value, scopeValue: e.target.value })}>
              <option value="">—</option>{(meta.locations || []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></div>
        )}
      </div>
      {value.scope === 'CHOSEN' && (
        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
          {!people ? <LoadingBlock label="Loading…" /> : people.map(p => (
            <label key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '2px 0' }}>
              <input type="checkbox" checked={value.personIds.includes(p.id)}
                onChange={e => onChange({ ...value, personIds: e.target.checked ? [...value.personIds, p.id] : value.personIds.filter((x: string) => x !== p.id) })} />
              {p.name} <span className="text-muted">· {p.employeeNo}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Change requests ---------------------------------------------------------------------------
function RequestsTab({ meta }: any) {
  const [data, setData] = useState<any>(null);
  const [drive, setDrive] = useState<any>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setData((await peopleAPI.getChangeRequests('PENDING')).data);
      setDrive((await peopleAPI.getDetailsConfirmation()).data);
    } catch (e: any) { setError(e.response?.data?.error || 'Failed to load'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const review = async (r: any, approve: boolean) => {
    let note = '';
    if (!approve) {
      const ok = await confirmDialog({ title: `Reject ${r.person.name}'s change?`, message: 'The employee is told it was not accepted.', confirmLabel: 'Reject', danger: true });
      if (!ok) return;
    }
    try { await peopleAPI.reviewChangeRequest(r.id, { approve, note }); toast.success(approve ? 'Approved and applied' : 'Rejected'); load(); }
    catch (e: any) { setError(e.response?.data?.error || 'Could not review'); }
  };
  const openProof = async (r: any) => { try { openDataFile((await peopleAPI.getChangeRequestFile(r.id)).data.fileData); } catch { setError('Could not open the proof'); } };
  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading…" />;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {drive && (
        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Details confirmation (data drive)</h3>
          <p className="text-muted" style={{ fontSize: 13, margin: 0 }}>
            {drive.confirmed} of {drive.total} employees have confirmed their details are up to date.
            {drive.total - drive.confirmed > 0 && ` ${drive.total - drive.confirmed} have not yet.`}
          </p>
        </div>
      )}
      <div className="card mb-24">
        <div className="card-header"><h3>Pending changes ({data.requests.length})</h3></div>
        {data.requests.length === 0 ? <EmptyState icon="✓" title="Nothing waiting" message="Changes employees propose show up here for approval." /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Employee</th><th>Section</th><th>Proposed change</th><th>Proof</th><th /></tr></thead>
            <tbody>{data.requests.map((r: any) => (
              <tr key={r.id}>
                <td><Link to={`/people/${r.person.id}`} style={{ fontWeight: 600 }}>{r.person.name}</Link>
                  <div className="text-muted" style={{ fontSize: 11.5 }}>{r.person.employeeNo} · {dateTime(r.createdAt)}</div></td>
                <td>{(meta.changeSections.find((s: any) => s.value === r.section) || {}).label || r.section}</td>
                <td style={{ fontSize: 12.5 }}>
                  {r.section === 'FAMILY'
                    ? <span>{r.changes.name} — {r.changes.relation}{r.changes.nomineeShare ? `, nominee ${r.changes.nomineeShare}%` : ''}</span>
                    : Object.values(r.changes).map((c: any) => <div key={c.label}>{c.label}: <span className="text-muted">{c.from || '—'}</span> → <strong>{c.to}</strong></div>)}
                </td>
                <td>{r.hasFile ? <button className="btn btn-secondary btn-sm" onClick={() => openProof(r)}>Open</button> : '—'}</td>
                <td><div className="row-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => review(r, true)}>Approve</button>
                  <button className="btn btn-danger btn-sm" onClick={() => review(r, false)}>Reject</button>
                </div></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

// ---- Mail --------------------------------------------------------------------------------------
function MailTab({ meta }: any) {
  const [form, setForm] = useState<any>({ subject: '', body: '', scope: 'EVERYONE', scopeValue: '', personIds: [] });
  const [count, setCount] = useState<any>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => { setCampaigns((await peopleAPI.getCampaigns()).data.campaigns); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!campaigns.some(c => c.status === 'SENDING')) return;
    const t = setInterval(load, 1500); return () => clearInterval(t);
  }, [campaigns, load]);

  const aud = () => ({ scope: form.scope, scopeValue: form.scopeValue, personIds: form.personIds });
  const check = async () => { try { setCount((await peopleAPI.mailAudienceCount(aud())).data); setError(''); } catch (e: any) { setError(e.response?.data?.error || 'Could not check'); } };
  const send = async () => {
    if (!await confirmDialog({ title: 'Send this mail?', message: `It goes to ${count?.recipients ?? 'the selected'} employees, one at a time.`, confirmLabel: 'Send' })) return;
    setSending(true);
    try { await peopleAPI.createCampaign({ ...form, ...aud() }); toast.success('Sending started'); setForm({ subject: '', body: '', scope: 'EVERYONE', scopeValue: '', personIds: [] }); setCount(null); load(); }
    catch (e: any) { setError(e.response?.data?.error || 'Could not send'); }
    finally { setSending(false); }
  };

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 10 }}>Mail to a group</h3>
        <div className="field" style={{ marginBottom: 10 }}><label>Subject *</label>
          <input className="input" maxLength={200} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></div>
        <div className="field" style={{ marginBottom: 10 }}><label>Message *</label>
          <textarea className="input" rows={5} maxLength={10000} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></div>
        <AudiencePicker meta={meta} value={form} onChange={(v: any) => { setForm({ ...form, ...v }); setCount(null); }} allowChosen />
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={check}>Check recipients</button>
          {count && <span className="text-muted" style={{ fontSize: 13 }}>{count.recipients} will get it{count.withoutEmail ? `, ${count.withoutEmail} have no email` : ''}.</span>}
          <button className="btn btn-primary" disabled={sending || !form.subject || !form.body || !count?.recipients} onClick={send} style={{ marginLeft: 'auto' }}>Send</button>
        </div>
      </div>
      <div className="card mb-24">
        <div className="card-header"><h3>Recent mail ({campaigns.length})</h3></div>
        {campaigns.length === 0 ? <EmptyState icon="✉" title="No mail sent yet" message="" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Subject</th><th>To</th><th>When</th><th>Result</th></tr></thead>
            <tbody>{campaigns.map(c => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.subject}</td>
                <td className="text-muted">{c.scopeLabel}</td>
                <td className="text-muted">{dateTime(c.createdAt)}</td>
                <td>{c.status === 'SENDING'
                  ? <span className="badge badge-info">Sending… {c.sent + c.failed}/{c.total}</span>
                  : <span>{c.sent} sent{c.failed ? <span className="text-danger">, {c.failed} failed</span> : ''}</span>}</td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

// ---- Bulletins ---------------------------------------------------------------------------------
function BulletinsTab({ meta }: any) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => { try { setRows((await peopleAPI.getBulletins()).data.bulletins); } catch (e: any) { setError(e.response?.data?.error || 'Failed'); } }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const body: any = { title: form.title, body: form.body, scope: form.scope, scopeValue: form.scopeValue, expiresOn: form.expiresOn, isActive: form.isActive };
      if (form.file) { body.fileData = await readFileAsDataUri(form.file); body.fileName = form.file.name; }
      if (form.id) await peopleAPI.updateBulletin(form.id, body); else await peopleAPI.saveBulletin(body);
      toast.success('Saved'); setForm(null); load();
    } catch (e: any) { setError(e.response?.data?.error || 'Could not save'); } finally { setSaving(false); }
  };
  const remove = async (b: any) => { if (!await confirmDialog({ title: `Remove "${b.title}"?`, message: 'The notice is deleted.', confirmLabel: 'Remove', danger: true })) return; await peopleAPI.deleteBulletin(b.id); load(); };
  if (!rows) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading…" />;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <div className="card mb-24">
        <div className="card-header"><h3>Bulletins ({rows.length})</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setForm({ title: '', body: '', scope: 'EVERYONE', scopeValue: '', expiresOn: '', isActive: true, file: null })}>+ New Notice</button></div>
        {rows.length === 0 ? <EmptyState icon="▦" title="No notices" message="" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Title</th><th>Audience</th><th>Expires</th><th>Active</th><th /></tr></thead>
            <tbody>{rows.map(b => (
              <tr key={b.id}>
                <td style={{ fontWeight: 600 }}>{b.title}{b.hasFile && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>File</span>}</td>
                <td className="text-muted">{b.scopeLabel}</td>
                <td className="text-muted">{b.expiresOn ? formatDate(b.expiresOn) : '—'}</td>
                <td>{b.isActive ? 'Yes' : 'No'}</td>
                <td><div className="row-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => setForm({ ...b, expiresOn: b.expiresOn || '', file: null })}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(b)}>Remove</button>
                </div></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      <Modal title={form?.id ? 'Edit Notice' : 'New Notice'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <div className="field" style={{ marginBottom: 10 }}><label>Title *</label>
            <input className="input" required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div className="field" style={{ marginBottom: 10 }}><label>Text</label>
            <textarea className="input" rows={4} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></div>
          <AudiencePicker meta={meta} value={{ ...form, personIds: [] }} onChange={(v: any) => setForm({ ...form, scope: v.scope, scopeValue: v.scopeValue })} />
          <div className="form-grid" style={{ marginBottom: 10 }}>
            <div className="field"><label>Expires on</label>
              <input className="input" type="date" value={form.expiresOn} onChange={e => setForm({ ...form, expiresOn: e.target.value })} /></div>
            {!form.id && <div className="field"><label>Attachment</label>
              <input className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })} /></div>}
          </div>
          <label className="checkbox-field"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>}
      </Modal>
    </>
  );
}

// ---- Policies ----------------------------------------------------------------------------------
function PoliciesTab({ meta }: any) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [coverage, setCoverage] = useState<any>(null);
  const load = useCallback(async () => { try { setRows((await peopleAPI.getPolicies()).data.policies); } catch (e: any) { setError(e.response?.data?.error || 'Failed'); } }, []);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const body: any = { title: form.title, body: form.body, scope: form.scope, scopeValue: form.scopeValue, isActive: form.isActive };
      if (form.file) { body.fileData = await readFileAsDataUri(form.file); body.fileName = form.file.name; }
      if (form.id) await peopleAPI.updatePolicy(form.id, body); else await peopleAPI.savePolicy(body);
      toast.success('Saved'); setForm(null); load();
    } catch (e: any) { setError(e.response?.data?.error || 'Could not save'); } finally { setSaving(false); }
  };
  const remove = async (p: any) => { if (!await confirmDialog({ title: `Remove "${p.title}"?`, message: 'The policy and its read records are deleted.', confirmLabel: 'Remove', danger: true })) return; await peopleAPI.deletePolicy(p.id); load(); };
  const showCoverage = async (p: any) => { try { setCoverage((await peopleAPI.getPolicyCoverage(p.id)).data); } catch (e: any) { setError(e.response?.data?.error || 'Failed'); } };
  if (!rows) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading…" />;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <div className="card mb-24">
        <div className="card-header"><h3>Policies ({rows.length})</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setForm({ title: '', body: '', scope: 'EVERYONE', scopeValue: '', isActive: true, file: null })}>+ New Policy</button></div>
        {rows.length === 0 ? <EmptyState icon="▤" title="No policies" message="" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Title</th><th>Audience</th><th>Read by</th><th /></tr></thead>
            <tbody>{rows.map(p => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.title}{p.hasFile && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>File</span>}</td>
                <td className="text-muted">{p.scopeLabel}</td>
                <td><button className="link-button" onClick={() => showCoverage(p)}>{p.acknowledged} read →</button></td>
                <td><div className="row-actions">
                  <button className="btn btn-secondary btn-sm" onClick={() => setForm({ ...p, file: null })}>Edit</button>
                  <button className="btn btn-danger btn-sm" onClick={() => remove(p)}>Remove</button>
                </div></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      <Modal title={form?.id ? 'Edit Policy' : 'New Policy'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <div className="field" style={{ marginBottom: 10 }}><label>Title *</label>
            <input className="input" required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div className="field" style={{ marginBottom: 10 }}><label>Text</label>
            <textarea className="input" rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></div>
          <AudiencePicker meta={meta} value={{ ...form, personIds: [] }} onChange={(v: any) => setForm({ ...form, scope: v.scope, scopeValue: v.scopeValue })} />
          {!form.id && <div className="field" style={{ marginBottom: 10 }}><label>Document (optional)</label>
            <input className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })} /></div>}
          <label className="checkbox-field"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Published</label>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>}
      </Modal>
      <Modal title={coverage ? `Who has read "${coverage.title}"` : ''} open={Boolean(coverage)} onClose={() => setCoverage(null)}>
        {coverage && <div>
          <p className="text-muted" style={{ fontSize: 13 }}>{coverage.read.length} read · {coverage.notRead.length} not yet</p>
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {coverage.read.map((e: any) => <div key={e.id} style={{ fontSize: 13, padding: '2px 0' }}>✓ {e.name} <span className="text-muted">· {formatDate(e.acknowledgedAt)}</span></div>)}
            {coverage.notRead.map((e: any) => <div key={e.id} style={{ fontSize: 13, padding: '2px 0' }} className="text-muted">○ {e.name} · {e.employeeNo}</div>)}
          </div>
        </div>}
      </Modal>
    </>
  );
}

export default function Communication() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab')! : 'requests';
  const [meta, setMeta] = useState<any>(null);
  const [error, setError] = useState('');
  useEffect(() => { peopleAPI.getCommunicationMeta().then(r => setMeta(r.data)).catch(e => setError(e.response?.data?.error || 'Failed to load')); }, []);

  let content: ReactNode = null;
  if (meta) content = tab === 'mail' ? <MailTab meta={meta} /> : tab === 'bulletins' ? <BulletinsTab meta={meta} /> : tab === 'policies' ? <PoliciesTab meta={meta} /> : <RequestsTab meta={meta} />;

  return (
    <>
      <PageHeader title="Communication" subtitle={<>Approve detail changes, mail a group, post notices and publish policies. <Link to="/people">Back to People</Link></>} />
      <div className="tabs" role="tablist">
        {TABS.map(t => <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setParams({ tab: t.key })}>{t.label}</button>)}
      </div>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {meta ? content : !error && <LoadingBlock label="Loading…" />}
    </>
  );
}
