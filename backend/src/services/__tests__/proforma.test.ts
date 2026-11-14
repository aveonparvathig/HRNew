import { describe, it, expect } from 'vitest';
import {
  nextProformaNumber, fiscalYearOf, buildProformaLines, proformaTotals, taxableForBalance,
  proformaAmountInWords, renderProformaHtml, proformaFilename, taxTypeFor, supplierStateCode,
  placeOfSupplyLabel, periodDetail, addressLines,
} from '../proformaService';
import type { OrgBrand } from '../orgBrand';

const brand: OrgBrand = {
  name: 'Aveon <Infotech>', tagline: '', addressLine: '', phone: '8754006483', email: '',
  website: '', logoData: '', brandPrimary: '#0e7490', brandAccent: '#111827',
  signatoryName: '', signatoryDesignation: '', signatureData: '', logoPosition: 'LEFT', clientLogos: [],
  address: 'No.33, Kathir Avenue Andal Street\nHope College, Peelamedu', city: 'Coimbatore',
  state: 'Tamil Nadu', pincode: '641004', country: 'India', gstin: '33AAKCA4063C1Z4',
};

describe('fiscalYearOf', () => {
  it('uses the April-March financial year', () => {
    expect(fiscalYearOf('2026-11-13')).toBe('2026-27');
    expect(fiscalYearOf('2027-03-31')).toBe('2026-27');
    expect(fiscalYearOf('2027-04-01')).toBe('2027-28');
    expect(fiscalYearOf('2099-06-01')).toBe('2099-00');
  });
});

describe('nextProformaNumber', () => {
  it('starts at 001 for a fresh year', () => {
    expect(nextProformaNumber('2026-27', [])).toBe('PRO/2026-27/001');
  });

  it('continues an existing sequence from the configured floor', () => {
    expect(nextProformaNumber('2026-27', [], 22)).toBe('PRO/2026-27/023');
  });

  it('increments from the highest issued number, above the floor', () => {
    expect(nextProformaNumber('2026-27', ['PRO/2026-27/023', 'PRO/2026-27/025'], 22)).toBe('PRO/2026-27/026');
    expect(nextProformaNumber('2026-27', ['PRO/2026-27/003'], 22)).toBe('PRO/2026-27/023');
  });

  it('ignores other years', () => {
    expect(nextProformaNumber('2027-28', ['PRO/2026-27/040'])).toBe('PRO/2027-28/001');
  });
});

describe('lines and totals', () => {
  const lines = buildProformaLines([
    { billingId: 'b1', description: 'CMS Software Subscription Charges for', detail: 'Academic Year 2025 - 26', rate: 50000 },
    { billingId: 'b2', description: 'CMS Software Subscription Charges for', detail: 'Academic Year 2026 - 27', rate: 20000 },
    { description: 'Implementation fee', rate: 10000, gst: false },
  ]);

  it('computes each line at qty × rate with 18% GST (or none)', () => {
    expect(lines[0]).toMatchObject({ qty: 1, taxable: 50000, gstRate: 18, gst: 9000, total: 59000, hsn: '998311' });
    expect(lines[2]).toMatchObject({ taxable: 10000, gstRate: 0, gst: 0, total: 10000, billingId: null });
  });

  it('splits GST into CGST + SGST for intra-state supply', () => {
    expect(proformaTotals(lines, 'CGST_SGST')).toEqual({
      subtotal: 80000, gst: 12600, cgst: 6300, sgst: 6300, igst: 0, total: 92600,
    });
  });

  it('charges IGST for inter-state supply', () => {
    expect(proformaTotals(lines, 'IGST')).toMatchObject({ cgst: 0, sgst: 0, igst: 12600, total: 92600 });
  });

  it('keeps CGST + SGST equal to total GST when the paise are odd', () => {
    const t = proformaTotals(buildProformaLines([{ description: 'x', rate: 100.05 }]), 'CGST_SGST');
    expect(t.gst).toBe(18.01);
    expect(Math.round((t.cgst + t.sgst) * 100) / 100).toBe(18.01);
  });

  it('default taxable reconstructs the balance', () => {
    expect(taxableForBalance(59000)).toBe(50000);
    expect(taxableForBalance(-5)).toBe(0);
  });
});

describe('tax type and place of supply', () => {
  it('reads the supplier state from the GSTIN first', () => {
    expect(supplierStateCode('33AAKCA4063C1Z4', 'Karnataka')).toBe('33');
    expect(supplierStateCode('', 'Karnataka')).toBe('29');
  });

  it('is intra-state for the same state, inter-state otherwise', () => {
    expect(taxTypeFor('33', 'Tamil Nadu')).toBe('CGST_SGST');
    expect(taxTypeFor('33', 'Kerala')).toBe('IGST');
    expect(taxTypeFor('33', '')).toBe('CGST_SGST');
  });

  it('labels the place of supply with its code', () => {
    expect(placeOfSupplyLabel('Tamil Nadu')).toBe('Tamil Nadu (33)');
  });
});

describe('periodDetail', () => {
  it('formats academic years like the sample', () => {
    expect(periodDetail({ academicYear: '2025-2026' }, '2025-2026')).toBe('Academic Year 2025 - 26');
    expect(periodDetail({ periodType: 'CUSTOM', academicYear: '2026-02-01' }, '01 Feb 2026 → 31 Jan 2027'))
      .toBe('Period 01 Feb 2026 → 31 Jan 2027');
  });
});

describe('proformaAmountInWords', () => {
  it('reads like the sample', () => {
    expect(proformaAmountInWords(59000)).toBe('Rupees Fifty Nine Thousand Only');
    expect(proformaAmountInWords(1250.5)).toBe('Rupees One Thousand Two Hundred Fifty and Fifty Paise Only');
  });
});

