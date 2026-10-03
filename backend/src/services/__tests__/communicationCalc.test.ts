import { describe, it, expect } from 'vitest';
import {
  audienceInput, audienceWhere, audienceMatches, scopeLabel, bulletinLive,
  CHANGE_SECTIONS, requiresProof, changeDiff, changeApplyData, fieldLabel,
} from '../communicationCalc';

describe('audience', () => {
  it('validates the scope and what it needs', () => {
    expect(audienceInput({ scope: 'EVERYONE' })).toEqual({ scope: 'EVERYONE', scopeValue: '', personIds: [] });
    expect(audienceInput({ scope: 'DEPARTMENT', scopeValue: 'Engineering' })).toMatchObject({ scope: 'DEPARTMENT', scopeValue: 'Engineering' });
    expect(audienceInput({ scope: 'DEPARTMENT' })).toMatch(/department/);
    expect(audienceInput({ scope: 'LOCATION' })).toMatch(/work location/);
    expect(audienceInput({ scope: 'CHOSEN', personIds: ['a', 'b', 'a'] })).toEqual({ scope: 'CHOSEN', scopeValue: '', personIds: ['a', 'b'] });
    expect(audienceInput({ scope: 'CHOSEN', personIds: [] })).toMatch(/at least one/);
    expect(audienceInput({ scope: 'NONSENSE' })).toMatch(/who this is for/);
    // bulletins/policies cannot hand-pick people
    expect(audienceInput({ scope: 'CHOSEN', personIds: ['a'] }, false)).toMatch(/who this is for/);
  });

  it('builds the where-filter for serving employees', () => {
    const base = { organizationId: 'o1', kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } };
    expect(audienceWhere('o1', { scope: 'EVERYONE', scopeValue: '', personIds: [] })).toEqual(base);
    expect(audienceWhere('o1', { scope: 'DEPARTMENT', scopeValue: 'Sales', personIds: [] })).toMatchObject({ department: 'Sales' });
    expect(audienceWhere('o1', { scope: 'LOCATION', scopeValue: 'loc1', personIds: [] })).toMatchObject({ workLocationId: 'loc1' });
    expect(audienceWhere('o1', { scope: 'CHOSEN', scopeValue: '', personIds: ['p1', 'p2'] })).toMatchObject({ id: { in: ['p1', 'p2'] } });
  });

  it('matches one person to a group and labels the scope', () => {
    const p = { department: 'Engineering', workLocationId: 'loc1' };
    expect(audienceMatches(p, 'EVERYONE', '')).toBe(true);
    expect(audienceMatches(p, 'DEPARTMENT', 'Engineering')).toBe(true);
    expect(audienceMatches(p, 'DEPARTMENT', 'Sales')).toBe(false);
    expect(audienceMatches(p, 'LOCATION', 'loc1')).toBe(true);
    expect(audienceMatches(p, 'LOCATION', 'loc2')).toBe(false);
    expect(scopeLabel('DEPARTMENT', 'Sales')).toBe('Department: Sales');
    expect(scopeLabel('LOCATION', 'loc1', 'Coimbatore')).toBe('Location: Coimbatore');
    expect(scopeLabel('EVERYONE', '')).toBe('Everyone');
  });

  it('knows when a bulletin is live', () => {
    expect(bulletinLive({ isActive: true, expiresOn: null }, '2026-10-03')).toBe(true);
    expect(bulletinLive({ isActive: true, expiresOn: '2026-10-10' }, '2026-10-03')).toBe(true);
    expect(bulletinLive({ isActive: true, expiresOn: '2026-10-01' }, '2026-10-03')).toBe(false);
    expect(bulletinLive({ isActive: false, expiresOn: null }, '2026-10-03')).toBe(false);
  });
});

describe('change requests', () => {
  const person = { email: 'old@x.com', phone: '111', address: 'Old addr', permanentAddress: '', emergencyName: '', emergencyRelation: '', emergencyNo: '999', bankName: 'HDFC', bankAccountName: '', bankAccountNumber: '123', bankBranch: '', bankAccountType: '', ifscCode: 'HDFC0001234' };

  it('knows the sections and which need a proof', () => {
    expect(CHANGE_SECTIONS.map(s => s.value)).toEqual(['CONTACT', 'ADDRESS', 'EMERGENCY', 'BANK', 'FAMILY']);
    expect(requiresProof('BANK')).toBe(true);
    expect(requiresProof('CONTACT')).toBe(false);
    expect(fieldLabel('ifscCode')).toBe('IFSC');
  });

  it('diffs only the fields that change', () => {
    const d = changeDiff('CONTACT', { email: 'new@x.com', phone: '111' }, person) as any;
    expect(Object.keys(d)).toEqual(['email']);
    expect(d.email).toEqual({ from: 'old@x.com', to: 'new@x.com', label: 'Personal email' });
  });

  it('nothing changed is an empty diff', () => {
    expect(changeDiff('CONTACT', { email: 'old@x.com', phone: '111' }, person)).toEqual({});
  });

  it('validates the fields it touches', () => {
    expect(changeDiff('CONTACT', { email: 'not-an-email' }, person)).toMatch(/valid personal email/);
    expect(changeDiff('BANK', { ifscCode: 'BAD' }, person)).toMatch(/HDFC0001234/);
    expect(changeDiff('BANK', { bankAccountType: 'LOAN' }, person)).toMatch(/account type/);
    expect(changeDiff('FAMILY', {}, person)).toMatch(/what you want to change/);
  });

  it('cleans an IFSC and makes the apply data', () => {
    const d = changeDiff('BANK', { ifscCode: ' hdfc0009999 ', bankAccountNumber: '999' }, person) as any;
    expect(d.ifscCode.to).toBe('HDFC0009999');
    expect(changeApplyData(d)).toEqual({ ifscCode: 'HDFC0009999', bankAccountNumber: '999' });
  });
});
