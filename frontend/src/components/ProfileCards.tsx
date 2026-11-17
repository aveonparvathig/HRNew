import { useState, useEffect, useCallback, cloneElement, isValidElement } from 'react';
import { peopleAPI } from '../api/people';
import { openDataFile, readFileAsDataUri } from '../api/files';
import { Modal, ErrorAlert, EmptyState } from './ui';
import { Button } from './Button';
import { confirmDialog, toast } from './feedback';
import { formatDate, formatINR } from '../utils/format';

const FAMILY_RELATIONS = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Other'];
const MAX_FILE = 5 * 1024 * 1024;
const sizeLabel = (b: number) => (b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const field = (label: string, node: any, span = false) => {
  const id = `pp-f-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '')}`;
  return (
    <div className={span ? 'field pp-span-all' : 'field'}>
      <label htmlFor={id}>{label}</label>{isValidElement(node) ? cloneElement(node as any, { id }) : node}
    </div>
  );
};
const input = (value: any, onChange: (v: string) => void, props: any = {}) => (
  <input className="input" value={value ?? ''} onChange={e => onChange(e.target.value)} {...props} />
);

// ---- Family members ----------------------------------------------------------------------------
export function FamilyCard({ person }: { person: any }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setData((await peopleAPI.getFamily(person.id)).data); }
    catch (e: any) { setError(e.response?.data?.error || 'Failed to load family'); }
  }, [person.id]);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true);
    try {
      if (form.id) await peopleAPI.updateFamily(form.id, form);
      else await peopleAPI.addFamily(person.id, form);
      toast.success('Saved'); setForm(null); load();
    } catch (err: any) { setFormError(err.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  };
  const remove = async (m: any) => {
    if (!await confirmDialog({ title: `Remove ${m.name}?`, message: 'This family member will be removed.', confirmLabel: 'Remove', danger: true })) return;
    try { await peopleAPI.deleteFamily(m.id); load(); } catch (e: any) { setError(e.response?.data?.error || 'Could not remove'); }
  };
  if (!data) return error ? <ErrorAlert message={error} /> : null;
  const members: any[] = data.members;

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div><h3>Family ({members.length})</h3>
          <span className="text-sm-muted">For insurance and PF/gratuity nomination. Nominee shares total {data.nomineeTotal}%.</span></div>
        <Button size="sm" icon="plus" onClick={() => { setFormError(''); setForm({ name: '', relation: '', dateOfBirth: '', isDependant: false, nomineeShare: '' }); }}>Add member</Button>
      </div>
      <div className="pp-card-alert"><ErrorAlert message={error} onDismiss={() => setError('')} /></div>
      {members.length === 0 ? <EmptyState icon="☺" title="No family members yet" message="" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Relationship</th><th>Date of birth</th><th>Dependant</th><th className="num">Nominee</th><th /></tr></thead>
          <tbody>{members.map(m => (
            <tr key={m.id}>
              <td className="pp-strong">{m.name}</td><td>{m.relation}</td>
              <td className="pp-date text-muted">{m.dateOfBirth ? formatDate(m.dateOfBirth) : '—'}</td>
              <td>{m.isDependant ? 'Yes' : 'No'}</td>
              <td className="num">{m.nomineeShare ? `${m.nomineeShare}%` : '—'}</td>
              <td><div className="row-actions">
                <Button size="sm" onClick={() => { setFormError(''); setForm({ ...m, dateOfBirth: m.dateOfBirth || '', nomineeShare: m.nomineeShare || '' }); }}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => remove(m)}>Remove</Button>
              </div></td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Modal title={form?.id ? 'Edit family member' : 'Add family member'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <ErrorAlert message={formError} />
          <div className="form-grid mb-14">
            {field('Name *', input(form.name, v => setForm({ ...form, name: v }), { required: true, maxLength: 120 }))}
            {field('Relationship *', (
              <select className="select" required value={form.relation} onChange={e => setForm({ ...form, relation: e.target.value })}>
                <option value="">—</option>{FAMILY_RELATIONS.map(r => <option key={r}>{r}</option>)}
              </select>))}
            {field('Date of birth', input(form.dateOfBirth, v => setForm({ ...form, dateOfBirth: v }), { type: 'date' }))}
            {field('Nominee share %', input(form.nomineeShare, v => setForm({ ...form, nomineeShare: v }), { type: 'number', min: 0, max: 100, step: '0.01', placeholder: '0' }))}
          </div>
          <label className="checkbox-field"><input type="checkbox" checked={form.isDependant} onChange={e => setForm({ ...form, isDependant: e.target.checked })} /> Dependant</label>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>}
      </Modal>
    </div>
  );
}

// ---- Education ---------------------------------------------------------------------------------
export function EducationCard({ person }: { person: any }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setRows((await peopleAPI.getEducation(person.id)).data.rows); }
    catch (e: any) { setError(e.response?.data?.error || 'Failed to load'); }
  }, [person.id]);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true);
    try {
      if (form.id) await peopleAPI.updateEducation(form.id, form);
      else await peopleAPI.addEducation(person.id, form);
      toast.success('Saved'); setForm(null); load();
    } catch (err: any) { setFormError(err.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  };
  const remove = async (r: any) => {
    if (!await confirmDialog({ title: `Remove ${r.qualification}?`, message: 'This qualification will be removed.', confirmLabel: 'Remove', danger: true })) return;
    try { await peopleAPI.deleteEducation(r.id); load(); } catch (e: any) { setError(e.response?.data?.error || 'Could not remove'); }
  };
  if (!rows) return error ? <ErrorAlert message={error} /> : null;

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div><h3>Education ({rows.length})</h3></div>
        <Button size="sm" icon="plus" onClick={() => { setFormError(''); setForm({ qualification: '', institute: '', fromYear: '', toYear: '', grade: '', isHighest: false }); }}>Add qualification</Button>
      </div>
      <div className="pp-card-alert"><ErrorAlert message={error} onDismiss={() => setError('')} /></div>
      {rows.length === 0 ? <EmptyState icon="▦" title="No qualifications yet" message="" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Qualification</th><th>Institute</th><th>Years</th><th>Grade</th><th /></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}>
              <td className="pp-strong">{r.qualification}{r.isHighest && <span className="badge badge-success pp-badge-gap">Highest</span>}</td>
              <td>{r.institute || '—'}</td>
              <td className="pp-date text-muted">{[r.fromYear, r.toYear].filter(Boolean).join(' – ') || '—'}</td>
              <td>{r.grade || '—'}</td>
              <td><div className="row-actions">
                <Button size="sm" onClick={() => { setFormError(''); setForm({ ...r, fromYear: r.fromYear || '', toYear: r.toYear || '' }); }}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => remove(r)}>Remove</Button>
              </div></td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Modal title={form?.id ? 'Edit qualification' : 'Add qualification'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <ErrorAlert message={formError} />
          <div className="form-grid mb-14">
            {field('Qualification *', input(form.qualification, v => setForm({ ...form, qualification: v }), { required: true, placeholder: 'e.g. B.E. CSE' }), true)}
            {field('Institute', input(form.institute, v => setForm({ ...form, institute: v })), true)}
            {field('Start year', input(form.fromYear, v => setForm({ ...form, fromYear: v }), { type: 'number', min: 1950, max: 2100, placeholder: '2014' }))}
            {field('End year', input(form.toYear, v => setForm({ ...form, toYear: v }), { type: 'number', min: 1950, max: 2100, placeholder: '2018' }))}
            {field('Grade', input(form.grade, v => setForm({ ...form, grade: v }), { placeholder: 'e.g. First class' }))}
          </div>
          <label className="checkbox-field"><input type="checkbox" checked={form.isHighest} onChange={e => setForm({ ...form, isHighest: e.target.checked })} /> Highest qualification</label>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>}
      </Modal>
    </div>
  );
}

