// What the TDS calculation needs from the database for one payroll month:
// the year's tax rules, each employee's tax details, what earlier months
// paid and deducted, and loan perquisites.
import { prisma } from '../../config/database';
import { financialYearOf, periodsOfFinancialYear } from './financialYear';
import { loanPerquisiteForMonth, perquisiteApplies, outstandingPrincipal } from './loanCalc';
import {
  DEFAULT_TAX_CONFIGS, EMPTY_TAX_PROFILE, MonthFigures, TaxConfigLike, TaxProfileLike,
  ageAtYearEnd, computeTds, hasValidPan,
} from './taxCalc';
import { effectiveTaxProfile } from './declarationCalc';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface TaxContext {
  fyStart: number;
  fyLabel: string;
  period: string;
  later: string[];                      // payroll months of the year after this one
  defaultRegime: string;
  configs: Map<string, TaxConfigLike>;  // by regime
  profiles: Map<string, TaxProfileLike & { regime: string }>;
  earlier: Map<string, MonthFigures[]>;
  people: Map<string, { dateOfBirth: string | null; leavingDate: string | null; panNumber: string }>;
  perquisites: Map<string, number>;
  nonTaxable: Set<string>;              // catalogue components that are not taxable income
  workings: Map<string, any>;           // filled in as entries are computed
}

// The regime configs of a financial year, created on first use: copied
// from the latest earlier year that has them, else from the built-ins.
export async function taxConfigsFor(organizationId: string, fyStart: number) {
  const include = { slabs: { orderBy: { incomeFrom: 'asc' as const } } };
  const existing = await prisma.taxRegimeConfig.findMany({ where: { organizationId, fyStart }, include });
  if (existing.length) return existing;
  const previous = await prisma.taxRegimeConfig.findFirst({
    where: { organizationId, fyStart: { lt: fyStart } }, orderBy: { fyStart: 'desc' },
  });
  const source: TaxConfigLike[] = previous
    ? await prisma.taxRegimeConfig.findMany({ where: { organizationId, fyStart: previous.fyStart }, include })
    : DEFAULT_TAX_CONFIGS;
  for (const c of source) {
    await prisma.taxRegimeConfig.create({
      data: {
        organizationId, fyStart, regime: c.regime,
        standardDeduction: c.standardDeduction, rebateIncomeLimit: c.rebateIncomeLimit,
        rebateMaxAmount: c.rebateMaxAmount, rebateMarginalRelief: c.rebateMarginalRelief,
        cessPercent: c.cessPercent, seniorExemption: c.seniorExemption,
        superSeniorExemption: c.superSeniorExemption, allowsExemptions: c.allowsExemptions,
        section80CLimit: c.section80CLimit, housingInterestLimit: c.housingInterestLimit,
        slabs: { create: c.slabs.map(s => ({
          incomeFrom: s.incomeFrom, incomeTo: s.incomeTo, ratePercent: s.ratePercent, surchargePercent: s.surchargePercent,
        })) },
      },
    });
  }
  return prisma.taxRegimeConfig.findMany({ where: { organizationId, fyStart }, include });
}

// Gross less catalogue earnings marked not taxable.
export function taxableGrossOf(entry: { grossSalary: number }, lines: any[], nonTaxable: Set<string>): number {
  const exempt = (lines || [])
    .filter(l => l.type !== 'DEDUCTION' && l.componentId && nonTaxable.has(l.componentId))
    .reduce((s, l) => s + Number(l.amount || 0), 0);
  return r2(entry.grossSalary - exempt);
}

// Taxable value for the year of loans charged below the benchmark rate.
export async function loanPerquisites(organizationId: string, settings: any, fyStart: number, period: string) {
  const result = new Map<string, number>();
  if (!(settings.loanBenchmarkRate > 0)) return result;
  const loans = await prisma.loan.findMany({
    where: { organizationId },
    include: { transactions: true, schedule: { where: { status: 'DUE' } } },
  });
  const lent = new Map<string, number>();
  for (const loan of loans) {
    const total = loan.transactions.filter(t => t.principal > 0).reduce((s, t) => s + t.principal, 0);
    lent.set(loan.personId, (lent.get(loan.personId) || 0) + total);
  }
  for (const loan of loans) {
    if (!perquisiteApplies(lent.get(loan.personId) || 0, settings.loanPerquisiteExemptLimit)) continue;
    const now = outstandingPrincipal(loan.transactions);
    let value = 0;
    for (const month of periodsOfFinancialYear(fyStart)) {
      // Balance at the start of the month: from the ledger up to this
      // payroll month, from the repayment plan after it.
      const balance = month <= period
        ? outstandingPrincipal(loan.transactions.filter(t => t.date < `${month}-01`))
        : now - loan.schedule.filter(l => l.period < month).reduce((s, l) => s + l.principal, 0);
      value += loanPerquisiteForMonth(balance, loan.annualRate, settings.loanBenchmarkRate);
    }
    if (value > 0) result.set(loan.personId, (result.get(loan.personId) || 0) + value);
  }
  return result;
}

