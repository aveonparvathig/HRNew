// Separation (phase 25): how an employee leaves — the record, its status
// flow, notice-period maths and the exit checklist. Pure, DB-independent.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: any) => String(v ?? '').trim();
const clean = (v: any, max: number) => str(v).replace(/\s+/g, ' ').slice(0, max);

function isRealDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
function dateField(v: any, label: string): string | null | { error: string } {
  const s = str(v);
  if (!s) return null;
  if (!isRealDate(s)) return { error: `Enter a valid ${label}` };
  return s;
}

// "YYYY-MM-DD" plus a number of days.
export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Whole days from a to b (b - a); negative if b is earlier.
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

export const SEPARATION_MODES = [
  { value: 'RESIGNATION', label: 'Resignation', notice: true },
  { value: 'TERMINATION', label: 'Termination', notice: false },
  { value: 'CONTRACT_END', label: 'End of contract', notice: false },
  { value: 'RETIREMENT', label: 'Retirement', notice: false },
  { value: 'DEATH', label: 'Death', notice: false },
];
export const SEPARATION_STATUSES = [
  { value: 'SUBMITTED', label: 'Submitted' },
  { value: 'ACCEPTED', label: 'Notice period' },
  { value: 'RELIEVED', label: 'Relieved' },
  { value: 'WITHDRAWN', label: 'Withdrawn' },
];
export const FIT_TO_REHIRE = [
  { value: '', label: 'Not decided' },
  { value: 'YES', label: 'Yes' },
  { value: 'NO', label: 'No' },
];
const MODE_VALUES = SEPARATION_MODES.map(m => m.value);
export const modeHasNotice = (mode: string) => Boolean(SEPARATION_MODES.find(m => m.value === mode)?.notice);

// The last working day the notice implies: from the submission date plus
// the notice days (counting the submission day as day one).
export function noticeLastDay(submittedOn?: string | null, noticeDays?: number | null): string | null {
  if (!submittedOn || !isRealDate(submittedOn) || noticeDays == null || !Number.isFinite(noticeDays) || noticeDays < 0) return null;
  return addDays(submittedOn, Math.max(0, noticeDays - 1));
}

// Days short of the notice required: 0 if waived, or if the agreed last day
// is on/after the day the notice implies.
export function noticeShortfall(requiredLastDay?: string | null, agreedLastDay?: string | null, waived = false): number {
  if (waived || !requiredLastDay || !agreedLastDay) return 0;
  return Math.max(0, daysBetween(agreedLastDay, requiredLastDay));
}

// The leaving status the person ends on, by how they left.
export const finalStatusForMode = (mode: string) => (mode === 'TERMINATION' ? 'TERMINATED' : 'RESIGNED');

export const exitComplete = (s: { assetsReturned: boolean; accessRevoked: boolean; handoverDone: boolean; exitInterviewDone: boolean }) =>
  Boolean(s.assetsReturned && s.accessRevoked && s.handoverDone && s.exitInterviewDone);

// Status transitions. A resignation is accepted (→ notice period) before it
// is relieved; other modes may be relieved straight away. Nothing changes
// once relieved or withdrawn.
export const canAccept = (s: { mode: string; status: string }) => s.mode === 'RESIGNATION' && s.status === 'SUBMITTED';
export const canRelieve = (s: { mode: string; status: string }) =>
  (s.status === 'ACCEPTED' || s.status === 'SUBMITTED') && !(s.mode === 'RESIGNATION' && s.status === 'SUBMITTED');
export const canWithdraw = (s: { status: string }) => s.status === 'SUBMITTED' || s.status === 'ACCEPTED';

// The separation details as typed, checked and cleaned. Notice last-day and
// shortfall are worked out here so the record always agrees with itself.
export function separationInput(b: any): string | Record<string, any> {
  const mode = str(b.mode).toUpperCase();
  if (!MODE_VALUES.includes(mode)) return 'Pick how the employee is leaving';
  const submittedOn = dateField(b.submittedOn, 'date submitted');
  if (submittedOn && typeof submittedOn === 'object') return submittedOn.error;
  const agreedLastDay = dateField(b.agreedLastDay, 'agreed last working day');
  if (agreedLastDay && typeof agreedLastDay === 'object') return agreedLastDay.error;
  const noticeDays = b.noticeDays === '' || b.noticeDays == null ? null : Number(b.noticeDays);
  if (noticeDays !== null && (!Number.isInteger(noticeDays) || noticeDays < 0 || noticeDays > 365)) {
    return 'Notice is a whole number of days, up to 365';
  }
  const fitToRehire = str(b.fitToRehire).toUpperCase();
  if (fitToRehire && !['YES', 'NO'].includes(fitToRehire)) return 'Fit to rehire is Yes, No, or left undecided';
  const waived = Boolean(b.noticeWaived);
  const required = modeHasNotice(mode) ? noticeLastDay(submittedOn as string | null, noticeDays) : null;
  return {
    mode,
    submittedOn: submittedOn as string | null,
    reason: clean(b.reason, 200),
    noticeDays,
    noticeLastDay: required,
    agreedLastDay: agreedLastDay as string | null,
    noticeWaived: waived,
    noticeShortfallDays: noticeShortfall(required, agreedLastDay as string | null, waived),
    remarks: clean(b.remarks, 500),
    assetsReturned: Boolean(b.assetsReturned),
    accessRevoked: Boolean(b.accessRevoked),
    handoverDone: Boolean(b.handoverDone),
    exitInterviewDone: Boolean(b.exitInterviewDone),
    fitToRehire,
  };
}

// The relieving date to use: the one given, else the agreed last day, else
// the day the notice implies. Returns null if none is known.
export function relievingDate(given: any, sep: { agreedLastDay?: string | null; noticeLastDay?: string | null }): string | null {
  const s = str(given);
  if (s && isRealDate(s)) return s;
  return sep.agreedLastDay || sep.noticeLastDay || null;
}
