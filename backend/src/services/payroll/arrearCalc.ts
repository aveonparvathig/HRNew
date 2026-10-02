// Arrears and final settlement rules. Pure, DB-independent.
import { computeEntry } from '../payrollCalc';
import { addMonths } from './loanCalc';

const r0 = (n: number) => Math.round(n);
const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Arrears
// ---------------------------------------------------------------------------
export const ARREAR_FIELDS = [
  'basic', 'da', 'hra', 'transportAllowance', 'foodAllowance',
  'pfEmployee', 'pfEmployer', 'esiEmployee', 'esiEmployer',
] as const;
export type ArrearAmounts = Record<(typeof ARREAR_FIELDS)[number] | 'gross', number>;

const EARNING_FIELDS = ['basic', 'da', 'hra', 'transportAllowance', 'foodAllowance'] as const;

export interface PaidMonth {
  monthlyPackage: number;
  totalWorkingDays: number;
  empLeaveDays?: number;
  lopDays?: number;
  isEsiEligible?: boolean;
  isPfApplicable?: boolean;
}

const zero = (): ArrearAmounts => ({
  basic: 0, da: 0, hra: 0, transportAllowance: 0, foodAllowance: 0, gross: 0,
  pfEmployee: 0, pfEmployer: 0, esiEmployee: 0, esiEmployer: 0,
});

export function sumArrears(items: Partial<ArrearAmounts>[]): ArrearAmounts {
  const total = zero();
  for (const item of items) {
    for (const f of [...ARREAR_FIELDS, 'gross'] as const) total[f] = r2(total[f] + Number(item[f] || 0));
  }
  return total;
}

// What a past month should have paid, against what its inputs paid, less
// arrears already raised for it. Both sides are worked out with the same
// engine and settings, so the difference is only the package or the
// loss-of-pay days that changed. PF and ESI follow the month's own flags.
export function arrearFor(
  paid: PaidMonth, corrected: { monthlyPackage: number; lopDays: number }, settings: any,
  alreadyRaised: Partial<ArrearAmounts>[] = [],
): ArrearAmounts {
  const base = {
    totalWorkingDays: paid.totalWorkingDays, empLeaveDays: paid.empLeaveDays,
    isEsiEligible: paid.isEsiEligible, isPfApplicable: paid.isPfApplicable,
  };
  const was = computeEntry({ ...base, monthlyPackage: paid.monthlyPackage, lopDays: paid.lopDays }, settings);
  const now = computeEntry({ ...base, monthlyPackage: corrected.monthlyPackage, lopDays: corrected.lopDays }, settings);
  const raised = sumArrears(alreadyRaised);
  const out = zero();
  for (const f of ARREAR_FIELDS) out[f] = r2(now[f] - was[f] - raised[f]);
  out.gross = r2(EARNING_FIELDS.reduce((s, f) => s + out[f], 0));
  return out;
}

// Loss-of-pay days of a past month as they now stand: the days on the
// payslip, less those reversed since, plus those added since.
export function effectiveLop(lopDays: number, raised: { kind: string; lopDays: number; status?: string }[]): number {
  const open = raised.filter(i => !i.status || i.status === 'OPEN');
  const sum = (kind: string) => open.filter(i => i.kind === kind).reduce((s, i) => s + i.lopDays, 0);
  return r2(Math.max(0, lopDays - sum('LOP_REVERSAL') + sum('LOP_RECOVERY')));
}

// An item that takes pay back (retro loss of pay, a back-dated cut)
export const isRecovery = (a: { gross?: number }) => Number(a.gross || 0) < 0;

export const hasArrear = (a: ArrearAmounts) =>
  [...ARREAR_FIELDS, 'gross' as const].some(f => Math.abs(a[f]) >= 0.005);

// The payslip lines a set of arrears becomes. Items that pay and items
// that recover are kept apart, so a payslip shows both and not their net.
export function arrearLines(items: Partial<ArrearAmounts>[]) {
  const t = sumArrears(items);
  return { earnings: t.gross, pf: t.pfEmployee, esi: t.esiEmployee, net: r2(t.gross - t.pfEmployee - t.esiEmployee) };
}

export function arrearAndRecoveryLines(items: Partial<ArrearAmounts>[]) {
  return { pay: arrearLines(items.filter(i => !isRecovery(i))), recover: arrearLines(items.filter(isRecovery)) };
}

// The earliest month whose loss of pay can still be reversed when paying
// in `currentPeriod`: N months back.
export const lopReversalFrom = (currentPeriod: string, months: number) => addMonths(currentPeriod, -Math.max(0, months));

// ---------------------------------------------------------------------------
// Final settlement
// ---------------------------------------------------------------------------
const days = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);

