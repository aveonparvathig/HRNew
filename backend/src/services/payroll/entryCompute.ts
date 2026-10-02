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
  halfYearOf, policyInForce, ptPolicyInForce, professionalTaxForMonth, lwfForMonth, esiCovered, PriorMonth,
} from './statutoryCalc';
import { splitText, withSplit } from './structureCalc';
import { RecurringLike, RecurringLine, recurringLines } from './recurringCalc';
import { PersonStructure, structuresByPerson, recurringByPerson } from './structures';
import { CONSULTANT_SPLIT, CONSULTANT_STRUCTURE, consultantTds, employerNps } from './consultantCalc';
import { hasValidPan } from './taxCalc';

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
  // Employees whose pay is split by a structure template of their own
  structures?: Map<string, PersonStructure>;
  // Components paid or deducted every month, per employee
  recurring?: Map<string, RecurringLike[]>;
  // Filled in as entries are computed: the recurring lines each payslip
  // should carry, for saveRecurringLines
  recurringLines?: Map<string, RecurringLine[]>;
  // Employees the employer contributes to NPS for: the share of Basic + DA
  nps?: Map<string, number>;
  // Consultants: the section and rate tax is deducted at on their fee
  consultants?: Map<string, { section: string; percent: number; hasValidPan: boolean }>;
}

// Whether TDS is worked out for this person, rather than typed: always
// for a consultant, and for employees once computed TDS has started.
export const computesTds = (ctx: StatutoryContext, personId: string) =>
  Boolean(ctx.tax) || Boolean(ctx.consultants?.has(personId));

export async function loadStatutoryContext(organizationId: string, period: string): Promise<StatutoryContext> {
  const earlier = halfYearOf(period).periods.filter(p => p < period);
  const [settings, ptPolicies, lwfPolicies, loanDue, structures, recurring, special, entries] = await Promise.all([
    prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} }),
    prisma.ptPolicy.findMany({ where: { organizationId }, include: { slabs: true } }),
    prisma.lwfPolicy.findMany({ where: { organizationId } }),
    loanDueByPerson(organizationId, period),
    structuresByPerson(organizationId),
    recurringByPerson(organizationId, period),
    prisma.person.findMany({
      where: { organizationId, OR: [{ npsEmployerPercent: { gt: 0 } }, { taxTreatment: 'CONSULTANT' }] },
      select: { id: true, npsEmployerPercent: true, taxTreatment: true, consultantSection: true, consultantTdsPercent: true, panNumber: true },
    }),
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
  const consultants = new Map(special.filter(p => p.taxTreatment === 'CONSULTANT').map(p => [p.id, {
    section: p.consultantSection, percent: p.consultantTdsPercent, hasValidPan: hasValidPan(p.panNumber),
  }]));
  // A consultant gets no employer NPS: they are not on salary
  const nps = new Map(special.filter(p => p.npsEmployerPercent > 0 && p.taxTreatment !== 'CONSULTANT').map(p => [p.id, p.npsEmployerPercent]));
  return {
    period, settings, ptPolicies, lwfPolicies, priorByPerson, loanDue, tax, structures, recurring, recurringLines: new Map(),
    nps, consultants,
  };
}

// Payroll settings as they apply to one employee: the company's, with the
// split of their structure template when they have one.
export const settingsOf = (ctx: StatutoryContext, personId: string) =>
  withSplit(ctx.settings, ctx.structures?.get(personId)?.split);

export const coveredEarlier = (ctx: StatutoryContext, personId: string) =>
  (ctx.priorByPerson.get(personId) || []).some(p => p.esiCovered);

// ESI flag for a new entry: the employee's own flag, or — with automatic
// coverage switched on — the wage-ceiling and contribution-period rule.
export function esiFlagFor(ctx: StatutoryContext, person: { id: string; isEsiEligible: boolean }, inputs: EntryInputs): boolean {
  if (!ctx.settings.esiAutoCoverage) return person.isEsiEligible;
  return esiCovered(fullMonthEsiWage(inputs, settingsOf(ctx, person.id)), ctx.settings.esiWageCeiling, coveredEarlier(ctx, person.id));
}

export interface ComputeOptions {
  personId: string;
  state?: string | null;       // state of the employee's work location
  town?: string | null;        // its town, for Professional Tax set by the local body
  excludeFromPt?: boolean;     // the location pays no Professional Tax
  ptOverride?: number | null;  // a manually entered Professional Tax
  tdsOverride?: number | null; // under computed TDS, an amount typed over it
}

// What a work location tells the computation. Select these columns
// wherever an employee's location is loaded for payroll.
export const LOCATION_FOR_PAYROLL = { state: true, city: true, excludeFromPt: true } as const;
export const locationOptions = (location: { state: string; city: string; excludeFromPt: boolean } | null | undefined) => ({
  state: location?.state, town: location?.city, excludeFromPt: Boolean(location?.excludeFromPt),
});

