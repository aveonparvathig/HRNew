import { describe, it, expect } from 'vitest';
import { computeEntry, amountInWords } from '../payrollCalc';

// The Excel-default settings every new org starts with.
const SETTINGS = {
  basicPercentOfPackage: 50,
  daPercentOfBasic: 45,
  hraPercentOfBasic: 25,
  transportPercentOfBasic: 20,
  foodPercentOfBasic: 10,
  esiEmployeePercent: 0.75,
  esiEmployerPercent: 3.25,
  esiWageCeiling: 21000,
  pfEmployeePercent: 12,
  pfEmployerPercent: 12,
  pfWageCap: 15000,
  pfWageFactor: 60,
  pfEmployerMatchesEmployee: true,
};

describe('computeEntry — reproduces the source Salary Excel exactly', () => {
  it('full month, PF-enrolled (₹45,000)', () => {
    const r = computeEntry({
      monthlyPackage: 45000, totalWorkingDays: 26, isPfApplicable: true,
    }, SETTINGS);
    expect(r.basic).toBe(22500);            // 45000 × 50%
    expect(r.da).toBe(10125);               // basic × 45%
    expect(r.hra).toBe(5625);               // basic × 25%
    expect(r.transportAllowance).toBe(4500);
    expect(r.foodAllowance).toBe(2250);
    expect(r.grossSalary).toBe(45000);      // components sum back to package
    // PF: (22500+10125) × 60% = 19575 → capped at 15000 → × 12%
    expect(r.pfEmployee).toBe(1800);
    expect(r.pfEmployer).toBe(1800);        // matched
    expect(r.esiEmployee).toBe(0);          // not ESI-eligible
    expect(r.totalDeductions).toBe(1800);
    expect(r.netPayable).toBe(43200);
    expect(r.ctc).toBe(46800);              // gross + employer PF
  });

  it('ESI-eligible (₹30,000) uses ROUNDUP on the ESI base', () => {
    const r = computeEntry({
      monthlyPackage: 30000, totalWorkingDays: 26, isEsiEligible: true,
    }, SETTINGS);
    expect(r.grossSalary).toBe(30000);
    expect(r.esiEmployee).toBe(225);        // ceil(30000 × 0.75%)
    expect(r.esiEmployer).toBe(975);        // ceil(30000 × 3.25%)
    expect(r.netPayable).toBe(29775);
    expect(r.ctc).toBe(30975);
  });

  it('ESI ceiling rounding rounds UP fractions', () => {
    // esiBase = 30001 would give 225.0075 → must become 226, never 225
    const r = computeEntry({
      monthlyPackage: 30001, totalWorkingDays: 26, isEsiEligible: true,
    }, SETTINGS);
    // basic = round(15000.5) = 15001 (half away from zero, like Excel ROUND)
    expect(r.basic).toBe(15001);
    const esiBase = r.basic + r.da + r.hra + r.transportAllowance + r.foodAllowance;
    expect(r.esiEmployee).toBe(Math.ceil(esiBase * 0.0075 - 1e-9));
  });

  it('LOP days shrink the basic proportionally (whole-rupee rounding)', () => {
    const r = computeEntry({
      monthlyPackage: 45000, totalWorkingDays: 26, lopDays: 2, isPfApplicable: true,
    }, SETTINGS);
    expect(r.payDays).toBe(24);
    expect(r.basic).toBe(20769);            // round(45000×0.5/26×24) = round(20769.23)
    expect(r.grossSalary).toBe(41538);
    // PF base still above cap → PF unchanged
    expect(r.pfEmployee).toBe(1800);
  });

  it('below the PF cap, PF is computed on the actual wage base', () => {
    const r = computeEntry({
      monthlyPackage: 20000, totalWorkingDays: 26, isPfApplicable: true,
    }, SETTINGS);
    // basic 10000, da 4500 → base = 14500 × 60% = 8700 (< 15000 cap)
    expect(r.pfEmployee).toBe(1044);        // 8700 × 12%
  });

  it('advance and TDS deduct from net but not from gross', () => {
    const r = computeEntry({
      monthlyPackage: 45000, totalWorkingDays: 26,
      salaryAdvance: 5000, tds: 1000, lopDays: 2, isPfApplicable: true,
    }, SETTINGS);
    expect(r.grossSalary).toBe(41538);
    expect(r.totalDeductions).toBe(7800);   // 1800 PF + 5000 + 1000
    expect(r.netPayable).toBe(33738);
  });

  it('one-off allowances add to gross without touching statutory bases', () => {
    const base = computeEntry({ monthlyPackage: 30000, totalWorkingDays: 26, isEsiEligible: true }, SETTINGS);
    const withNet = computeEntry({
      monthlyPackage: 30000, totalWorkingDays: 26, isEsiEligible: true,
      internetAllowance: 500, salaryArrearAllowance: 1200,
    }, SETTINGS);
    expect(withNet.grossSalary).toBe(base.grossSalary + 1700);
    expect(withNet.esiEmployee).toBe(base.esiEmployee); // ESI base excludes one-offs
  });

  it('zero working days never divides by zero', () => {
    const r = computeEntry({ monthlyPackage: 45000, totalWorkingDays: 0 }, SETTINGS);
    expect(r.basic).toBe(0);
    expect(r.netPayable).toBe(0);
  });

  it('unmatched employer PF computes independently', () => {
    const r = computeEntry({
      monthlyPackage: 45000, totalWorkingDays: 26, isPfApplicable: true,
    }, { ...SETTINGS, pfEmployerMatchesEmployee: false, pfEmployerPercent: 13 });
    expect(r.pfEmployee).toBe(1800);
    expect(r.pfEmployer).toBe(1950);        // 15000 × 13%
  });
});

describe('amountInWords — Indian numbering', () => {
  it.each([
    [0, 'Zero Rupees Only'],
    [7, 'Seven Rupees Only'],
    [19, 'Nineteen Rupees Only'],
    [45000, 'Forty Five Thousand Rupees Only'],
    [34738, 'Thirty Four Thousand Seven Hundred Thirty Eight Rupees Only'],
    [100000, 'One Lakh Rupees Only'],
    [590000, 'Five Lakh Ninety Thousand Rupees Only'],
    [14183492, 'One Crore Forty One Lakh Eighty Three Thousand Four Hundred Ninety Two Rupees Only'],
  ])('%d → %s', (amount, words) => {
    expect(amountInWords(amount)).toBe(words);
  });

  it('rounds paise to the nearest rupee', () => {
    expect(amountInWords(99.6)).toBe('One Hundred Rupees Only');
  });
});
