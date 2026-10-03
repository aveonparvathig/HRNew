// Fuller employee profile (phase 24): validation for the personal fields,
// family members, education, previous employment and identity documents,
// plus Aadhaar masking and total-experience maths. Pure, DB-independent.

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const str = (v: any) => String(v ?? '').trim();
const clean = (v: any, max: number) => str(v).replace(/\s+/g, ' ').slice(0, max);

// Strict: "2020-02-30" is rejected rather than rolled over to March.
function isRealDate(s: string): boolean {
  if (!DATE.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// A date cell: '' -> null, a valid "YYYY-MM-DD" -> itself, anything else -> error.
function dateField(v: any, label: string): string | null | { error: string } {
  const s = str(v);
  if (!s) return null;
  if (!isRealDate(s)) return { error: `Enter a valid ${label}` };
  return s;
}

// A month-or-date cell for work periods: accepts "YYYY-MM" or "YYYY-MM-DD".
function monthField(v: any, label: string): string | null | { error: string } {
  const s = str(v);
  if (!s) return null;
  if (MONTH.test(s)) return s;
  if (isRealDate(s)) return s.slice(0, 7);
  return { error: `Enter ${label} as a month, e.g. 2020-06` };
}

// ---- Enumerations ------------------------------------------------------------------------------
export const RESIDENTIAL_STATUSES = [
  { value: 'RESIDENT', label: 'Resident' },
  { value: 'NON_RESIDENT', label: 'Non-resident' },
  { value: 'NOT_ORDINARILY_RESIDENT', label: 'Not ordinarily resident' },
];
export const ACCOUNT_TYPES = [
  { value: 'SAVINGS', label: 'Savings' },
  { value: 'CURRENT', label: 'Current' },
];
export const LWF_COVERAGE = [
  { value: 'AUTO', label: 'Follow the work location' },
  { value: 'YES', label: 'Covered' },
  { value: 'NO', label: 'Not covered' },
];
export const IDENTITY_DOC_TYPES = [
  { value: 'PAN', label: 'PAN', expires: false },
  { value: 'AADHAAR', label: 'Aadhaar', expires: false },
  { value: 'PASSPORT', label: 'Passport', expires: true },
  { value: 'DRIVING_LICENCE', label: 'Driving licence', expires: true },
  { value: 'VOTER_ID', label: 'Voter ID', expires: false },
];
export const FAMILY_RELATIONS = ['Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Other'];
const DOC_TYPE_VALUES = IDENTITY_DOC_TYPES.map(t => t.value);
const docTypeLabel = (value: string) => IDENTITY_DOC_TYPES.find(t => t.value === value)?.label || value;

// ---- Aadhaar masking ---------------------------------------------------------------------------
// All but the last four digits hidden, grouped in fours: "XXXX XXXX 1234".
// Shown to everyone but Super Admin and HR.
export function maskAadhaar(value: any): string {
  const digits = str(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length <= 4) return digits;
  const masked = 'X'.repeat(digits.length - 4) + digits.slice(-4);
  return masked.replace(/(.{4})/g, '$1 ').trim();
}
export const canSeeFullAadhaar = (role: string) => role === 'SUPER_ADMIN' || role === 'HR';

// ---- Personal fields ---------------------------------------------------------------------------
export function personalInput(b: any): string | Record<string, any> {
  const out: Record<string, any> = {};
  if ('marriageDate' in b) {
    const d = dateField(b.marriageDate, 'marriage date');
    if (d && typeof d === 'object') return d.error;
    out.marriageDate = d;
  }
  if ('dateOfBirth' in b) {
    const d = dateField(b.dateOfBirth, 'date of birth');
    if (d && typeof d === 'object') return d.error;
  }
  if ('residentialStatus' in b) {
    const v = str(b.residentialStatus);
    if (v && !RESIDENTIAL_STATUSES.some(r => r.value === v)) return 'Pick a residential status from the list';
    out.residentialStatus = v;
  }
  if ('bankAccountType' in b) {
    const v = str(b.bankAccountType);
    if (v && !ACCOUNT_TYPES.some(a => a.value === v)) return 'Pick the bank account type from the list';
    out.bankAccountType = v;
  }
  if ('lwfCovered' in b) {
    const v = str(b.lwfCovered) || 'AUTO';
    if (!LWF_COVERAGE.some(l => l.value === v)) return 'Pick the Labour Welfare Fund coverage from the list';
    out.lwfCovered = v;
  }
  if ('pfJoinDate' in b) {
    const d = dateField(b.pfJoinDate, 'PF join date');
    if (d && typeof d === 'object') return d.error;
    out.pfJoinDate = d;
  }
  if ('physicallyChallenged' in b && b.physicallyChallenged && !str(b.disabilityType) && !('disabilityType' in b && str(b.disabilityType))) {
    // physically challenged with no type is allowed; the type is optional
  }
  return out;
}

// The scalar profile fields phase 24 adds, cleaned for storage. Called
// alongside the existing personData(); parentSpouseName is fed from the
// father's name so the PF/ESI registers keep working.
export function profileData(b: any): Record<string, any> {
  const fatherName = clean(b.fatherName, 120);
  const spouseName = clean(b.spouseName, 120);
  const data: Record<string, any> = {
    fatherName, spouseName,
    marriageDate: str(b.marriageDate) && isRealDate(str(b.marriageDate)) ? str(b.marriageDate) : null,
    nationality: clean(b.nationality, 60),
    placeOfBirth: clean(b.placeOfBirth, 120),
    residentialStatus: RESIDENTIAL_STATUSES.some(r => r.value === b.residentialStatus) ? b.residentialStatus : '',
    religion: clean(b.religion, 60),
    physicallyChallenged: Boolean(b.physicallyChallenged),
    disabilityType: Boolean(b.physicallyChallenged) ? clean(b.disabilityType, 120) : '',
    isDirector: Boolean(b.isDirector),
    permanentAddress: clean(b.permanentAddress, 500),
    emergencyName: clean(b.emergencyName, 120),
    emergencyRelation: clean(b.emergencyRelation, 60),
    bankAccountName: clean(b.bankAccountName, 150),
    bankBranch: clean(b.bankBranch, 150),
    bankAccountType: ACCOUNT_TYPES.some(a => a.value === b.bankAccountType) ? b.bankAccountType : '',
    pfJoinDate: str(b.pfJoinDate) && isRealDate(str(b.pfJoinDate)) ? str(b.pfJoinDate) : null,
    epsMember: Boolean(b.epsMember),
    lwfCovered: LWF_COVERAGE.some(l => l.value === b.lwfCovered) ? b.lwfCovered : 'AUTO',
  };
  // Keep the legacy combined field (letters, PF/ESI registers) in step
  if (fatherName || spouseName) data.parentSpouseName = fatherName || spouseName;
  return data;
}

// ---- Family members ----------------------------------------------------------------------------
export function familyMemberInput(b: any): string | Record<string, any> {
  const name = clean(b.name, 120);
  if (!name) return 'Enter the family member’s name';
  const relation = clean(b.relation, 40);
  if (!relation) return 'Pick the relationship';
  const dob = dateField(b.dateOfBirth, 'date of birth');
  if (dob && typeof dob === 'object') return dob.error;
  const share = b.nomineeShare === '' || b.nomineeShare == null ? 0 : Number(b.nomineeShare);
  if (!isFinite(share) || share < 0 || share > 100) return 'The nominee share is a percentage between 0 and 100';
  return {
    name, relation, dateOfBirth: dob as string | null,
    isDependant: Boolean(b.isDependant),
    nomineeShare: Math.round(share * 100) / 100,
  };
}

// The nominee shares across the family must not add up to more than 100%.
// `members` are the rows as they would stand after the change.
export function nomineeShareProblem(members: { nomineeShare: number }[]): string | null {
  const total = members.reduce((sum, m) => sum + (Number(m.nomineeShare) || 0), 0);
  if (total > 100.001) return `The nominee shares add up to ${Math.round(total * 100) / 100}%. They cannot be more than 100%.`;
  return null;
}

// ---- Education ---------------------------------------------------------------------------------
const THIS_YEAR = new Date().getFullYear();
function yearField(v: any, label: string): number | null | { error: string } {
  if (v === '' || v == null) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1950 || n > THIS_YEAR + 10) return { error: `Enter a valid ${label} (1950–${THIS_YEAR + 10})` };
  return n;
}
export function educationInput(b: any): string | Record<string, any> {
  const qualification = clean(b.qualification, 120);
  if (!qualification) return 'Enter the qualification';
  const fromYear = yearField(b.fromYear, 'start year');
  if (fromYear && typeof fromYear === 'object') return fromYear.error;
  const toYear = yearField(b.toYear, 'end year');
  if (toYear && typeof toYear === 'object') return toYear.error;
  if (typeof fromYear === 'number' && typeof toYear === 'number' && fromYear > toYear) {
    return 'The start year cannot be after the end year';
  }
  return {
    qualification, institute: clean(b.institute, 150),
    fromYear: fromYear as number | null, toYear: toYear as number | null,
    grade: clean(b.grade, 40), isHighest: Boolean(b.isHighest),
  };
}

// ---- Previous employment -----------------------------------------------------------------------
export function previousEmploymentInput(b: any): string | Record<string, any> {
  const employer = clean(b.employer, 150);
  if (!employer) return 'Enter the previous employer';
  const fromDate = monthField(b.fromDate, 'the start');
  if (fromDate && typeof fromDate === 'object') return fromDate.error;
  const toDate = monthField(b.toDate, 'the end');
  if (toDate && typeof toDate === 'object') return toDate.error;
  if (typeof fromDate === 'string' && typeof toDate === 'string' && fromDate > toDate) {
    return 'The start cannot be after the end';
  }
  const salary = b.lastSalary === '' || b.lastSalary == null ? 0 : Number(b.lastSalary);
  if (!isFinite(salary) || salary < 0) return 'The last salary is an amount, 0 or more';
  return {
    employer, designation: clean(b.designation, 120),
    fromDate: fromDate as string | null, toDate: toDate as string | null,
    lastSalary: Math.round(salary * 100) / 100, reasonForLeaving: clean(b.reasonForLeaving, 200),
  };
}

// Whole months between two "YYYY-MM" (or "YYYY-MM-DD") points, inclusive of
// the starting month: Jan 2020 to Mar 2020 is 3 months.
export function monthsBetween(from?: string | null, to?: string | null): number {
  if (!from || !to) return 0;
  const idx = (s: string) => { const [y, m] = s.slice(0, 7).split('-').map(Number); return y * 12 + (m - 1); };
  return Math.max(0, idx(to) - idx(from) + 1);
}

export function totalExperience(rows: { fromDate?: string | null; toDate?: string | null }[]): { months: number; label: string } {
  const months = rows.reduce((sum, r) => sum + monthsBetween(r.fromDate, r.toDate), 0);
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (rem) parts.push(`${rem} month${rem === 1 ? '' : 's'}`);
  return { months, label: parts.join(' ') || 'None' };
}

// ---- Identity documents ------------------------------------------------------------------------
export function identityDocInput(b: any): string | Record<string, any> {
  const docType = str(b.docType).toUpperCase();
  if (!DOC_TYPE_VALUES.includes(docType)) return 'Pick the document type from the list';
  const number = clean(b.number, 60);
  if (!number) return `Enter the ${docTypeLabel(docType)} number`;
  const expiry = dateField(b.expiryDate, 'expiry date');
  if (expiry && typeof expiry === 'object') return expiry.error;
  if (!IDENTITY_DOC_TYPES.find(t => t.value === docType)!.expires && expiry) {
    // keep an expiry if someone enters one, but it is not required
  }
  return {
    docType, number, nameOnDocument: clean(b.nameOnDocument, 150),
    expiryDate: expiry as string | null,
  };
}

// Documents with an expiry date on or before `days` from today (and not
// already long past): used for the "expiring soon" list.
export function expiringWithin<T extends { expiryDate?: string | null }>(docs: T[], days: number, today: string): T[] {
  const limit = new Date(today + 'T00:00:00Z');
  limit.setUTCDate(limit.getUTCDate() + days);
  const cutoff = limit.toISOString().slice(0, 10);
  return docs.filter(d => d.expiryDate && d.expiryDate <= cutoff).sort((a, b) => (a.expiryDate! < b.expiryDate! ? -1 : 1));
}

// Whether a stored expiry date is in the past as of `today`.
export const isExpired = (expiryDate: string | null | undefined, today: string) => Boolean(expiryDate && expiryDate < today);

// The PAN and Aadhaar already on the profile, as read-only identity rows
// shown until a real document of that type is added.
export function profileIdentityRows(person: { panNumber?: string; aadharNo?: string; name?: string }, existingTypes: Set<string>) {
  const rows: any[] = [];
  if (str(person.panNumber) && !existingTypes.has('PAN')) {
    rows.push({ id: null, docType: 'PAN', number: str(person.panNumber), nameOnDocument: str(person.name), fromProfile: true, verified: false, hasFile: false, expiryDate: null });
  }
  if (str(person.aadharNo) && !existingTypes.has('AADHAAR')) {
    rows.push({ id: null, docType: 'AADHAAR', number: str(person.aadharNo), nameOnDocument: str(person.name), fromProfile: true, verified: false, hasFile: false, expiryDate: null });
  }
  return rows;
}
