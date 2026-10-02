// A financial year as it actually turned out, per employee: the salary
// paid, the declarations, the tax for the year and what was deducted.
// Feeds Form 16, Form 12BA and the annual part of the TDS return.
import { prisma } from '../../config/database';
import { financialYearFor, periodsOfFinancialYear } from './financialYear';
import {
  taxConfigsFor, taxableGrossOf, loanPerquisites, typedPerquisiteValues, exemptKeysOf, componentAmounts,
} from './taxContext';
import { PerquisiteLike, typedPerquisites } from './perquisiteCalc';
import { MonthFigures, EMPTY_TAX_PROFILE, ageAtYearEnd, hasValidPan, yearEndTax } from './taxCalc';
import { LandlordLike, cleanLandlords, declarationTotals, effectiveTaxProfile } from './declarationCalc';
import { form16PartB } from './tdsReturnCalc';

export interface AnnualTax {
  person: {
    id: string; name: string; employeeNo: string; designation: string; panNumber: string;
    address: string; joinDate: string | null; leavingDate: string | null;
  };
  hasValidPan: boolean;
  regime: string;
  employedFrom: string;   // within the financial year
  employedTo: string;
  months: MonthFigures[];
  working: ReturnType<typeof yearEndTax>;
  form: ReturnType<typeof form16PartB>;
  landlord: { rent: number; name: string; pan: string };
  landlords: LandlordLike[];   // up to four, with the rent paid to each
  lender: { interest: number; name: string; pan: string };
  loanPerquisite: number;
  perquisiteValues: PerquisiteLike[]; // typed, by Form 12BA line
  usePoi: boolean;
}

// Everyone paid in the year through finalized runs (or one employee).
// `draftPeriods` lists months of the year that are not finalized yet and
// are therefore left out.
export async function annualTaxFor(organizationId: string, fyStart: number, personId?: string) {
  const fy = financialYearFor(fyStart);
  const periods = periodsOfFinancialYear(fyStart);
  const [settings, configs, profiles, items, entries, components, runs] = await Promise.all([
    prisma.payrollSettings.upsert({ where: { organizationId }, create: { organizationId }, update: {} }),
    taxConfigsFor(organizationId, fyStart),
    prisma.employeeTaxProfile.findMany({
      where: { organizationId, fyStart, ...(personId ? { personId } : {}) }, include: { lines: true },
    }),
    prisma.declarationItem.findMany({ where: { organizationId } }),
    prisma.payslipEntry.findMany({
      where: {
        organizationId, ...(personId ? { personId } : {}),
        consultantSection: '', // fees to consultants are not salary
        run: { period: { in: periods }, status: 'FINALIZED' },
      },
      include: {
        run: { select: { period: true } },
        lines: { select: { type: true, amount: true, componentId: true } },
        person: { select: {
          id: true, name: true, employeeNo: true, designation: true, panNumber: true, address: true,
          joinDate: true, leavingDate: true, dateOfBirth: true,
        } },
      },
    }),
    prisma.payComponent.findMany({ where: { organizationId, taxable: false, type: 'EARNING' }, select: { id: true } }),
    prisma.payrollRun.findMany({ where: { organizationId, period: { in: periods } }, select: { period: true, status: true } }),
  ]);
  const [perquisites, typed] = await Promise.all([
    loanPerquisites(organizationId, settings, fyStart, fy.end),
    typedPerquisiteValues(organizationId, fyStart, personId),
  ]);
  const nonTaxable = new Set(components.map(c => c.id));
  const exemptKeys = exemptKeysOf(items);
  const configByRegime = new Map(configs.map(c => [c.regime, c]));
  const profileByPerson = new Map(profiles.map(p => [p.personId, p]));

  const byPerson = new Map<string, typeof entries>();
  for (const e of entries) byPerson.set(e.personId, [...(byPerson.get(e.personId) || []), e]);

  const rows: AnnualTax[] = [];
  for (const list of byPerson.values()) {
    const person = list[0].person;
    const months: MonthFigures[] = list.map(e => ({
      period: e.run.period, taxableGross: taxableGrossOf(e, e.lines, nonTaxable),
      basic: e.basic, da: e.da, hra: e.hra, pfEmployee: e.pfEmployee,
      professionalTax: e.professionalTax, tds: e.tds,
      components: componentAmounts(e, e.lines, exemptKeys),
      npsEmployer: e.npsEmployer,
    })).sort((a, b) => a.period.localeCompare(b.period));
    const profile = profileByPerson.get(person.id);
    const chosen = profile?.regime && configByRegime.has(profile.regime) ? profile.regime : settings.defaultTaxRegime || 'NEW';
    const config = configByRegime.get(chosen) || configs[0];
    const usePoi = Boolean(profile?.poiConsidered);
    const loanPerquisite = perquisites.get(person.id) || 0;
    const perquisiteValues = typed.get(person.id) || [];
    const rent = usePoi ? profile?.rentApproved ?? 0 : profile?.annualRentPaid ?? 0;
    const named = cleanLandlords(profile?.landlords);
    const working = yearEndTax({
      config, fyLabel: fy.label, months, settings,
      profile: profile ? effectiveTaxProfile(profile, profile.lines, items) : EMPTY_TAX_PROFILE,
      perquisites: loanPerquisite + typedPerquisites(perquisiteValues),
      age: ageAtYearEnd(person.dateOfBirth, fyStart),
      hasValidPan: hasValidPan(person.panNumber),
    });
    const bySection = profile ? declarationTotals(profile.lines, items, usePoi).bySection : [];
    const yearStart = `${fyStart}-04-01`;
    const yearEnd = `${fyStart + 1}-03-31`;
    rows.push({
      person: { ...person, employeeNo: person.employeeNo || '', designation: person.designation || '', address: person.address || '' },
      hasValidPan: hasValidPan(person.panNumber),
      regime: config.regime,
      employedFrom: person.joinDate && person.joinDate > yearStart ? person.joinDate : yearStart,
      employedTo: person.leavingDate && person.leavingDate < yearEnd ? person.leavingDate : yearEnd,
      months, working,
      form: form16PartB({ working, bySection, usePoi, allowsDeductions: config.allowsExemptions }),
      landlord: { rent, name: profile?.landlordName || '', pan: profile?.landlordPan || '' },
      // One landlord on record takes the whole of the year's rent
      landlords: named.length > 1 ? named
        : rent > 0 ? [{ name: profile?.landlordName || '', pan: profile?.landlordPan || '', address: named[0]?.address || '', rent }] : [],
      lender: {
        interest: usePoi ? profile?.housingInterestApproved ?? 0 : profile?.housingLoanInterest ?? 0,
        name: profile?.lenderName || '', pan: profile?.lenderPan || '',
      },
      loanPerquisite, perquisiteValues, usePoi,
    });
  }
  rows.sort((a, b) => a.person.name.localeCompare(b.person.name));
  return {
    fy, rows,
    draftPeriods: runs.filter(r => r.status !== 'FINALIZED').map(r => r.period).sort(),
    monthsRun: runs.filter(r => r.status === 'FINALIZED').length,
  };
}
