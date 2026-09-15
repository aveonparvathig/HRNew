import { describe, it, expect } from 'vitest';
import { computePricing, resolveSelection } from '../proposalService';
import { CATALOG } from '../../data/proposalCatalog';

describe('resolveSelection', () => {
  it('bundle mode expands to the bundle module list', () => {
    const modules = resolveSelection('BUNDLE', 'CMS_FULL', []);
    expect(modules.length).toBe(25);
    expect(modules[0].name).toBe('Admission & Enrollment Management');
  });

  it('custom mode keeps only known module codes', () => {
    const modules = resolveSelection('CUSTOM', null, ['CMS_SIS', 'NOT_A_MODULE', 'CMS_LMS']);
    expect(modules.map((m: any) => m.code)).toEqual(['CMS_SIS', 'CMS_LMS']);
  });
});

describe('computePricing — per-student model', () => {
  it('rate × commitment + GST, implementation fee waived', () => {
    const p = computePricing({
      bundle: 'CMS_FULL', pricingModel: 'PER_STUDENT',
      pricePerUnit: 500, minimumStudentCommitment: 1000,
      oneTimeImplementationFee: 500000, waiveOneTimeFee: true,
      gstPercent: 18,
    });
    expect(p.annual.amount).toBe(500000);
    expect(p.implementation.amount).toBe(0);
    expect(p.implementation.waived).toBe(true);
    expect(p.implementation.originalAmount).toBe(500000);
    expect(p.subtotal).toBe(500000);
    expect(p.gstAmount).toBe(90000);
    expect(p.grandTotal).toBe(590000);
  });

  it('unwaived implementation fee joins the subtotal', () => {
    const p = computePricing({
      bundle: null, pricingModel: 'PER_STUDENT',
      pricePerUnit: 250, minimumStudentCommitment: 400,
      oneTimeImplementationFee: 50000, waiveOneTimeFee: false,
      gstPercent: 18,
    });
    expect(p.subtotal).toBe(150000);        // 100000 + 50000
    expect(p.grandTotal).toBe(177000);
  });
});

describe('computePricing — one-time + AMC model', () => {
  it('AMC carries its own GST line and stays out of year-1 total', () => {
    const p = computePricing({
      bundle: 'CMS_FULL', pricingModel: 'ONE_TIME',
      oneTimePrice: 850000, amcAmount: 100000, amcPercent: null,
      oneTimeImplementationFee: 0, waiveOneTimeFee: false,
      gstPercent: 18,
    });
    expect(p.model).toBe('ONE_TIME');
    expect(p.oneTime.amount).toBe(850000);
    expect(p.subtotal).toBe(850000);
    expect(p.grandTotal).toBe(1003000);     // 850000 × 1.18
    expect(p.amc.amount).toBe(100000);
    expect(p.amc.gstAmount).toBe(18000);
    expect(p.amc.totalWithGst).toBe(118000);
  });
});

describe('catalog integrity', () => {
  it('every bundle references only existing modules', () => {
    for (const bundle of Object.values<any>(CATALOG.bundles)) {
      for (const code of bundle.modules) {
        expect(CATALOG.modules[code], `${bundle.code} references ${code}`).toBeDefined();
      }
    }
  });

  it('CMS_FULL bundle price matches the source (₹500/student, 25 modules)', () => {
    const b = CATALOG.bundles.CMS_FULL;
    expect(b.bundle_price_per_student).toBe(500);
    expect(b.modules.length).toBe(25);
  });
});
