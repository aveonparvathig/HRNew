import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import { peopleAPI } from '../api/people';
import { Modal, ErrorAlert } from './ui';
import { Button, ButtonLink } from './Button';
import { confirmDialog, toast } from './feedback';
import { formatDate } from '../utils/format';

const STATUS_TONE: Record<string, string> = { SUBMITTED: 'badge-warning', ACCEPTED: 'badge-info', RELIEVED: 'badge-neutral', WITHDRAWN: 'badge-neutral' };
const CHECKLIST: [string, string][] = [
  ['assetsReturned', 'Assets returned'], ['accessRevoked', 'Access removed'],
  ['handoverDone', 'Handover done'], ['exitInterviewDone', 'Exit interview done'],
];
const today = () => new Date().toISOString().slice(0, 10);
const Info = ({ label, value }: { label: string; value: ReactNode }) => value ? <div className="pp-kv"><span className="pp-kv-label">{label}</span><span>{value}</span></div> : null;

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

  return (
    <div className="card mb-24">
      <div className="card-header">
        <div><h3>Separation</h3>
          {sep && <span className="pp-text-13"><span className={`badge ${STATUS_TONE[sep.status]}`}>{statusLabel(sep.status)}</span> {modeLabel(sep.mode)}</span>}</div>
        <div className="cluster">
          {!sep && <Button size="sm" onClick={startEdit}>Start separation</Button>}
          {sep && sep.status !== 'RELIEVED' && sep.status !== 'WITHDRAWN' && <Button size="sm" icon="pen" onClick={startEdit}>Edit</Button>}
          {sep?.canAccept && <Button size="sm" onClick={accept}>Accept (start notice)</Button>}
          {sep?.canRelieve && <Button size="sm" onClick={() => setRelieve({ relievedOn: sep.agreedLastDay || sep.noticeLastDay || today() })}>Relieve…</Button>}
          {sep?.canWithdraw && <Button size="sm" variant="ghost" onClick={withdraw}>Withdraw</Button>}
          {sep && sep.status !== 'RELIEVED' && <Button size="sm" variant="danger" onClick={remove}>Remove</Button>}
        </div>
      </div>
      <div className="pp-card-body">
        <ErrorAlert message={error} onDismiss={() => setError('')} />
        {!sep ? (
          <p className="text-muted pp-text-13">No separation recorded. Start one to track a resignation, termination, contract end, retirement or death.</p>
        ) : (
          <div className="grid-2 pp-gap-24">
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
              <div className="pp-subhead">Exit checklist</div>
              {CHECKLIST.map(([key, label]) => (
                <label key={key} className="pp-check-row">
                  <input type="checkbox" checked={sep[key]} disabled={sep.status === 'WITHDRAWN'} onChange={e => toggleExit(key, e.target.checked)} />
                  {label}
                </label>
              ))}
              <div className="field pp-field-narrow pp-mt-10">
                <label htmlFor="pp-sep-rehire" className="pp-label-sm">Fit to rehire</label>
                <select id="pp-sep-rehire" className="select" value={sep.fitToRehire || ''} disabled={sep.status === 'WITHDRAWN'}
                  onChange={e => toggleExit('fitToRehire' as any, e.target.value as any)}>
                  {(data.fitOptions || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}

        {sep && (sep.status === 'ACCEPTED' || sep.status === 'RELIEVED') && (
          <div className="cluster pp-divider-row">
            <span className="text-sm-muted">On leaving:</span>
            {data.letters.map((l: any) => (
              <Button key={l.code} size="sm" icon="pen" onClick={() => onIssueLetter?.(l.code, l.label)}>{l.label}</Button>
            ))}
            <ButtonLink to={`/payroll/settlements/new?personId=${person.id}`} size="sm" icon="banknote">
              {data.settlement ? 'Final settlement' : 'Start final settlement'}
            </ButtonLink>
          </div>
        )}
      </div>

      {/* Start / edit details */}
      <Modal title={sep ? 'Edit separation' : 'Start separation'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && <form onSubmit={save}>
          <ErrorAlert message={formError} />
          <div className="form-grid mb-14">
            <div className="field">
              <label htmlFor="pp-sep-mode">How are they leaving? *</label>
              <select id="pp-sep-mode" className="select" required value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value })}>
                {(data.modes || []).map((m: any) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div className="field"><label htmlFor="pp-sep-submitted">Date submitted</label>
              <input id="pp-sep-submitted" className="input" type="date" value={form.submittedOn} onChange={e => setForm({ ...form, submittedOn: e.target.value })} /></div>
            {data.modes.find((m: any) => m.value === form.mode)?.notice && (<>
              <div className="field"><label htmlFor="pp-sep-notice">Notice required (days)</label>
                <input id="pp-sep-notice" className="input num" type="number" min={0} max={365} value={form.noticeDays} onChange={e => setForm({ ...form, noticeDays: e.target.value })} /></div>
              <div className="field"><label htmlFor="pp-sep-lastday">Agreed last working day</label>
                <input id="pp-sep-lastday" className="input" type="date" value={form.agreedLastDay} onChange={e => setForm({ ...form, agreedLastDay: e.target.value })} /></div>
            </>)}
            <div className="field pp-span-all"><label htmlFor="pp-sep-reason">Reason</label>
              <input id="pp-sep-reason" className="input" maxLength={200} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
          </div>
          {data.modes.find((m: any) => m.value === form.mode)?.notice && (
            <label className="checkbox-field pp-mb-12">
              <input type="checkbox" checked={form.noticeWaived} onChange={e => setForm({ ...form, noticeWaived: e.target.checked })} /> Notice shortfall waived
            </label>
          )}
          <div className="field"><label htmlFor="pp-sep-remarks">Remarks</label>
            <textarea id="pp-sep-remarks" className="input" rows={2} maxLength={500} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>}
      </Modal>

      {/* Relieve */}
      <Modal title={`Relieve ${person.name}`} open={Boolean(relieve)} onClose={() => setRelieve(null)}>
        {relieve && <>
          <p className="modal-lede">
            This sets the relieving date and leaving status, and stops the employee's login. The final settlement and letters are offered afterwards.
          </p>
          <div className="field pp-field-narrow mb-14">
            <label htmlFor="pp-sep-relieved">Relieving date *</label>
            <input id="pp-sep-relieved" className="input" type="date" value={relieve.relievedOn} onChange={e => setRelieve({ relievedOn: e.target.value })} />
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setRelieve(null)}>Cancel</Button>
            <Button variant="accent" disabled={!relieve.relievedOn} onClick={doRelieve}>Relieve</Button>
          </div>
        </>}
      </Modal>
    </div>
  );
}
