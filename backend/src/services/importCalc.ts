// Bulk imports: reading what was typed in a workbook and checking every
// row before anything is saved. Pure, DB-independent.
import { cleanIfsc, cleanLabel, isValidIfsc, labelKey } from './masters';
import { jobDetailsInput, managerProblem } from './orgChart';
import { packageForPeriod } from './payroll/salaryStructure';

// ---- Cells ---------------------------------------------------------------------------
const pad = (n: number | string) => String(n).padStart(2, '0');
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const realDate = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d && y >= 1900 && y <= 2100;
};

// A cell as text. A number typed where text was meant (an account number,
// a phone) is written out in full, never as 1.2e+15.
export function textCell(v: any): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('fullwide', { useGrouping: false }) : String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v).replace(/\s+/g, ' ').trim();
}

// A date cell as "YYYY-MM-DD": a real date cell, 2026-04-01, 01-04-2026,
// 01/04/2026, 1.4.2026 or 1 Apr 2026. '' = blank, null = not a date.
export function dateCell(v: any): string | null {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = textCell(v);
  if (!s) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return realDate(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(m[2])}-${pad(m[3])}` : null;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return realDate(+m[3], +m[2], +m[1]) ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : null;
  m = /^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s,-]+(\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[2].toLowerCase()) + 1;
    return month && realDate(+m[3], month, +m[1]) ? `${m[3]}-${pad(month)}-${pad(m[1])}` : null;
  }
  return null;
}

// A month cell as "YYYY-MM": 2026-10, 10/2026, Oct 2026, October 2026, or
// any date in the month. '' = blank, null = not a month.
export function monthCell(v: any): string | null {
  if (v === null || v === undefined || v === '') return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.toISOString().slice(0, 7);
  const s = textCell(v);
  if (!s) return '';
  let m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (m) return +m[2] >= 1 && +m[2] <= 12 ? `${m[1]}-${pad(m[2])}` : null;
  m = /^(\d{1,2})[-/.](\d{4})$/.exec(s);
  if (m) return +m[1] >= 1 && +m[1] <= 12 ? `${m[2]}-${pad(m[1])}` : null;
  m = /^([A-Za-z]{3})[A-Za-z]*[\s,-]+(\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    return month ? `${m[2]}-${pad(month)}` : null;
  }
  const date = dateCell(v);
  return date ? date.slice(0, 7) : null;
}

// A number cell: 45,000 and ₹ 45000 are 45000. '' = blank, null = not a number.
export function numberCell(v: any): number | '' | null {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = textCell(v).replace(/[,\s₹]/g, '').replace(/^rs\.?/i, '');
  if (!s) return '';
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

export function yesNoCell(v: any): boolean | '' | null {
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'boolean') return v;
  const s = textCell(v).toLowerCase();
  if (!s) return '';
  if (['yes', 'y', 'true', '1'].includes(s)) return true;
  if (['no', 'n', 'false', '0'].includes(s)) return false;
  return null;
}

const STATUSES = ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD', 'RESIGNED', 'TERMINATED'];
const GENDERS = ['Male', 'Female', 'Other'];
const headerKey = (h: any) => String(h ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

// ---- Employee columns -------------------------------------------------------------------
type ColumnType = 'text' | 'date' | 'number' | 'whole' | 'yesno' | 'status' | 'gender' | 'list' | 'location' | 'manager' | 'ifsc' | 'email' | 'pan' | 'aadhaar';
export interface ImportColumn {
  key: string; // the field on the employee's record
  header: string;
  type: ColumnType;
  aliases?: string[];
  list?: string;
  // Only when adding: the package changes later through salary revisions
  addOnly?: boolean;
  example?: string;
}

// The headers are those of the employee export, so an export can be
// edited and brought back in.
export const EMPLOYEE_COLUMNS: ImportColumn[] = [
  { key: 'employeeNo', header: 'Employee Code', type: 'text', example: 'EMP-0042' },
  { key: 'name', header: 'Name', type: 'text', example: 'Priya Raman' },
  { key: 'gender', header: 'Gender', type: 'gender', example: 'Female' },
  { key: 'designation', header: 'Designation', type: 'list', list: 'DESIGNATION', example: 'Software Engineer' },
  { key: 'department', header: 'Department', type: 'list', list: 'DEPARTMENT', example: 'Engineering' },
  { key: 'grade', header: 'Grade', type: 'list', list: 'GRADE', example: 'L2' },
  { key: 'employmentType', header: 'Employment Type', type: 'list', list: 'EMPLOYMENT_TYPE', example: 'Permanent' },
  { key: 'workLocationId', header: 'Work Location', type: 'location', example: 'Coimbatore Office' },
  { key: 'joinDate', header: 'Date of Joining', type: 'date', aliases: ['DOJ', 'Joining Date'], example: '01-04-2026' },
  { key: 'employmentStatus', header: 'Employment Status', type: 'status', aliases: ['Status'], example: 'Active' },
  { key: 'currentMonthlyPackage', header: 'Monthly Package (₹)', type: 'number', aliases: ['Monthly Package'], addOnly: true, example: '45000' },
  { key: 'managerId', header: 'Reporting Manager Code', type: 'manager', aliases: ['Manager Code'], example: 'EMP-0007' },
  { key: 'probationMonths', header: 'Probation (months)', type: 'whole', example: '6' },
  { key: 'confirmationDate', header: 'Confirmation Date', type: 'date', example: '' },
  { key: 'noticePeriodDays', header: 'Notice Period (days)', type: 'whole', example: '60' },
  { key: 'dateOfBirth', header: 'Date of Birth', type: 'date', aliases: ['DOB'], example: '15-08-1998' },
  { key: 'bloodGroup', header: 'Blood Group', type: 'list', list: 'BLOOD_GROUP', example: 'O+' },
  { key: 'maritalStatus', header: 'Marital Status', type: 'list', list: 'MARITAL_STATUS', example: 'Single' },
  { key: 'parentSpouseName', header: 'Parent / Spouse Name', type: 'text', aliases: ['Parent/Spouse', 'Father / Spouse Name'], example: 'K. Raman' },
  { key: 'aadharNo', header: 'Aadhaar Number', type: 'aadhaar', aliases: ['Aadhaar', 'Aadhar Number'], example: '123412341234' },
  { key: 'panNumber', header: 'PAN Number', type: 'pan', aliases: ['PAN'], example: 'ABCDE1234F' },
  { key: 'email', header: 'Personal Email', type: 'email', example: 'priya@example.com' },
  { key: 'officialEmail', header: 'Official Email', type: 'email', example: '' },
  { key: 'phone', header: 'Contact Number', type: 'text', aliases: ['Contact No', 'Phone'], example: '9876543210' },
  { key: 'officialNo', header: 'Official Number', type: 'text', aliases: ['Official No'], example: '' },
  { key: 'emergencyNo', header: 'Emergency Number', type: 'text', aliases: ['Emergency No'], example: '' },
  { key: 'address', header: 'Address', type: 'text', example: '12, Lake View Road, Coimbatore' },
  { key: 'biometricId', header: 'Biometric ID', type: 'text', example: '' },
  { key: 'bankName', header: 'Bank Name', type: 'list', list: 'BANK', example: 'HDFC Bank' },
  { key: 'bankAccountNumber', header: 'Account Number', type: 'text', example: '50100123456789' },
  { key: 'ifscCode', header: 'IFSC Code', type: 'ifsc', aliases: ['IFSC'], example: 'HDFC0001234' },
  { key: 'pfNumber', header: 'PF Number', type: 'text', example: '' },
  { key: 'pfUan', header: 'PF UAN', type: 'text', example: '' },
  { key: 'esiNumber', header: 'ESI Number', type: 'text', example: '' },
  { key: 'isEsiEligible', header: 'ESI Eligible', type: 'yesno', example: 'No' },
  { key: 'isPfApplicable', header: 'PF Applicable', type: 'yesno', example: 'Yes' },
  { key: 'agreementSigned', header: 'Agreement Signed', type: 'yesno', example: 'Yes' },
  { key: 'agreementSignDate', header: 'Agreement Sign Date', type: 'date', aliases: ['Agreement Date'], example: '' },
  { key: 'leavingDate', header: 'Relieving Date', type: 'date', example: '' },
  { key: 'reasonForLeaving', header: 'Reason for Leaving', type: 'list', list: 'LEAVING_REASON', example: '' },
];
// In the export, read past without comment
const IGNORED_HEADERS = ['active', 'sno', 'slno'];

const COLUMN_BY_HEADER = new Map<string, ImportColumn>();
for (const c of EMPLOYEE_COLUMNS) for (const h of [c.header, ...(c.aliases || [])]) COLUMN_BY_HEADER.set(headerKey(h), c);
export const employeeColumn = (header: string) => COLUMN_BY_HEADER.get(headerKey(header));

// Columns an update may change: everything but the code rows are matched
// by and what only applies when adding.
export const UPDATABLE_COLUMNS = EMPLOYEE_COLUMNS.filter(c => c.key !== 'employeeNo' && !c.addOnly);

export interface SheetRow {
  row: number; // as numbered in the sheet
  cells: Record<string, any>; // by header as typed
}

export interface ExistingPerson {
  id: string;
  kind: string;
  isEmployee: boolean;
  name: string;
  employeeNo: string;
  [field: string]: any;
}

export interface ImportContext {
  people: ExistingPerson[]; // everyone on record in the company
  lists: Record<string, string[]>; // labels of each value list
  locations: { id: string; name: string }[];
}

export interface RowChange { field: string; from: string; to: string }
export interface RowResult {
  row: number;
  employeeNo: string;
  name: string;
  result: 'NEW' | 'UPDATE' | 'UNCHANGED' | 'ERROR';
  errors: string[];
  warnings: string[];
  changes: RowChange[];
  // What to write on the record. A manager is given by code and settled
  // once every row is known.
  data: Record<string, any>;
  managerCode?: string;
  personId?: string;
  newValues: { list: string; label: string }[];
}

export interface EmployeeImportCheck {
  problem: string | null; // the sheet as a whole cannot be read
  columns: { key: string; header: string }[]; // those that will be used
  unknownHeaders: string[];
  results: RowResult[];
  newValues: { list: string; label: string; rows: number }[];
  counts: Record<'NEW' | 'UPDATE' | 'UNCHANGED' | 'ERROR', number>;
}

const codeKey = (v: any) => textCell(v).toLowerCase();
const shown = (v: any) => (v === null || v === undefined || v === '' ? '—' : v === true ? 'Yes' : v === false ? 'No' : String(v));
// Whether a cell says what the record already says. Text is compared as
// it would be stored: a name on record with a stray space is not a change.
const same = (a: any, b: any) => (a ?? '') === (b ?? '') || textCell(a) === textCell(b);

// People on record under each code. A code held by two people cannot say
// which of them a row, or a file, is for.
function peopleByCode<T extends { employeeNo: string }>(people: T[]) {
  const map = new Map<string, T[]>();
  for (const p of people) {
    const code = codeKey(p.employeeNo);
    if (code) map.set(code, [...(map.get(code) || []), p]);
  }
  return map;
}
const sharedCode = (code: string, holders: { name: string }[]) =>
  `${holders.map(h => h.name).join(' and ')} share the code ${code} on record. Give each their own code first.`;

// Check every row of an employee sheet. Nothing is saved here: the result
// says what each row would do and why a row cannot be taken.
//
// ADD: each row is a new employee. A code or a name already on record, or
// twice in the file, is refused.
// UPDATE: each row is an existing employee, found by code. Only the
// chosen columns are touched, and a blank cell changes nothing.
export function checkEmployeeImport(
  headers: string[], rows: SheetRow[], ctx: ImportContext, mode: 'ADD' | 'UPDATE', chosen?: string[],
): EmployeeImportCheck {
  const empty = { columns: [], unknownHeaders: [], results: [], newValues: [], counts: { NEW: 0, UPDATE: 0, UNCHANGED: 0, ERROR: 0 } };
  const found = new Map<string, string>(); // column key -> header as typed
  const unknownHeaders: string[] = [];
  for (const h of headers) {
    if (!textCell(h)) continue;
    const column = employeeColumn(h);
    if (column) { if (!found.has(column.key)) found.set(column.key, h); }
    else if (!IGNORED_HEADERS.includes(headerKey(h))) unknownHeaders.push(textCell(h));
  }
  if (!found.has('employeeNo')) return { ...empty, unknownHeaders, problem: 'The sheet has no "Employee Code" column. Start from the template.' };
  if (mode === 'ADD' && !found.has('name')) return { ...empty, unknownHeaders, problem: 'The sheet has no "Name" column. Start from the template.' };

  const used = EMPLOYEE_COLUMNS.filter(c => found.has(c.key) && c.key !== 'employeeNo'
    && (mode === 'ADD' || (!c.addOnly && (!chosen || chosen.includes(c.key)))));
  if (mode === 'UPDATE' && used.length === 0) {
    return { ...empty, unknownHeaders, problem: 'Pick at least one column to update. The sheet has none of the columns picked.' };
  }

  const cell = (r: SheetRow, key: string) => (found.has(key) ? r.cells[found.get(key)!] : undefined);
  const filled = rows.filter(r => Object.values(r.cells).some(v => textCell(v) !== ''));
  if (filled.length === 0) return { ...empty, unknownHeaders, columns: used.map(c => ({ key: c.key, header: c.header })), problem: 'The sheet has no rows under the headings' };

  const holders = peopleByCode(ctx.people);
  const byCode = new Map([...holders].map(([code, list]) => [code, list[0]]));
  const namesOnRecord = new Set(ctx.people.filter(p => p.kind === 'CANDIDATE').map(p => labelKey(p.name)));
  const rowsOfCode = new Map<string, number[]>();
  const rowsOfName = new Map<string, number[]>();
  for (const r of filled) {
    const code = codeKey(cell(r, 'employeeNo'));
    if (code) rowsOfCode.set(code, [...(rowsOfCode.get(code) || []), r.row]);
    const name = labelKey(cell(r, 'name'));
    if (name) rowsOfName.set(name, [...(rowsOfName.get(name) || []), r.row]);
  }
  const listLabel = new Map<string, string>();
  for (const [type, labels] of Object.entries(ctx.lists)) for (const l of labels) listLabel.set(`${type}:${labelKey(l)}`, l);
  const locationByName = new Map(ctx.locations.map(l => [labelKey(l.name), l]));
  const locationName = new Map(ctx.locations.map(l => [l.id, l.name]));
  const nameOfId = new Map(ctx.people.map(p => [p.id, p]));

  // Reporting lines as they would stand, row after row, for the loop check
  const reporting = ctx.people.filter(p => p.isEmployee).map(p => ({ id: p.id, managerId: p.managerId || null }));

  const results: RowResult[] = filled.map(r => {
    const employeeNo = textCell(cell(r, 'employeeNo'));
    const existing = byCode.get(employeeNo.toLowerCase());
    const out: RowResult = {
      row: r.row, employeeNo, name: textCell(cell(r, 'name')) || existing?.name || '', result: mode === 'ADD' ? 'NEW' : 'UPDATE',
      errors: [], warnings: [], changes: [], data: {}, newValues: [],
    };
    const bad = (message: string) => { out.errors.push(message); };

    if (!employeeNo) bad('The employee code is missing');
    else if ((rowsOfCode.get(employeeNo.toLowerCase()) || []).length > 1) {
      bad(`Employee code ${employeeNo} is on rows ${rowsOfCode.get(employeeNo.toLowerCase())!.join(' and ')} of the file`);
    } else if (mode === 'ADD' && existing) bad(`Employee code ${employeeNo} is already in use, by ${existing.name}`);
    else if (mode === 'UPDATE' && !existing) bad(`No employee has the code ${employeeNo}`);
    else if (mode === 'UPDATE' && (holders.get(employeeNo.toLowerCase()) || []).length > 1) bad(sharedCode(employeeNo, holders.get(employeeNo.toLowerCase())!));
    else if (mode === 'UPDATE' && existing && !(existing.kind === 'CANDIDATE' && existing.isEmployee)) bad(`${existing.name} is not an employee`);
    // Only when the code says, beyond doubt, whose row this is
    if (mode === 'UPDATE' && existing && out.errors.length === 0) out.personId = existing.id;

    for (const c of used) {
      const raw = cell(r, c.key);
      const text = textCell(raw);
      // A blank cell: nothing typed. When adding, the field starts empty;
      // when updating, the field is left as it is.
      if (text === '') {
        if (c.key === 'name' && mode === 'ADD') bad('The name is missing');
        continue;
      }
      let value: any = text;
      switch (c.type) {
        case 'date': {
          const date = dateCell(raw);
          if (date === null) { bad(`${c.header}: "${text}" is not a date. Write it as 01-04-2026.`); continue; }
          value = date;
          break;
        }
        case 'number': case 'whole': {
          const n = numberCell(raw);
          if (n === null || n === '' || n < 0 || (c.type === 'whole' && !Number.isInteger(n))) { bad(`${c.header}: "${text}" is not a ${c.type === 'whole' ? 'whole number' : 'number'}`); continue; }
          value = n;
          break;
        }
        case 'yesno': {
          const yes = yesNoCell(raw);
          if (yes === null || yes === '') { bad(`${c.header}: write Yes or No, not "${text}"`); continue; }
          value = yes;
          break;
        }
        case 'status': {
          const status = text.toUpperCase().replace(/[\s-]+/g, '_');
          if (!STATUSES.includes(status)) { bad(`${c.header}: "${text}" is not one of Active, Probation, Notice Period, Resigned, Terminated`); continue; }
          value = status;
          break;
        }
        case 'gender': {
          const gender = GENDERS.find(g => g.toLowerCase() === text.toLowerCase() || g[0].toLowerCase() === text.toLowerCase());
          if (!gender) { bad(`${c.header}: write Male, Female or Other, not "${text}"`); continue; }
          value = gender;
          break;
        }
        case 'list': {
          const label = listLabel.get(`${c.list}:${labelKey(text)}`);
          if (label) value = label;
          else {
            value = cleanLabel(text);
            if (value.length > 120) { bad(`${c.header}: keep it under 120 characters`); continue; }
            out.newValues.push({ list: c.list!, label: value });
          }
          break;
        }
        case 'location': {
          const location = locationByName.get(labelKey(text));
          if (!location) { bad(`${c.header}: "${text}" is not one of the work locations set up`); continue; }
          value = location.id;
          break;
        }
        case 'manager': {
          const manager = byCode.get(text.toLowerCase());
          const inFile = mode === 'ADD' && (rowsOfCode.get(text.toLowerCase()) || []).length === 1;
          if (text.toLowerCase() === employeeNo.toLowerCase()) { bad(`${c.header}: someone cannot report to themselves`); continue; }
          if (!inFile && !(manager && manager.isEmployee)) { bad(`${c.header}: no employee has the code ${text}`); continue; }
          out.managerCode = manager?.employeeNo || text;
          if (existing && manager) {
            const problem = managerProblem(existing.id, manager.id, reporting);
            if (problem) { bad(`${c.header}: ${problem}`); continue; }
            const line = reporting.find(p => p.id === existing.id);
            if (line) line.managerId = manager.id;
          }
          value = manager?.id || null; // a manager added by this file is linked once it exists
          break;
        }
        case 'ifsc':
          value = cleanIfsc(text);
          if (!isValidIfsc(value)) { bad(`${c.header}: "${text}" does not look like HDFC0001234`); continue; }
          break;
        case 'email':
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) { bad(`${c.header}: "${text}" is not an email address`); continue; }
          break;
        case 'pan':
          value = text.toUpperCase().replace(/\s+/g, '');
          if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value)) out.warnings.push(`${c.header}: "${text}" is not in the usual form (ABCDE1234F)`);
          break;
        case 'aadhaar':
          value = text.replace(/[\s-]+/g, '');
          if (!/^\d{12}$/.test(value)) out.warnings.push(`${c.header}: an Aadhaar number has 12 digits`);
          break;
        default:
          if (c.key === 'bankAccountNumber' && typeof raw === 'number' && text.length > 15) {
            out.warnings.push(`${c.header}: typed as a number, and Excel keeps only 15 digits. Check the last digits.`);
          }
          if (text.length > (c.key === 'address' ? 500 : 200)) { bad(`${c.header}: too long`); continue; }
      }
      out.data[c.key] = value;
    }

    // The name must stay one of a kind among employees and candidates. When
    // an update cannot tell whose row it is, the name is not judged.
    if (out.data.name !== undefined && !(mode === 'UPDATE' && !out.personId)) {
      const key = labelKey(out.data.name);
      const renamed = !existing || labelKey(existing.name) !== key;
      if ((rowsOfName.get(key) || []).length > 1) bad(`The name ${out.data.name} is on rows ${rowsOfName.get(key)!.join(' and ')} of the file`);
      else if (renamed && namesOnRecord.has(key)) bad(`Someone named ${out.data.name} is already on record`);
    }

    // Probation, confirmation and notice period, as the record would then read
    if (out.errors.length === 0) {
      const job = jobDetailsInput({ ...(existing || {}), ...out.data });
      if (typeof job === 'string') bad(job);
    }
    if (out.data.leavingDate && (out.data.joinDate || existing?.joinDate) && out.data.leavingDate < (out.data.joinDate || existing?.joinDate)) {
      bad('The relieving date cannot be before the joining date');
    }

    if (mode === 'UPDATE' && existing) {
      for (const c of used) {
        if (!(c.key in out.data)) continue;
        const [from, to] = [existing[c.key], out.data[c.key]];
        if (same(from, to)) { delete out.data[c.key]; continue; }
        const words = (v: any) => (c.type === 'location' ? locationName.get(v) : c.type === 'manager' ? nameOfId.get(v)?.name : v);
        out.changes.push({ field: c.header, from: shown(words(from)), to: shown(words(to)) });
      }
      if (out.managerCode !== undefined && !('managerId' in out.data)) delete out.managerCode;
      out.newValues = out.newValues.filter(v => Object.values(out.data).includes(v.label));
      if (out.errors.length === 0 && out.changes.length === 0) out.result = 'UNCHANGED';
      // A row that is not taken changes nothing: listing changes for it would mislead
      if (out.errors.length) out.changes = [];
    }
    if (out.errors.length) out.result = 'ERROR';
    return out;
  });

  // A manager who comes in with the same file is only there if their own row is taken
  if (mode === 'ADD') {
    const resultOfCode = new Map(results.map(r => [r.employeeNo.toLowerCase(), r.result]));
    for (const r of results) {
      if (r.result === 'ERROR' || !r.managerCode || r.data.managerId) continue;
      if (resultOfCode.get(r.managerCode.toLowerCase()) === 'ERROR') {
        r.warnings.push(`The manager ${r.managerCode} is on a row that will not be taken, so no manager will be set`);
      }
    }
  }

  const newValues = new Map<string, { list: string; label: string; rows: number }>();
  for (const r of results) {
    if (r.result === 'ERROR') continue;
    for (const v of r.newValues) {
      const key = `${v.list}:${labelKey(v.label)}`;
      const seen = newValues.get(key);
      if (seen) seen.rows++; else newValues.set(key, { ...v, rows: 1 });
    }
  }
  const counts = { NEW: 0, UPDATE: 0, UNCHANGED: 0, ERROR: 0 };
  for (const r of results) counts[r.result]++;
  return { problem: null, columns: used.map(c => ({ key: c.key, header: c.header })), unknownHeaders, results, newValues: [...newValues.values()], counts };
}

// ---- Salary revisions ------------------------------------------------------------------------
export const REVISION_COLUMNS = [
  { key: 'employeeNo', header: 'Employee Code', aliases: [], example: 'EMP-0042' },
  { key: 'name', header: 'Name', aliases: [], example: 'Priya Raman (for your reference; not read)' },
  { key: 'newMonthlyPackage', header: 'New Monthly Package (₹)', aliases: ['New Monthly Package', 'New Package'], example: '52000' },
  { key: 'effectiveMonth', header: 'Effective Month', aliases: ['Effective From', 'Month'], example: 'Oct 2026' },
  { key: 'reason', header: 'Reason', aliases: [], example: 'Annual increment' },
];

export interface RevisionPerson {
  id: string;
  name: string;
  employeeNo: string;
  isEmployee: boolean;
  currentMonthlyPackage: number;
  revisions: { effectiveFrom: string; oldMonthlyPackage: number; newMonthlyPackage: number }[];
  finalizedPeriods: string[]; // months of this employee already finalized
}

export interface RevisionRow {
  row: number;
  employeeNo: string;
  name: string;
  result: 'REVISE' | 'ERROR';
  errors: string[];
  warnings: string[];
  personId?: string;
  effectiveMonth: string;
  oldMonthlyPackage: number | null;
  newMonthlyPackage: number | null;
  reason: string;
}

// Check every row of a salary revision sheet, by the rules of the
// revision screen: a real month, a package that differs, no later
// revision already on record — and one row an employee.
export function checkRevisionImport(headers: string[], rows: SheetRow[], people: RevisionPerson[]) {
  const found = new Map<string, string>();
  for (const h of headers) {
    const column = REVISION_COLUMNS.find(c => [c.header, ...c.aliases].some(x => headerKey(x) === headerKey(h)));
    if (column && !found.has(column.key)) found.set(column.key, h);
  }
  const missing = ['employeeNo', 'newMonthlyPackage', 'effectiveMonth'].filter(k => !found.has(k))
    .map(k => REVISION_COLUMNS.find(c => c.key === k)!.header);
  if (missing.length) return { problem: `The sheet has no "${missing.join('", "')}" column. Start from the template.`, results: [] as RevisionRow[], counts: { REVISE: 0, ERROR: 0 } };
  const cell = (r: SheetRow, key: string) => (found.has(key) ? r.cells[found.get(key)!] : undefined);
  const filled = rows.filter(r => ['employeeNo', 'newMonthlyPackage', 'effectiveMonth'].some(k => textCell(cell(r, k)) !== ''));
  if (filled.length === 0) return { problem: 'The sheet has no rows under the headings', results: [] as RevisionRow[], counts: { REVISE: 0, ERROR: 0 } };

  const holders = peopleByCode(people);
  const byCode = new Map([...holders].map(([code, list]) => [code, list[0]]));
  const rowsOfCode = new Map<string, number[]>();
  for (const r of filled) {
    const code = codeKey(cell(r, 'employeeNo'));
    if (code) rowsOfCode.set(code, [...(rowsOfCode.get(code) || []), r.row]);
  }

  const results: RevisionRow[] = filled.map(r => {
    const employeeNo = textCell(cell(r, 'employeeNo'));
    const person = byCode.get(employeeNo.toLowerCase());
    const out: RevisionRow = {
      row: r.row, employeeNo, name: person?.name || textCell(cell(r, 'name')), result: 'REVISE', errors: [], warnings: [],
      personId: person?.id, effectiveMonth: '', oldMonthlyPackage: null, newMonthlyPackage: null, reason: textCell(cell(r, 'reason')).slice(0, 200),
    };
    if (!employeeNo) out.errors.push('The employee code is missing');
    else if ((rowsOfCode.get(employeeNo.toLowerCase()) || []).length > 1) {
      out.errors.push(`Employee code ${employeeNo} is on rows ${rowsOfCode.get(employeeNo.toLowerCase())!.join(' and ')} of the file: one revision an employee at a time`);
    } else if (!person) out.errors.push(`No employee has the code ${employeeNo}`);
    else if ((holders.get(employeeNo.toLowerCase()) || []).length > 1) out.errors.push(sharedCode(employeeNo, holders.get(employeeNo.toLowerCase())!));
    else if (!person.isEmployee) out.errors.push(`${person.name} is not an employee`);

    const month = monthCell(cell(r, 'effectiveMonth'));
    if (!month) out.errors.push(month === '' ? 'The effective month is missing' : `Effective Month: "${textCell(cell(r, 'effectiveMonth'))}" is not a month. Write it as Oct 2026.`);
    else out.effectiveMonth = month;

    const amount = numberCell(cell(r, 'newMonthlyPackage'));
    if (amount === '' ) out.errors.push('The new monthly package is missing');
    else if (amount === null || amount <= 0) out.errors.push(`New Monthly Package: "${textCell(cell(r, 'newMonthlyPackage'))}" is not an amount`);
    else out.newMonthlyPackage = amount;

    if (person && person.isEmployee && out.effectiveMonth && out.newMonthlyPackage !== null && out.errors.length === 0) {
      if (person.revisions.some(v => v.effectiveFrom.slice(0, 7) > out.effectiveMonth)) {
        out.errors.push('A later revision is already on record. Remove it first, or pick a later month.');
      } else {
        out.oldMonthlyPackage = packageForPeriod(person.currentMonthlyPackage, person.revisions, out.effectiveMonth);
        if (out.oldMonthlyPackage === out.newMonthlyPackage) out.errors.push('The new package is the same as the present one');
        const paid = person.finalizedPeriods.filter(p => p >= out.effectiveMonth).length;
        if (paid && out.errors.length === 0) {
          out.warnings.push(out.newMonthlyPackage > out.oldMonthlyPackage
            ? `Payroll is finalized for ${paid} ${paid === 1 ? 'month' : 'months'} from then: the difference is raised as arrears`
            : `Payroll is finalized for ${paid} ${paid === 1 ? 'month' : 'months'} from then at the higher package: nothing is taken back unless you ask on the employee's page`);
        }
      }
    }
    if (out.errors.length) out.result = 'ERROR';
    return out;
  });
  const counts = { REVISE: results.filter(r => r.result === 'REVISE').length, ERROR: results.filter(r => r.result === 'ERROR').length };
  return { problem: null as string | null, results, counts };
}

