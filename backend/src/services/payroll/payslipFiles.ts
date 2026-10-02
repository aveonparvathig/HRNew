// Payslips as files and as email: the file's name, its password, who it
// goes to and what the mail says. Pure, DB-independent.
import { PAN_FORMAT } from './taxCalc';

// ---------------------------------------------------------------------------
// Password
// ---------------------------------------------------------------------------
export const PDF_PASSWORD_MODES = [
  { value: 'NONE', label: 'No password' },
  { value: 'PAN', label: 'The employee\'s PAN, in capitals' },
  { value: 'DOB', label: 'The employee\'s date of birth, as DDMMYYYY' },
];
const MODE_VALUES = PDF_PASSWORD_MODES.map(m => m.value);
export const isPasswordMode = (value: any) => MODE_VALUES.includes(value);

export interface PasswordResult {
  password: string | null; // null = the file is not protected
  missing: string | null;  // why a protected file cannot be made for this person
}

// The password of an employee's payslip file. When the rule needs a detail
// the record does not hold, no file is made: an unprotected payslip is
// never sent in place of a protected one.
export function payslipPassword(mode: string, person: { panNumber?: string | null; dateOfBirth?: string | null }): PasswordResult {
  if (mode === 'PAN') {
    const pan = String(person.panNumber || '').trim().toUpperCase();
    return PAN_FORMAT.test(pan) ? { password: pan, missing: null } : { password: null, missing: 'No valid PAN on record for the password' };
  }
  if (mode === 'DOB') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(person.dateOfBirth || ''));
    return match ? { password: `${match[3]}${match[2]}${match[1]}`, missing: null }
      : { password: null, missing: 'No date of birth on record for the password' };
  }
  return { password: null, missing: null };
}

// What the mail tells the employee about opening the file. Never the
// password itself.
export function passwordHint(mode: string): string {
  if (mode === 'PAN') return 'The file opens with your PAN in capital letters, for example ABCDE1234F.';
  if (mode === 'DOB') return 'The file opens with your date of birth as eight digits, day first: 5 March 1990 is 05031990.';
  return '';
}

// ---------------------------------------------------------------------------
// File names
// ---------------------------------------------------------------------------
export const FILE_CONTEXTS = [
  { value: 'EMPNO', label: 'Employee code' },
  { value: 'NAME', label: 'Employee name' },
  { value: 'EMPNO_NAME', label: 'Employee code and name' },
];
const CONTEXT_VALUES = FILE_CONTEXTS.map(c => c.value);
export const isFileContext = (value: any) => CONTEXT_VALUES.includes(value);

// A piece of a file name: letters, digits, dashes; spaces become dashes.
export const filePart = (value: any) => String(value ?? '').normalize('NFKD')
  .replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-').slice(0, 60);

// "Payslip_EMP-0002_2026-06.pdf". A person with no code falls back to
// their name, so the file always says whose it is.
export function payslipFileName(
  settings: { payslipFilePrefix?: string; payslipFileContext?: string },
  person: { name: string; employeeNo?: string | null }, period: string,
): string {
  const code = filePart(person.employeeNo);
  const name = filePart(person.name);
  const context = settings.payslipFileContext === 'NAME' ? name
    : settings.payslipFileContext === 'EMPNO_NAME' ? [code, name].filter(Boolean).join('_')
    : code || name;
  return [filePart(settings.payslipFilePrefix) || 'Payslip', context || 'employee', period].join('_') + '.pdf';
}

// File names inside one archive must differ: a second "x.pdf" becomes "x-2.pdf".
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map(name => {
    const count = (seen.get(name.toLowerCase()) || 0) + 1;
    seen.set(name.toLowerCase(), count);
    return count === 1 ? name : name.replace(/(\.[^.]+)?$/, `-${count}$1`);
  });
}

export const jvFileName = (prefix: string | undefined, period: string, extension: 'csv' | 'xlsx') =>
  `${filePart(prefix) || 'JV'}_${period}.${extension}`;

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------
export const EMAIL_TARGETS = [
  { value: 'OFFICIAL', label: 'Official email' },
  { value: 'PERSONAL', label: 'Personal email' },
];
export const isEmailTarget = (value: any) => value === 'OFFICIAL' || value === 'PERSONAL';

