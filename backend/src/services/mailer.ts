// Outgoing mail through the organization's own mail server (any SMTP
// service). Every attempt is written to the mail log.
import nodemailer from 'nodemailer';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { unseal } from './secretBox';
import { isEmail } from './payroll/payslipFiles';

export const MAIL_SECURITY = [
  { value: 'STARTTLS', label: 'STARTTLS (usually port 587)' },
  { value: 'SSL', label: 'SSL / TLS (usually port 465)' },
  { value: 'NONE', label: 'None (unencrypted, usually port 25)' },
];

export const mailSettingsFor = (organizationId: string) =>
  prisma.mailSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });

// What the settings screen gets: never the password itself.
export const mailSettingsJSON = (s: any) => ({
  enabled: s.enabled, host: s.host, port: s.port, security: s.security, username: s.username,
  hasPassword: Boolean(s.passwordEnc), fromName: s.fromName, fromEmail: s.fromEmail, replyTo: s.replyTo,
  welcomeMail: Boolean(s.welcomeMail), appUrl: s.appUrl || '',
});

// Why mail cannot be sent with these settings, or null when it can.
export function mailProblem(s: any): string | null {
  if (!s.host) return 'The mail server is not set up yet';
  if (!isEmail(s.fromEmail)) return 'The sender address is not set';
  if (s.username && s.passwordEnc && !unseal(s.passwordEnc)) {
    return 'The saved mail password can no longer be read. Type it in again in Company Settings → Email.';
  }
  return null;
}

function transportFor(s: any) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.security === 'SSL',
    requireTLS: s.security === 'STARTTLS',
    ignoreTLS: s.security === 'NONE',
    auth: s.username ? { user: s.username, pass: unseal(s.passwordEnc) } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

// A mail server's refusal in words a person can act on.
function failureText(err: any): string {
  const code = String(err?.code || '');
  const detail = `${code} ${err?.message || ''} ${err?.cause?.code || ''}`;
  if (code === 'EAUTH') return 'The mail server refused the user name or password';
  if (code === 'EENVELOPE') return 'The mail server refused the address';
  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EDNS|EHOSTUNREACH|ECONNECTION/.test(detail)) return 'Could not reach the mail server: check the host and port';
  if (/wrong version number|SSL routines|STARTTLS|ETLS/i.test(detail)) return 'The connection security does not suit this port: STARTTLS usually goes with 587, SSL with 465';
  if (/ETIMEDOUT|timeout|ESOCKET/i.test(detail)) return 'The mail server did not answer in time: check the port and the security setting';
  return String(err?.response || err?.message || 'Sending failed').slice(0, 300);
}

export interface OutgoingMail {
  kind: 'PAYSLIP' | 'TEST' | 'WELCOME' | 'NOTICE';
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
  // For the log
  runId?: string; entryId?: string; personId?: string; personName?: string; sentBy?: string;
}

// Send one mail and log the outcome. `force` sends even while mail is
// switched off: only the test from the settings screen does that.
export async function sendMail(organizationId: string, mail: OutgoingMail, opts: { force?: boolean } = {}) {
  const settings = await mailSettingsFor(organizationId);
  const log = (status: 'SENT' | 'FAILED', error = '') => prisma.mailLog.create({
    data: {
      organizationId, kind: mail.kind, toEmail: mail.to, subject: mail.subject, status, error,
      runId: mail.runId, entryId: mail.entryId, personId: mail.personId,
      personName: mail.personName || '', sentBy: mail.sentBy || '',
    },
  });
  if (!settings.enabled && !opts.force) {
    throw new AppError(400, 'Email is switched off. Switch it on in Company Settings → Email.');
  }
  const problem = mailProblem(settings);
  if (problem) throw new AppError(400, problem);
  if (!isEmail(mail.to)) throw new AppError(400, 'That is not an email address');
  try {
    await transportFor(settings).sendMail({
      from: settings.fromName ? { name: settings.fromName, address: settings.fromEmail } : settings.fromEmail,
      replyTo: isEmail(settings.replyTo) ? settings.replyTo : undefined,
      to: mail.to, subject: mail.subject, text: mail.text, html: mail.html, attachments: mail.attachments,
    });
    await log('SENT');
    return { ok: true as const, error: '' };
  } catch (err: any) {
    const error = failureText(err);
    await log('FAILED', error);
    return { ok: false as const, error };
  }
}
