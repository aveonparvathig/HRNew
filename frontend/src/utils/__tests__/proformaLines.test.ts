import { describe, it, expect } from 'vitest';
import { periodLines, lineAmounts, draftTotals, advanceFor, periodDetail } from '../proformaLines';

const row2526 = {
  id: 'b1', academicYear: '2025-2026', periodLabel: '2025-2026',
  overrideAmounts: false, studentCount: 9263, rate: 250, taxableValue: 2315750, oneTimePayment: 0,
};

describe('periodLines', () => {
  it('bills students × rate per student (the 2025-2026 row)', () => {
    const [l] = periodLines(row2526);
    expect(l).toMatchObject({ billingId: 'b1', qty: '9263', rate: '250', gst: true, detail: 'Academic Year 2025 - 26' });
    expect(lineAmounts(l)).toEqual({ taxable: 2315750, gst: 416835, total: 2732585 });
  });

  it('bills a fixed-fee row as qty 1 at the taxable value', () => {
    const [l] = periodLines({ ...row2526, overrideAmounts: true, taxableValue: 50000 });
    expect(l).toMatchObject({ qty: '1', rate: '50000' });
  });

  it('adds the one-time fee as its own line without GST', () => {
    const lines = periodLines({ ...row2526, oneTimePayment: 25000 });
    expect(lines).toHaveLength(2);
    expect(lines[1]).toMatchObject({ billingId: 'b1', qty: '1', rate: '25000', gst: false });
  });

  it('labels custom periods by their label', () => {
    expect(periodDetail({ periodType: 'CUSTOM', academicYear: '2026-02-04', periodLabel: '04 Feb 2026 → 03 Feb 2027' }))
      .toBe('Period 04 Feb 2026 → 03 Feb 2027');
  });
});

describe('draftTotals', () => {
  it('reproduces proforma 018: 2092 × 100, advance 1,00,000', () => {
    const t = draftTotals([{ qty: '2092', rate: '100', gst: true }], true, 100000);
    expect(t).toEqual({
      subtotal: 209200, gst: 37656, cgst: 18828, sgst: 18828, igst: 0,
      total: 246856, advance: 100000, balanceDue: 146856,
    });
  });

  it('uses IGST for another state', () => {
    expect(draftTotals([{ qty: '1', rate: '100', gst: true }], false)).toMatchObject({ cgst: 0, sgst: 0, igst: 18 });
  });
});

describe('advanceFor', () => {
  it('sums payments on the ticked periods only', () => {
    const billings = [{ id: 'a', received: 1000000 }, { id: 'b', received: 0 }, { id: 'c', received: 5 }];
    expect(advanceFor(billings, new Set(['a', 'b']))).toBe(1000000);
    expect(advanceFor(billings, new Set())).toBe(0);
  });
});
