import { describe, it, expect } from 'vitest';
import {
  nextProformaNumber, computeProformaAmounts, taxableForBalance,
  proformaAmountInWords, renderProformaHtml, proformaFilename,
} from '../proformaService';
import type { OrgBrand } from '../orgBrand';

const brand: OrgBrand = {
  name: 'Acme <Systems>', tagline: '', addressLine: 'Chennai, TN', phone: '99999', email: 'a@acme.test',
  website: '', logoData: '', brandPrimary: '#123456', brandAccent: '#654321',
  signatoryName: 'R. Kumar', signatoryDesignation: 'Director', signatureData: '',
  logoPosition: 'LEFT', clientLogos: [],
};

describe('nextProformaNumber', () => {
  it('starts at 001 for a fresh period', () => {
    expect(nextProformaNumber('2026-2027', [])).toBe('PI/2026-2027/001');
  });

  it('increments from the highest existing number in the period', () => {
    expect(nextProformaNumber('2026-2027', ['PI/2026-2027/001'])).toBe('PI/2026-2027/002');
    expect(nextProformaNumber('2026-2027', ['PI/2026-2027/001', 'PI/2026-2027/007', 'PI/2026-2027/003']))
      .toBe('PI/2026-2027/008');
  });

  it('resets per period — other periods do not count', () => {
    expect(nextProformaNumber('2027-2028', ['PI/2026-2027/005'])).toBe('PI/2027-2028/001');
  });

  it('does not reuse a gap left by a deleted invoice', () => {
    expect(nextProformaNumber('2026-2027', ['PI/2026-2027/001', 'PI/2026-2027/003'])).toBe('PI/2026-2027/004');
  });

  it('grows past three digits', () => {
    expect(nextProformaNumber('2026-2027', ['PI/2026-2027/999'])).toBe('PI/2026-2027/1000');
  });
});

describe('computeProformaAmounts', () => {
  it('adds 18% GST to the taxable value', () => {
    expect(computeProformaAmounts(100000)).toMatchObject({ taxable: 100000, gst: 18000, oneTime: 0, total: 118000 });
  });

  it('rounds to paise and adds the one-time fee without GST by default', () => {
    expect(computeProformaAmounts(1234.567, 5000)).toEqual({
      taxable: 1234.57, gst: 222.22, oneTime: 5000, oneTimeGst: false, oneTimeGstAmount: 0, total: 6456.79,
    });
  });

  it('adds 18% GST on the one-time fee when chosen', () => {
    expect(computeProformaAmounts(100000, 25000, true)).toEqual({
      taxable: 100000, gst: 22500, oneTime: 25000, oneTimeGst: true, oneTimeGstAmount: 4500, total: 147500,
    });
  });

  it('ignores the GST choice when there is no one-time fee', () => {
    expect(computeProformaAmounts(100000, 0, true)).toMatchObject({ gst: 18000, oneTimeGst: false, total: 118000 });
  });

  it('default taxable reconstructs the balance', () => {
    const t = taxableForBalance(118000);
    expect(t).toBe(100000);
    expect(computeProformaAmounts(t).total).toBe(118000);
    expect(taxableForBalance(-50)).toBe(0);
  });
});

describe('proformaAmountInWords', () => {
  it('uses the Indian lakh system', () => {
    expect(proformaAmountInWords(118000)).toBe('One Lakh Eighteen Thousand Rupees Only');
  });

  it('spells paise', () => {
    expect(proformaAmountInWords(1250.5)).toBe('One Thousand Two Hundred Fifty Rupees and Fifty Paise Only');
  });
});

describe('renderProformaHtml', () => {
  const html = renderProformaHtml(brand, {
    number: 'PI/2026-2027/001', invoiceDate: '2026-11-14', periodLabel: '2026-2027',
    clientName: 'St. <Mary> College', onboarding: { address: '12 Main Rd', city: 'Madurai', contactPerson: 'Principal' },
    lineDescription: 'ERP subscription 2026-2027', taxable: 100000, gst: 18000, oneTime: 0, total: 118000,
  });

  it('marks the document as not a tax invoice', () => {
    expect(html).toContain('Proforma Invoice — Not a Tax Invoice');
  });

  it('shows the number, buyer block, totals and amount in words', () => {
    expect(html).toContain('PI/2026-2027/001');
    expect(html).toContain('12 Main Rd');
    expect(html).toContain('Madurai');
    expect(html).toContain('1,18,000.00');
    expect(html).toContain('18,000.00');
    expect(html).toContain('One Lakh Eighteen Thousand Rupees Only');
    expect(html).toContain('14 Nov 2026');
  });

  it('escapes user-supplied text', () => {
    expect(html).toContain('St. &lt;Mary&gt; College');
    expect(html).toContain('Acme &lt;Systems&gt;');
    expect(html).not.toContain('<Mary>');
  });

  it('omits the one-time row when there is none', () => {
    expect(html).not.toContain('One-time fee');
  });

  const base = {
    number: 'PI/2026-2027/002', invoiceDate: '2026-11-14', periodLabel: '2026-2027',
    clientName: 'X College', lineDescription: 'Subscription',
  };

  it('marks an untaxed one-time fee as not subject to GST', () => {
    const h = renderProformaHtml(brand, { ...base, ...computeProformaAmounts(100000, 25000, false) });
    expect(h).toContain('One-time fee (not subject to GST)');
    expect(h).toContain('One-time fee (no GST)');
    expect(h).toContain('1,43,000.00');
  });

  it('shows GST on the one-time line when taxed', () => {
    const h = renderProformaHtml(brand, { ...base, ...computeProformaAmounts(100000, 25000, true) });
    expect(h).not.toContain('not subject to GST');
    expect(h).toContain('4,500.00');   // one-time GST
    expect(h).toContain('29,500.00');  // one-time line amount
    expect(h).toContain('1,25,000.00'); // taxable value incl. one-time
    expect(h).toContain('22,500.00');  // total GST
    expect(h).toContain('1,47,500.00');
    expect(h).toContain('One Lakh Forty Seven Thousand Five Hundred Rupees Only');
  });
});

describe('proformaFilename', () => {
  it('is filesystem-safe', () => {
    expect(proformaFilename('PI/2026-2027/001', 'St. Mary College')).toBe('Proforma_PI-2026-2027-001_St_Mary_College.pdf');
  });
});
