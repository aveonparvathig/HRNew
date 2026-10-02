// Payroll documents as files: payslip PDFs (one, a month's ZIP, a month
// in one file), any report as a PDF, the journal voucher for import, and
// payslips by email.
import { Response, NextFunction } from 'express';
import JSZip from 'jszip';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { actorPerson } from '../middleware/roles';
import { orgBrand } from '../services/orgBrand';
import { htmlToPdf, joinHtml, pdfEngine } from '../services/pdf';
import { mailProblem, mailSettingsFor, sendMail } from '../services/mailer';
import { actorName, diffFields, logPayrollAudit } from '../services/payroll/audit';
import { financialYearFor, financialYearOf, periodsOfFinancialYear } from '../services/payroll/financialYear';
import { currentPeriodIST } from '../services/payroll/salaryStructure';
import { journalVoucher } from '../services/payroll/payoutCalc';
import { monthEnd } from '../services/payroll/tdsReturnCalc';
import { monthLabel } from '../services/payroll/reportHtml';
import {
  EMAIL_TARGETS, FILE_CONTEXTS, JV_HEADER, PDF_PASSWORD_MODES, filePart, isEmailTarget, isFileContext,
  isPasswordMode, jvFileName, jvRows, payslipAddress, payslipEmail, payslipPassword, toCsv, uniqueNames,
} from '../services/payroll/payslipFiles';
import {
  PAYSLIP_INCLUDE, payslipFile, payslipHtml, sendFile, settingsFor,
} from '../services/payroll/payslipDocs';

const str = (v: any) => String(v ?? '').trim();
const byName = (a: any, b: any) => a.person.name.localeCompare(b.person.name);
const PDF = 'application/pdf';
const FILE_SETTINGS = ['payslipPdfPassword', 'payslipFilePrefix', 'payslipFileContext', 'payslipEmailTo', 'jvFilePrefix'];

async function fetchRun(runId: string, organizationId: string) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, organizationId },
    include: { entries: { include: { person: true, lines: true } } },
  });
  if (!run) throw new AppError(404, 'Payroll run not found');
  run.entries.sort(byName);
  return run;
}

async function fetchEntry(entryId: string, organizationId: string, extra: any = {}) {
  const entry = await prisma.payslipEntry.findFirst({
    where: { id: entryId, organizationId, ...extra }, include: PAYSLIP_INCLUDE,
  });
  if (!entry) throw new AppError(404, 'Payslip not found');
  return entry;
}

// A ZIP of payslip files. Payslips that cannot be made (a password is
// required and the record lacks what it is made from) are listed in a
// text file inside, so nothing goes missing silently.
async function payslipsZip(organizationId: string, entries: any[]): Promise<{ zip: Buffer; included: number; skipped: string[] }> {
  const [settings, brand] = await Promise.all([settingsFor(organizationId), orgBrand(organizationId)]);
  const files: { filename: string; pdf: Buffer }[] = [];
  const skipped: string[] = [];
  for (const entry of entries) {
    const { missing } = payslipPassword(settings.payslipPdfPassword, entry.person);
    if (missing) { skipped.push(`${entry.person.name} (${monthLabel(entry.run.period)}): ${missing}`); continue; }
    files.push(await payslipFile(organizationId, entry, settings, brand));
  }
  const zip = new JSZip();
  const names = uniqueNames(files.map(f => f.filename));
  files.forEach((f, i) => zip.file(names[i], f.pdf));
  if (skipped.length) zip.file('NOT-INCLUDED.txt', `These payslips were left out:\r\n\r\n${skipped.join('\r\n')}\r\n`);
  return { zip: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), included: files.length, skipped };
}

// Payslips an employee may see: finalized and released, and not on hold.
const VISIBLE_TO_EMPLOYEE = { run: { status: 'FINALIZED', releasedAt: { not: null } }, payStatus: 'PAY' };