// Everything to store on the entry. Statutory amounts need the gross, so
// the engine runs once without them and once with. Loan instalments come
// straight from the ledger.
export function computeFullEntry(ctx: StatutoryContext, inputs: EntryInputs, given: LineAmount[], opts: ComputeOptions) {
  const consultant = ctx.consultants?.get(opts.personId);
  if (consultant) return computeConsultantEntry(ctx, inputs, given, opts, consultant);
  // The employee's own split, when a structure template applies to them
  const structure = ctx.structures?.get(opts.personId);
  const settings = withSplit(ctx.settings, structure?.split);
  const npsPercent = ctx.nps?.get(opts.personId) || 0;
  // The employer's NPS contribution is a cost on top of pay, like employer PF
  const withNps = <T extends { basic: number; da: number; employerContributions: number; ctc: number }>(r: T) => {
    const npsEmployer = employerNps(r.basic, r.da, npsPercent);
    return {
      ...r, npsEmployer,
      employerContributions: Math.round((r.employerContributions + npsEmployer) * 100) / 100,
      ctc: Math.round((r.ctc + npsEmployer) * 100) / 100,
    };
  };
  const snapshot = {
    structureName: structure?.name || '', structureSplit: structure ? splitText(structure.split) : '',
    consultantSection: '', consultantTdsPercent: 0,
  };
  // Recurring lines are worked out afresh each time: the days may have changed
  const items = ctx.recurring?.get(opts.personId) || [];
  const kept = given.filter(l => l.source !== 'RECURRING');
  const recurring = recurringLines(items, ctx.period, inputs, new Set(kept.map(l => l.componentId || '')));
  ctx.recurringLines?.set(opts.personId, recurring);
  const lines = [...kept, ...recurring];

  const bare = computeEntryWithLines(
    { ...inputs, professionalTax: 0, lwfEmployee: 0, lwfEmployer: 0, loanDeduction: 0 }, settings, lines,
  );
  let professionalTax = 0;
  let lwf = { lwfEmployee: 0, lwfEmployer: 0 };
  if (opts.state) {
    const ptPolicy = opts.excludeFromPt ? undefined : ptPolicyInForce(ctx.ptPolicies, opts.state, opts.town, ctx.period);
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
      ...withNps(computeEntryWithLines({ ...inputs, ...statutory }, settings, lines)),
      ...statutory,
      ...snapshot,
    };
  }
  const beforeTax = withNps(computeEntryWithLines({ ...inputs, ...statutory, tds: 0 }, settings, lines));
  const tds = tdsForEntry(
    ctx.tax, settings, opts.personId, inputs, beforeTax, professionalTax, lines, opts.tdsOverride ?? null,
    { recurring: items, npsEmployerPercent: npsPercent },
  );
  return {
    ...withNps(computeEntryWithLines({ ...inputs, ...statutory, tds }, settings, lines)),
    ...statutory,
    tds,
    ...snapshot,
  };
}

// A consultant's month: the fee as one amount, no PF, ESI, Professional
// Tax or LWF, and tax at the flat rate of their section on the whole fee
// (recurring and typed earnings included). The income-tax working for
// salaries does not apply.
function computeConsultantEntry(
  ctx: StatutoryContext, inputs: EntryInputs, given: LineAmount[], opts: ComputeOptions,
  consultant: { section: string; percent: number; hasValidPan: boolean },
) {
  const settings = withSplit(ctx.settings, CONSULTANT_SPLIT);
  const fee = { ...inputs, isEsiEligible: false, isPfApplicable: false, professionalTax: 0, lwfEmployee: 0, lwfEmployer: 0 };
  const items = ctx.recurring?.get(opts.personId) || [];
  const kept = given.filter(l => l.source !== 'RECURRING');
  const recurring = recurringLines(items, ctx.period, inputs, new Set(kept.map(l => l.componentId || '')));
  ctx.recurringLines?.set(opts.personId, recurring);
  const lines = [...kept, ...recurring];
  const loanDeduction = ctx.loanDue.get(opts.personId) || 0;

  const beforeTax = computeEntryWithLines({ ...fee, loanDeduction, tds: 0 }, settings, lines);
  const flat = consultantTds(beforeTax.grossSalary, consultant.percent, consultant.hasValidPan);
  const tds = opts.tdsOverride ?? flat.tds;
  // No salary tax working is kept for a consultant
  ctx.tax?.workings.delete(opts.personId);
  return {
    ...computeEntryWithLines({ ...fee, loanDeduction, tds }, settings, lines),
    professionalTax: 0, lwfEmployee: 0, lwfEmployer: 0, loanDeduction, tds,
    isEsiEligible: false, isPfApplicable: false, npsEmployer: 0,
    structureName: CONSULTANT_STRUCTURE, structureSplit: splitText(CONSULTANT_SPLIT),
    consultantSection: consultant.section, consultantTdsPercent: flat.rate,
  };
}
