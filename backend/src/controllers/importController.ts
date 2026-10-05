// Bulk imports: employees and salary revisions from a workbook, photos
// and documents from files named by employee code. Every import is
// checked first and reported row by row; nothing is saved until asked.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { actorName, logPayrollAudit } from '../services/payroll/audit';
import { IMAGE_DATA_URI, LIST_TYPES } from '../services/masters';
import { ensureListValues, listValuesFor } from '../services/listValues';
import { noteEmployeeCodeUsed } from '../services/numberSeries';
import { ensureStartingPosition, followProfileEdit } from '../services/positions';
import {
  EMPLOYEE_COLUMNS, ImportColumn, REVISION_COLUMNS, RowResult, UPDATABLE_COLUMNS, checkEmployeeImport, checkRevisionImport, employeeColumn,
  matchFile, matchFiles,
} from '../services/importCalc';
import { MAX_SHEET_ROWS, TemplateColumn, readSheet, sendWorkbook, templateWorkbook } from '../services/sheets';
import { EMPLOYMENT_STATUSES } from './peopleController';
import { reviseSalary } from './payrollStructureController';
import { addEmployeeFile } from './employeeFilesController';
import { assertEmployeeCapacity } from '../services/limitGuards';

const str = (v: any) => String(v ?? '').trim();
const LIST_COLUMNS = EMPLOYEE_COLUMNS.filter(c => c.type === 'list');
const LISTS = [...new Set(LIST_COLUMNS.map(c => c.list!))];
const MAX_PHOTO_CHARS = 2_000_000; // of the data URI: photos are made small before they are sent
const MAX_BATCH = 25;
const KIND_LABEL: Record<string, string> = {
  EMPLOYEES_ADD: 'Employees added', EMPLOYEES_UPDATE: 'Employees updated', SALARY_REVISIONS: 'Salary revisions',
  PHOTOS: 'Photos', DOCUMENTS: 'Documents',
};
const monthWords = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

async function employeeContext(organizationId: string) {
  const [people, lists, locations] = await Promise.all([
    prisma.person.findMany({ where: { organizationId }, omit: { photoData: true } }),
    listValuesFor(organizationId, LISTS),
    prisma.workLocation.findMany({ where: { organizationId }, select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } }),
  ]);
  return {
    people, locations,
    lists: Object.fromEntries(Object.entries(lists).map(([type, values]) => [type, (values as any[]).map(v => v.label)])),
  };
}

// The values a row gives to the lists: { DEPARTMENT: 'Support', … }
const listValuesOf = (data: Record<string, any>) =>
  Object.fromEntries(LIST_COLUMNS.filter(c => data[c.key]).map(c => [c.list!, data[c.key]]));

// What is typed in a column, for the Notes sheet of the template
function columnNote(c: ImportColumn, mode: string): string {
  if (c.key === 'employeeNo') return mode === 'ADD' ? 'Needed. A code not yet in use.' : 'Needed. The employee is found by this code; it is never changed.';
  if (c.key === 'name') return mode === 'ADD' ? 'Needed. No two employees may share a name.' : 'The name as it should read.';
  if (c.key === 'currentMonthlyPackage') return 'The package for a full month. Only when adding: later changes go through salary revisions.';
  switch (c.type) {
    case 'date': return 'A date, as 01-04-2026.';
    case 'whole': return 'A whole number.';
    case 'number': return 'A number.';
    case 'yesno': return 'Yes or No.';
    case 'status': return `One of: ${EMPLOYMENT_STATUSES.map(s => s.label).join(', ')}.`;
    case 'gender': return 'Male, Female or Other.';
    case 'list': return `A value of the ${LIST_TYPES.find(t => t.type === c.list)?.label || c.list} list. A value not in the list is reported before it is added.`;
    case 'location': return 'The name of a work location that is set up.';
    case 'manager': return 'The employee code of the person they report to.';
    case 'ifsc': return 'The IFSC of the branch: four letters, a zero, six characters.';
    case 'pan': return 'Five letters, four digits, a letter.';
    case 'aadhaar': return 'Twelve digits.';
    case 'email': return 'An email address.';
    default: return '';
  }
}

const AS_TEXT = ['employeeNo', 'managerId', 'bankAccountNumber', 'aadharNo', 'phone', 'officialNo', 'emergencyNo', 'pfUan', 'pfNumber', 'esiNumber', 'biometricId'];

