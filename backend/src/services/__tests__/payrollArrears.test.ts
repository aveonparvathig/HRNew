import { describe, it, expect } from 'vitest';
import {
  arrearFor, hasArrear, sumArrears, arrearLines, lopReversalFrom,
  serviceLength, gratuityYears, gratuityAmount, leaveEncashmentAmount, noticeAmounts,
  settlementPayDays, settlementLines,
} from '../payroll/arrearCalc';
import { computeEntry } from '../payrollCalc';

const SETTINGS = {
  basicPercentOfPackage: 50, daPercentOfBasic: 45, hraPercentOfBasic: 25,
  transportPercentOfBasic: 20, foodPercentOfBasic: 10, esiEmployeePercent: 0.75, esiEmployerPercent: 3.25,
  pfEmployeePercent: 12, pfEmployerPercent: 12, pfWageCap: 15000, pfWageFactor: 60, pfEmployerMatchesEmployee: true,
};
const month = (over: any = {}) => ({
  monthlyPackage: 20000, totalWorkingDays: 30, empLeaveDays: 0, lopDays: 0,
  isEsiEligible: false, isPfApplicable: true, ...over,
});

describe('arrears for a back-dated revision', () => {
  it('is the difference between the month at the new package and as paid', () => {
    const a = arrearFor(month(), { monthlyPackage: 24000, lopDays: 0 }, SETTINGS);
    const was = computeEntry(month(), SETTINGS);
    const now = computeEntry(month({ monthlyPackage: 24000 }), SETTINGS);
    expect(a.basic).toBe(now.basic - was.basic);
    expect(a.basic).toBe(2000);
    expect(a.gross).toBe(Math.round((now.grossSalary - was.grossSalary) * 100) / 100);
    expect(a.gross).toBe(4000);
    expect(a.pfEmployee).toBe(Math.round((now.pfEmployee - was.pfEmployee) * 100) / 100);
    expect(a.pfEmployer).toBe(a.pfEmployee);
    expect(a.esiEmployee).toBe(0);
    expect(hasArrear(a)).toBe(true);
  });

  it('follows the month’s own attendance: loss of pay reduces the arrear too', () => {
    const full = arrearFor(month(), { monthlyPackage: 24000, lopDays: 0 }, SETTINGS);
    const withLop = arrearFor(month({ lopDays: 6 }), { monthlyPackage: 24000, lopDays: 6 }, SETTINGS);
    expect(withLop.basic).toBe(1600); // 24 of 30 days
    expect(withLop.gross).toBeLessThan(full.gross);
  });

  it('stops PF once the wage cap is reached, and adds ESI where the month had it', () => {
    const capped = arrearFor(month({ monthlyPackage: 60000 }), { monthlyPackage: 70000, lopDays: 0 }, SETTINGS);
    expect(capped.gross).toBe(10000);
    expect(capped.pfEmployee).toBe(0); // PF wage was already at the cap
    const esi = arrearFor(month({ isEsiEligible: true, isPfApplicable: false }), { monthlyPackage: 21000, lopDays: 0 }, SETTINGS);
    expect(esi.esiEmployee).toBe(8);   // ceil(21000 × 0.75%) − ceil(20000 × 0.75%)
    expect(esi.esiEmployer).toBe(683 - 650);
  });

  it('pays only what has not been raised already', () => {
    const first = arrearFor(month(), { monthlyPackage: 22000, lopDays: 0 }, SETTINGS);
    const second = arrearFor(month(), { monthlyPackage: 24000, lopDays: 0 }, SETTINGS, [first]);
    expect(first.gross).toBe(2000);
    expect(second.gross).toBe(2000);
    const none = arrearFor(month(), { monthlyPackage: 24000, lopDays: 0 }, SETTINGS, [first, second]);
    expect(hasArrear(none)).toBe(false);
  });

  it('is nil when nothing changed', () => {
    expect(hasArrear(arrearFor(month(), { monthlyPackage: 20000, lopDays: 0 }, SETTINGS))).toBe(false);
  });
});

describe('loss-of-pay reversal', () => {
  it('pays back the days reversed, at that month’s package', () => {
    const a = arrearFor(month({ lopDays: 3 }), { monthlyPackage: 20000, lopDays: 1 }, SETTINGS);
    expect(a.basic).toBe(667);      // 2 days of 10,000 / 30, as the engine rounds each side
    expect(a.gross).toBe(1334);
    expect(a.pfEmployee).toBeGreaterThan(0);
  });

  it('combines with a revision of the same month without paying twice', () => {
    const revision = arrearFor(month({ lopDays: 3 }), { monthlyPackage: 24000, lopDays: 3 }, SETTINGS);
    const reversal = arrearFor(month({ lopDays: 3 }), { monthlyPackage: 24000, lopDays: 0 }, SETTINGS, [revision]);
    const both = arrearFor(month({ lopDays: 3 }), { monthlyPackage: 24000, lopDays: 0 }, SETTINGS);
    expect(Math.round((revision.gross + reversal.gross) * 100) / 100).toBe(both.gross);
  });

  it('knows how far back it may go', () => {
    expect(lopReversalFrom('2026-10', 6)).toBe('2026-04');
    expect(lopReversalFrom('2026-02', 6)).toBe('2025-08');
    expect(lopReversalFrom('2026-10', 0)).toBe('2026-10');
  });
});

