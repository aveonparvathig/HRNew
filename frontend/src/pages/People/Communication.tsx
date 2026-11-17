import { useState, useEffect, useCallback, useId, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { peopleAPI } from '../../api/people';
import { readFileAsDataUri, openDataFile } from '../../api/files';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, Modal } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';
import { Button } from '../../components/Button';
import { Tabs, type TabItem } from '../../components/Tabs';
import { Icon } from '../../components/Layout/nav';
import { formatDate } from '../../utils/format';

const TABS: TabItem<string>[] = [
  { key: 'requests', label: 'Change requests' },
  { key: 'mail', label: 'Mail' },
  { key: 'bulletins', label: 'Bulletins' },
  { key: 'policies', label: 'Policies' },
];
const dateTime = (v: string) => new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

// Scope picker shared by mail, bulletins and policies.
function AudiencePicker({ meta, value, onChange, allowChosen }: any) {
  const id = useId();
  const [people, setPeople] = useState<any[] | null>(null);
  useEffect(() => {
    if (value.scope === 'CHOSEN' && !people) peopleAPI.getPeople().then(r => setPeople(r.data.employees || []));
  }, [value.scope, people]);
  const scopes = (allowChosen ? meta.audienceScopes : meta.groupScopes) || [];
  return (
    <div>
      <div className="form-grid pl-mb-10">
        <div className="field">
          <label htmlFor={`${id}-scope`}>Who is this for?</label>
          <select id={`${id}-scope`} className="select" value={value.scope} onChange={e => onChange({ ...value, scope: e.target.value, scopeValue: '' })}>
            {scopes.map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        {value.scope === 'DEPARTMENT' && (
          <div className="field"><label htmlFor={`${id}-dept`}>Department</label>
            <select id={`${id}-dept`} className="select" value={value.scopeValue} onChange={e => onChange({ ...value, scopeValue: e.target.value })}>
              <option value="">—</option>{(meta.departments || []).map((d: string) => <option key={d}>{d}</option>)}
            </select></div>
        )}
        {value.scope === 'LOCATION' && (
          <div className="field"><label htmlFor={`${id}-loc`}>Work location</label>
            <select id={`${id}-loc`} className="select" value={value.scopeValue} onChange={e => onChange({ ...value, scopeValue: e.target.value })}>
              <option value="">—</option>{(meta.locations || []).map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select></div>
        )}
      </div>
      {value.scope === 'CHOSEN' && (
        <div className="pl-picker">
          {!people ? <LoadingBlock label="Loading…" /> : people.map(p => (
            <label key={p.id} className="checkbox-field pl-picker-row">
              <input type="checkbox" checked={value.personIds.includes(p.id)}
                onChange={e => onChange({ ...value, personIds: e.target.checked ? [...value.personIds, p.id] : value.personIds.filter((x: string) => x !== p.id) })} />
              {p.name} <span className="text-muted num">· {p.employeeNo}</span>
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
          <h3 className="pl-card-title pl-tight">Details confirmation (data drive)</h3>
          <p className="pl-note">
            <span className="num">{drive.confirmed}</span> of <span className="num">{drive.total}</span> employees have confirmed their details are up to date.
            {drive.total - drive.confirmed > 0 && <> <span className="num">{drive.total - drive.confirmed}</span> have not yet.</>}
          </p>
        </div>
      )}
      <div className="card mb-24">
        <div className="card-header"><h3>Pending changes <span className="num">({data.requests.length})</span></h3></div>
        {data.requests.length === 0 ? <EmptyState icon="✓" title="Nothing waiting" message="Changes employees propose show up here for approval." /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Employee</th><th>Section</th><th>Proposed change</th><th>Proof</th><th /></tr></thead>
            <tbody>{data.requests.map((r: any) => (
              <tr key={r.id}>
                <td><Link to={`/people/${r.person.id}`} className="pl-strong">{r.person.name}</Link>
                  <div className="pl-sub num">{r.person.employeeNo} · {dateTime(r.createdAt)}</div></td>
                <td>{(meta.changeSections.find((s: any) => s.value === r.section) || {}).label || r.section}</td>
                <td className="pl-cell-sm">
                  {r.section === 'FAMILY'
                    ? <span>{r.changes.name} — {r.changes.relation}{r.changes.nomineeShare ? `, nominee ${r.changes.nomineeShare}%` : ''}</span>
                    : Object.values(r.changes).map((c: any) => <div key={c.label}>{c.label}: <span className="text-muted">{c.from || '—'}</span> → <strong>{c.to}</strong></div>)}
                </td>
                <td>{r.hasFile ? <Button size="sm" onClick={() => openProof(r)}>Open</Button> : '—'}</td>
                <td><div className="row-actions">
                  <Button variant="primary" size="sm" onClick={() => review(r, true)}>Approve</Button>
                  <Button variant="danger" size="sm" onClick={() => review(r, false)}>Reject</Button>
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
        <h3 className="pl-card-title">Mail to a group</h3>
        <div className="field pl-mb-10"><label htmlFor="pl-mail-subject">Subject *</label>
          <input id="pl-mail-subject" className="input" maxLength={200} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} /></div>
        <div className="field pl-mb-10"><label htmlFor="pl-mail-body">Message *</label>
          <textarea id="pl-mail-body" className="input" rows={5} maxLength={10000} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></div>
        <AudiencePicker meta={meta} value={form} onChange={(v: any) => { setForm({ ...form, ...v }); setCount(null); }} allowChosen />
        <div className="cluster">
          <Button icon="users" onClick={check}>Check recipients</Button>
          {count && <span className="text-sm-muted"><span className="num">{count.recipients}</span> will get it{count.withoutEmail ? <>, <span className="num">{count.withoutEmail}</span> have no email</> : ''}.</span>}
          <Button variant="accent" icon="mail" className="pl-push" loading={sending}
            disabled={!form.subject || !form.body || !count?.recipients} onClick={send}>Send</Button>
        </div>
      </div>
      <div className="card mb-24">
        <div className="card-header"><h3>Recent mail <span className="num">({campaigns.length})</span></h3></div>
        {campaigns.length === 0 ? <EmptyState icon="✉" title="No mail sent yet" message="" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Subject</th><th>To</th><th>When</th><th>Result</th></tr></thead>
            <tbody>{campaigns.map(c => (
              <tr key={c.id}>
                <td className="pl-strong">{c.subject}</td>
                <td className="text-muted">{c.scopeLabel}</td>
                <td className="text-muted num">{dateTime(c.createdAt)}</td>
                <td>{c.status === 'SENDING'
                  ? <span className="badge badge-info">Sending… <span className="num">{c.sent + c.failed}/{c.total}</span></span>
                  : <span><span className="num">{c.sent}</span> sent{c.failed ? <span className="text-danger">, <span className="num">{c.failed}</span> failed</span> : ''}</span>}</td>
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
        <div className="card-header"><h3>Bulletins <span className="num">({rows.length})</span></h3>
          <Button variant="accent" size="sm" icon="plus" onClick={() => setForm({ title: '', body: '', scope: 'EVERYONE', scopeValue: '', expiresOn: '', isActive: true, file: null })}>New notice</Button></div>
        {rows.length === 0 ? <EmptyState icon="▦" title="No notices" message="" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Title</th><th>Audience</th><th>Expires</th><th>Active</th><th /></tr></thead>
            <tbody>{rows.map(b => (
              <tr key={b.id}>
                <td className="pl-strong">{b.title}{b.hasFile && <span className="badge badge-neutral pl-badge-gap">File</span>}</td>
                <td className="text-muted">{b.scopeLabel}</td>
                <td className="text-muted num">{b.expiresOn ? formatDate(b.expiresOn) : '—'}</td>
                <td>{b.isActive ? 'Yes' : 'No'}</td>
                <td><div className="row-actions">
                  <Button size="sm" onClick={() => setForm({ ...b, expiresOn: b.expiresOn || '', file: null })}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => remove(b)}>Remove</Button>
                </div></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      <Modal title={form?.id ? 'Edit notice' : 'New notice'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <div className="field pl-mb-10"><label htmlFor="pl-bul-title">Title *</label>
            <input id="pl-bul-title" className="input" required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div className="field pl-mb-10"><label htmlFor="pl-bul-body">Text</label>
            <textarea id="pl-bul-body" className="input" rows={4} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></div>
          <AudiencePicker meta={meta} value={{ ...form, personIds: [] }} onChange={(v: any) => setForm({ ...form, scope: v.scope, scopeValue: v.scopeValue })} />
          <div className="form-grid pl-mb-10">
            <div className="field"><label htmlFor="pl-bul-expires">Expires on</label>
              <input id="pl-bul-expires" className="input" type="date" value={form.expiresOn} onChange={e => setForm({ ...form, expiresOn: e.target.value })} /></div>
            {!form.id && <div className="field"><label htmlFor="pl-bul-file">Attachment</label>
              <input id="pl-bul-file" className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })} /></div>}
          </div>
          <label className="checkbox-field"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Active</label>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
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
        <div className="card-header"><h3>Policies <span className="num">({rows.length})</span></h3>
          <Button variant="accent" size="sm" icon="plus" onClick={() => setForm({ title: '', body: '', scope: 'EVERYONE', scopeValue: '', isActive: true, file: null })}>New policy</Button></div>
        {rows.length === 0 ? <EmptyState icon="▤" title="No policies" message="" /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Title</th><th>Audience</th><th>Read by</th><th /></tr></thead>
            <tbody>{rows.map(p => (
              <tr key={p.id}>
                <td className="pl-strong">{p.title}{p.hasFile && <span className="badge badge-neutral pl-badge-gap">File</span>}</td>
                <td className="text-muted">{p.scopeLabel}</td>
                <td><button type="button" className="link-button" onClick={() => showCoverage(p)}><span className="num">{p.acknowledged}</span> read →</button></td>
                <td><div className="row-actions">
                  <Button size="sm" onClick={() => setForm({ ...p, file: null })}>Edit</Button>
                  <Button variant="danger" size="sm" onClick={() => remove(p)}>Remove</Button>
                </div></td>
              </tr>))}</tbody>
          </table></div>
        )}
      </div>
      <Modal title={form?.id ? 'Edit policy' : 'New policy'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <div className="field pl-mb-10"><label htmlFor="pl-pol-title">Title *</label>
            <input id="pl-pol-title" className="input" required maxLength={200} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
          <div className="field pl-mb-10"><label htmlFor="pl-pol-body">Text</label>
            <textarea id="pl-pol-body" className="input" rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></div>
          <AudiencePicker meta={meta} value={{ ...form, personIds: [] }} onChange={(v: any) => setForm({ ...form, scope: v.scope, scopeValue: v.scopeValue })} />
          {!form.id && <div className="field pl-mb-10"><label htmlFor="pl-pol-file">Document (optional)</label>
            <input id="pl-pol-file" className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })} /></div>}
          <label className="checkbox-field"><input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} /> Published</label>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>}
      </Modal>
      <Modal title={coverage ? `Who has read "${coverage.title}"` : ''} open={Boolean(coverage)} onClose={() => setCoverage(null)}>
        {coverage && <div>
          <p className="modal-lede"><span className="num">{coverage.read.length}</span> read · <span className="num">{coverage.notRead.length}</span> not yet</p>
          <div className="pl-scroll-320">
            {coverage.read.map((e: any) => (
              <div key={e.id} className="pl-cov-row">
                <Icon name="checkCircle" size={14} className="pl-cov-icon" />
                <span>{e.name} <span className="text-muted num">· {formatDate(e.acknowledgedAt)}</span></span>
              </div>
            ))}
            {coverage.notRead.map((e: any) => (
              <div key={e.id} className="pl-cov-row pl-cov-pending">
                <Icon name="clock" size={14} className="pl-cov-icon" />
                <span>{e.name} <span className="num">· {e.employeeNo}</span></span>
              </div>
            ))}
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
      <Tabs label="Communication sections" items={TABS} value={tab} onChange={key => setParams({ tab: key })} />
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {meta ? content : !error && <LoadingBlock label="Loading…" />}
    </>
  );
}