async function saveLog(req: any, kind: string, fileName: string, summary: Record<string, number>, rows: any[]) {
  const log = await prisma.importLog.create({
    data: {
      organizationId: req.user?.organizationId, kind, fileName: str(fileName).slice(0, 200) || 'Unnamed file',
      ranByName: await actorName(req.user?.userId), summary, rows,
    },
  });
  await logPayrollAudit(req, [{
    action: 'IMPORT_RUN', field: `${KIND_LABEL[kind]} · ${log.fileName}`,
    newValue: Object.entries(summary).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k.toLowerCase()}`).join(', ') || 'nothing',
  }]);
  return log;
}

const countBy = (rows: { result: string }[]) => {
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.result] = (counts[r.result] || 0) + 1;
  return counts;
};

export const importController = {
  // ---- Employees --------------------------------------------------------------------------
  // The workbook to fill in. For an update it comes with every employee
  // and what is on record now, to edit and send back.
  async employeeTemplate(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const mode = req.query.mode === 'UPDATE' ? 'UPDATE' : 'ADD';
    const ctx = await employeeContext(organizationId);
    const columns: TemplateColumn[] = EMPLOYEE_COLUMNS.filter(c => mode === 'ADD' || !c.addOnly)
      .map(c => ({ header: c.header, note: columnNote(c, mode), example: c.example, asText: AS_TEXT.includes(c.key) || c.type === 'date' }));
    const used = EMPLOYEE_COLUMNS.filter(c => mode === 'ADD' || !c.addOnly);
    const locationName = new Map(ctx.locations.map(l => [l.id, l.name]));
    const codeOf = new Map(ctx.people.map(p => [p.id, p.employeeNo]));
    const dmy = (iso: any) => (/^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? String(iso).split('-').reverse().join('-') : '');
    const cellOf = (p: any, c: ImportColumn) => {
      const v = p[c.key];
      if (c.type === 'location') return locationName.get(v) || '';
      if (c.type === 'manager') return codeOf.get(v) || '';
      if (c.type === 'yesno') return v ? 'Yes' : 'No';
      if (c.type === 'date') return dmy(v);
      if (c.type === 'status') return EMPLOYMENT_STATUSES.find(s => s.value === v)?.label || '';
      if (c.type === 'whole') return v ?? '';
      return v ?? '';
    };
    const rows = mode === 'UPDATE'
      ? ctx.people.filter(p => p.kind === 'CANDIDATE' && p.isEmployee)
        .sort((a, b) => String(a.employeeNo).localeCompare(String(b.employeeNo), 'en', { numeric: true }) || a.name.localeCompare(b.name))
        .map(p => used.map(c => cellOf(p, c)))
      : [];
    const notes = mode === 'ADD'
      ? ['Adding employees: one row for each new employee.', 'Only Employee Code and Name are needed; fill what you have.',
        'Upload the file to see every row checked. Nothing is saved until you confirm.']
      : ['Updating employees: every employee is listed with what is on record now.', 'Change the cells you want changed. Delete the rows and columns you do not need.',
        'A cell left empty changes nothing: it never wipes what is on record.', 'The package is not here: it changes through salary revisions.'];
    const lists = [
      { title: 'Employment Status', values: EMPLOYMENT_STATUSES.map(s => s.label) },
      { title: 'Work Location', values: ctx.locations.filter(l => l.isActive).map(l => l.name) },
      ...LIST_COLUMNS.map(c => ({ title: c.header, values: ctx.lists[c.list!] || [] })).filter(l => l.values.length > 0),
    ];
    const wb = await templateWorkbook('Employees', columns, rows, notes, lists);
    await sendWorkbook(res, wb, mode === 'ADD' ? 'employees-to-add.xlsx' : `employees-to-update-${new Date().toISOString().slice(0, 10)}.xlsx`);
  },

  // Check a sheet of employees, and on the second call save what passed.
  async importEmployees(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const b = req.body || {};
    const mode = b.mode === 'UPDATE' ? 'UPDATE' : 'ADD';
    const dryRun = b.dryRun !== false;
    // For an update: the columns to take. None given = every column the sheet has
    const chosen = Array.isArray(b.columns) ? b.columns.map(str) : undefined;
    const sheet = await readSheet(b.fileBase64);
    const ctx = await employeeContext(organizationId);
    const check = checkEmployeeImport(sheet.headers, sheet.rows, ctx, mode, chosen);
    const inSheet = new Set(sheet.headers.map(h => employeeColumn(h)?.key).filter(Boolean));
    const base = {
      mode, problem: check.problem, columns: check.columns, unknownHeaders: check.unknownHeaders, counts: check.counts,
      // The columns of the sheet an update could take, chosen or not
      sheetColumns: UPDATABLE_COLUMNS.filter(c => inSheet.has(c.key)).map(c => ({ key: c.key, header: c.header })),
      newValues: check.newValues.map(v => ({ ...v, listLabel: LIST_TYPES.find(t => t.type === v.list)?.label || v.list })),
      // Every column a sheet may carry, for choosing what an update touches
      updatable: UPDATABLE_COLUMNS.map(c => ({ key: c.key, header: c.header })),
    };
    const view = (r: RowResult) => ({
      row: r.row, employeeNo: r.employeeNo, name: r.name, result: r.result, errors: r.errors, warnings: r.warnings, changes: r.changes,
      newValues: r.newValues.map(v => v.label),
    });
    if (dryRun || check.problem) {
      res.json({ ...base, dryRun: true, results: check.results.map(view) });
      return;
    }

    // Saving. Values new to a list are added only when that was asked for:
    // without it the whole save is refused, so rows are never taken in part
    if (check.newValues.length && !b.addNewValues) {
      throw new AppError(400, `Not in your lists yet: ${check.newValues.map(v => v.label).join(', ')}. Tick "Add these values to the lists", or correct the sheet.`);
    }
    // Adding employees in bulk counts against the plan's cap, as one batch
    if (mode === 'ADD') {
      const toAdd = check.results.filter(r => r.result !== 'ERROR' && r.result !== 'UNCHANGED').length;
      if (toAdd > 0) await assertEmployeeCapacity(organizationId, toAdd);
    }
    const before = new Map(ctx.people.map(p => [p.id, p]));
    const idOfCode = new Map(ctx.people.filter(p => p.employeeNo).map(p => [p.employeeNo.toLowerCase(), p.id]));
    const rows: any[] = [];
    const linkLater: { id: string; managerCode: string; name: string }[] = [];
    for (const r of check.results) {
      const out = { row: r.row, employeeNo: r.employeeNo, name: r.name, result: 'ERROR', messages: [...r.errors, ...r.warnings], fields: r.changes.map(c => c.field) };
      rows.push(out);
      if (r.result === 'ERROR') continue;
      if (r.result === 'UNCHANGED') { out.result = 'UNCHANGED'; continue; }
      try {
        if (mode === 'ADD') {
          const person = await prisma.person.create({
            data: { organizationId, kind: 'CANDIDATE', isEmployee: true, name: r.data.name, employeeNo: r.employeeNo, ...r.data },
          });
          idOfCode.set(r.employeeNo.toLowerCase(), person.id);
          if (r.managerCode && !r.data.managerId) linkLater.push({ id: person.id, managerCode: r.managerCode, name: person.name });
          await noteEmployeeCodeUsed(organizationId, person.employeeNo);
          await ensureStartingPosition(person);
          out.result = 'ADDED';
        } else {
          const updated = await prisma.person.update({ where: { id: r.personId! }, data: r.data });
          // Designation, department, location and grade changed here correct the position record in force
          await followProfileEdit(before.get(r.personId!), updated);
          out.result = 'UPDATED';
        }
        await ensureListValues(organizationId, listValuesOf(r.data));
      } catch (err: any) {
        out.messages.unshift(err?.statusCode ? err.message : 'Could not be saved');
      }
    }
    // A manager who came in with the same file exists only now
    for (const link of linkLater) {
      const managerId = idOfCode.get(link.managerCode.toLowerCase());
      if (managerId) await prisma.person.update({ where: { id: link.id }, data: { managerId } });
      // Already said on the row when its manager's row was refused
    }
    const summary = countBy(rows);
    const log = await saveLog(req, mode === 'ADD' ? 'EMPLOYEES_ADD' : 'EMPLOYEES_UPDATE', b.fileName, summary, rows);
    res.status(201).json({ ...base, dryRun: false, logId: log.id, summary, results: rows });
  },

  // ---- Salary revisions ----------------------------------------------------------------------
  async revisionTemplate(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const employees = await prisma.person.findMany({
      where: { organizationId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } },
      select: { employeeNo: true, name: true }, orderBy: { name: 'asc' },
    });
    const columns: TemplateColumn[] = REVISION_COLUMNS.map(c => ({
      header: c.header, example: c.example, asText: c.key === 'employeeNo' || c.key === 'effectiveMonth',
      note: c.key === 'employeeNo' ? 'Needed. One row an employee.' : c.key === 'name' ? 'For your reference; the employee is found by the code.'
        : c.key === 'newMonthlyPackage' ? 'Needed. The new package for a full month.'
          : c.key === 'effectiveMonth' ? 'Needed. The month the new package applies from, as Oct 2026.' : 'Why, in a few words.',
    }));
    const wb = await templateWorkbook('Salary revisions', columns, employees.map(e => [e.employeeNo, e.name, '', '', '']), [
      'Salary revisions: one row for each employee whose package changes. Delete the rows you do not need.',
      'Each row is recorded exactly as the Revise Salary screen records it: draft payslips from that month are recalculated,',
      'and months already finalized bring arrears.',
    ]);
    await sendWorkbook(res, wb, 'salary-revisions.xlsx');
  },

  async importRevisions(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const b = req.body || {};
    const dryRun = b.dryRun !== false;
    const sheet = await readSheet(b.fileBase64);
    const [people, finalized] = await Promise.all([
      prisma.person.findMany({
        where: { organizationId, kind: 'CANDIDATE' },
        select: { id: true, name: true, employeeNo: true, isEmployee: true, currentMonthlyPackage: true, salaryRevisions: true },
      }),
      prisma.payslipEntry.findMany({ where: { organizationId, run: { status: 'FINALIZED' } }, select: { personId: true, run: { select: { period: true } } } }),
    ]);
    const paid = new Map<string, string[]>();
    for (const e of finalized) paid.set(e.personId, [...(paid.get(e.personId) || []), e.run.period]);
    const check = checkRevisionImport(sheet.headers, sheet.rows, people.map(p => ({
      ...p, revisions: p.salaryRevisions, finalizedPeriods: paid.get(p.id) || [],
    })));
    if (dryRun || check.problem) {
      res.json({ dryRun: true, problem: check.problem, counts: check.counts, results: check.results.map(({ personId: _id, ...r }) => r) });
      return;
    }
    const rows: any[] = [];
    for (const r of check.results) {
      const out = { row: r.row, employeeNo: r.employeeNo, name: r.name, result: 'ERROR', messages: [...r.errors] };
      rows.push(out);
      if (r.result === 'ERROR') continue;
      try {
        const done: any = await reviseSalary(req, r.personId!, {
          effectiveMonth: r.effectiveMonth, newMonthlyPackage: r.newMonthlyPackage, reason: r.reason || 'Imported from a sheet',
        });
        out.result = 'REVISED';
        out.messages.push(`Revised from ${monthWords(r.effectiveMonth)}`);
        if (done.draftEntriesUpdated) out.messages.push(`${done.draftEntriesUpdated} draft payslip${done.draftEntriesUpdated === 1 ? '' : 's'} recalculated`);
        if (done.arrears?.months) out.messages.push(`Arrears raised for ${done.arrears.months} finalized month${done.arrears.months === 1 ? '' : 's'}`);
        else if (done.arrears?.reductions) out.messages.push(`${done.arrears.reductions} finalized month${done.arrears.reductions === 1 ? ' was' : 's were'} paid at the higher package: recover it from the employee's page if wanted`);
      } catch (err: any) {
        out.messages.push(err?.statusCode ? err.message : 'Could not be saved');
      }
    }
    const summary = countBy(rows);
    const log = await saveLog(req, 'SALARY_REVISIONS', b.fileName, summary, rows);
    res.status(201).json({ dryRun: false, logId: log.id, summary, results: rows });
  },

  // ---- Photos and documents named by employee code ----------------------------------------------
  // Whose file is each of these? Names only: nothing is uploaded yet.
  async matchFiles(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const names: string[] = (Array.isArray(req.body?.fileNames) ? req.body.fileNames : []).map((n: any) => String(n ?? '')).filter(Boolean).slice(0, 5000);
    if (names.length === 0) throw new AppError(400, 'The zip has no files in it');
    const employees = await prisma.person.findMany({
      where: { organizationId, kind: 'CANDIDATE', isEmployee: true, NOT: { employeeNo: '' } }, select: { id: true, employeeNo: true, name: true },
    });
    const matches = matchFiles(names, employees, req.body.kind === 'PHOTOS');
    res.json({
      matches: matches.map(({ personId: _id, ...m }) => m),
      matched: matches.filter(m => !m.problem).length, unmatched: matches.filter(m => m.problem).length,
    });
  },

  // A batch of the files themselves. The screen sends them a few at a
  // time; the first batch opens the import's log and the rest add to it.
  async importFiles(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const b = req.body || {};
    const kind = b.kind === 'PHOTOS' ? 'PHOTOS' : 'DOCUMENTS';
    const items: any[] = Array.isArray(b.items) ? b.items : [];
    if (items.length === 0) throw new AppError(400, 'No files were sent');
    if (items.length > MAX_BATCH) throw new AppError(400, `Send ${MAX_BATCH} files at most at a time`);
    const category = str(b.category);
    if (kind === 'DOCUMENTS' && !category) throw new AppError(400, 'Pick the category the documents go under');
    const employees = await prisma.person.findMany({
      where: { organizationId, kind: 'CANDIDATE', isEmployee: true, NOT: { employeeNo: '' } }, select: { id: true, employeeNo: true, name: true },
    });
    const rows: any[] = [];
    for (const item of items) {
      const fileName = String(item?.fileName ?? '');
      const match = matchFile(fileName, employees);
      const out = { row: 0, employeeNo: match.employeeNo, name: match.name, file: fileName.split(/[\\/]/).pop() || fileName, result: 'ERROR', messages: [] as string[] };
      rows.push(out);
      if (!match.personId) { out.messages.push(match.problem!); continue; }
      try {
        if (kind === 'PHOTOS') {
          const photoData = String(item?.data ?? '');
          if (!IMAGE_DATA_URI.test(photoData)) throw new AppError(400, 'Not a JPG or PNG image');
          if (photoData.length > MAX_PHOTO_CHARS) throw new AppError(400, 'The photo is too large');
          await prisma.person.update({ where: { id: match.personId }, data: { photoData } });
          out.result = 'SET';
        } else {
          await addEmployeeFile(req, { id: match.personId, name: match.name }, {
            category, title: match.title || category, fileName: out.file, fileData: item?.data, visibleToEmployee: Boolean(b.visibleToEmployee),
          });
          out.result = 'ADDED';
        }
      } catch (err: any) {
        out.messages.push(err?.statusCode ? err.message : 'Could not be saved');
      }
    }
    // One log for the whole zip, however many batches it comes in
    let log = b.importId ? await prisma.importLog.findFirst({ where: { id: str(b.importId), organizationId, kind } }) : null;
    if (log) {
      const all = [...(log.rows as any[]), ...rows].map((r, i) => ({ ...r, row: i + 1 }));
      log = await prisma.importLog.update({ where: { id: log.id }, data: { rows: all, summary: countBy(all) } });
    } else {
      log = await saveLog(req, kind, b.zipName, countBy(rows), rows.map((r, i) => ({ ...r, row: i + 1 })));
    }
    res.status(201).json({ importId: log.id, results: rows, summary: log.summary });
  },

  // ---- What was imported, and by whom ---------------------------------------------------------
  async getLogs(req: any, res: Response) {
    const logs = await prisma.importLog.findMany({
      where: { organizationId: req.user?.organizationId }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { id: true, kind: true, fileName: true, ranByName: true, summary: true, createdAt: true },
    });
    res.json({ logs: logs.map(l => ({ ...l, kindLabel: KIND_LABEL[l.kind] || l.kind })), limits: { rows: MAX_SHEET_ROWS, batch: MAX_BATCH } });
  },

  async getLog(req: any, res: Response) {
    const log = await prisma.importLog.findFirst({ where: { id: req.params.logId, organizationId: req.user?.organizationId } });
    if (!log) throw new AppError(404, 'Import not found');
    res.json({ ...log, kindLabel: KIND_LABEL[log.kind] || log.kind });
  },
};