describe('arrear lines on the payslip', () => {
  it('adds items up into earnings, PF and ESI', () => {
    const items = [
      arrearFor(month(), { monthlyPackage: 24000, lopDays: 0 }, SETTINGS),
      arrearFor(month({ totalWorkingDays: 31 }), { monthlyPackage: 24000, lopDays: 0 }, SETTINGS),
    ];
    const total = sumArrears(items);
    const lines = arrearLines(items);
    expect(lines.earnings).toBe(total.gross);
    expect(lines.pf).toBe(total.pfEmployee);
    expect(lines.net).toBe(Math.round((total.gross - total.pfEmployee - total.esiEmployee) * 100) / 100);
    expect(arrearLines([])).toEqual({ earnings: 0, pf: 0, esi: 0, net: 0 });
  });
});

describe('service and gratuity', () => {
  it('measures service with the last day included', () => {
    expect(serviceLength('2020-04-01', '2026-03-31')).toMatchObject({ years: 6, months: 0, days: 0 });
    expect(serviceLength('2021-01-15', '2026-10-20')).toMatchObject({ years: 5, months: 9, days: 6 });
    expect(serviceLength('2022-03-31', '2026-10-01')).toMatchObject({ years: 4, months: 6, days: 1 });
    expect(serviceLength(null, '2026-10-01')).toMatchObject({ years: 0, totalYears: 0 });
    expect(serviceLength('2027-01-01', '2026-10-01').years).toBe(0);
  });

  it('counts a part-year over six months as a year', () => {
    expect(gratuityYears({ years: 5, months: 6, days: 0 })).toBe(5);
    expect(gratuityYears({ years: 5, months: 6, days: 1 })).toBe(6);
    expect(gratuityYears({ years: 5, months: 9, days: 6 })).toBe(6);
    expect(gratuityYears({ years: 7, months: 2, days: 20 })).toBe(7);
  });

  it('pays 15/26 of Basic + DA a year from five years of service', () => {
    const rules = { gratuityMinYears: 5, gratuityCap: 2000000 };
    expect(gratuityAmount(29000, { years: 5, months: 9, days: 6 }, rules)).toEqual({ eligible: true, years: 6, amount: 100385 });
    expect(gratuityAmount(29000, { years: 4, months: 11, days: 20 }, rules)).toEqual({ eligible: false, years: 5, amount: 0 });
    expect(gratuityAmount(500000, { years: 30, months: 0, days: 0 }, rules).amount).toBe(2000000); // capped
  });
});

describe('leave encashment and notice', () => {
  it('encashes leave on Basic + DA by the day', () => {
    expect(leaveEncashmentAmount(12, 29000, 30)).toBe(11600);
    expect(leaveEncashmentAmount(12, 29000, 26)).toBe(13385);
    expect(leaveEncashmentAmount(-3, 29000, 30)).toBe(0);
  });

  it('recovers notice not served and pays notice not wanted', () => {
    expect(noticeAmounts({ noticeDays: 60, noticeServedDays: 45, noticePayDays: 0 }, 60000, 30))
      .toEqual({ shortfallDays: 15, noticeRecovery: 30000, noticePay: 0 });
    expect(noticeAmounts({ noticeDays: 30, noticeServedDays: 30, noticePayDays: 10 }, 60000, 30))
      .toEqual({ shortfallDays: 0, noticeRecovery: 0, noticePay: 20000 });
    expect(noticeAmounts({ noticeDays: 30, noticeServedDays: 45, noticePayDays: 0 }, 60000, 30).noticeRecovery).toBe(0);
  });

  it('works out paid days in the last month', () => {
    expect(settlementPayDays('2026-10', '2026-10-20', 31)).toBe(20);
    expect(settlementPayDays('2026-10', '2026-10-31', 31)).toBe(31);
    expect(settlementPayDays('2026-10', '2026-10-20', 26)).toBe(17);    // 26 × 20/31, to the half day
    expect(settlementPayDays('2026-10', '2026-09-30', 31)).toBe(0);     // left in an earlier month: no salary
    expect(settlementPayDays('2026-10', '2026-11-15', 31)).toBeNull();  // still working that month
  });
});

describe('settlement lines', () => {
  const totals = { leaveEncashment: 11600, gratuity: 100385, noticePay: 0, noticeRecovery: 30000 };

  it('pays the totals on a first settlement', () => {
    expect(settlementLines(totals)).toEqual({
      leaveEncashment: 11600, gratuity: 100385, noticePay: 0, noticeRecovery: 30000,
      adjustmentPay: 0, adjustmentRecovery: 0, net: 81985,
    });
  });

  it('pays only the difference on a resettlement', () => {
    const corrected = { ...totals, leaveEncashment: 14500, noticeRecovery: 30000 };
    const lines = settlementLines(corrected, [totals]);
    expect(lines).toMatchObject({ leaveEncashment: 2900, gratuity: 0, noticeRecovery: 0, net: 2900 });
  });

  it('takes back an overpayment and refunds an over-recovery through adjustment lines', () => {
    const corrected = { leaveEncashment: 9000, gratuity: 100385, noticePay: 0, noticeRecovery: 20000 };
    const lines = settlementLines(corrected, [totals]);
    expect(lines.leaveEncashment).toBe(0);
    expect(lines.adjustmentRecovery).toBe(2600);
    expect(lines.adjustmentPay).toBe(10000);
    expect(lines.net).toBe(7400);
  });
});