// Service from the joining date to the last working day, both included.
export function serviceLength(joinDate: string | null | undefined, lastWorkingDate: string) {
  if (!joinDate || joinDate > lastWorkingDate) return { years: 0, months: 0, days: 0, totalYears: 0 };
  const [jy, jm, jd] = joinDate.split('-').map(Number);
  const [ly, lm, ld] = lastWorkingDate.split('-').map(Number);
  const end = new Date(Date.UTC(ly, lm - 1, ld + 1)); // the day after the last one, so the last day counts
  let years = end.getUTCFullYear() - jy;
  let months = end.getUTCMonth() + 1 - jm;
  let d = end.getUTCDate() - jd;
  if (d < 0) {
    months -= 1;
    d += new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 0)).getUTCDate(); // days in the month before
  }
  if (months < 0) { years -= 1; months += 12; }
  return { years, months, days: d, totalYears: r2((days(lastWorkingDate) + 1 - days(joinDate)) / 365.25) };
}

// Years that count for gratuity: completed years, with a part of more
// than six months counting as one more.
export function gratuityYears(service: { years: number; months: number; days: number }): number {
  return service.years + (service.months > 6 || (service.months === 6 && service.days > 0) ? 1 : 0);
}

// Gratuity = 15 days' wages for every year, a month being 26 days, on the
// last Basic + DA. Nothing below the minimum service; capped by law.
export function gratuityAmount(
  basicDa: number, service: { years: number; months: number; days: number },
  rules: { gratuityMinYears: number; gratuityCap: number },
): { eligible: boolean; years: number; amount: number } {
  const years = gratuityYears(service);
  const eligible = service.years >= rules.gratuityMinYears;
  const amount = eligible ? Math.min(r0((15 / 26) * basicDa * years), rules.gratuityCap || Infinity) : 0;
  return { eligible, years, amount };
}

export const leaveEncashmentAmount = (leaveDays: number, basicDa: number, dayBasis: number) =>
  r0((basicDa / (dayBasis || 30)) * Math.max(0, leaveDays));

// Notice not served is recovered; notice the employer does not want
// served is paid. Both at the monthly gross, by the day.
export function noticeAmounts(
  inp: { noticeDays: number; noticeServedDays: number; noticePayDays: number }, monthlyGross: number, dayBasis: number,
) {
  const perDay = monthlyGross / (dayBasis || 30);
  const shortfall = Math.max(0, inp.noticeDays - inp.noticeServedDays);
  return {
    shortfallDays: shortfall,
    noticeRecovery: r0(perDay * shortfall),
    noticePay: r0(perDay * Math.max(0, inp.noticePayDays)),
  };
}

// Paid days in the settlement month. Someone whose last working day
// falls in it is paid up to that date, scaled to the run's working days;
// someone who left in an earlier month is paid no salary in it. Null when
// the last day is still to come (the run's attendance stands).
export function settlementPayDays(period: string, lastWorkingDate: string, totalWorkingDays: number): number | null {
  const lastMonth = lastWorkingDate.slice(0, 7);
  if (lastMonth < period) return 0;
  if (lastMonth > period) return null;
  const [y, m] = period.split('-').map(Number);
  const monthDays = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const day = Number(lastWorkingDate.slice(8, 10));
  if (totalWorkingDays === monthDays) return day;
  return Math.min(totalWorkingDays, Math.round((totalWorkingDays * day / monthDays) * 2) / 2);
}

export interface SettlementTotals {
  leaveEncashment: number;
  gratuity: number;
  noticePay: number;
  noticeRecovery: number;
}

export const SETTLEMENT_KEYS = ['leaveEncashment', 'gratuity', 'noticePay', 'noticeRecovery'] as const;

// What this settlement adds to the payslip: its totals less what earlier
// settlements already paid or recovered. An amount that has to come back
// (an earning reduced, or a recovery reduced) goes to an adjustment line.
export function settlementLines(totals: SettlementTotals, earlier: SettlementTotals[] = []) {
  const before = (k: keyof SettlementTotals) => earlier.reduce((s, e) => s + Number(e[k] || 0), 0);
  const diff = (k: keyof SettlementTotals) => r2(Number(totals[k] || 0) - before(k));
  const out = { leaveEncashment: 0, gratuity: 0, noticePay: 0, noticeRecovery: 0, adjustmentPay: 0, adjustmentRecovery: 0 };
  for (const k of ['leaveEncashment', 'gratuity', 'noticePay'] as const) {
    const d = diff(k);
    if (d >= 0) out[k] = d; else out.adjustmentRecovery = r2(out.adjustmentRecovery - d);
  }
  const recovery = diff('noticeRecovery');
  if (recovery >= 0) out.noticeRecovery = recovery; else out.adjustmentPay = r2(-recovery);
  return {
    ...out,
    net: r2(out.leaveEncashment + out.gratuity + out.noticePay + out.adjustmentPay - out.noticeRecovery - out.adjustmentRecovery),
  };
}