// ---------------------------------------------------------------------------
// Any report as a PDF: add ?format=pdf to its address. The page the
// report would have shown is rendered to a file instead.
// ---------------------------------------------------------------------------
export function pdfFormat(req: any, res: Response, next: NextFunction) {
  if (req.method !== 'GET' || req.query.format !== 'pdf') return next();
  const json = res.json.bind(res);
  res.json = ((body: any) => {
    // Only titled documents; a payslip has its own route, with its password
    if (res.statusCode >= 400 || !body || typeof body.html !== 'string' || typeof body.title !== 'string') return json(body);
    htmlToPdf(body.html)
      .then(pdf => sendFile(res, `${filePart(body.title) || 'document'}.pdf`, PDF, pdf))
      .catch(err => {
        res.status(err?.statusCode || 500);
        json({ error: err?.statusCode ? err.message : 'Could not make the PDF file' });
      });
    return res;
  }) as any;
  next();
}

export const payrollFilesController = {
  // ---- Settings --------------------------------------------------------------
  async getFileSettings(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const [settings, mail, employees] = await Promise.all([
      settingsFor(organizationId),
      mailSettingsFor(organizationId),
      prisma.person.findMany({
        where: { organizationId, isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } },
        select: { panNumber: true, dateOfBirth: true, officialEmail: true, email: true },
      }),
    ]);
    const lacking = (mode: string) => employees.filter(p => payslipPassword(mode, p).missing).length;
    res.json({
      settings: Object.fromEntries(FILE_SETTINGS.map(f => [f, (settings as any)[f]])),
      passwordModes: PDF_PASSWORD_MODES, fileContexts: FILE_CONTEXTS, emailTargets: EMAIL_TARGETS,
      engine: pdfEngine(),
      mail: { enabled: mail.enabled, problem: mailProblem(mail) },
      // How many current employees each choice would leave without a file or a mail
      employees: {
        total: employees.length,
        withoutPan: lacking('PAN'), withoutBirthDate: lacking('DOB'),
        withoutOfficialEmail: employees.filter(p => !payslipAddress('OFFICIAL', { officialEmail: p.officialEmail }).address).length,
        withoutPersonalEmail: employees.filter(p => !payslipAddress('PERSONAL', { email: p.email }).address).length,
        withoutAnyEmail: employees.filter(p => !payslipAddress('OFFICIAL', p).address).length,
      },
    });
  },

  async updateFileSettings(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const before = await settingsFor(organizationId);
    const b = req.body;
    const data: any = {};
    if (b.payslipPdfPassword !== undefined) {
      if (!isPasswordMode(b.payslipPdfPassword)) throw new AppError(400, 'Pick how payslip files are protected');
      if (b.payslipPdfPassword !== 'NONE' && !pdfEngine().password) {
        throw new AppError(400, 'Password-protected PDF files are not available on this server');
      }
      data.payslipPdfPassword = b.payslipPdfPassword;
    }
    if (b.payslipFileContext !== undefined) {
      if (!isFileContext(b.payslipFileContext)) throw new AppError(400, 'Pick what identifies the employee in the file name');
      data.payslipFileContext = b.payslipFileContext;
    }
    if (b.payslipEmailTo !== undefined) {
      if (!isEmailTarget(b.payslipEmailTo)) throw new AppError(400, 'Pick the official or the personal address');
      data.payslipEmailTo = b.payslipEmailTo;
    }
    for (const [field, fallback] of [['payslipFilePrefix', 'Payslip'], ['jvFilePrefix', 'JV']]) {
      if (b[field] === undefined) continue;
      const value = filePart(b[field]).slice(0, 30);
      if (str(b[field]) && !value) throw new AppError(400, 'A file name can use letters, digits and dashes');
      data[field] = value || fallback;
    }
    const updated = await prisma.payrollSettings.update({ where: { organizationId }, data });
    await logPayrollAudit(req, diffFields(before, updated, FILE_SETTINGS).map(c => ({ action: 'SETTINGS_UPDATED' as const, ...c })));
    res.json({ settings: Object.fromEntries(FILE_SETTINGS.map(f => [f, (updated as any)[f]])) });
  },

  // ---- Payslip files -----------------------------------------------------------
  async payslipPdf(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const file = await payslipFile(organizationId, await fetchEntry(req.params.entryId, organizationId));
    sendFile(res, file.filename, PDF, file.pdf);
  },

  // Every payslip of the month as separate files in one ZIP.
  async runPayslipsZip(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    if (run.entries.length === 0) throw new AppError(400, 'This run has no payslips');
    const settings = await settingsFor(organizationId);
    const { zip, included, skipped } = await payslipsZip(organizationId, run.entries.map(e => ({ ...e, run })));
    res.setHeader('X-Included', String(included));
    res.setHeader('X-Skipped', String(skipped.length));
    sendFile(res, `${filePart(settings.payslipFilePrefix) || 'Payslip'}s_${run.period}.zip`, 'application/zip', zip);
  },

  // Every payslip of the month in one file, a page each: for the office's
  // own record, so it carries no password.
  async runPayslipsPdf(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    if (run.entries.length === 0) throw new AppError(400, 'This run has no payslips');
    const [settings, brand] = await Promise.all([settingsFor(organizationId), orgBrand(organizationId)]);
    const pages: string[] = [];
    for (const e of run.entries) pages.push(await payslipHtml(organizationId, { ...e, run }, brand));
    sendFile(res, `${filePart(settings.payslipFilePrefix) || 'Payslip'}s_${run.period}_all.pdf`, PDF, await htmlToPdf(joinHtml(pages)));
  },

  // ---- Payslips by email --------------------------------------------------------
  // Who a month's payslips would go to, and what was sent so far.
  async delivery(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await fetchRun(req.params.runId, organizationId);
    const [settings, mail, logs] = await Promise.all([
      settingsFor(organizationId),
      mailSettingsFor(organizationId),
      prisma.mailLog.findMany({ where: { organizationId, runId: run.id, kind: 'PAYSLIP' }, orderBy: { createdAt: 'desc' } }),
    ]);
    const target = isEmailTarget(req.query.to) ? String(req.query.to) : settings.payslipEmailTo;
    const lastOf = new Map<string, any>();
    for (const log of logs) if (log.entryId && !lastOf.has(log.entryId)) lastOf.set(log.entryId, log);
    res.json({
      run: { id: run.id, period: run.period, status: run.status, releasedAt: run.releasedAt },
      target, emailTargets: EMAIL_TARGETS,
      passwordMode: settings.payslipPdfPassword,
      passwordLabel: PDF_PASSWORD_MODES.find(m => m.value === settings.payslipPdfPassword)?.label || '',
      mail: { enabled: mail.enabled, problem: mailProblem(mail), from: mail.fromEmail },
      engine: pdfEngine(),
      entries: run.entries.map(e => {
        const { address, fallback } = payslipAddress(target, e.person);
        const last = lastOf.get(e.id);
        const blocked = e.payStatus === 'HOLD' ? 'Salary is on hold'
          : !address ? 'No email address on record'
          : payslipPassword(settings.payslipPdfPassword, e.person).missing;
        return {
          id: e.id, person: { id: e.person.id, name: e.person.name, employeeNo: e.person.employeeNo },
          netPayable: e.netPayable, address, fallback, blocked: blocked || null,
          last: last ? { status: last.status, to: last.toEmail, at: last.createdAt, error: last.error } : null,
        };
      }),
    });
  },

  // Mail one employee their payslip. The run must be finalized and its
  // payslips released: a payslip in someone's inbox is a released one.
  async emailPayslip(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const entry = await fetchEntry(req.params.entryId, organizationId);
    if (entry.run.status !== 'FINALIZED') throw new AppError(400, 'Finalize the run before emailing its payslips');
    if (!entry.run.releasedAt) throw new AppError(400, 'Release the payslips to employees first, then email them');
    if (entry.payStatus === 'HOLD') throw new AppError(400, `${entry.person.name}'s salary is on hold`);
    const settings = await settingsFor(organizationId);
    const target = isEmailTarget(req.body.to) ? req.body.to : settings.payslipEmailTo;
    const { address } = payslipAddress(target, entry.person);
    if (!address) throw new AppError(400, `${entry.person.name} has no email address on record`);
    const brand = await orgBrand(organizationId);
    const file = await payslipFile(organizationId, entry, settings, brand);
    const mail = payslipEmail(brand, entry.person, entry.run.period, settings.payslipPdfPassword);
    const result = await sendMail(organizationId, {
      kind: 'PAYSLIP', to: address, ...mail,
      attachments: [{ filename: file.filename, content: file.pdf, contentType: PDF }],
      runId: entry.runId, entryId: entry.id, personId: entry.personId, personName: entry.person.name,
      sentBy: await actorName(req.user?.userId),
    });
    res.json({ ...result, to: address, locked: file.locked });
  },

  // ---- Journal voucher as a file -------------------------------------------------
  async journalVoucherFile(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const run = await prisma.payrollRun.findFirst({
      where: { id: req.params.runId, organizationId },
      include: { entries: { include: { person: true, lines: true, payoutBatch: true } } },
    });
    if (!run) throw new AppError(404, 'Payroll run not found');
    const [mappings, settings] = await Promise.all([
      prisma.ledgerMapping.findMany({ where: { organizationId } }),
      settingsFor(organizationId),
    ]);
    const jv = journalVoucher(run.entries, Object.fromEntries(mappings.map(m => [m.key, m.ledgerName])));
    const narration = `Salaries and statutory dues for ${monthLabel(run.period)}`;
    const rows = jvRows(jv.lines, monthEnd(run.period), narration);
    if (req.query.format === 'xlsx') {
      const Excel = await import('exceljs');
      const wb = new Excel.Workbook();
      const ws = wb.addWorksheet('Journal voucher');
      ws.addRow(JV_HEADER).font = { bold: true };
      for (const row of rows) ws.addRow(row);
      ws.addRow(['', 'Total', jv.totalDebit, jv.totalCredit, '']).font = { bold: true };
      ws.columns.forEach((c: any, i: number) => { c.width = [12, 38, 16, 16, 46][i]; });
      [3, 4].forEach(i => { ws.getColumn(i).numFmt = '#,##0.00'; });
      const buffer = Buffer.from(await wb.xlsx.writeBuffer() as ArrayBuffer);
      return sendFile(res, jvFileName(settings.jvFilePrefix, run.period, 'xlsx'),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer);
    }
    // UTF-8 with a byte-order mark, so a spreadsheet reads ledger names correctly
    sendFile(res, jvFileName(settings.jvFilePrefix, run.period, 'csv'), 'text/csv; charset=utf-8',
      Buffer.from('﻿' + toCsv([JV_HEADER, ...rows]), 'utf8'));
  },

  // ---- An employee's own payslips ---------------------------------------------------
  async myPayslipPdf(req: any, res: Response) {
    const me = await actorPerson(req);
    const entry = await fetchEntry(req.params.entryId, me.organizationId, { personId: me.id, ...VISIBLE_TO_EMPLOYEE });
    const file = await payslipFile(me.organizationId, entry);
    sendFile(res, file.filename, PDF, file.pdf);
  },

  // A financial year's payslips in one ZIP.
  async myPayslipsZip(req: any, res: Response) {
    const me = await actorPerson(req);
    const year = Number(/^(\d{4})/.exec(String(req.query.fy || ''))?.[1]) || financialYearOf(currentPeriodIST()).startYear;
    const entries = await prisma.payslipEntry.findMany({
      where: {
        organizationId: me.organizationId, personId: me.id, ...VISIBLE_TO_EMPLOYEE,
        run: { ...VISIBLE_TO_EMPLOYEE.run, period: { in: periodsOfFinancialYear(year) } },
      },
      include: PAYSLIP_INCLUDE, orderBy: { run: { period: 'asc' } },
    });
    if (entries.length === 0) throw new AppError(404, `No payslips in FY ${financialYearFor(year).label}`);
    const { zip } = await payslipsZip(me.organizationId, entries);
    sendFile(res, `Payslips_FY-${financialYearFor(year).label}.zip`, 'application/zip', zip);
  },
};
