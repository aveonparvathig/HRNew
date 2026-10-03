import { describe, it, expect } from 'vitest';
import {
  maskAadhaar, canSeeFullAadhaar, personalInput, profileData, familyMemberInput, nomineeShareProblem,
  educationInput, previousEmploymentInput, monthsBetween, totalExperience, identityDocInput, expiringWithin,
  isExpired, profileIdentityRows,
} from '../profileCalc';

describe('Aadhaar masking', () => {
  it('hides all but the last four digits, grouped', () => {
    expect(maskAadhaar('123412341234')).toBe('XXXX XXXX 1234');
    expect(maskAadhaar('1234 1234 1234')).toBe('XXXX XXXX 1234');
    expect(maskAadhaar('')).toBe('');
    expect(maskAadhaar('12')).toBe('12');
  });
  it('only Super Admin and HR see the full number', () => {
    expect(canSeeFullAadhaar('SUPER_ADMIN')).toBe(true);
    expect(canSeeFullAadhaar('HR')).toBe(true);
    expect(canSeeFullAadhaar('PAYROLL_VIEWER')).toBe(false);
    expect(canSeeFullAadhaar('EMPLOYEE')).toBe(false);
  });
});

describe('personal fields', () => {
  it('accepts good values and rejects bad enums and dates', () => {
    expect(personalInput({ residentialStatus: 'RESIDENT', marriageDate: '2020-02-14' })).toEqual({ residentialStatus: 'RESIDENT', marriageDate: '2020-02-14' });
    expect(personalInput({ residentialStatus: 'MARTIAN' })).toMatch(/residential status/);
    expect(personalInput({ marriageDate: '2020-13-01' })).toMatch(/valid marriage date/);
    expect(personalInput({ bankAccountType: 'LOAN' })).toMatch(/account type/);
    expect(personalInput({ lwfCovered: 'MAYBE' })).toMatch(/Labour Welfare Fund/);
    expect(personalInput({ pfJoinDate: 'soon' })).toMatch(/valid PF join date/);
  });

  it('cleans for storage and feeds the legacy parent/spouse field from the father', () => {
    const d = profileData({
      fatherName: '  K.  Raman ', spouseName: '', nationality: 'Indian', religion: 'Hindu',
      residentialStatus: 'RESIDENT', bankAccountType: 'SAVINGS', physicallyChallenged: true, disabilityType: 'Low vision',
      isDirector: true, epsMember: true, lwfCovered: 'NO', marriageDate: '', pfJoinDate: '2021-04-01',
    });
    expect(d.fatherName).toBe('K. Raman');
    expect(d.parentSpouseName).toBe('K. Raman');
    expect(d).toMatchObject({ nationality: 'Indian', residentialStatus: 'RESIDENT', bankAccountType: 'SAVINGS', physicallyChallenged: true, disabilityType: 'Low vision', isDirector: true, epsMember: true, lwfCovered: 'NO', marriageDate: null, pfJoinDate: '2021-04-01' });
  });

  it('drops a disability type when not physically challenged, and bad enums fall back', () => {
    const d = profileData({ physicallyChallenged: false, disabilityType: 'Ignored', residentialStatus: 'BOGUS', bankAccountType: 'X', lwfCovered: 'Z' });
    expect(d.disabilityType).toBe('');
    expect(d.residentialStatus).toBe('');
    expect(d.bankAccountType).toBe('');
    expect(d.lwfCovered).toBe('AUTO');
    expect(d.parentSpouseName).toBeUndefined(); // nothing to feed
  });
});

describe('family members', () => {
  it('needs a name and a relationship', () => {
    expect(familyMemberInput({ name: '', relation: 'Spouse' })).toMatch(/name/);
    expect(familyMemberInput({ name: 'Meena', relation: '' })).toMatch(/relationship/);
  });
  it('takes a good member and bounds the nominee share', () => {
    expect(familyMemberInput({ name: 'Meena Raman', relation: 'Spouse', dateOfBirth: '1992-05-01', isDependant: true, nomineeShare: '60' }))
      .toEqual({ name: 'Meena Raman', relation: 'Spouse', dateOfBirth: '1992-05-01', isDependant: true, nomineeShare: 60 });
    expect(familyMemberInput({ name: 'X', relation: 'Son', nomineeShare: '120' })).toMatch(/between 0 and 100/);
    expect(familyMemberInput({ name: 'X', relation: 'Son', dateOfBirth: '2020-02-30' })).toMatch(/valid date of birth/);
  });
  it('refuses nominee shares that add up to more than 100%', () => {
    expect(nomineeShareProblem([{ nomineeShare: 60 }, { nomineeShare: 40 }])).toBeNull();
    expect(nomineeShareProblem([{ nomineeShare: 60 }, { nomineeShare: 50 }])).toMatch(/110%/);
    expect(nomineeShareProblem([{ nomineeShare: 0 }, { nomineeShare: 0 }])).toBeNull();
  });
});

