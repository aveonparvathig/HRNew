// Employee communication (phase 26): who a message or notice reaches, and
// turning an employee's proposed change into a checked diff. Pure.
import { cleanIfsc, isValidIfsc } from './masters';
import { ACCOUNT_TYPES } from './profileCalc';

const str = (v: any) => String(v ?? '').trim();
const clean = (v: any, max: number) => str(v).replace(/\s+/g, ' ').slice(0, max);

// ---- Audience ----------------------------------------------------------------------------------
export const AUDIENCE_SCOPES = [
  { value: 'EVERYONE', label: 'Everyone' },
  { value: 'DEPARTMENT', label: 'A department' },
  { value: 'LOCATION', label: 'A work location' },
  { value: 'CHOSEN', label: 'Chosen people' },
];
// Bulletins and policies target a group, never a hand-picked list
export const GROUP_SCOPES = AUDIENCE_SCOPES.filter(s => s.value !== 'CHOSEN');

export function audienceInput(b: any, allowChosen = true): string | { scope: string; scopeValue: string; personIds: string[] } {
  const scope = str(b.scope).toUpperCase() || 'EVERYONE';
  const scopes = allowChosen ? AUDIENCE_SCOPES : GROUP_SCOPES;
  if (!scopes.some(s => s.value === scope)) return 'Pick who this is for';
  if (scope === 'DEPARTMENT' && !str(b.scopeValue)) return 'Pick the department';
  if (scope === 'LOCATION' && !str(b.scopeValue)) return 'Pick the work location';
  const personIds = Array.isArray(b.personIds) ? [...new Set(b.personIds.map(str).filter(Boolean))] as string[] : [];
  if (scope === 'CHOSEN' && personIds.length === 0) return 'Pick at least one person';
  return { scope, scopeValue: scope === 'DEPARTMENT' || scope === 'LOCATION' ? str(b.scopeValue) : '', personIds: scope === 'CHOSEN' ? personIds : [] };
}

// The Prisma `where` that selects the serving employees an audience covers.
export function audienceWhere(organizationId: string, aud: { scope: string; scopeValue: string; personIds: string[] }) {
  const base: any = { organizationId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } };
  if (aud.scope === 'DEPARTMENT') base.department = aud.scopeValue;
  else if (aud.scope === 'LOCATION') base.workLocationId = aud.scopeValue;
  else if (aud.scope === 'CHOSEN') base.id = { in: aud.personIds };
  return base;
}

// Whether one person is in a group scope (for showing a bulletin/policy).
export function audienceMatches(person: { department?: string; workLocationId?: string | null }, scope: string, scopeValue: string): boolean {
  if (scope === 'DEPARTMENT') return person.department === scopeValue;
  if (scope === 'LOCATION') return (person.workLocationId || '') === scopeValue;
  return scope === 'EVERYONE';
}

export const scopeLabel = (scope: string, scopeValue: string, locationName?: string) =>
  scope === 'DEPARTMENT' ? `Department: ${scopeValue}`
    : scope === 'LOCATION' ? `Location: ${locationName || scopeValue}`
      : scope === 'CHOSEN' ? 'Chosen people' : 'Everyone';

// A bulletin/policy is live if active and not past its expiry.
export const bulletinLive = (b: { isActive: boolean; expiresOn?: string | null }, today: string) =>
  b.isActive && (!b.expiresOn || b.expiresOn >= today);

// ---- Change requests ---------------------------------------------------------------------------
// What an employee may propose to change, by section. Only these fields.
export const CHANGE_SECTIONS: { value: string; label: string; fields: string[]; proof?: boolean }[] = [
  { value: 'CONTACT', label: 'Contact details', fields: ['email', 'phone'] },
  { value: 'ADDRESS', label: 'Address', fields: ['address', 'permanentAddress'] },
  { value: 'EMERGENCY', label: 'Emergency contact', fields: ['emergencyName', 'emergencyRelation', 'emergencyNo'] },
  { value: 'BANK', label: 'Bank account', fields: ['bankName', 'bankAccountName', 'bankAccountNumber', 'bankBranch', 'bankAccountType', 'ifscCode'], proof: true },
  { value: 'FAMILY', label: 'Add a family member', fields: [] },
];
export const sectionDef = (section: string) => CHANGE_SECTIONS.find(s => s.value === section);
export const requiresProof = (section: string) => Boolean(sectionDef(section)?.proof);

const FIELD_LABELS: Record<string, string> = {
  email: 'Personal email', phone: 'Contact number', address: 'Present address', permanentAddress: 'Permanent address',
  emergencyName: 'Emergency contact', emergencyRelation: 'Relationship', emergencyNo: 'Emergency number',
  bankName: 'Bank', bankAccountName: 'Name as per bank', bankAccountNumber: 'Account number',
  bankBranch: 'Branch', bankAccountType: 'Account type', ifscCode: 'IFSC',
};
export const fieldLabel = (f: string) => FIELD_LABELS[f] || f;

// Turn a proposed change into a checked diff against the person's current
// values: { field: { from, to, label } }, only fields that actually change.
// Returns an error string, or the diff (empty object means nothing changed).
export function changeDiff(section: string, body: any, person: any): string | Record<string, { from: string; to: string; label: string }> {
  const def = sectionDef(section);
  if (!def || section === 'FAMILY') return 'Pick what you want to change';
  const diff: Record<string, { from: string; to: string; label: string }> = {};
  for (const f of def.fields) {
    if (!(f in body)) continue;
    let to = clean(body[f], f === 'address' || f === 'permanentAddress' ? 500 : 150);
    if (f === 'ifscCode') {
      to = cleanIfsc(to);
      if (to && !isValidIfsc(to)) return 'IFSC must look like HDFC0001234';
    }
    if (f === 'email' && to && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return 'Enter a valid personal email';
    if (f === 'bankAccountType' && to && !ACCOUNT_TYPES.some(a => a.value === to)) return 'Pick the account type from the list';
    const from = str(person[f]);
    if (to !== from) diff[f] = { from, to, label: fieldLabel(f) };
  }
  return diff;
}

// The Person update that an approved scalar change request applies.
export function changeApplyData(changes: Record<string, { to: string }>): Record<string, string> {
  const data: Record<string, string> = {};
  for (const [field, { to }] of Object.entries(changes)) data[field] = to;
  return data;
}
