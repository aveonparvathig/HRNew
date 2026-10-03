import { useState, useEffect, useCallback } from 'react';
import { peopleAPI } from '../api/people';
import { openDataFile, readFileAsDataUri } from '../api/files';
import { Modal, ErrorAlert, EmptyState } from './ui';
import { confirmDialog, toast } from './feedback';
import { formatDate, formatINR } from '../utils/format';

const FAMILY_RELATIONS = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Other'];
const MAX_FILE = 5 * 1024 * 1024;
const sizeLabel = (b: number) => (b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const field = (label: string, node: any, span = false) => (
  <div className="field" style={span ? { gridColumn: '1 / -1' } : undefined}><label>{label}</label>{node}</div>
);
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
          <span className="text-muted" style={{ fontSize: 12.5 }}>For insurance and PF/gratuity nomination. Nominee shares total {data.nomineeTotal}%.</span></div>
        <button className="btn btn-primary btn-sm" onClick={() => { setFormError(''); setForm({ name: '', relation: '', dateOfBirth: '', isDependant: false, nomineeShare: '' }); }}>+ Add Member</button>
      </div>
      <div style={{ padding: '0 22px' }}><ErrorAlert message={error} onDismiss={() => setError('')} /></div>
      {members.length === 0 ? <EmptyState icon="☺" title="No family members yet" message="" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Relationship</th><th>Date of birth</th><th>Dependant</th><th>Nominee</th><th /></tr></thead>
          <tbody>{members.map(m => (
            <tr key={m.id}>
              <td style={{ fontWeight: 600 }}>{m.name}</td><td>{m.relation}</td>
              <td className="text-muted">{m.dateOfBirth ? formatDate(m.dateOfBirth) : '—'}</td>
              <td>{m.isDependant ? 'Yes' : 'No'}</td>
              <td>{m.nomineeShare ? `${m.nomineeShare}%` : '—'}</td>
              <td><div className="row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => { setFormError(''); setForm({ ...m, dateOfBirth: m.dateOfBirth || '', nomineeShare: m.nomineeShare || '' }); }}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(m)}>Remove</button>
              </div></td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Modal title={form?.id ? 'Edit Family Member' : 'Add Family Member'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <ErrorAlert message={formError} />
          <div className="form-grid" style={{ marginBottom: 14 }}>
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
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
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
        <button className="btn btn-primary btn-sm" onClick={() => { setFormError(''); setForm({ qualification: '', institute: '', fromYear: '', toYear: '', grade: '', isHighest: false }); }}>+ Add Qualification</button>
      </div>
      <div style={{ padding: '0 22px' }}><ErrorAlert message={error} onDismiss={() => setError('')} /></div>
      {rows.length === 0 ? <EmptyState icon="▦" title="No qualifications yet" message="" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Qualification</th><th>Institute</th><th>Years</th><th>Grade</th><th /></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{r.qualification}{r.isHighest && <span className="badge badge-success" style={{ marginLeft: 6 }}>Highest</span>}</td>
              <td>{r.institute || '—'}</td>
              <td className="text-muted">{[r.fromYear, r.toYear].filter(Boolean).join(' – ') || '—'}</td>
              <td>{r.grade || '—'}</td>
              <td><div className="row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => { setFormError(''); setForm({ ...r, fromYear: r.fromYear || '', toYear: r.toYear || '' }); }}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>Remove</button>
              </div></td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Modal title={form?.id ? 'Edit Qualification' : 'Add Qualification'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <ErrorAlert message={formError} />
          <div className="form-grid" style={{ marginBottom: 14 }}>
            {field('Qualification *', input(form.qualification, v => setForm({ ...form, qualification: v }), { required: true, placeholder: 'e.g. B.E. CSE' }), true)}
            {field('Institute', input(form.institute, v => setForm({ ...form, institute: v })), true)}
            {field('Start year', input(form.fromYear, v => setForm({ ...form, fromYear: v }), { type: 'number', min: 1950, max: 2100, placeholder: '2014' }))}
            {field('End year', input(form.toYear, v => setForm({ ...form, toYear: v }), { type: 'number', min: 1950, max: 2100, placeholder: '2018' }))}
            {field('Grade', input(form.grade, v => setForm({ ...form, grade: v }), { placeholder: 'e.g. First class' }))}
          </div>
          <label className="checkbox-field"><input type="checkbox" checked={form.isHighest} onChange={e => setForm({ ...form, isHighest: e.target.checked })} /> Highest qualification</label>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
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
          <span className="text-muted" style={{ fontSize: 12.5 }}>Total prior experience: {data.totalExperience.label}.</span></div>
        <button className="btn btn-primary btn-sm" onClick={() => { setFormError(''); setForm({ employer: '', designation: '', fromDate: '', toDate: '', lastSalary: '', reasonForLeaving: '' }); }}>+ Add</button>
      </div>
      <div style={{ padding: '0 22px' }}><ErrorAlert message={error} onDismiss={() => setError('')} /></div>
      {rows.length === 0 ? <EmptyState icon="▣" title="No previous employment recorded" message="" /> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Employer</th><th>Designation</th><th>Period</th><th>Last salary</th><th>Reason</th><th /></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}>
              <td style={{ fontWeight: 600 }}>{r.employer}</td><td>{r.designation || '—'}</td>
              <td className="text-muted">{[r.fromDate, r.toDate].filter(Boolean).join(' – ') || '—'}</td>
              <td>{r.lastSalary ? formatINR(r.lastSalary) : '—'}</td>
              <td className="text-muted">{r.reasonForLeaving || '—'}</td>
              <td><div className="row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => { setFormError(''); setForm({ ...r, fromDate: r.fromDate || '', toDate: r.toDate || '', lastSalary: r.lastSalary || '' }); }}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(r)}>Remove</button>
              </div></td>
            </tr>))}</tbody>
        </table></div>
      )}
      <Modal title={form?.id ? 'Edit Previous Employment' : 'Add Previous Employment'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <ErrorAlert message={formError} />
          <div className="form-grid" style={{ marginBottom: 14 }}>
            {field('Employer *', input(form.employer, v => setForm({ ...form, employer: v }), { required: true }), true)}
            {field('Designation', input(form.designation, v => setForm({ ...form, designation: v })))}
            {field('Last salary', input(form.lastSalary, v => setForm({ ...form, lastSalary: v }), { type: 'number', min: 0, step: '0.01', placeholder: 'Monthly' }))}
            {field('From', input(form.fromDate, v => setForm({ ...form, fromDate: v }), { type: 'month' }))}
            {field('To', input(form.toDate, v => setForm({ ...form, toDate: v }), { type: 'month' }))}
            {field('Reason for leaving', input(form.reasonForLeaving, v => setForm({ ...form, reasonForLeaving: v })), true)}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
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
          <span className="text-muted" style={{ fontSize: 12.5 }}>PAN, Aadhaar, passport, driving licence, voter ID. Attach a copy and mark it verified.</span></div>
        <button className="btn btn-primary btn-sm" onClick={() => { setFormError(''); setForm({ docType: '', number: '', nameOnDocument: person.name, expiryDate: '', file: null }); }}>+ Add Document</button>
      </div>
      <div style={{ padding: '0 22px' }}><ErrorAlert message={error} onDismiss={() => setError('')} /></div>
      <div className="table-wrap"><table className="table">
        <thead><tr><th>Type</th><th>Number</th><th>Name on document</th><th>Expiry</th><th>Verified</th><th /></tr></thead>
        <tbody>{docs.map((d, i) => (
          <tr key={d.id || `p${i}`}>
            <td style={{ fontWeight: 600 }}>{typeLabel(d.docType)}{d.hasFile && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>File</span>}</td>
            <td>{d.number}</td>
            <td className="text-muted">{d.nameOnDocument || '—'}</td>
            <td>{d.expiryDate ? <span className={d.expired ? 'text-danger' : ''}>{formatDate(d.expiryDate)}{d.expired && ' (expired)'}</span> : '—'}</td>
            <td>{d.fromProfile ? <span className="text-muted">—</span> : (
              <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={d.verified} onChange={() => verify(d)} />
                {d.verified ? `Yes${d.verifiedByName ? ` · ${d.verifiedByName}` : ''}` : 'No'}
              </label>)}</td>
            <td>{d.fromProfile ? (
              <span className="text-muted" style={{ fontSize: 11.5 }}>From the profile — add it to attach a file or verify</span>
            ) : (
              <div className="row-actions">
                {d.hasFile && <button className="btn btn-secondary btn-sm" onClick={() => openFile(d)}>Open</button>}
                <button className="btn btn-secondary btn-sm" onClick={() => { setFormError(''); setForm({ ...d, expiryDate: d.expiryDate || '', nameOnDocument: d.nameOnDocument || '', file: null }); }}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(d)}>Remove</button>
              </div>)}</td>
          </tr>))}
          {docs.length === 0 && <tr><td colSpan={6}><EmptyState icon="▤" title="No identity documents yet" message="" /></td></tr>}
        </tbody>
      </table></div>
      <Modal title={form?.id ? 'Edit Identity Document' : 'Add Identity Document'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <ErrorAlert message={formError} />
          <div className="form-grid" style={{ marginBottom: 14 }}>
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
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>}
      </Modal>
    </div>
  );
}
