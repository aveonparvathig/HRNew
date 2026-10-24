// Payslips as documents in the database's terms: the HTML of one entry,
// its PDF file under the organization's naming and password rules.
import { prisma } from '../../config/database';
import { AppError } from '../../middleware/errorHandler';
import { orgBrand, OrgBrand } from '../orgBrand';
import { renderPayslipHtml } from '../payrollCalc';
import { htmlToPdf, protectPdf } from '../pdf';
import { loanBalanceAfter } from './loanLedger';
import { claimsOfEntry } from './payout';
import { payslipFileName, payslipPassword } from './payslipFiles';
import { stampEntry } from '../positions';
import { mapLimit } from '../../utils/async';

export const settingsFor = (organizationId: string) =>
  prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} });

// Options for documents made in bulk: `stamped` when the caller has already
// set every entry's position with stampEntries (one query for the lot).
export interface PayslipDocOptions { stamped?: boolean }

// The payslip of an entry as HTML. `entry` carries its run, person and lines.
export async function payslipHtml(organizationId: string, entry: any, brand?: OrgBrand, opts: PayslipDocOptions = {}): Promise<string> {
  // Designation and department as they stood in the payslip's month
  if (!opts.stamped) await stampEntry(organizationId, entry);
  return renderPayslipHtml(brand || await orgBrand(organizationId), entry.run, {
    ...entry,
    loanBalanceAfter: await loanBalanceAfter(organizationId, entry, entry.run.period),
    claims: entry.reimbursement > 0 ? await claimsOfEntry(entry.id) : [],
  }, entry.person);
}

export interface PayslipFile {
  filename: string;
  pdf: Buffer;
  locked: boolean;
}

// The payslip as a PDF file, password-protected when the organization
// asks for that. Throws when a password is required and the employee's
// record lacks what it is made from.
export async function payslipFile(
  organizationId: string, entry: any, settings?: any, brand?: OrgBrand, opts: PayslipDocOptions = {},
): Promise<PayslipFile> {
  const s = settings || await settingsFor(organizationId);
  const { password, missing } = payslipPassword(s.payslipPdfPassword, entry.person);
  if (missing) throw new AppError(400, `${entry.person.name}: ${missing}`);
  const plain = await htmlToPdf(await payslipHtml(organizationId, entry, brand, opts));
  return {
    filename: payslipFileName(s, entry.person, entry.run.period),
    pdf: password ? await protectPdf(plain, password) : plain,
    locked: Boolean(password),
  };
}

// Payslips made in bulk go a few at a time: a large run neither waits on
// one PDF after another nor opens a browser page per employee at once.
export const BULK_CONCURRENCY = 4;
export { mapLimit };

export const PAYSLIP_INCLUDE = { run: true, person: true, lines: true } as const;

// Send a file as the response body.
export function sendFile(res: any, filename: string, contentType: string, body: Buffer) {
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.\-]/g, '_')}"`);
  res.setHeader('X-File-Name', encodeURIComponent(filename));
  res.send(body);
}