// ---- Previous employment -----------------------------------------------------------------------
export function PreviousEmploymentCard({ person }: { person: any }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setData((await peopleAPI.getPreviousEmployment(person.id)).data); }
    catch (e: any) { setError(e.response?.data?.error || 'Failed to load'); }
  }, [person.id]);
  useEffect(() => { load(); }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true);
    try {
      if (form.id) await peopleAPI.updatePreviousEmployment(form.id, form);
      else await peopleAPI.addPreviousEmployment(person.id, form);
      toast.success('Saved'); setForm(null); load();
    } catch (err: any) { setFormError(err.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  };
  const remove = async (r: any) => {
    if (!await confirmDialog({ title: `Remove ${r.employer}?`, message: 'This record will be removed.', confirmLabel: 'Remove', danger: true })) return;
    try { await peopleAPI.deletePreviousEmployment(r.id); load(); } catch (e: any) { setError(e.response?.data?.error || 'Could not remove'); }
  };
  if (!data) return error ? <ErrorAlert message={error} /> : null;
  const rows: any[] = data.rows;

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div><h3>Previous employment ({rows.length})</h3>
          <span className="text-sm-muted">Total prior experience: {data.totalExperience.label}.</span></div>
        <Button size="sm" icon="plus" onClick={() => { setFormError(''); setForm({ employer: '', designation: '', fromDate: '', toDate: '', lastSalary: '', reasonForLeaving: '' }); }}>Add</Button>
      </div>
      <div className="pp-card-alert"><ErrorAlert message={error} onDismiss={() => setError('')} /></div>
      {rows.length === 0 ? <EmptyState icon="▣" title="No previous employment recorded" message="" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Employer</th><th>Designation</th><th>Period</th><th className="num">Last salary</th><th>Reason</th><th /></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}>
              <td className="pp-strong">{r.employer}</td><td>{r.designation || '—'}</td>
              <td className="pp-date text-muted">{[r.fromDate, r.toDate].filter(Boolean).join(' – ') || '—'}</td>
              <td className="num">{r.lastSalary ? formatINR(r.lastSalary) : '—'}</td>
              <td className="text-muted">{r.reasonForLeaving || '—'}</td>
              <td><div className="row-actions">
                <Button size="sm" onClick={() => { setFormError(''); setForm({ ...r, fromDate: r.fromDate || '', toDate: r.toDate || '', lastSalary: r.lastSalary || '' }); }}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => remove(r)}>Remove</Button>
              </div></td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Modal title={form?.id ? 'Edit previous employment' : 'Add previous employment'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <ErrorAlert message={formError} />
          <div className="form-grid mb-14">
            {field('Employer *', input(form.employer, v => setForm({ ...form, employer: v }), { required: true }), true)}
            {field('Designation', input(form.designation, v => setForm({ ...form, designation: v })))}
            {field('Last salary', input(form.lastSalary, v => setForm({ ...form, lastSalary: v }), { type: 'number', min: 0, step: '0.01', placeholder: 'Monthly' }))}
            {field('From', input(form.fromDate, v => setForm({ ...form, fromDate: v }), { type: 'month' }))}
            {field('To', input(form.toDate, v => setForm({ ...form, toDate: v }), { type: 'month' }))}
            {field('Reason for leaving', input(form.reasonForLeaving, v => setForm({ ...form, reasonForLeaving: v })), true)}
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>}
      </Modal>
    </div>
  );
}

