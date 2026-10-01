import { describe, it, expect } from 'vitest';
import {
  lineAmount, lineDeduction, declarationTotals, effectiveTaxProfile, rentNeedsLandlordPan,
  DEFAULT_DECLARATION_ITEMS,
} from '../payroll/declarationCalc';
import { computeTds, DEFAULT_TAX_CONFIGS, TdsInputs } from '../payroll/taxCalc';

const ITEMS = [
  { id: 'lic', name: 'Life insurance', section: '80C', group: 'SECTION_80C', maxAmount: 150000, deductPercent: 100 },
  { id: 'ppf', name: 'PPF', section: '80C', group: 'SECTION_80C', maxAmount: 150000, deductPercent: 100 },
  { id: 'med', name: 'Medical insurance', section: '80D', group: 'OTHER', maxAmount: 25000, deductPercent: 100 },
  { id: 'don', name: 'Donation 50%', section: '80G', group: 'OTHER', maxAmount: null, deductPercent: 50 },
  { id: 'edu', name: 'Education loan interest', section: '80E', group: 'OTHER', maxAmount: null, deductPercent: 100 },
];
const line = (itemId: string, declaredAmount: number, approvedAmount: number | null = null) =>
  ({ itemId, declaredAmount, approvedAmount });

describe('declaration lines', () => {
  it('uses the declared amount until proofs are considered, then the approved one', () => {
    expect(lineAmount(line('lic', 60000, 45000), false)).toBe(60000);
    expect(lineAmount(line('lic', 60000, 45000), true)).toBe(45000);
    expect(lineAmount(line('lic', 60000), true)).toBe(0); // nothing approved yet
  });

  it('caps at the item limit and applies the deductible share', () => {
    expect(lineDeduction(line('med', 40000), ITEMS[2], false)).toBe(25000);
    expect(lineDeduction(line('don', 10000), ITEMS[3], false)).toBe(5000);
    expect(lineDeduction(line('edu', 320000), ITEMS[4], false)).toBe(320000);
    expect(lineDeduction(line('med', 40000, 18000), ITEMS[2], true)).toBe(18000);
  });
});

describe('declaration totals', () => {
  const lines = [line('lic', 60000, 60000), line('ppf', 100000, 50000), line('med', 40000, 20000), line('don', 10000)];

  it('splits the Section 80C pool from the other deductions', () => {
    const t = declarationTotals(lines, ITEMS, false);
    expect(t.section80C).toBe(160000);        // overall 80C limit is applied later, with PF
    expect(t.otherDeductions).toBe(25000 + 5000);
  });

  it('switches to approved amounts once proofs are considered', () => {
    const t = declarationTotals(lines, ITEMS, true);
    expect(t.section80C).toBe(110000);
    expect(t.otherDeductions).toBe(20000);    // donation has nothing approved
  });

  it('reports declared, approved and allowed per section, in section order', () => {
    const t = declarationTotals(lines, ITEMS, false);
    expect(t.bySection.map(s => s.section)).toEqual(['80C', '80D', '80G']);
    expect(t.bySection[0]).toEqual({ section: '80C', declared: 160000, approved: 110000, allowed: 160000 });
    expect(t.bySection[1]).toEqual({ section: '80D', declared: 40000, approved: 20000, allowed: 25000 });
  });

  it('ignores lines whose item no longer exists', () => {
    expect(declarationTotals([line('gone', 5000)], ITEMS, false)).toEqual({ section80C: 0, otherDeductions: 0, bySection: [] });
  });
});

describe('effective tax profile', () => {
  const profile = {
    prevEmployerIncome: 100000, prevEmployerTds: 5000, otherIncome: 12000,
    annualRentPaid: 180000, isMetro: false, housingLoanInterest: 90000,
    poiConsidered: false, rentApproved: 150000, housingInterestApproved: null,
  };
  const lines = [line('lic', 60000, 40000), line('med', 20000, 20000)];

  it('passes declared figures through while proofs are not considered', () => {
    expect(effectiveTaxProfile(profile, lines, ITEMS)).toEqual({
      prevEmployerIncome: 100000, prevEmployerTds: 5000, otherIncome: 12000,
      annualRentPaid: 180000, isMetro: false, section80C: 60000, otherDeductions: 20000, housingLoanInterest: 90000,
    });
  });

  it('uses approved rent, interest and items once proofs are considered', () => {
    const p = effectiveTaxProfile({ ...profile, poiConsidered: true }, lines, ITEMS);
    expect(p.annualRentPaid).toBe(150000);
    expect(p.housingLoanInterest).toBe(0);   // nothing approved
    expect(p.section80C).toBe(40000);
    expect(p.otherDeductions).toBe(20000);
  });

  it('feeds the tax engine: old-regime tax falls as declarations rise', () => {
    const OLD = DEFAULT_TAX_CONFIGS.find(c => c.regime === 'OLD')!;
    const SETTINGS = {
      basicPercentOfPackage: 50, daPercentOfBasic: 45, hraPercentOfBasic: 25,
      transportPercentOfBasic: 20, foodPercentOfBasic: 10, esiEmployeePercent: 0.75, esiEmployerPercent: 3.25,
      pfEmployeePercent: 12, pfEmployerPercent: 12, pfWageCap: 15000, pfWageFactor: 60, pfEmployerMatchesEmployee: true,
    };
    const base = (p: any): TdsInputs => ({
      config: OLD, fyLabel: '2026-27', period: '2026-04', monthsAfter: 11, earlier: [],
      current: { period: '2026-04', taxableGross: 100000, basic: 50000, da: 22500, hra: 12500, pfEmployee: 0, professionalTax: 0, tds: 0, oneTime: 0 },
      projection: { settings: SETTINGS, monthlyPackage: 100000, isEsiEligible: false, isPfApplicable: false },
      profile: p, perquisites: 0, age: 30, hasValidPan: true,
    });
    const none = { ...profile, prevEmployerIncome: 0, prevEmployerTds: 0, otherIncome: 0, annualRentPaid: 0, housingLoanInterest: 0 };
    const without = computeTds(base(effectiveTaxProfile(none, [], ITEMS)));
    const withItems = computeTds(base(effectiveTaxProfile(none, [line('lic', 150000), line('med', 25000)], ITEMS)));
    expect(without.working.taxableIncome).toBe(1150000);
    expect(withItems.working.taxableIncome).toBe(1150000 - 175000);
    expect(withItems.tds).toBeLessThan(without.tds);
  });
});

describe('rules and catalogue', () => {
  it('needs the landlord’s PAN only above one lakh of rent a year', () => {
    expect(rentNeedsLandlordPan(100000)).toBe(false);
    expect(rentNeedsLandlordPan(100001)).toBe(true);
  });

  it('ships a starter catalogue with unique codes and valid groups', () => {
    const codes = DEFAULT_DECLARATION_ITEMS.map(i => i[0]);
    expect(new Set(codes).size).toBe(codes.length);
    expect(DEFAULT_DECLARATION_ITEMS.every(i => ['SECTION_80C', 'OTHER'].includes(i[4]))).toBe(true);
    expect(DEFAULT_DECLARATION_ITEMS.every(i => i[6] > 0 && i[6] <= 100)).toBe(true);
  });
});
