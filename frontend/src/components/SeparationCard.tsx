import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { peopleAPI } from '../api/people';
import { Modal, ErrorAlert } from './ui';
import { confirmDialog, toast } from './feedback';
import { formatDate } from '../utils/format';

const STATUS_TONE: Record<string, string> = { SUBMITTED: 'badge-warning', ACCEPTED: 'badge-info', RELIEVED: 'badge-neutral', WITHDRAWN: 'badge-neutral' };
const CHECKLIST: [string, string][] = [
  ['assetsReturned', 'Assets returned'], ['accessRevoked', 'Access removed'],
  ['handoverDone', 'Handover done'], ['exitInterviewDone', 'Exit interview done'],
];
const today = () => new Date().toISOString().slice(0, 10);

// Separation (phase 25): how an employee is leaving. Accepting a
// resignation starts the notice period; relieving sets the leaving date,
// stops the login and offers the settlement and the leaving letters.
export default function SeparationCard({ person, onChanged, onIssueLetter }: { person: any; onChanged?: () => void; onIssueLetter?: (docType: string, docLabel: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<any>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [relieve, setRelieve] = useState<{ relievedOn: string } | null>(null);

  const load = useCallback(async () => {
    try { setData((await peopleAPI.getSeparation(person.id)).data); }
    catch (e: any) { setError(e.response?.data?.error || 'Failed to load'); }
  }, [person.id]);
  useEffect(() => { load(); }, [load]);

  const sep = data?.separation;
  const modeLabel = (v: string) => data?.modes.find((m: any) => m.value === v)?.label || v;
  const statusLabel = (v: string) => data?.statuses.find((s: any) => s.value === v)?.label || v;
  const refresh = () => { load(); onChanged?.(); };

  const startEdit = () => {
    setFormError('');
    setForm(sep ? { ...sep, submittedOn: sep.submittedOn || '', agreedLastDay: sep.agreedLastDay || '', noticeDays: sep.noticeDays ?? '' }
      : { mode: 'RESIGNATION', submittedOn: today(), reason: '', noticeDays: person.noticePeriodDays ?? data?.person?.noticePeriodDays ?? '', agreedLastDay: '', noticeWaived: false, remarks: '', fitToRehire: '', assetsReturned: false, accessRevoked: false, handoverDone: false, exitInterviewDone: false });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setFormError(''); setSaving(true);
    try { await peopleAPI.saveSeparation(person.id, form); toast.success('Saved'); setForm(null); refresh(); }
    catch (err: any) { setFormError(err.response?.data?.error || 'Could not save'); }
    finally { setSaving(false); }
  };
  const act = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); toast.success(ok); refresh(); } catch (e: any) { setError(e.response?.data?.error || 'Could not do that'); }
  };
  const accept = () => act(() => peopleAPI.acceptSeparation(person.id), 'Resignation accepted — notice period started');
  const withdraw = async () => {
    if (!await confirmDialog({ title: 'Withdraw this separation?', message: 'The record is kept as withdrawn; an employee on notice goes back to active.', confirmLabel: 'Withdraw' })) return;
    act(() => peopleAPI.withdrawSeparation(person.id), 'Withdrawn');
  };
  const remove = async () => {
    if (!await confirmDialog({ title: 'Remove this separation record?', message: 'It is deleted; use this only if it was created in error.', confirmLabel: 'Remove', danger: true })) return;
    act(() => peopleAPI.deleteSeparation(person.id), 'Removed');
  };
  const doRelieve = async () => {
    try { await peopleAPI.relieveSeparation(person.id, { relievedOn: relieve!.relievedOn }); toast.success('Relieved'); setRelieve(null); refresh(); }
    catch (e: any) { setError(e.response?.data?.error || 'Could not relieve'); }
  };
  const toggleExit = async (key: string, value: boolean) => {
    try { await peopleAPI.saveSeparation(person.id, { ...sep, submittedOn: sep.submittedOn || '', agreedLastDay: sep.agreedLastDay || '', noticeDays: sep.noticeDays ?? '', [key]: value }); refresh(); }
    catch (e: any) { setError(e.response?.data?.error || 'Could not update'); }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : null;
  const Info = ({ label, value }: any) => value ? <div style={{ display: 'flex', gap: 8, fontSize: 13, padding: '2px 0' }}><span className="text-muted" style={{ minWidth: 150 }}>{label}</span><span>{value}</span></div> : null;

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div><h3>Separation</h3>
          {sep && <span style={{ fontSize: 13 }}><span className={`badge ${STATUS_TONE[sep.status]}`}>{statusLabel(sep.status)}</span> {modeLabel(sep.mode)}</span>}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!sep && <button className="btn btn-primary btn-sm" onClick={startEdit}>Start Separation</button>}
          {sep && sep.status !== 'RELIEVED' && sep.status !== 'WITHDRAWN' && <button className="btn btn-secondary btn-sm" onClick={startEdit}>Edit</button>}
          {sep?.canAccept && <button className="btn btn-primary btn-sm" onClick={accept}>Accept (start notice)</button>}
          {sep?.canRelieve && <button className="btn btn-primary btn-sm" onClick={() => setRelieve({ relievedOn: sep.agreedLastDay || sep.noticeLastDay || today() })}>Relieve…</button>}
          {sep?.canWithdraw && <button className="btn btn-ghost btn-sm" onClick={withdraw}>Withdraw</button>}
          {sep && sep.status !== 'RELIEVED' && <button className="btn btn-danger btn-sm" onClick={remove}>Remove</button>}
        </div>
      </div>
      <div style={{ padding: '0 22px 16px' }}>
        <ErrorAlert message={error} onDismiss={() => setError('')} />
        {!sep ? (
          <p className="text-muted" style={{ fontSize: 13 }}>No separation recorded. Start one to track a resignation, termination, contract end, retirement or death.</p>
        ) : (
          <div className="grid-2" style={{ gap: 24 }}>
            <div>
              <Info label="Mode" value={modeLabel(sep.mode)} />
              <Info label="Submitted on" value={sep.submittedOn && formatDate(sep.submittedOn)} />
              <Info label="Reason" value={sep.reason} />
              {sep.noticeDays != null && <Info label="Notice required" value={`${sep.noticeDays} days`} />}
              <Info label="Notice last day" value={sep.noticeLastDay && formatDate(sep.noticeLastDay)} />
              <Info label="Agreed last day" value={sep.agreedLastDay && formatDate(sep.agreedLastDay)} />
              {sep.noticeShortfallDays > 0 && <Info label="Notice shortfall" value={<span className="text-warning">{sep.noticeShortfallDays} days{sep.noticeWaived ? ' (waived)' : ''}</span>} />}
              {sep.noticeWaived && <Info label="Notice" value="Waived" />}
              {sep.relievedOn && <Info label="Relieved on" value={formatDate(sep.relievedOn)} />}
              <Info label="Remarks" value={sep.remarks} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Exit checklist</div>
              {CHECKLIST.map(([key, label]) => (
                <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, padding: '3px 0' }}>
                  <input type="checkbox" checked={sep[key]} disabled={sep.status === 'WITHDRAWN'} onChange={e => toggleExit(key, e.target.checked)} />
                  {label}
                </label>
              ))}
              <div className="field" style={{ marginTop: 10, maxWidth: 220 }}>
                <label style={{ fontSize: 12.5 }}>Fit to rehire</label>
                <select className="select" value={sep.fitToRehire || ''} disabled={sep.status === 'WITHDRAWN'}
                  onChange={e => toggleExit('fitToRehire' as any, e.target.value as any)}>
                  {(data.fitOptions || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {sep && (sep.status === 'ACCEPTED' || sep.status === 'RELIEVED') && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="text-muted" style={{ fontSize: 12.5, marginRight: 4 }}>On leaving:</span>
            {data.letters.map((l: any) => (
              <button key={l.code} className="btn btn-secondary btn-sm" onClick={() => onIssueLetter?.(l.code, l.label)}>{l.label}</button>
            ))}
            <Link to={`/payroll/settlements/new?personId=${person.id}`} className="btn btn-secondary btn-sm">
              {data.settlement ? 'Final settlement' : 'Start final settlement'}
            </Link>
          </div>
        )}
      </div>

      {/* Start / edit details */}
      <Modal title={sep ? 'Edit Separation' : 'Start Separation'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <ErrorAlert message={formError} />
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>How are they leaving? *</label>
              <select className="select" required value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>
                {(data.modes || []).map((m: any) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="field"><label>Date submitted</label>
              <input className="input" type="date" value={form.submittedOn} onChange={e => setForm({ ...form, submittedOn: e.target.value })} /></div>
            {data.modes.find((m: any) => m.value === form.mode)?.notice && (<>
              <div className="field"><label>Notice required (days)</label>
                <input className="input" type="number" min={0} max={365} value={form.noticeDays} onChange={e => setForm({ ...form, noticeDays: e.target.value })} /></div>
              <div className="field"><label>Agreed last working day</label>
                <input className="input" type="date" value={form.agreedLastDay} onChange={e => setForm({ ...form, agreedLastDay: e.target.value })} /></div>
            </>)}
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Reason</label>
              <input className="input" maxLength={200} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
          </div>
          {data.modes.find((m: any) => m.value === form.mode)?.notice && (
            <label className="checkbox-field" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={form.noticeWaived} onChange={e => setForm({ ...form, noticeWaived: e.target.checked })} /> Notice shortfall waived
            </label>
          )}
          <div className="field"><label>Remarks</label>
            <textarea className="input" rows={2} maxLength={500} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>}
      </Modal>

      {/* Relieve */}
      <Modal title={`Relieve ${person.name}`} open={Boolean(relieve)} onClose={() => setRelieve(null)}>
        {relieve && <>
          <p className="text-muted" style={{ fontSize: 13 }}>
            This sets the relieving date and leaving status, and stops the employee's login. The final settlement and letters are offered afterwards.
          </p>
          <div className="field" style={{ maxWidth: 220, marginBottom: 14 }}>
            <label>Relieving date *</label>
            <input className="input" type="date" value={relieve.relievedOn} onChange={e => setRelieve({ relievedOn: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setRelieve(null)}>Cancel</button>
            <button type="button" className="btn btn-primary" disabled={!relieve.relievedOn} onClick={doRelieve}>Relieve</button>
          </div>
        </>}
      </Modal>
    </div>
  );
}
