import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import JSZip from 'jszip';
import { peopleAPI } from '../../api/people';
import { readFileAsDataUri } from '../../api/files';
import { PageHeader, LoadingBlock, ErrorAlert, SuccessAlert, EmptyState } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';
import DownloadButton from '../../components/DownloadButton';
import ListSelect from '../../components/ListSelect';
import { formatINR } from '../../utils/format';

const TABS = [
  { key: 'add', label: 'Add Employees' },
  { key: 'update', label: 'Update Employees' },
  { key: 'revisions', label: 'Salary Revisions' },
  { key: 'photos', label: 'Photos' },
  { key: 'documents', label: 'Documents' },
  { key: 'history', label: 'History' },
];

const RESULT_BADGE: Record<string, [string, string]> = {
  NEW: ['badge-success', 'New'], UPDATE: ['badge-info', 'Will update'], UNCHANGED: ['badge-neutral', 'No change'],
  ERROR: ['badge-danger', 'Not taken'], REVISE: ['badge-success', 'Will revise'],
  ADDED: ['badge-success', 'Added'], UPDATED: ['badge-success', 'Updated'], REVISED: ['badge-success', 'Revised'], SET: ['badge-success', 'Photo set'],
};
const badge = (result: string) => {
  const [tone, label] = RESULT_BADGE[result] || ['badge-neutral', result];
  return <span className={`badge ${tone}`}>{label}</span>;
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const dateTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
const monthWords = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

function Steps({ children }: { children: ReactNode }) {
  return <ol className="text-muted" style={{ fontSize: 13, margin: '0 0 16px', paddingLeft: 18, lineHeight: 1.7 }}>{children}</ol>;
}

// The rows of a check or of a finished import
function RowsTable({ rows, extra }: { rows: any[]; extra?: (r: any) => ReactNode }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
      <table className="table">
        <thead><tr><th style={{ width: 54 }}>Row</th><th>Employee</th><th>Result</th><th>What will change, and why not</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.row}-${i}`}>
              <td className="text-muted">{r.file ? i + 1 : r.row}</td>
              <td>
                <span style={{ fontWeight: 600 }}>{r.name || '—'}</span>
                <div className="text-muted" style={{ fontSize: 11.5 }}>{[r.employeeNo, r.file].filter(Boolean).join(' · ')}</div>
              </td>
              <td>{badge(r.result)}</td>
              <td style={{ fontSize: 12.5 }}>
                {extra?.(r)}
                {(r.changes || []).map((c: any) => <div key={c.field}>{c.field}: <span className="text-muted">{c.from}</span> → {c.to}</div>)}
                {(r.fields || []).length > 0 && <div className="text-muted">Changed: {r.fields.join(', ')}</div>}
                {(r.newValues || []).length > 0 && <div className="text-warning">New to the lists: {r.newValues.join(', ')}</div>}
                {(r.errors || []).map((m: string) => <div key={m} className="text-danger">{m}</div>)}
                {(r.warnings || []).map((m: string) => <div key={m} className="text-warning">{m}</div>)}
                {(r.messages || []).map((m: string) => <div key={m} className={r.result === 'ERROR' ? 'text-danger' : 'text-muted'}>{m}</div>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Summary({ summary }: { summary: Record<string, number> }) {
  return <>{Object.entries(summary).filter(([, n]) => n > 0).map(([k, n]) => <span key={k} style={{ marginRight: 10 }}>{badge(k)} {n}</span>)}</>;
}

// ---- Employees from a workbook: add, or update ---------------------------------------------------
function EmployeeSheet({ mode }: { mode: 'ADD' | 'UPDATE' }) {
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<any>(null);
  const [done, setDone] = useState<any>(null);
  const [columns, setColumns] = useState<string[] | null>(null); // update: the columns to touch; null = every column in the sheet
  const [addNewValues, setAddNewValues] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const run = async (picked: File, dryRun: boolean, chosen: string[] | null) => {
    setBusy(dryRun ? 'check' : 'save');
    try {
      const res = await peopleAPI.importEmployees({
        fileBase64: await readFileAsDataUri(picked), fileName: picked.name, mode, dryRun, addNewValues,
        columns: mode === 'UPDATE' && chosen ? chosen : undefined,
      });
      setError('');
      if (res.data.dryRun) { setCheck(res.data); setDone(null); } else { setDone(res.data); setCheck(null); setFile(null); }
    } catch (err: any) {
      setError(err.response?.data?.error || 'The file could not be read');
    } finally {
      setBusy('');
    }
  };

  const pick = (picked: File | null) => {
    setFile(picked); setCheck(null); setDone(null); setColumns(null); setAddNewValues(false);
    if (picked) run(picked, true, null);
  };

  const toggleColumn = (key: string) => {
    const all: string[] = check.sheetColumns.map((c: any) => c.key);
    const next = (columns || all).includes(key) ? (columns || all).filter(k => k !== key) : [...(columns || all), key];
    setColumns(next);
    if (file) run(file, true, next);
  };

  const save = async () => {
    const ready = check.counts.NEW + check.counts.UPDATE;
    if (!await confirmDialog({
      title: mode === 'ADD' ? `Add ${plural(ready, 'employee')}?` : `Update ${plural(ready, 'employee')}?`,
      message: `${check.counts.ERROR ? `${plural(check.counts.ERROR, 'row')} with something wrong will be left out. ` : ''}${
        mode === 'UPDATE' ? 'Only the changes listed are made; nothing else on the records is touched.' : 'Each row becomes an employee on record.'}`,
      confirmLabel: mode === 'ADD' ? 'Add Employees' : 'Update Employees',
    })) return;
    run(file!, false, columns);
  };

  const ready = check ? check.counts.NEW + check.counts.UPDATE : 0;
  const blockedByLists = check && check.newValues.length > 0 && !addNewValues;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {done && (
        <SuccessAlert message="" onDismiss={() => setDone(null)}>
          <strong>Import finished.</strong> <Summary summary={done.summary} /> It is kept under History.
        </SuccessAlert>
      )}

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>{mode === 'ADD' ? 'Add new employees from a workbook' : 'Update employees from a workbook'}</h3>
        <Steps>
          {mode === 'ADD' ? <>
            <li>Download the template and fill one row for each new employee. Only the code and the name are needed.</li>
            <li>Upload it. Every row is checked and shown below; nothing is saved yet.</li>
            <li>Correct the file and upload again if rows are refused, then add the employees.</li>
          </> : <>
            <li>Download the workbook: it lists every employee with what is on record now.</li>
            <li>Change the cells you want changed. An empty cell changes nothing, so it can never wipe a field.</li>
            <li>Upload it, pick the columns to take, check the changes listed, then update.</li>
          </>}
        </Steps>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <DownloadButton path="/people/import/employees/template.xlsx" params={{ mode }} busyLabel="Making the workbook…">
            ⤓ {mode === 'ADD' ? 'Template' : 'Workbook of Employees'}
          </DownloadButton>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            {busy === 'check' ? 'Checking…' : file ? 'Upload Another File' : 'Upload the Filled File'}
            <input type="file" accept=".xlsx" hidden disabled={busy !== ''}
              onChange={e => { pick(e.target.files?.[0] || null); e.target.value = ''; }} />
          </label>
          {file && <span className="text-muted" style={{ fontSize: 12.5 }}>{file.name}</span>}
        </div>
      </div>

      {check?.problem && <ErrorAlert message={check.problem} />}

      {check && (!check.problem || (mode === 'UPDATE' && check.sheetColumns.length > 0)) && (
        <div className="card mb-24">
          <div className="card-header">
            <div>
              <h3>Check of {file?.name}</h3>
              <span style={{ fontSize: 13 }}><Summary summary={check.counts} /></span>
            </div>
            <button className="btn btn-primary" disabled={busy !== '' || ready === 0 || blockedByLists || Boolean(check.problem)} onClick={save}>
              {busy === 'save' ? 'Saving…' : mode === 'ADD' ? `Add ${plural(ready, 'Employee')}` : `Update ${plural(ready, 'Employee')}`}
            </button>
          </div>
          <div style={{ padding: '0 22px 6px' }}>
            {mode === 'UPDATE' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Columns to take from the sheet</div>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {check.sheetColumns.map((c: any) => (
                    <label key={c.key} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                      <input type="checkbox" checked={(columns || check.sheetColumns.map((x: any) => x.key)).includes(c.key)} onChange={() => toggleColumn(c.key)} />
                      {c.header}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {check.unknownHeaders.length > 0 && (
              <div className="alert alert-warning">
                <span>⚑</span><span>Not read, as no such column is known: {check.unknownHeaders.join(', ')}.</span>
              </div>
            )}
            {check.newValues.length > 0 && (
              <div className="alert alert-warning" style={{ alignItems: 'flex-start' }}>
                <span>⚑</span>
                <span>
                  <strong>Not in your lists yet:</strong>{' '}
                  {check.newValues.map((v: any) => `${v.label} (${v.listLabel}, ${plural(v.rows, 'row')})`).join('; ')}.
                  Check they are not misspellings of values you already have.
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontWeight: 600 }}>
                    <input type="checkbox" checked={addNewValues} onChange={e => setAddNewValues(e.target.checked)} />
                    Add these values to the lists
                  </label>
                </span>
              </div>
            )}
          </div>
          <RowsTable rows={check.results} />
        </div>
      )}

      {done && <div className="card mb-24"><div className="card-header"><h3>What was done</h3></div><RowsTable rows={done.results} /></div>}
    </>
  );
}

// ---- Salary revisions from a workbook ----------------------------------------------------------
function RevisionSheet() {
  const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<any>(null);
  const [done, setDone] = useState<any>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const run = async (picked: File, dryRun: boolean) => {
    setBusy(dryRun ? 'check' : 'save');
    try {
      const res = await peopleAPI.importRevisions({ fileBase64: await readFileAsDataUri(picked), fileName: picked.name, dryRun });
      setError('');
      if (res.data.dryRun) { setCheck(res.data); setDone(null); } else { setDone(res.data); setCheck(null); setFile(null); }
    } catch (err: any) {
      setError(err.response?.data?.error || 'The file could not be read');
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (!await confirmDialog({
      title: `Revise ${plural(check.counts.REVISE, 'salary', 'salaries')}?`,
      message: 'Each is recorded as on the Revise Salary screen: draft payslips from that month are recalculated, and months already finalized bring arrears.',
      confirmLabel: 'Revise Salaries',
    })) return;
    run(file!, false);
  };

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {done && (
        <SuccessAlert message="" onDismiss={() => setDone(null)}>
          <strong>Import finished.</strong> <Summary summary={done.summary} /> It is kept under History.
        </SuccessAlert>
      )}
      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>Salary revisions from a workbook</h3>
        <Steps>
          <li>Download the workbook: it lists the employees. Keep the rows whose package changes and delete the rest.</li>
          <li>Type the new monthly package, the month it applies from (as Oct 2026) and the reason.</li>
          <li>Upload it. Each row is checked and shown with the old and new package; nothing is saved until you confirm.</li>
        </Steps>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <DownloadButton path="/people/import/revisions/template.xlsx" busyLabel="Making the workbook…">⤓ Workbook</DownloadButton>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            {busy === 'check' ? 'Checking…' : file ? 'Upload Another File' : 'Upload the Filled File'}
            <input type="file" accept=".xlsx" hidden disabled={busy !== ''}
              onChange={e => { const f = e.target.files?.[0] || null; e.target.value = ''; setFile(f); setCheck(null); setDone(null); if (f) run(f, true); }} />
          </label>
          {file && <span className="text-muted" style={{ fontSize: 12.5 }}>{file.name}</span>}
        </div>
      </div>

      {check?.problem && <ErrorAlert message={check.problem} />}
      {check && !check.problem && (
        <div className="card mb-24">
          <div className="card-header">
            <div><h3>Check of {file?.name}</h3><span style={{ fontSize: 13 }}><Summary summary={check.counts} /></span></div>
            <button className="btn btn-primary" disabled={busy !== '' || check.counts.REVISE === 0} onClick={save}>
              {busy === 'save' ? 'Saving…' : `Revise ${plural(check.counts.REVISE, 'Salary', 'Salaries')}`}
            </button>
          </div>
          <RowsTable rows={check.results} extra={r => r.result === 'REVISE' && (
            <div>
              {formatINR(r.oldMonthlyPackage)} → <strong>{formatINR(r.newMonthlyPackage)}</strong> from {monthWords(r.effectiveMonth)}
              {r.reason && <span className="text-muted"> · {r.reason}</span>}
            </div>
          )} />
        </div>
      )}
      {done && <div className="card mb-24"><div className="card-header"><h3>What was done</h3></div><RowsTable rows={done.results} /></div>}
    </>
  );
}

// ---- Photos and documents from a zip ---------------------------------------------------------------
const PHOTO_TYPES = /\.(jpe?g|png|webp)$/i;
const DOCUMENT_TYPES: Record<string, string> = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const BATCH_BYTES = 6 * 1024 * 1024;

// As the photo on the employee form: at most 512 pixels a side, JPEG
function resizePhoto(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 512 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Not an image that can be read')); };
    img.src = url;
  });
}

const blobToDataUri = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Could not read the file'));
  reader.readAsDataURL(blob);
});

function ZipUpload({ kind }: { kind: 'PHOTOS' | 'DOCUMENTS' }) {
  const photos = kind === 'PHOTOS';
  const [zipName, setZipName] = useState('');
  const [entries, setEntries] = useState<any[]>([]); // { name, entry }
  const [matches, setMatches] = useState<any[] | null>(null);
  const [category, setCategory] = useState('');
  const [visible, setVisible] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');

  const pick = async (file: File | null) => {
    setMatches(null); setResults(null); setSummary(null); setEntries([]); setZipName(file?.name || '');
    if (!file) return;
    setBusy('read');
    try {
      const zip = await JSZip.loadAsync(file);
      const found = Object.values(zip.files)
        .filter(f => !f.dir && !/(^|\/)(\.|__MACOSX)/.test(f.name))
        .map(f => ({ name: f.name.split('/').pop() || f.name, entry: f }));
      if (found.length === 0) throw new Error('The zip has no files in it');
      const res = await peopleAPI.matchImportFiles({ kind, fileNames: found.map(f => f.name) });
      setEntries(found);
      setMatches(res.data.matches);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || (err.message?.includes('zip') || err.message?.includes('central directory')
        ? 'That is not a zip file that can be read' : err.message || 'The zip could not be read'));
    } finally {
      setBusy('');
    }
  };

  const ready = (matches || []).filter(m => !m.problem);

  const upload = async () => {
    if (!await confirmDialog({
      title: photos ? `Set ${plural(ready.length, 'photo')}?` : `Add ${plural(ready.length, 'document')}?`,
      message: photos ? 'Each replaces the photo the employee has now.'
        : `They go under ${category}${visible ? ' and are shown to the employees under My Documents' : ''}.`,
      confirmLabel: photos ? 'Set Photos' : 'Add Documents',
    })) return;
    setBusy('upload');
    const all: any[] = [];
    let importId = '';
    let latest: Record<string, number> | null = null;
    try {
      let batch: any[] = [];
      let bytes = 0;
      const flush = async () => {
        if (batch.length === 0) return;
        const res = await peopleAPI.importFiles({ importId, kind, zipName, category, visibleToEmployee: visible, items: batch });
        importId = res.data.importId;
        latest = res.data.summary;
        all.push(...res.data.results);
        batch = []; bytes = 0;
        setProgress(`${all.length} of ${ready.length} done…`);
      };
      for (const match of ready) {
        const entry = entries.find(e => e.name === match.fileName)?.entry;
        const fail = (reason: string) => all.push({ employeeNo: match.employeeNo, name: match.name, file: match.fileName, result: 'ERROR', messages: [reason] });
        if (!entry) { fail('Not found in the zip'); continue; }
        const extension = (match.fileName.split('.').pop() || '').toLowerCase();
        try {
          let data: string;
          if (photos) {
            if (!PHOTO_TYPES.test(match.fileName)) { fail('Not a JPG or PNG image'); continue; }
            data = await resizePhoto(await entry.async('blob'));
          } else {
            const type = DOCUMENT_TYPES[extension];
            if (!type) { fail('Not a PDF or an image (JPG, PNG)'); continue; }
            const blob = new Blob([await entry.async('arraybuffer')], { type });
            if (blob.size > MAX_DOCUMENT_BYTES) { fail('The file is too large. Keep each document under 5 MB.'); continue; }
            data = await blobToDataUri(blob);
          }
          if (batch.length >= 20 || bytes + data.length > BATCH_BYTES) await flush();
          batch.push({ fileName: match.fileName, data });
          bytes += data.length;
        } catch (err: any) {
          fail(err.message || 'Could not be read');
        }
      }
      await flush();
      setError('');
    } catch (err: any) {
      setError(`${err.response?.data?.error || 'The upload stopped'}. ${all.length} of ${ready.length} were done before that.`);
    } finally {
      setResults(all);
      setSummary(latest);
      setMatches(null);
      setBusy('');
      setProgress('');
    }
  };

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 8 }}>{photos ? 'Employee photos from a zip' : 'Employee documents from a zip'}</h3>
        <Steps>
          <li>Name each file by the employee's code{photos ? ': EMP-0042.jpg.' : ', then anything you like: EMP-0042.pdf or EMP-0042 - PAN card.pdf. What follows the code becomes the title.'}</li>
          <li>Put the files in one zip and pick it here. Each file is matched to its employee and listed before anything is uploaded.</li>
          <li>{photos ? 'Photos are made small before they are sent. A photo replaces the one the employee has.' : 'All the files go under one category. PDF, JPG or PNG, up to 5 MB each.'}</li>
        </Steps>
        {!photos && (
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Category *</label>
              <ListSelect listType="DOCUMENT_CATEGORY" value={category} onChange={setCategory} />
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, fontWeight: 400 }}>
                <input type="checkbox" checked={visible} onChange={e => setVisible(e.target.checked)} />
                Show these to the employees under My Documents
              </label>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            {busy === 'read' ? 'Reading…' : zipName ? 'Pick Another Zip' : 'Pick the Zip'}
            <input type="file" accept=".zip,application/zip" hidden disabled={busy !== ''}
              onChange={e => { pick(e.target.files?.[0] || null); e.target.value = ''; }} />
          </label>
          {zipName && <span className="text-muted" style={{ fontSize: 12.5 }}>{zipName}</span>}
        </div>
      </div>

      {matches && (
        <div className="card mb-24">
          <div className="card-header">
            <div>
              <h3>{plural(matches.length, 'file')} in {zipName}</h3>
              <span style={{ fontSize: 13 }}>
                <span className="badge badge-success">Matched</span> {ready.length}{' '}
                {matches.length - ready.length > 0 && <><span className="badge badge-danger">Not taken</span> {matches.length - ready.length}</>}
              </span>
            </div>
            <button className="btn btn-primary" disabled={busy !== '' || ready.length === 0 || (!photos && !category)} onClick={upload}
              title={!photos && !category ? 'Pick a category first' : undefined}>
              {busy === 'upload' ? progress || 'Uploading…' : photos ? `Set ${plural(ready.length, 'Photo')}` : `Add ${plural(ready.length, 'Document')}`}
            </button>
          </div>
          <div className="table-wrap" style={{ maxHeight: 460, overflowY: 'auto' }}>
            <table className="table">
              <thead><tr><th>File</th><th>Employee</th>{!photos && <th>Title</th>}<th /></tr></thead>
              <tbody>
                {matches.map((m, i) => (
                  <tr key={`${m.fileName}-${i}`}>
                    <td>{m.fileName}</td>
                    <td>{m.name ? <><span style={{ fontWeight: 600 }}>{m.name}</span> <span className="text-muted">· {m.employeeNo}</span></> : '—'}</td>
                    {!photos && <td className="text-muted">{m.problem ? '' : m.title || category || 'The category'}</td>}
                    <td>{m.problem ? <span className="text-danger" style={{ fontSize: 12.5 }}>{m.problem}</span> : <span className="badge badge-success">Matched</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {results && (
        <div className="card mb-24">
          <div className="card-header">
            <div><h3>What was done</h3>{summary && <span style={{ fontSize: 13 }}><Summary summary={summary} /></span>}</div>
          </div>
          <RowsTable rows={results} />
        </div>
      )}
    </>
  );
}

// ---- What was imported, and by whom -------------------------------------------------------------------
function History() {
  const [logs, setLogs] = useState<any[] | null>(null);
  const [open, setOpen] = useState<any>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setLogs((await peopleAPI.getImportLogs()).data.logs);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the imports');
    }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const show = async (id: string) => {
    if (open?.id === id) { setOpen(null); return; }
    try {
      setOpen((await peopleAPI.getImportLog(id)).data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the import');
    }
  };

  if (!logs) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading…" />;
  if (logs.length === 0) return <div className="card"><EmptyState icon="▤" title="No imports yet" message="Every import is listed here with who ran it and what became of each row." /></div>;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <div className="card mb-24">
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>When</th><th>Import</th><th>File</th><th>By</th><th>Result</th><th /></tr></thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{dateTime(l.createdAt)}</td>
                  <td style={{ fontWeight: 600 }}>{l.kindLabel}</td>
                  <td className="text-muted">{l.fileName}</td>
                  <td className="text-muted">{l.ranByName || '—'}</td>
                  <td style={{ fontSize: 13 }}><Summary summary={l.summary} /></td>
                  <td><div className="row-actions"><button className="btn btn-secondary btn-sm" onClick={() => show(l.id)}>{open?.id === l.id ? 'Hide Rows' : 'Rows'}</button></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && (
        <div className="card mb-24">
          <div className="card-header"><h3>{open.kindLabel} · {open.fileName} · {dateTime(open.createdAt)}</h3></div>
          <RowsTable rows={open.rows} />
        </div>
      )}
    </>
  );
}

// Bring employees, salary revisions, photos and documents in by the batch.
export default function Import() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t.key === params.get('tab')) ? params.get('tab')! : 'add';

  return (
    <>
      <PageHeader title="Import"
        subtitle={<>Employees and salary revisions from Excel, photos and documents from a zip. Everything is checked and shown before it is saved. <Link to="/people">Back to People</Link></>} />
      <div className="tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setParams({ tab: t.key })}>{t.label}</button>
        ))}
      </div>
      {tab === 'add' && <EmployeeSheet key="add" mode="ADD" />}
      {tab === 'update' && <EmployeeSheet key="update" mode="UPDATE" />}
      {tab === 'revisions' && <RevisionSheet />}
      {tab === 'photos' && <ZipUpload key="photos" kind="PHOTOS" />}
      {tab === 'documents' && <ZipUpload key="documents" kind="DOCUMENTS" />}
      {tab === 'history' && <History />}
    </>
  );
}