describe('education', () => {
  it('needs a qualification and sane years', () => {
    expect(educationInput({ qualification: '' })).toMatch(/qualification/);
    expect(educationInput({ qualification: 'B.E.', fromYear: '2014', toYear: '2018', grade: 'First class', isHighest: true }))
      .toEqual({ qualification: 'B.E.', institute: '', fromYear: 2014, toYear: 2018, grade: 'First class', isHighest: true });
    expect(educationInput({ qualification: 'B.E.', fromYear: '2018', toYear: '2014' })).toMatch(/start year cannot be after/);
    expect(educationInput({ qualification: 'B.E.', fromYear: '1800' })).toMatch(/valid start year/);
  });
});

describe('previous employment and total experience', () => {
  it('needs an employer and sane dates', () => {
    expect(previousEmploymentInput({ employer: '' })).toMatch(/employer/);
    expect(previousEmploymentInput({ employer: 'Acme', fromDate: '2019-06', toDate: '2021-05', lastSalary: '45000', designation: 'Dev' }))
      .toEqual({ employer: 'Acme', designation: 'Dev', fromDate: '2019-06', toDate: '2021-05', lastSalary: 45000, reasonForLeaving: '' });
    expect(previousEmploymentInput({ employer: 'Acme', fromDate: '2021-05', toDate: '2019-06' })).toMatch(/start cannot be after/);
    expect(previousEmploymentInput({ employer: 'Acme', fromDate: 'last year' })).toMatch(/as a month/);
    expect(previousEmploymentInput({ employer: 'Acme', lastSalary: '-5' })).toMatch(/0 or more/);
  });
  it('accepts a full date and keeps the month', () => {
    expect((previousEmploymentInput({ employer: 'Acme', fromDate: '2019-06-15' }) as any).fromDate).toBe('2019-06');
  });
  it('counts months inclusively and sums experience', () => {
    expect(monthsBetween('2020-01', '2020-03')).toBe(3);
    expect(monthsBetween('2020-01', null)).toBe(0);
    expect(monthsBetween('2020-05', '2020-01')).toBe(0);
    const exp = totalExperience([{ fromDate: '2018-01', toDate: '2019-12' }, { fromDate: '2020-01', toDate: '2020-06' }]);
    expect(exp.months).toBe(24 + 6);
    expect(exp.label).toBe('2 years 6 months');
    expect(totalExperience([]).label).toBe('None');
    expect(totalExperience([{ fromDate: '2020-01', toDate: '2020-01' }]).label).toBe('1 month');
  });
});

describe('identity documents', () => {
  it('needs a known type and a number', () => {
    expect(identityDocInput({ docType: 'LIBRARY_CARD', number: '1' })).toMatch(/document type/);
    expect(identityDocInput({ docType: 'PAN', number: '' })).toMatch(/Enter the PAN number/);
    expect(identityDocInput({ docType: 'passport', number: 'J1234567', expiryDate: '2030-01-01', nameOnDocument: 'Priya' }))
      .toEqual({ docType: 'PASSPORT', number: 'J1234567', nameOnDocument: 'Priya', expiryDate: '2030-01-01' });
    expect(identityDocInput({ docType: 'PASSPORT', number: 'J1', expiryDate: '2030-13-01' })).toMatch(/valid expiry date/);
  });
  it('finds documents expiring within a window and flags expired ones', () => {
    const docs = [
      { id: 'a', expiryDate: '2026-10-20' }, { id: 'b', expiryDate: '2026-12-31' },
      { id: 'c', expiryDate: null }, { id: 'd', expiryDate: '2026-09-01' },
    ];
    const soon = expiringWithin(docs, 60, '2026-10-03');
    expect(soon.map(d => d.id)).toEqual(['d', 'a']); // within 60 days (incl. already past), earliest first
    expect(isExpired('2026-09-01', '2026-10-03')).toBe(true);
    expect(isExpired('2026-12-31', '2026-10-03')).toBe(false);
    expect(isExpired(null, '2026-10-03')).toBe(false);
  });
  it('shows PAN and Aadhaar from the profile until a real document is added', () => {
    const person = { panNumber: 'ABCDE1234F', aadharNo: '123412341234', name: 'Priya' };
    expect(profileIdentityRows(person, new Set()).map(r => r.docType)).toEqual(['PAN', 'AADHAAR']);
    expect(profileIdentityRows(person, new Set(['PAN'])).map(r => r.docType)).toEqual(['AADHAAR']);
    expect(profileIdentityRows(person, new Set(['PAN', 'AADHAAR']))).toEqual([]);
    expect(profileIdentityRows({ name: 'X' }, new Set())).toEqual([]);
    expect(profileIdentityRows(person, new Set())[0]).toMatchObject({ id: null, fromProfile: true, number: 'ABCDE1234F' });
  });
});