// Null when TDS is still typed by hand for this month.
export async function loadTaxContext(organizationId: string, period: string, settings: any): Promise<TaxContext | null> {
  if (!settings.tdsAutoFrom || period < settings.tdsAutoFrom) return null;
  const fy = financialYearOf(period);
  const periods = periodsOfFinancialYear(fy.startYear);
  const before = periods.filter(p => p < period);
  const [configs, profiles, items, entries, people, components, perquisites] = await Promise.all([
    taxConfigsFor(organizationId, fy.startYear),
    prisma.employeeTaxProfile.findMany({ where: { organizationId, fyStart: fy.startYear }, include: { lines: true } }),
    prisma.declarationItem.findMany({ where: { organizationId } }),
    before.length
      ? prisma.payslipEntry.findMany({
        where: { organizationId, run: { period: { in: before } } },
        select: {
          personId: true, grossSalary: true, basic: true, da: true, hra: true,
          pfEmployee: true, professionalTax: true, tds: true,
          run: { select: { period: true } },
          lines: { select: { type: true, amount: true, componentId: true } },
        },
      })
      : Promise.resolve([]),
    prisma.person.findMany({
      where: { organizationId, isEmployee: true },
      select: { id: true, dateOfBirth: true, leavingDate: true, panNumber: true },
    }),
    prisma.payComponent.findMany({ where: { organizationId, taxable: false, type: 'EARNING' }, select: { id: true } }),
    loanPerquisites(organizationId, settings, fy.startYear, period),
  ]);

  const nonTaxable = new Set(components.map(c => c.id));
  const earlier = new Map<string, MonthFigures[]>();
  for (const e of entries) {
    const list = earlier.get(e.personId) || [];
    list.push({
      period: e.run.period, taxableGross: taxableGrossOf(e, e.lines, nonTaxable),
      basic: e.basic, da: e.da, hra: e.hra, pfEmployee: e.pfEmployee,
      professionalTax: e.professionalTax, tds: e.tds,
    });
    earlier.set(e.personId, list);
  }
  return {
    fyStart: fy.startYear, fyLabel: fy.label, period,
    later: periods.filter(p => p > period),
    defaultRegime: settings.defaultTaxRegime || 'NEW',
    configs: new Map(configs.map(c => [c.regime, c])),
    // Declared amounts, or the approved ones once proofs are considered
    profiles: new Map(profiles.map(p => [p.personId, { ...effectiveTaxProfile(p, p.lines, items), regime: p.regime }])),
    earlier,
    people: new Map(people.map(p => [p.id, p])),
    perquisites,
    nonTaxable,
    workings: new Map(),
  };
}

export const regimeOf = (tax: TaxContext, personId: string) => {
  const chosen = tax.profiles.get(personId)?.regime;
  return chosen && tax.configs.has(chosen) ? chosen : tax.defaultRegime;
};

// TDS for one employee this month. `computed` is the entry as the salary
// engine produced it (before TDS); `override` is a hand-typed amount.
// The working is kept on the context for saving alongside the entry.
export function tdsForEntry(
  tax: TaxContext, settings: any, personId: string,
  inputs: { monthlyPackage: number; isEsiEligible?: boolean; isPfApplicable?: boolean; salaryArrearAllowance?: number },
  computed: any, professionalTax: number, lines: any[], override: number | null,
): number {
  const config = tax.configs.get(regimeOf(tax, personId));
  if (!config) return override ?? 0;
  const person = tax.people.get(personId);
  const leavingMonth = person?.leavingDate ? person.leavingDate.slice(0, 7) : null;
  const monthsAfter = tax.later.filter(p => !leavingMonth || p <= leavingMonth).length;
  const oneTime = r2(Number(inputs.salaryArrearAllowance || 0) + (lines || [])
    .filter(l => l.type !== 'DEDUCTION' && !(l.componentId && tax.nonTaxable.has(l.componentId)))
    .reduce((s, l) => s + Number(l.amount || 0), 0));

  const result = computeTds({
    config, fyLabel: tax.fyLabel, period: tax.period, monthsAfter,
    earlier: tax.earlier.get(personId) || [],
    current: {
      period: tax.period, taxableGross: taxableGrossOf(computed, lines, tax.nonTaxable),
      basic: computed.basic, da: computed.da, hra: computed.hra, pfEmployee: computed.pfEmployee,
      professionalTax, tds: 0, oneTime: Math.min(oneTime, computed.grossSalary),
    },
    projection: {
      settings, monthlyPackage: inputs.monthlyPackage,
      isEsiEligible: Boolean(inputs.isEsiEligible), isPfApplicable: Boolean(inputs.isPfApplicable),
    },
    profile: tax.profiles.get(personId) || EMPTY_TAX_PROFILE,
    perquisites: tax.perquisites.get(personId) || 0,
    age: ageAtYearEnd(person?.dateOfBirth, tax.fyStart),
    hasValidPan: hasValidPan(person?.panNumber),
  });
  const tds = override ?? result.tds;
  tax.workings.set(personId, {
    ...result.working, computedTds: result.tds, tdsThisMonth: tds, overridden: override != null,
  });
  return tds;
}

// Store the workings gathered while computing a run's entries.
export async function saveTaxWorkings(tax: TaxContext | null, organizationId: string, runId: string) {
  if (!tax) return;
  for (const [personId, working] of tax.workings) {
    await prisma.taxComputation.upsert({
      where: { runId_personId: { runId, personId } },
      create: { organizationId, runId, personId, fyStart: tax.fyStart, period: tax.period, working },
      update: { working, fyStart: tax.fyStart, period: tax.period },
    });
  }
  tax.workings.clear();
}