describe('addressLines', () => {
  it('keeps commas inside a street line and adds city, state, PIN', () => {
    expect(addressLines({ name: 'x', address: 'No.33, Kathir Avenue\nPeelamedu', city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641004' }))
      .toEqual(['No.33, Kathir Avenue', 'Peelamedu', 'Coimbatore, Tamil Nadu, 641004', 'India']);
  });
});

describe('renderProformaHtml', () => {
  const doc = (taxType: 'CGST_SGST' | 'IGST') => renderProformaHtml(brand, {
    number: 'PRO/2026-27/022', invoiceDate: '2026-11-13', validUntil: '2026-11-20',
    placeOfSupply: 'Tamil Nadu', taxType,
    buyer: { name: 'Annai Mira <College>', address: 'NH-46, Chennai-Bengaluru Highway\nArappakkam', city: 'Vellore', state: 'Tamil Nadu', pincode: '632517' },
    lines: buildProformaLines([
      { billingId: 'b1', description: 'CMS Software Subscription Charges for', detail: 'Academic Year 2025 - 26', rate: 50000 },
    ]),
  });

  it('matches the sample layout', () => {
    const h = doc('CGST_SGST');
    expect(h).toContain('PROFORMA<br/>INVOICE');
    expect(h).toContain('PRO/2026-27/022');
    expect(h).toContain('13/11/2026');
    expect(h).toContain('20/11/2026');
    expect(h).toContain('Tamil Nadu (33)');
    expect(h).toContain('<strong>GSTIN:</strong> 33AAKCA4063C1Z4');
    expect(h).toContain('>Bill To<'); // shown upper-case via CSS
    expect(h).toContain('>Ship To<');
    expect(h).toContain('CGST @ 9%');
    expect(h).toContain('Vellore, Tamil Nadu, 632517');
    expect(h).toContain('998311');
    expect(h).toContain('CGST + SGST');
    expect(h).toContain('Rs.4,500.00');
    expect(h).toContain('Rs.59,000.00');
    expect(h).toContain('Rupees Fifty Nine Thousand Only');
    expect(h).toContain("Receiver's Signature");
    expect(h).toContain('computer-generated proforma invoice');
  });

  it('never prints the logo, even when the organisation has one', () => {
    const h = renderProformaHtml({ ...brand, logoData: 'data:image/png;base64,AAAA' }, {
      number: 'X', invoiceDate: '2026-11-14', validUntil: '', placeOfSupply: '', taxType: 'CGST_SGST',
      buyer: { name: 'B' }, lines: buildProformaLines([{ description: 'd', rate: 1 }]),
    });
    expect(h).not.toContain('<img');
    expect(h).not.toContain('data:image/png');
  });

  it('shows IGST for inter-state supply', () => {
    const h = doc('IGST');
    expect(h).toContain('>IGST<');
    expect(h).not.toContain('CGST + SGST');
  });

  it('escapes user-supplied text', () => {
    const h = doc('CGST_SGST');
    expect(h).toContain('Annai Mira &lt;College&gt;');
    expect(h).toContain('Aveon &lt;Infotech&gt;');
    expect(h).not.toContain('<College>');
  });
});

describe('renderProformaHtml — advance and balance due (proforma 018)', () => {
  const doc018 = (advanceReceived: number, validUntil = '') => renderProformaHtml(brand, {
    number: 'PRO/2026-27/018', invoiceDate: '2026-10-26', validUntil, placeOfSupply: 'Tamil Nadu',
    taxType: 'CGST_SGST', advanceReceived,
    buyer: { name: 'GRG Hostels', address: 'Avinashi Road\nPeelamedu', city: 'Coimbatore', state: 'Tamil Nadu', pincode: '641004' },
    lines: buildProformaLines([{ description: 'Hostel Management Software', qty: 2092, rate: 100 }]),
  });

  it('prints qty as students and the totals of the sample', () => {
    const h = doc018(100000);
    expect(h).toContain('>2,092<');
    expect(h).toContain('100.00');
    expect(h).toContain('2,09,200.00');
    expect(h).toContain('Rs.18,828.00');
    expect(h).toContain('Rs.2,46,856.00');
    expect(h).toContain('Received Amount');
    expect(h).not.toContain('Advance Received');
    expect(h).toContain('Rs.-1,00,000.00');
    expect(h).toContain('Balance Due');
    expect(h).toContain('Rs.1,46,856.00');
    // Amount in words is the grand total, as in the sample
    expect(h).toContain('Rupees Two Lakh Forty Six Thousand Eight Hundred Fifty Six Only');
  });

  it('omits the advance rows when nothing was received', () => {
    const h = doc018(0);
    expect(h).not.toContain('Received Amount');
    expect(h).not.toContain('Balance Due');
  });

  it('omits Valid Until when it is not set, prints it when it is', () => {
    expect(doc018(0)).not.toContain('Valid Until');
    expect(doc018(0, '2026-11-02')).toContain('02/11/2026');
  });

  it('prints fractional quantities to 2 decimals', () => {
    const h = renderProformaHtml(brand, {
      number: 'X', invoiceDate: '2026-10-26', validUntil: '', placeOfSupply: '', taxType: 'CGST_SGST',
      buyer: { name: 'B' }, lines: buildProformaLines([{ description: 'd', qty: 1.5, rate: 10 }]),
    });
    expect(h).toContain('>1.50<');
  });
});

describe('proformaFilename', () => {
  it('matches the sample file name', () => {
    expect(proformaFilename('PRO/2026-27/022')).toBe('proforma-PRO_2026-27_022.pdf');
  });
});
