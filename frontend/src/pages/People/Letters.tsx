import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { peopleAPI } from '../../api/people';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, Modal } from '../../components/ui';
import { confirmDialog, toast } from '../../components/feedback';
import { LetterFields } from '../../components/DocumentModal';
import { formatDate } from '../../utils/format';

const TABS = [
  { key: 'issue', label: 'Issue Letters' },
  { key: 'templates', label: 'Templates' },
];

const LEFT = ['RESIGNED', 'TERMINATED'];
// Filled from each person's own record, so they are not asked for here
const OWN = [
  'refNo', 'recipientAddress', 'employeeNo', 'designation', 'department', 'grade', 'workLocation', 'joiningDate', 'joinDate',
  'leavingDate', 'monthlyPackage', 'reportingTo', 'internshipRole', 'collegeName', 'course', 'rollNumber', 'startDate', 'endDate',
];
const BLANK_TEMPLATE = { id: '', name: '', audience: 'CANDIDATE', subject: '', salutation: 'Dear {{recipientName}},', body: '', builtIn: false };

function Sheet({ html }: { html: string }) {
  return <div className="letter-sheet" style={{ margin: 0 }}><div dangerouslySetInnerHTML={{ __html: html }} /></div>;
}

// ---- The same letter for several people ----------------------------------------------------
function IssueTab({ templates }: { templates: any[] }) {
  const active = templates.filter(t => t.isActive);
  const [code, setCode] = useState(active[0]?.code || '');
  const [people, setPeople] = useState<any>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [showLeft, setShowLeft] = useState(false);
  const [form, setForm] = useState<any>({});
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ name: string; html: string } | null>(null);
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    peopleAPI.getPeople({}).then(res => setPeople(res.data)).catch(err => setError(err.response?.data?.error || 'Failed to load people'));
  }, []);

  const template = active.find(t => t.code === code);
  const audience: any[] = useMemo(() => {
    if (!people || !template) return [];
    const list = template.audience === 'INTERN' ? people.interns : [...people.employees, ...people.candidates];
    return list.filter((p: any) => showLeft || !LEFT.includes(p.employmentStatus));
  }, [people, template, showLeft]);
  const q = search.trim().toLowerCase();
  const shown = q ? audience.filter(p => `${p.name} ${p.employeeNo || ''} ${p.designation || ''} ${p.department || ''}`.toLowerCase().includes(q)) : audience;
  const chosen = audience.filter(p => picked.has(p.id));

  const pickTemplate = (next: string) => { setCode(next); setPicked(new Set()); setForm({}); setResult(null); };
  const toggle = (id: string) => setPicked(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allShown = shown.length > 0 && shown.every(p => picked.has(p.id));
  const toggleAll = () => setPicked(prev => {
    const next = new Set(prev);
    for (const p of shown) { if (allShown) next.delete(p.id); else next.add(p.id); }
    return next;
  });

  const showPreview = async (person: any) => {
    setBusy('preview');
    try {
      const res = await peopleAPI.previewLetter({ code, personId: person.id, formData: form });
      setPreview({ name: person.name, html: res.data.html });
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not make the preview');
    } finally {
      setBusy('');
    }
  };

  const generate = async () => {
    if (!await confirmDialog({
      title: `Write ${chosen.length} ${chosen.length === 1 ? 'letter' : 'letters'}?`,
      message: `${template.name} for ${chosen.length === 1 ? chosen[0].name : `${chosen.length} people`}. Each is saved on the person's record${visible ? ' and shown to them under My Documents' : ''}.`,
      confirmLabel: 'Write Letters',
    })) return;
    setBusy('generate');
    try {
      const res = await peopleAPI.createLetters({ docType: code, personIds: chosen.map(p => p.id), formData: form, visibleToEmployee: visible });
      setResult(res.data);
      setPicked(new Set());
      setError('');
      toast.success(res.data.message);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not write the letters');
    } finally {
      setBusy('');
    }
  };

  if (active.length === 0) return <div className="card"><EmptyState icon="▤" title="No letter is switched on" message="Switch one on under Templates." /></div>;
  if (!people) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading people…" />;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {result && (
        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>{result.message}</h3>
          {result.issued.map((l: any) => (
            <div key={l.id} className="list-row" style={{ padding: '7px 0' }}>
              <Link to={`/people/documents/${l.id}`} style={{ fontWeight: 600 }}>{l.title}</Link>
              <span className="text-muted" style={{ fontSize: 12.5 }}>{l.refNo ? `Ref ${l.refNo}` : ''}</span>
            </div>
          ))}
          {result.skipped.map((s: any) => (
            <div key={s.id} className="list-row" style={{ padding: '7px 0' }}>
              <span>{s.name || 'Unknown'}</span><span className="text-warning" style={{ fontSize: 12.5 }}>Skipped: {s.reason}</span>
            </div>
          ))}
        </div>
      )}

      <div className="card card-pad mb-24">
        <div className="form-grid" style={{ marginBottom: 6 }}>
          <div className="field">
            <label>Letter</label>
            <select className="select" value={code} onChange={e => pickTemplate(e.target.value)}>
              {active.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}
            </select>
            <span className="hint">For {template.audience === 'INTERN' ? 'internship students' : 'employees and candidates'}.</span>
          </div>
        </div>
        <h3 style={{ fontSize: 14, margin: '14px 0 4px' }}>Common to every letter</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Each letter takes the name, address, designation, dates and the rest from the person's own record, and its reference from the letter series.
          What you type here is used on all of them; leave a field blank to keep each person's own value.
        </p>
        <LetterFields fields={template.fields.filter((f: any) => !OWN.includes(f.key))} form={form} set={(k, v) => setForm((f: any) => ({ ...f, [k]: v }))} />
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '14px 0 0', fontSize: 13.5 }}>
          <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />
          Show these letters to the employees under My Documents
        </label>
      </div>

      <div className="card mb-24">
        <div className="card-header">
          <div>
            <h3>Who gets it ({chosen.length} picked)</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>{audience.length} {template.audience === 'INTERN' ? 'interns' : 'people'} listed</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {template.audience !== 'INTERN' && (
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={showLeft} onChange={e => setShowLeft(e.target.checked)} /> Include those who have left
              </label>
            )}
            <input className="input" style={{ width: 220 }} placeholder="Search name, code, designation…" aria-label="Search people"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        {shown.length === 0 ? <EmptyState icon="☰" title="Nobody to list" message={q ? 'Try a different search.' : ''} /> : (
          <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}><input type="checkbox" checked={allShown} onChange={toggleAll} aria-label="Pick everyone listed" /></th>
                  <th>Name</th><th>Designation</th><th>Department</th><th>Joined</th><th />
                </tr>
              </thead>
              <tbody>
                {shown.map(p => (
                  <tr key={p.id}>
                    <td><input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Pick ${p.name}`} /></td>
                    <td><span style={{ fontWeight: 600 }}>{p.name}</span>{p.employeeNo && <span className="text-muted"> · {p.employeeNo}</span>}</td>
                    <td className="text-muted">{p.designation || p.internshipRole || '—'}</td>
                    <td className="text-muted">{p.department || p.collegeName || '—'}</td>
                    <td className="text-muted">{p.joinDate || p.startDate ? formatDate(p.joinDate || p.startDate) : '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-sm" disabled={busy === 'preview'} onClick={() => showPreview(p)}>Preview</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="form-actions" style={{ padding: '14px 22px' }}>
          <button className="btn btn-secondary" disabled={chosen.length === 0 || busy !== ''} onClick={() => showPreview(chosen[0])}>
            Preview the First
          </button>
          <button className="btn btn-primary" disabled={chosen.length === 0 || busy !== ''} onClick={generate}>
            {busy === 'generate' ? 'Writing…' : `Write ${chosen.length || ''} ${chosen.length === 1 ? 'Letter' : 'Letters'}`}
          </button>
        </div>
      </div>

      <Modal size="lg" title={preview ? `${template.name} — ${preview.name}` : ''} open={Boolean(preview)} onClose={() => setPreview(null)}>
        {preview && <>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>A preview: nothing is saved and no reference is taken.</p>
          <Sheet html={preview.html} />
        </>}
      </Modal>
    </>
  );
}

// ---- Templates --------------------------------------------------------------------------------
const MARKS: [string, string][] = [
  ['{{designation}}', 'a field from the list on the right'],
  ['{{pronoun|them}}', 'a field, with the words to use when it is empty'],
  ['**bold**', 'bold'],
  ['[[ in the {{department}} department]]', 'left out when a field inside it is empty'],
  ['[[{{stipend}} per month||Unpaid]]', 'the same, with words to use instead'],
  ['| Designation | {{designation}} |', 'a row of a details table; a row with no value is left out'],
  ['a blank line', 'starts a new paragraph'],
];

function TemplatesTab({ data, reload }: { data: any; reload: () => void }) {
  const [form, setForm] = useState<any>(null); // the template being edited, or null
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const templates: any[] = data.templates;

  const act = async (work: () => Promise<any>, done: string) => {
    try {
      await work();
      toast.success(done);
      setError('');
      reload();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not save');
    }
  };

  const edit = (t: any) => { setFormError(''); setPreview(''); setForm({ ...t }); };
  const set = (k: string, v: any) => { setPreview(''); setForm((f: any) => ({ ...f, [k]: v })); };

  // Put a field where the cursor is in the letter's text
  const insert = (key: string) => {
    const el = bodyRef.current;
    const text = `{{${key}}}`;
    if (!el) { set('body', `${form.body}${text}`); return; }
    const [from, to] = [el.selectionStart ?? form.body.length, el.selectionEnd ?? form.body.length];
    set('body', form.body.slice(0, from) + text + form.body.slice(to));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(from + text.length, from + text.length); });
  };

  const showPreview = async () => {
    try {
      const res = await peopleAPI.previewLetter({ template: { name: form.name || 'Preview', audience: form.audience, subject: form.subject, salutation: form.salutation, body: form.body } });
      setPreview(res.data.html);
      setFormError('');
    } catch (err: any) {
      setPreview('');
      setFormError(err.response?.data?.error || 'Could not make the preview');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name: form.name, audience: form.audience, subject: form.subject, salutation: form.salutation, body: form.body };
      if (form.id) await peopleAPI.updateLetterTemplate(form.id, body);
      else await peopleAPI.createLetterTemplate(body);
      toast.success('Letter saved');
      setForm(null);
      setError('');
      reload();
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Could not save the letter');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t: any) => {
    if (!await confirmDialog({ title: `Delete ${t.name}?`, message: 'Letters already issued from it stay on record.', confirmLabel: 'Delete', danger: true })) return;
    act(() => peopleAPI.deleteLetterTemplate(t.id), 'Letter deleted');
  };
  const reset = async (t: any) => {
    if (!await confirmDialog({ title: `Put ${t.name} back?`, message: 'Your wording is replaced by the wording the letter came with.', confirmLabel: 'Put Back' })) return;
    act(() => peopleAPI.resetLetterTemplate(t.id), 'Back to the original wording');
  };

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <div className="card mb-24">
        <div className="card-header">
          <div>
            <h3>Letters ({templates.length})</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              The wording of each letter. A letter already issued keeps the wording it was issued with.
            </span>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => edit(BLANK_TEMPLATE)}>+ New Letter</button>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Letter</th><th>For</th><th>Status</th><th>Last changed</th><th /></tr></thead>
            <tbody>
              {templates.map(t => (
                <tr key={t.id} style={t.isActive ? undefined : { opacity: 0.6 }}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{t.name}</span>
                    <div className="text-muted" style={{ fontSize: 11.5 }}>
                      {t.builtIn ? (t.reworded ? 'Came with the program · reworded' : 'Came with the program') : 'Added by you'}
                    </div>
                  </td>
                  <td className="text-muted">{t.audience === 'INTERN' ? 'Interns' : 'Employees'}</td>
                  <td><span className={`badge ${t.isActive ? 'badge-success' : 'badge-neutral'}`}>{t.isActive ? 'On' : 'Off'}</span></td>
                  <td className="text-muted">{t.updatedByName ? `${formatDate(t.updatedAt)} · ${t.updatedByName}` : '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => edit(t)}>Edit</button>
                      <button className="btn btn-secondary btn-sm"
                        onClick={() => act(() => peopleAPI.updateLetterTemplate(t.id, { isActive: !t.isActive }), t.isActive ? 'Switched off' : 'Switched on')}>
                        {t.isActive ? 'Switch Off' : 'Switch On'}
                      </button>
                      {t.builtIn && t.reworded && <button className="btn btn-secondary btn-sm" onClick={() => reset(t)}>Put Back</button>}
                      {!t.builtIn && <button className="btn btn-danger btn-sm" onClick={() => remove(t)}>Delete</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal size="lg" title={form?.id ? `Edit — ${form.name}` : 'New Letter'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={save}>
            <ErrorAlert message={formError} />
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Name *</label>
                <input className="input" required maxLength={80} placeholder="e.g. Salary Revision Letter" value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div className="field">
                <label>For</label>
                <select className="select" disabled={form.builtIn} value={form.audience} onChange={e => set('audience', e.target.value)}>
                  {data.audiences.map((a: any) => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Subject line</label>
                <input className="input" maxLength={200} placeholder="e.g. REVISION OF SALARY" value={form.subject} onChange={e => set('subject', e.target.value)} />
              </div>
              <div className="field">
                <label>Greeting</label>
                <input className="input" placeholder="Dear {{recipientName}}," value={form.salutation} onChange={e => set('salutation', e.target.value)} />
              </div>
            </div>
            <div className="template-editor">
              <div className="field" style={{ minWidth: 0 }}>
                <label>Text of the letter *</label>
                <textarea ref={bodyRef} className="input template-body" rows={16} required spellCheck
                  value={form.body} onChange={e => set('body', e.target.value)} />
                <span className="hint">
                  The letterhead, reference, date, the person's name and address, and the signature are added around this text.
                </span>
              </div>
              <div className="template-help">
                <strong>Fields</strong>
                <div className="template-fields">
                  {data.fields.map((f: any) => (
                    <button key={f.key} type="button" className="template-field" title={`Insert {{${f.key}}}`} onClick={() => insert(f.key)}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <strong>Marks</strong>
                <dl className="template-marks">
                  {MARKS.map(([mark, what]) => <div key={mark}><dt>{mark}</dt><dd>{what}</dd></div>)}
                </dl>
              </div>
            </div>
            {preview && (
              <div style={{ marginTop: 16 }}>
                <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 8 }}>Preview with sample values:</p>
                <Sheet html={preview} />
              </div>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="button" className="btn btn-secondary" onClick={showPreview}>Preview</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Letter'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

// Letters: write one for several people at once, and word the templates.
export default function Letters() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab')! : 'issue';
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setData((await peopleAPI.getLetterTemplates()).data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the letters');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <>
      <PageHeader title="Letters" subtitle="Offer, appointment, confirmation, experience and relieving letters, in your own wording." />
      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setParams({ tab: t.key })}>{t.label}</button>
        ))}
      </div>
      {!data ? (error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading letters…" />)
        : tab === 'templates' ? <TemplatesTab data={data} reload={fetchData} /> : <IssueTab templates={data.templates} />}
    </>
  );
}
