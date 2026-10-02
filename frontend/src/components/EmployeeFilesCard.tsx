import { useState, useEffect, useCallback } from 'react';
import { peopleAPI } from '../api/people';
import { openDataFile, readFileAsDataUri } from '../api/files';
import { Modal, ErrorAlert, EmptyState } from './ui';
import { formatDate } from '../utils/format';
import { confirmDialog, toast } from './feedback';
import ListSelect from './ListSelect';

export const sizeLabel = (bytes: number) =>
  (bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const EMPTY = { id: '', category: '', title: '', documentDate: '', visibleToEmployee: false, file: null as File | null };

// Files kept against an employee: identity proofs, certificates, signed
// letters. HR uploads them and decides which the employee can see.
export default function EmployeeFilesCard({ person }: { person: any }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<typeof EMPTY | null>(null); // adding or editing, or null
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setData((await peopleAPI.getFiles(person.id)).data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the files');
    }
  }, [person.id]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const open = async (file: any) => {
    try {
      openDataFile((await peopleAPI.getFile(file.id)).data.fileData);
    } catch {
      setError('Could not open the file');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setFormError('');
    if (!form.id) {
      if (!form.file) { setFormError('Attach a file'); return; }
      if (form.file.size > data.limits.maxBytes) { setFormError(`The file is too large. Keep each document under ${data.limits.maxLabel}.`); return; }
    }
    setSaving(true);
    try {
      const details = { category: form.category, title: form.title, documentDate: form.documentDate, visibleToEmployee: form.visibleToEmployee };
      if (form.id) await peopleAPI.updateFile(form.id, details);
      else await peopleAPI.uploadFile(person.id, { ...details, fileName: form.file!.name, fileData: await readFileAsDataUri(form.file!) });
      toast.success(form.id ? 'Saved' : 'File added');
      setForm(null);
      setError('');
      fetchData();
    } catch (err: any) {
      setFormError(err.response?.data?.error || 'Could not save the file');
    } finally {
      setSaving(false);
    }
  };

  const toggleVisible = async (file: any) => {
    try {
      await peopleAPI.updateFile(file.id, { visibleToEmployee: !file.visibleToEmployee });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not change it');
    }
  };

  const remove = async (file: any) => {
    if (!await confirmDialog({ title: `Remove ${file.title}?`, message: 'The file is deleted and cannot be brought back.', confirmLabel: 'Remove', danger: true })) return;
    try {
      await peopleAPI.deleteFile(file.id);
      toast.success('File removed');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not remove the file');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : null;
  const files: any[] = data.files;

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div>
          <h3>Files ({files.length})</h3>
          <span className="text-muted" style={{ fontSize: 12.5 }}>
            Identity proofs, certificates and signed letters. PDF or image, up to {data.limits.maxLabel} each.
          </span>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setFormError(''); setForm({ ...EMPTY }); }}>+ Add File</button>
      </div>
      <div style={{ padding: '0 22px' }}>
        <ErrorAlert message={error} onDismiss={() => setError('')} />
      </div>
      {files.length === 0 ? (
        <EmptyState icon="▤" title="No files yet" message={`Keep ${person.name}'s documents here instead of in a folder somewhere.`} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Document</th><th>Category</th><th>Dated</th><th>Added</th><th>Employee sees it</th><th /></tr>
            </thead>
            <tbody>
              {files.map(f => (
                <tr key={f.id}>
                  <td>
                    <button type="button" className="link-button" style={{ fontWeight: 600 }} onClick={() => open(f)}>{f.title}</button>
                    <div className="text-muted" style={{ fontSize: 11.5 }}>{f.fileName} · {sizeLabel(f.sizeBytes)}</div>
                  </td>
                  <td><span className="badge badge-neutral">{f.category}</span></td>
                  <td className="text-muted">{f.documentDate ? formatDate(f.documentDate) : '—'}</td>
                  <td className="text-muted">{formatDate(f.createdAt)}{f.uploadedByName && <div style={{ fontSize: 11.5 }}>{f.uploadedByName}</div>}</td>
                  <td>
                    <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                      <input type="checkbox" checked={f.visibleToEmployee} onChange={() => toggleVisible(f)}
                        aria-label={`Show ${f.title} to the employee`} />
                      {f.visibleToEmployee ? 'Yes' : 'No'}
                    </label>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn-secondary btn-sm" onClick={() => open(f)}>Open</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => {
                        setFormError('');
                        setForm({ id: f.id, category: f.category, title: f.title, documentDate: f.documentDate || '', visibleToEmployee: f.visibleToEmployee, file: null });
                      }}>Edit</button>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(f)}>Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal title={form?.id ? 'Edit File Details' : `Add File — ${person.name}`} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={save}>
            <ErrorAlert message={formError} />
            <div className="form-grid" style={{ marginBottom: 14 }}>
              {!form.id && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>File *</label>
                  <input className="input" type="file" accept={`${data.limits.accept},application/pdf,image/jpeg,image/png,image/webp`}
                    onChange={e => {
                      const file = e.target.files?.[0] || null;
                      setForm(f => f && ({ ...f, file, title: f.title || (file ? file.name.replace(/\.[A-Za-z0-9]{1,5}$/, '') : '') }));
                    }} />
                  <span className="hint">PDF, JPG or PNG, up to {data.limits.maxLabel}.</span>
                </div>
              )}
              <div className="field">
                <label>Category *</label>
                <ListSelect listType="DOCUMENT_CATEGORY" required value={form.category} onChange={v => setForm(f => f && ({ ...f, category: v }))} />
              </div>
              <div className="field">
                <label>Date on the document</label>
                <input className="input" type="date" value={form.documentDate}
                  onChange={e => setForm(f => f && ({ ...f, documentDate: e.target.value }))} />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Title *</label>
                <input className="input" required maxLength={150} placeholder="e.g. PAN card, Degree certificate"
                  value={form.title} onChange={e => setForm(f => f && ({ ...f, title: e.target.value }))} />
              </div>
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5 }}>
              <input type="checkbox" checked={form.visibleToEmployee}
                onChange={e => setForm(f => f && ({ ...f, visibleToEmployee: e.target.checked }))} />
              Show this file to {person.name} under My Documents
            </label>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : form.id ? 'Save' : 'Add File'}</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