// ---- Files named by employee code ---------------------------------------------------------------
export interface FileMatch {
  fileName: string;
  personId: string | null;
  employeeNo: string;
  name: string;
  title: string; // what follows the code in the file name, if anything
  problem: string | null;
}

const baseName = (fileName: string) => (String(fileName).split(/[\\/]/).pop() || '').replace(/\.[A-Za-z0-9]{1,5}$/, '').trim();

// Whose file is it? The name starts with an employee code — the whole
// name, or the code and then a space, hyphen, underscore or dot. The
// longest code that fits wins, so EMP-10.pdf is not EMP-1's.
export function matchFile(fileName: string, people: { id: string; employeeNo: string; name: string }[]): FileMatch {
  const base = baseName(fileName);
  const lower = base.toLowerCase();
  let best: { id: string; employeeNo: string; name: string } | null = null;
  for (const p of people) {
    const code = String(p.employeeNo || '').trim().toLowerCase();
    if (!code || !lower.startsWith(code)) continue;
    const next = lower[code.length];
    if (next !== undefined && !/[\s_.\-()]/.test(next)) continue;
    if (!best || code.length > best.employeeNo.trim().length) best = p;
  }
  if (!best) return { fileName, personId: null, employeeNo: '', name: '', title: '', problem: 'No employee code matches this file name' };
  const sharing = people.filter(p => String(p.employeeNo || '').trim().toLowerCase() === best!.employeeNo.trim().toLowerCase());
  if (sharing.length > 1) return { fileName, personId: null, employeeNo: best.employeeNo, name: '', title: '', problem: sharedCode(best.employeeNo, sharing) };
  const title = base.slice(best.employeeNo.trim().length).replace(/^[\s_.\-()]+|[\s_.\-()]+$/g, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
  return { fileName, personId: best.id, employeeNo: best.employeeNo, name: best.name, title, problem: null };
}

// A set of files matched to employees. For photos an employee can have
// only one: a second file for the same person is refused.
export function matchFiles(fileNames: string[], people: { id: string; employeeNo: string; name: string }[], onePerPerson = false): FileMatch[] {
  const seen = new Set<string>();
  return fileNames.map(fileName => {
    const match = matchFile(fileName, people);
    if (!match.personId) return match;
    if (onePerPerson && seen.has(match.personId)) return { ...match, problem: `A second file for ${match.name}: one photo each` };
    seen.add(match.personId);
    return match;
  });
}
