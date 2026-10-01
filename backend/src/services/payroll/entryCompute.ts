// Full computation of a payslip entry: the salary engine and catalogue
// lines, plus everything that depends on other records — state policies
// and earlier months (Professional Tax, Labour Welfare Fund, ESI
// coverage), the loan ledger, and income tax for the year (TDS).
import { prisma } from '../../config/database';
import { EntryInputs } from '../payrollCalc';
import { computeEntryWithLines, LineAmount } from './lines';
import { fullMonthEsiWage } from './checks';
import { loanDueByPerson } from './loanLedger';
import { TaxContext, loadTaxContext, tdsForEntry } from './taxContext';
import {
  halfYearOf, policyInForce, professionalTaxForMonth, lwfForMonth, esiCovered, PriorMonth,
} from './statutoryCalc';

interface PriorEntry extends PriorMonth {
  esiCovered: boolean;
}

export interface StatutoryContext {
  period: string;
  settings: any;
  ptPolicies: any[];
  lwfPolicies: any[];
  // Each employee's entries from earlier months of the same half-year
  priorByPerson: Map<string, PriorEntry[]>;
  // Loan instalments falling due this month, per employee
  loanDue: Map<string, number>;
  // Present once TDS is computed for this month; null while it is typed by hand
  tax: TaxContext | null;
}

export async function loadStatutoryContext(organizationId: string, period: string): Promise<StatutoryContext> {
  const earlier = halfYearOf(period).periods.filter(p => p < period);
  const [settings, ptPolicies, lwfPolicies, loanDue, entries] = await Promise.all([
    prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} }),
    prisma.ptPolicy.findMany({ where: { organizationId }, include: { slabs: true } }),
    prisma.lwfPolicy.findMany({ where: { organizationId } }),
    loanDueByPerson(organizationId, period),
    earlier.length
      ? prisma.payslipEntry.findMany({
        where: { organizationId, run: { period: { in: earlier } } },
        select: {
          personId: true, grossSalary: true, professionalTax: true,
          isEsiEligible: true, esiEmployee: true, run: { select: { period: true } },
        },
      })
      : Promise.resolve([]),
  ]);
  const priorByPerson = new Map<string, PriorEntry[]>();
  for (const e of entries) {
    const list = priorByPerson.get(e.personId) || [];
    list.push({
      period: e.run.period, grossSalary: e.grossSalary, professionalTax: e.professionalTax,
      esiCovered: e.isEsiEligible && e.esiEmployee > 0,
    });
    priorByPerson.set(e.personId, list);
  }
  const tax = await loadTaxContext(organizationId, period, settings);
  return { period, settings, ptPolicies, lwfPolicies, priorByPerson, loanDue, tax };
}

export const coveredEarlier = (ctx: StatutoryContext, personId: string) =>
  (ctx.priorByPerson.get(personId) || []).some(p => p.esiCovered);

// ESI flag for a new entry: the employee's own flag, or — with automatic
// coverage switched on — the wage-ceiling and contribution-period rule.
export function esiFlagFor(ctx: StatutoryContext, person: { id: string; isEsiEligible: boolean }, inputs: EntryInputs): boolean {
  if (!ctx.settings.esiAutoCoverage) return person.isEsiEligible;
  return esiCovered(fullMonthEsiWage(inputs, ctx.settings), ctx.settings.esiWageCeiling, coveredEarlier(ctx, person.id));
}

export interface ComputeOptions {
  personId: string;
  state?: string | null;       // state of the employee's work location
  ptOverride?: number | null;  // a manually entered Professional Tax
  tdsOverride?: number | null; // under computed TDS, an amount typed over it
}

// Everything to store on the entry. Statutory amounts need the gross, so
// the engine runs once without them and once with. Loan instalments come
// straight from the ledger.
export function computeFullEntry(ctx: StatutoryContext, inputs: EntryInputs, lines: LineAmount[], opts: ComputeOptions) {
  const bare = computeEntryWithLines(
    { ...inputs, professionalTax: 0, lwfEmployee: 0, lwfEmployer: 0, loanDeduction: 0 }, ctx.settings, lines,
  );
  let professionalTax = 0;
  let lwf = { lwfEmployee: 0, lwfEmployer: 0 };
  if (opts.state) {
    const ptPolicy = policyInForce(ctx.ptPolicies, opts.state, ctx.period);
    if (ptPolicy) {
      professionalTax = professionalTaxForMonth(
        ptPolicy, ctx.period, bare.grossSalary, ctx.priorByPerson.get(opts.personId) || [],
      );
    }
    const lwfPolicy = policyInForce(ctx.lwfPolicies, opts.state, ctx.period);
    if (lwfPolicy && bare.grossSalary > 0) lwf = lwfForMonth(lwfPolicy, ctx.period);
  }
  if (opts.ptOverride != null) professionalTax = opts.ptOverride;

  const statutory = { professionalTax, ...lwf, loanDeduction: ctx.loanDue.get(opts.personId) || 0 };
  if (!ctx.tax) {
    // TDS stays whatever was typed on the entry
    return {
      ...computeEntryWithLines({ ...inputs, ...statutory }, ctx.settings, lines),
      ...statutory,
    };
  }
  const beforeTax = computeEntryWithLines({ ...inputs, ...statutory, tds: 0 }, ctx.settings, lines);
  const tds = tdsForEntry(
    ctx.tax, ctx.settings, opts.personId, inputs, beforeTax, professionalTax, lines, opts.tdsOverride ?? null,
  );
  return {
    ...computeEntryWithLines({ ...inputs, ...statutory, tds }, ctx.settings, lines),
    ...statutory,
    tds,
  };
}