export const EMAIL_FORMAT = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
export const isEmail = (value: any) => EMAIL_FORMAT.test(String(value || '').trim());

// The address a payslip goes to: the preferred one, else the other.
export function payslipAddress(target: string, person: { officialEmail?: string | null; email?: string | null }) {
  const official = String(person.officialEmail || '').trim();
  const personal = String(person.email || '').trim();
  const [first, second] = target === 'PERSONAL' ? [personal, official] : [official, personal];
  const address = [first, second].find(isEmail) || '';
  return { address, fallback: Boolean(address) && address !== first };
}

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function payslipEmail(
  company: { name: string; email?: string }, person: { name: string }, period: string, passwordMode: string,
) {
  const month = monthLabel(period);
  const hint = passwordHint(passwordMode);
  const lines = [
    `Dear ${person.name},`,
    `Your payslip for ${month} is attached.`,
    ...(hint ? [hint] : []),
    `If anything on it looks wrong, write to ${company.email || 'the HR team'}.`,
    `Regards,\n${company.name}`,
  ];
  return {
    subject: `Payslip for ${month} — ${company.name}`,
    text: lines.join('\n\n'),
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1b2437;">${
      lines.map(l => `<p style="margin:0 0 12px;">${escapeHtml(l).replace(/\n/g, '<br/>')}</p>`).join('')}</div>`,
  };
}

// What goes out when a month's payslips are released
export const RELEASE_MAILS = [
  { value: 'NONE', label: 'Nothing' },
  { value: 'NOTICE', label: 'A notice that the payslip can be seen in My Pay' },
  { value: 'PAYSLIP', label: 'The payslip itself, as a PDF' },
];
export const isReleaseMail = (value: any) => RELEASE_MAILS.some(m => m.value === value);

const mailBody = (lines: string[]) => ({
  text: lines.join('\n\n'),
  html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#1b2437;">${
    lines.map(l => `<p style="margin:0 0 12px;">${escapeHtml(l).replace(/\n/g, '<br/>')}</p>`).join('')}</div>`,
});

// "Your payslip for October 2026 is ready."
export function releaseNoticeEmail(company: { name: string; email?: string }, person: { name: string }, period: string, url: string) {
  const month = monthLabel(period);
  return {
    subject: `Payslip for ${month} is ready — ${company.name}`,
    ...mailBody([
      `Dear ${person.name},`,
      `Your payslip for ${month} is ready. Sign in${url ? ` at ${url}` : ''} and open My Pay to see it.`,
      `If anything on it looks wrong, write to ${company.email || 'the HR team'}.`,
      `Regards,\n${company.name}`,
    ]),
  };
}

// A new login's sign-in address and temporary password.
export function welcomeEmail(company: { name: string; email?: string }, name: string, login: string, password: string, url: string) {
  return {
    subject: `Your login for ${company.name}`,
    ...mailBody([
      `Dear ${name},`,
      `A login has been created for you${url ? ` at ${url}` : ''}.`,
      `Sign in with: ${login}\nTemporary password: ${password}`,
      'You will be asked to choose a password of your own the first time you sign in. Do not share this mail.',
      `If you were not expecting this, write to ${company.email || 'the HR team'}.`,
      `Regards,\n${company.name}`,
    ]),
  };
}

// ---------------------------------------------------------------------------
// Journal voucher as rows for a file
// ---------------------------------------------------------------------------
export interface JvLineLike { ledger: string; detail: string; debit: number; credit: number }

export const JV_HEADER = ['Date', 'Ledger account', 'Debit', 'Credit', 'Narration'];

export function jvRows(lines: JvLineLike[], voucherDate: string, narration: string): (string | number)[][] {
  return lines.map(l => [voucherDate, l.ledger, l.debit || '', l.credit || '', narration]);
}

// A value starting with = + - @ would run as a formula in a spreadsheet
const csvCell = (value: string | number) => {
  const text = typeof value === 'number' ? String(value) : /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const toCsv = (rows: (string | number)[][]) => rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
