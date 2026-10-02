import { useState, useEffect } from 'react';
import { orgAPI } from '../../api/org';
import { LoadingBlock, ErrorAlert, SuccessAlert } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';

const plural = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;

// Where uploaded files are kept: in the database, or in the company's own
// object storage. Each file stays where it was put until it is moved.
export default function StorageSettingsTab() {
  const [data, setData] = useState<any>(null);
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');

  const apply = (d: any) => {
    setData(d);
    setForm({ ...d.settings, secretAccessKey: '' });
  };

  useEffect(() => {
    orgAPI.getStorageSettings().then(res => apply(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load the storage settings'));
  }, []);

  if (!form) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading…" />;

  const set = (key: string, value: any) => setForm({ ...form, [key]: value });
  const objectStore = form.provider === 'S3';
  const savedProvider: string = data.settings.provider;
  const elsewhere = savedProvider === 'S3' ? 'the database' : 'object storage';
  const here = savedProvider === 'S3' ? 'object storage' : 'the database';

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('save');
    setSuccess('');
    try {
      const res = await orgAPI.updateStorageSettings(form);
      apply(res.data);
      setError('');
      setSuccess(res.data.message);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save the storage settings');
    } finally {
      setBusy('');
    }
  };

  const test = async () => {
    setBusy('test');
    setSuccess('');
    try {
      const res = await orgAPI.testStorage(form);
      if (res.data.ok) { setError(''); setSuccess(res.data.message); } else setError(`The connection did not work: ${res.data.error}.`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'The connection did not work');
    } finally {
      setBusy('');
    }
  };

  // Files go across a few at a time; the screen keeps asking until none is left
  const move = async () => {
    if (!await confirmDialog({
      title: `Move ${plural(data.toMove)} to ${here}?`,
      message: `They are in ${elsewhere} now. Each file is copied across and checked before the old copy is removed. Leave this page open until it finishes.`,
      confirmLabel: 'Move Files',
    })) return;
    setBusy('move');
    setSuccess('');
    let moved = 0;
    try {
      for (;;) {
        const res = await orgAPI.moveStoredFiles();
        moved += res.data.moved;
        setData(res.data);
        setProgress(`${moved} moved, ${res.data.remaining} to go…`);
        if (res.data.failed.length) {
          setError(`${plural(res.data.failed.length)} could not be moved (${res.data.failed[0].title}: ${res.data.failed[0].reason}). ${moved} moved before that; the rest are where they were.`);
          break;
        }
        if (res.data.remaining === 0 || res.data.moved === 0) {
          setError('');
          setSuccess(`${plural(moved)} moved to ${here}.`);
          break;
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'The files could not be moved');
    } finally {
      setBusy('');
      setProgress('');
    }
  };

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>What is kept where</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
          The files HR uploads against employees. A file stays where it was put, so changing the setting below never loses one.
        </p>
        <div className="list-row" style={{ padding: '8px 0' }}>
          <span>In the database{savedProvider !== 'S3' && <> <span className="badge badge-success">new files go here</span></>}</span>
          <strong>{plural(data.usage.DB.files)}{data.usage.DB.files > 0 && ` · ${data.usage.DB.label}`}</strong>
        </div>
        <div className="list-row" style={{ padding: '8px 0' }}>
          <span>In object storage{savedProvider === 'S3' && <> <span className="badge badge-success">new files go here</span></>}</span>
          <strong>{plural(data.usage.S3.files)}{data.usage.S3.files > 0 && ` · ${data.usage.S3.label}`}</strong>
        </div>
        {data.toMove > 0 && (
          <div className="alert alert-warning" style={{ marginTop: 14, marginBottom: 0, alignItems: 'center' }}>
            <span>⚑</span>
            <span style={{ flex: 1 }}>
              {plural(data.toMove)} {data.toMove === 1 ? 'is' : 'are'} still in {elsewhere}. They open as before; move them to keep everything in one place.
            </span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={busy !== ''} onClick={move}>
              {busy === 'move' ? progress || 'Moving…' : `Move to ${here}`}
            </button>
          </div>
        )}
      </div>

      <form className="card card-pad mb-24" onSubmit={save}>
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Where new files go</h3>
        {data.providers.map((p: any) => (
          <label key={p.value} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, cursor: 'pointer' }}>
            <input type="radio" name="provider" style={{ marginTop: 3 }} checked={form.provider === p.value} onChange={() => set('provider', p.value)} />
            <span>
              <span style={{ fontWeight: 600 }}>{p.label}</span>
              <span className="text-muted" style={{ display: 'block', fontSize: 12.5 }}>{p.hint}</span>
            </span>
          </label>
        ))}

        {(objectStore || data.settings.bucket) && (
          <>
            <h3 style={{ fontSize: 15, margin: '18px 0 4px' }}>Object storage</h3>
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
              Create a private bucket with your storage service and an access key that can read, write and delete in it.
              Its console gives the endpoint, the region and the key. Turn on backups or versioning for the bucket there:
              database backups do not include these files.
            </p>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Endpoint</label>
                <input className="input" placeholder="https://<account>.r2.cloudflarestorage.com" value={form.endpoint} onChange={e => set('endpoint', e.target.value)} />
                <span className="hint">Leave blank for Amazon S3. Other services give an address here.</span>
              </div>
              <div className="field">
                <label>Bucket</label>
                <input className="input" placeholder="aveon-hr-files" value={form.bucket} onChange={e => set('bucket', e.target.value)} />
              </div>
              <div className="field">
                <label>Region</label>
                <input className="input" placeholder="ap-south-1" value={form.region} onChange={e => set('region', e.target.value)} />
                <span className="hint">Needed for Amazon S3. With an endpoint it can be left blank.</span>
              </div>
              <div className="field">
                <label>Access key ID</label>
                <input className="input" autoComplete="off" value={form.accessKeyId} onChange={e => set('accessKeyId', e.target.value)} />
              </div>
              <div className="field">
                <label>Secret access key</label>
                <input className="input" type="password" autoComplete="new-password" value={form.secretAccessKey}
                  placeholder={form.hasSecret ? 'Saved. Type a new one to change it' : ''}
                  onChange={e => set('secretAccessKey', e.target.value)} />
                <span className="hint">Stored encrypted and never shown again.</span>
              </div>
              <div className="field">
                <label>Folder in the bucket</label>
                <input className="input" placeholder="Optional, e.g. hr" value={form.prefix} onChange={e => set('prefix', e.target.value)} />
              </div>
              <div className="field">
                <label>&nbsp;</label>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13.5, fontWeight: 400 }}>
                  <input type="checkbox" checked={form.forcePathStyle} onChange={e => set('forcePathStyle', e.target.checked)} />
                  Put the bucket name in the path
                </label>
                <span className="hint">MinIO and some services need this. Amazon S3 does not.</span>
              </div>
            </div>
          </>
        )}

        <div className="form-actions">
          {objectStore && (
            <button type="button" className="btn btn-secondary" disabled={busy !== ''} onClick={test}>
              {busy === 'test' ? 'Testing…' : 'Test Connection'}
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy !== ''}>{busy === 'save' ? 'Saving…' : 'Save'}</button>
        </div>
        {objectStore && (
          <p className="text-muted" style={{ fontSize: 12.5, marginTop: 10 }}>
            Saving writes a small test file to the bucket, reads it back and removes it. Object storage is switched on only if that works.
          </p>
        )}
      </form>
    </>
  );
}
