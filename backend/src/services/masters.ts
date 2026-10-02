// Company masters: the editable value lists, state codes and the checks on
// bank and GST identifiers. Pure, DB-independent.
import { INDIAN_STATES } from './payroll/constants';

// ---------------------------------------------------------------------------
// Value lists
// ---------------------------------------------------------------------------
export interface ListType {
  type: string;
  label: string;
  usedFor: string;      // where the value is picked
  defaults: string[];   // offered when the list is first opened
}

export const LIST_TYPES: ListType[] = [
  { type: 'DEPARTMENT', label: 'Department', usedFor: 'Employee profile, job openings', defaults: [] },
  { type: 'DESIGNATION', label: 'Designation', usedFor: 'Employee profile', defaults: [] },
  { type: 'GRADE', label: 'Grade', usedFor: 'Employee profile, position history', defaults: [] },
  {
    type: 'EMPLOYMENT_TYPE', label: 'Employment type', usedFor: 'Employee profile',
    defaults: ['Permanent', 'Contract', 'Trainee', 'Part-time'],
  },
  {
    type: 'DOCUMENT_CATEGORY', label: 'Document category', usedFor: 'Files kept against an employee',
    defaults: ['Identity', 'Education', 'Previous employment', 'Address proof', 'Company letters', 'Other'],
  },
  { type: 'BANK', label: 'Bank', usedFor: 'Employee bank details, company accounts', defaults: [] },
  { type: 'BLOOD_GROUP', label: 'Blood group', usedFor: 'Employee profile', defaults: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  { type: 'MARITAL_STATUS', label: 'Marital status', usedFor: 'Employee profile', defaults: ['Single', 'Married', 'Other'] },
  {
    type: 'LEAVING_REASON', label: 'Reason for leaving', usedFor: 'Employee profile, on exit',
    defaults: ['Resigned', 'Better opportunity', 'Higher studies', 'Relocation', 'Health or family reasons', 'Contract ended', 'Terminated', 'Retired', 'Absconded'],
  },
  {
    type: 'HOLD_REASON', label: 'Salary hold reason', usedFor: 'Holding one salary in a payroll run',
    defaults: ['Exit clearance pending', 'Bank details pending', 'Attendance under review', 'Documents pending'],
  },
  {
    type: 'STOP_REASON', label: 'Salary stop reason', usedFor: 'Stopping an employee\'s salary',
    defaults: ['On unpaid leave', 'Absconding', 'Under suspension', 'Notice period not served'],
  },
];

export const listType = (type: string) => LIST_TYPES.find(t => t.type === type);

// Labels are compared without regard to case or stray spaces, so
// "Developer", "developer " and "DEVELOPER" are one value.
export const cleanLabel = (value: any) => String(value ?? '').trim().replace(/\s+/g, ' ');
export const labelKey = (value: any) => cleanLabel(value).toLowerCase();
export const sameLabel = (a: any, b: any) => labelKey(a) === labelKey(b);

// A list's first contents: its defaults, then every value already typed
// on records, each once. The first spelling met is the one kept; values
// that differ by more than case or spacing ("Marketing", "Marketting")
// stay separate for HR to merge.
export function initialListValues(defaults: string[], used: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const fromRecords = [...used].map(cleanLabel).filter(Boolean).sort((a, b) => a.localeCompare(b));
  for (const value of [...defaults, ...fromRecords]) {
    const key = labelKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(cleanLabel(value));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bank and GST identifiers
// ---------------------------------------------------------------------------
// IFSC: four letters for the bank, a zero, six characters for the branch.
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const cleanIfsc = (value: any) => String(value ?? '').trim().toUpperCase();
export const isValidIfsc = (value: any) => IFSC_PATTERN.test(cleanIfsc(value));

// GST state codes, by state as named in INDIAN_STATES.
export const GST_STATE_CODES: Record<string, string> = {
  'Jammu and Kashmir': '01', 'Himachal Pradesh': '02', 'Punjab': '03', 'Chandigarh': '04',
  'Uttarakhand': '05', 'Haryana': '06', 'Delhi': '07', 'Rajasthan': '08', 'Uttar Pradesh': '09',
  'Bihar': '10', 'Sikkim': '11', 'Arunachal Pradesh': '12', 'Nagaland': '13', 'Manipur': '14',
  'Mizoram': '15', 'Tripura': '16', 'Meghalaya': '17', 'Assam': '18', 'West Bengal': '19',
  'Jharkhand': '20', 'Odisha': '21', 'Chhattisgarh': '22', 'Madhya Pradesh': '23', 'Gujarat': '24',
  'Dadra and Nagar Haveli and Daman and Diu': '26', 'Maharashtra': '27', 'Karnataka': '29',
  'Goa': '30', 'Lakshadweep': '31', 'Kerala': '32', 'Tamil Nadu': '33', 'Puducherry': '34',
  'Andaman and Nicobar Islands': '35', 'Telangana': '36', 'Andhra Pradesh': '37', 'Ladakh': '38',
};

export const STATES = INDIAN_STATES.map(name => ({ name, gstCode: GST_STATE_CODES[name] || '' }));
export const stateOfGstCode = (code: string) => STATES.find(s => s.gstCode === code)?.name || '';

// GSTIN: state code, the holder's PAN, an entity number, "Z", a check character.
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const cleanGstin = (value: any) => String(value ?? '').trim().toUpperCase();

const GSTIN_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// The fifteenth character, worked out from the first fourteen.
export function gstinCheckChar(first14: string): string {
  let factor = 2;
  let sum = 0;
  for (let i = first14.length - 1; i >= 0; i--) {
    const product = factor * GSTIN_CHARS.indexOf(first14[i]);
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 2 ? 1 : 2;
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

export const isValidGstin = (value: any) => {
  const gstin = cleanGstin(value);
  return GSTIN_PATTERN.test(gstin) && gstinCheckChar(gstin.slice(0, 14)) === gstin[14];
};

// What a GSTIN says, and where it disagrees with the company's other
// details. Disagreements are worth a look, not errors: a company can hold
// a registration in a state other than its head office's.
export function gstinDetails(value: any, company: { state?: string; pan?: string } = {}) {
  const gstin = cleanGstin(value);
  if (!isValidGstin(gstin)) return null;
  const stateCode = gstin.slice(0, 2);
  const pan = gstin.slice(2, 12);
  const state = stateOfGstCode(stateCode);
  const notes: string[] = [];
  if (company.state && state && company.state !== state) {
    notes.push(`The GST number is registered in ${state}; the company's state is ${company.state}.`);
  }
  if (company.pan && company.pan !== pan) {
    notes.push('The PAN inside the GST number differs from the company PAN.');
  }
  return { stateCode, state, pan, notes };
}

// ---------------------------------------------------------------------------
// Images kept as data URIs (signatures)
// ---------------------------------------------------------------------------
export const IMAGE_DATA_URI = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/;
export const MAX_SIGNATURE_CHARS = 400_000; // about 300 KB of image

export const LOGO_POSITIONS = ['LEFT', 'CENTER', 'RIGHT'];