// ---- Identity documents ------------------------------------------------------------------------
export function IdentityDocumentsCard({ person }: { person: any }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setData((await peopleAPI.getIdentityDocuments(person.id)).data); }
    catch (e: any) { setError(e.response?.data?.error || 'Failed to load'); }
  }, [person.id]);
  useEffect(() => { load(); }, [load]);

  const typeLabel = (v: string) => data?.types.find((t: any) => t.value === v)?.label || v;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError('');
    if (form.file && form.file.size > MAX_FILE) { setFormError(`The file is too large. Keep it under ${sizeLabel(MAX_FILE)}.`); return; }
    setSaving(true);
    try {
      const body: any = { docType: form.docType, number: form.number, nameOnDocument: form.nameOnDocument, expiryDate: form.expiryDate };
      if (form.file) { body.fileData = await readFileAsDataUri(form.file); body.fileName = form.file.name; }
      if (form.id) await peopleAPI.updateIdentityDocument(form.id, body);
      else await peopleAPI.addIdentityDocument(person.id, body);
      toast.success('Saved'); setForm(null); load();
    } catch (err: any) { setFormError(err.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  };
  const openFile = async (d: any) => {
    try { openDataFile((await peopleAPI.getIdentityFile(d.id)).data.fileData); }
    catch { setError('Could not open the file'); }
  };
  const verify = async (d: any) => {
    try { await peopleAPI.verifyIdentityDocument(d.id, !d.verified); load(); }
    catch (e: any) { setError(e.response?.data?.error || 'Could not change it'); }
  };
  const remove = async (d: any) => {
    if (!await confirmDialog({ title: `Remove this ${typeLabel(d.docType)}?`, message: 'The document and any attached file will be removed.', confirmLabel: 'Remove', danger: true })) return;
    try { await peopleAPI.deleteIdentityDocument(d.id); load(); } catch (e: any) { setError(e.response?.data?.error || 'Could not remove'); }
  };
  if (!data) return error ? <ErrorAlert message={error} /> : null;
  const docs: any[] = data.docs;

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div><h3>Identity documents ({docs.length})</h3>
          <span className="text-sm-muted">PAN, Aadhaar, passport, driving licence, voter ID. Attach a copy and mark it verified.</span></div>
        <Button size="sm" icon="plus" onClick={() => { setFormError(''); setForm({ docType: '', number: '', nameOnDocument: person.name, expiryDate: '', file: null }); }}>Add document</Button>
      </div>
      <div className="pp-card-alert"><ErrorAlert message={error} onDismiss={() => setError('')} /></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Type</th><th>Number</th><th>Name on document</th><th>Expiry</th><th>Verified</th><th /></tr></thead>
        <tbody>{docs.map((d, i) => (
          <tr key={d.id || `p${i}`}>
            <td className="pp-strong">{typeLabel(d.docType)}{d.hasFile && <span className="badge badge-neutral pp-badge-gap">File</span>}</td>
            <td className="pp-fig">{d.number}</td>
            <td className="text-muted">{d.nameOnDocument || '—'}</td>
            <td className="pp-date">{d.expiryDate ? <span className={d.expired ? 'text-danger' : ''}>{formatDate(d.expiryDate)}{d.expired && ' (expired)'}</span> : '—'}</td>
            <td>{d.fromProfile ? <span className="text-muted">—</span> : (
              <label className="pp-check-inline">
                <input type="checkbox" checked={d.verified} aria-label={`Verified: ${typeLabel(d.docType)}`} onChange={() => verify(d)} />
                {d.verified ? `Yes${d.verifiedByName ? ` · ${d.verifiedByName}` : ''}` : 'No'}
              </label>)}</td>
            <td>{d.fromProfile ? (
              <span className="pp-sub">From the profile — add it to attach a file or verify</span>
            ) : (
              <div className="row-actions">
                {d.hasFile && <Button size="sm" onClick={() => openFile(d)}>Open</Button>}
                <Button size="sm" onClick={() => { setFormError(''); setForm({ ...d, expiryDate: d.expiryDate || '', nameOnDocument: d.nameOnDocument || '', file: null }); }}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => remove(d)}>Remove</Button>
              </div>)}</td>
          </tr>))}
          {docs.length === 0 && <tr><td colSpan={6}><EmptyState icon="▤" title="No identity documents yet" message="" /></td></tr>}
        </tbody>
      </table></div>
      <Modal title={form?.id ? 'Edit identity document' : 'Add identity document'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <ErrorAlert message={formError} />
          <div className="form-grid mb-14">
            {field('Type *', (
              <select className="select" required value={form.docType} onChange={e => setForm({ ...form, docType: e.target.value })} disabled={Boolean(form.id)}>
                <option value="">—</option>{(data.types || []).map((t: any) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>))}
            {field('Number *', input(form.number, v => setForm({ ...form, number: v }), { required: true, maxLength: 60 }))}
            {field('Name on document', input(form.nameOnDocument, v => setForm({ ...form, nameOnDocument: v })))}
            {field('Expiry date', input(form.expiryDate, v => setForm({ ...form, expiryDate: v }), { type: 'date' }))}
            {!form.id && field('File', (
              <input className="input" type="file" accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={e => setForm({ ...form, file: e.target.files?.[0] || null })} />), true)}
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>}
      </Modal>
    </div>
  );
}
