import { describe, it, expect } from 'vitest';
import {
  LIST_TYPES, cleanLabel, sameLabel, initialListValues, isValidIfsc, cleanIfsc,
  isValidGstin, gstinCheckChar, gstinDetails, GST_STATE_CODES, STATES, IMAGE_DATA_URI,
} from '../masters';
import { INDIAN_STATES } from '../payroll/constants';
import { renderLetter } from '../letterTemplates';

describe('value lists', () => {
  it('has unique list types', () => {
    const types = LIST_TYPES.map(t => t.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it('treats values that differ only in case or spacing as one', () => {
    expect(cleanLabel('  Software   Engineer ')).toBe('Software Engineer');
    expect(sameLabel('Developer', ' developer ')).toBe(true);
    expect(sameLabel('Marketing', 'Marketting')).toBe(false);
  });

  it('fills a list with its defaults, then what is already typed, each once', () => {
    expect(initialListValues(['Single', 'Married'], ['married ', 'Widowed', '', 'Single'])).toEqual(['Single', 'Married', 'Widowed']);
  });

  it('keeps one spelling of a typed value and leaves real differences apart', () => {
    expect(initialListValues([], ['developer', 'Developer', 'IE', 'Marketting', 'Marketing']))
      .toEqual(['developer', 'IE', 'Marketing', 'Marketting']);
  });
});

describe('IFSC', () => {
  it('accepts four letters, a zero and six characters', () => {
    expect(isValidIfsc('HDFC0001234')).toBe(true);
    expect(isValidIfsc(' sbin0abc123 ')).toBe(true);
    expect(cleanIfsc(' sbin0abc123 ')).toBe('SBIN0ABC123');
  });

  it('rejects anything else', () => {
    expect(isValidIfsc('HDFC1001234')).toBe(false); // fifth character must be zero
    expect(isValidIfsc('HDF00001234')).toBe(false);
    expect(isValidIfsc('HDFC000123')).toBe(false);
    expect(isValidIfsc('')).toBe(false);
  });
});

describe('GST number', () => {
  it('works out the check character', () => {
    expect(gstinCheckChar('27AAPFU0939F1Z')).toBe('V');
    expect(gstinCheckChar('29AAGCB7383J1Z')).toBe('4');
  });

  it('accepts a well-formed number and rejects a wrong check character or shape', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstin(' 27aapfu0939f1zv ')).toBe(true);
    expect(isValidGstin('27AAPFU0939F1ZX')).toBe(false);
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isValidGstin('AAAPFU0939F1ZV')).toBe(false);
  });

  it('reads the state and the PAN from the number', () => {
    expect(gstinDetails('27AAPFU0939F1ZV')).toEqual({ stateCode: '27', state: 'Maharashtra', pan: 'AAPFU0939F', notes: [] });
    expect(gstinDetails('not a gstin')).toBeNull();
  });

  it('points out a state or PAN that differs from the company’s', () => {
    const d = gstinDetails('27AAPFU0939F1ZV', { state: 'Tamil Nadu', pan: 'ABCDE1234F' })!;
    expect(d.notes).toHaveLength(2);
    expect(gstinDetails('27AAPFU0939F1ZV', { state: 'Maharashtra', pan: 'AAPFU0939F' })!.notes).toEqual([]);
  });
});

describe('states', () => {
  it('gives every state in the list its own GST code', () => {
    expect(STATES).toHaveLength(INDIAN_STATES.length);
    expect(STATES.every(s => /^\d{2}$/.test(s.gstCode))).toBe(true);
    const codes = Object.values(GST_STATE_CODES);
    expect(new Set(codes).size).toBe(codes.length);
    expect(GST_STATE_CODES['Tamil Nadu']).toBe('33');
  });
});

describe('signature images', () => {
  it('accepts PNG and JPG data URIs only', () => {
    expect(IMAGE_DATA_URI.test('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(IMAGE_DATA_URI.test('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(IMAGE_DATA_URI.test('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false);
    expect(IMAGE_DATA_URI.test('data:text/html;base64,PGI+')).toBe(false);
    expect(IMAGE_DATA_URI.test('https://example.com/sign.png')).toBe(false);
  });
});

describe('signature on letters', () => {
  const SIG = 'data:image/png;base64,iVBORw0KGgo=';
  const brand = {
    name: 'Acme', tagline: '', addressLine: 'Coimbatore', phone: '', email: '', website: '', logoData: '',
    brandPrimary: '#4f46e5', brandAccent: '#312e81', signatoryName: 'R. Kumar', signatoryDesignation: 'Director',
    signatureData: SIG, logoPosition: 'LEFT',
  };
  const letter = (formData: any) => renderLetter('EXPERIENCE_EMPLOYEE', brand, {
    recipientName: 'Asha', letterDate: '2026-10-01', ...formData,
  });

  it('prints the stored signature when the default signatory signs', () => {
    expect(letter({})).toContain(SIG);
    expect(letter({ signatoryName: 'R. Kumar' })).toContain(SIG);
  });

  it('leaves it out when the letter names another signatory, or none is stored', () => {
    expect(letter({ signatoryName: 'S. Priya' })).not.toContain(SIG);
    expect(renderLetter('EXPERIENCE_EMPLOYEE', { ...brand, signatureData: '' }, { recipientName: 'Asha', letterDate: '2026-10-01' }))
      .not.toContain('data:image');
  });
});
