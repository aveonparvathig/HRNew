// Income-tax declarations: how declared and approved amounts turn into
// the deductions the tax engine uses. Pure, DB-independent.
import { TaxProfileLike } from './taxCalc';

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface DeclarationItemLike {
  id: string;
  name: string;
  section: string;
  group: string; // SECTION_80C | OTHER
  maxAmount: number | null;
  deductPercent: number;
}

export interface DeclarationLineLike {
  itemId: string;
  declaredAmount: number;
  approvedAmount: number | null;
}

// The amount that counts: what HR approved once proofs are considered
// (nothing approved counts as nil), otherwise what was declared.
export const lineAmount = (line: DeclarationLineLike, usePoi: boolean) =>
  (usePoi ? line.approvedAmount ?? 0 : line.declaredAmount);

// Deduction a line gives: capped at the item's own limit, then the
// deductible share (e.g. 50% for some donations).
export function lineDeduction(line: DeclarationLineLike, item: DeclarationItemLike, usePoi: boolean): number {
  const amount = Math.max(0, lineAmount(line, usePoi));
  const capped = item.maxAmount == null ? amount : Math.min(amount, item.maxAmount);
  return r2((capped * item.deductPercent) / 100);
}

export interface SectionTotal {
  section: string;
  declared: number;
  approved: number;
  allowed: number; // what feeds the tax computation
}

// Totals by engine group and by section. The Section 80C pool is capped
// together with PF later, inside the tax engine.
export function declarationTotals(lines: DeclarationLineLike[], items: DeclarationItemLike[], usePoi: boolean) {
  const byId = new Map(items.map(i => [i.id, i]));
  let section80C = 0;
  let otherDeductions = 0;
  const sections = new Map<string, SectionTotal>();
  for (const line of lines) {
    const item = byId.get(line.itemId);
    if (!item) continue;
    const allowed = lineDeduction(line, item, usePoi);
    if (item.group === 'SECTION_80C') section80C += allowed; else otherDeductions += allowed;
    const row = sections.get(item.section) || { section: item.section, declared: 0, approved: 0, allowed: 0 };
    row.declared = r2(row.declared + line.declaredAmount);
    row.approved = r2(row.approved + (line.approvedAmount ?? 0));
    row.allowed = r2(row.allowed + allowed);
    sections.set(item.section, row);
  }
  return {
    section80C: r2(section80C),
    otherDeductions: r2(otherDeductions),
    bySection: [...sections.values()].sort((a, b) => a.section.localeCompare(b.section, 'en', { numeric: true })),
  };
}

export interface DeclarationProfileLike {
  prevEmployerIncome: number;
  prevEmployerTds: number;
  otherIncome: number;
  annualRentPaid: number;
  isMetro: boolean;
  housingLoanInterest: number;
  poiConsidered: boolean;
  rentApproved: number | null;
  housingInterestApproved: number | null;
}

// What the tax engine should use for an employee: declared figures, or
// the approved ones once their proofs are being considered.
export function effectiveTaxProfile(
  profile: DeclarationProfileLike, lines: DeclarationLineLike[], items: DeclarationItemLike[],
): TaxProfileLike {
  const usePoi = profile.poiConsidered;
  const totals = declarationTotals(lines, items, usePoi);
  return {
    prevEmployerIncome: profile.prevEmployerIncome,
    prevEmployerTds: profile.prevEmployerTds,
    otherIncome: profile.otherIncome,
    annualRentPaid: usePoi ? profile.rentApproved ?? 0 : profile.annualRentPaid,
    isMetro: profile.isMetro,
    section80C: totals.section80C,
    otherDeductions: totals.otherDeductions,
    housingLoanInterest: usePoi ? profile.housingInterestApproved ?? 0 : profile.housingLoanInterest,
  };
}

// The one-off dates on a year's declaration control that have come due:
// the window closes after its lock date, proofs open from their month.
// Each date clears itself once it has acted, so a window opened or closed
// by hand afterwards stays as HR left it.
export function dueControlChanges(
  control: { declarationOpen: boolean; proofOpen: boolean; declarationLockOn?: string | null; proofOpenFrom?: string | null },
  today: string,
): { declarationOpen?: boolean; declarationLockOn?: null; proofOpen?: boolean; proofOpenFrom?: null } | null {
  const patch: any = {};
  if (control.declarationLockOn && today > control.declarationLockOn) {
    patch.declarationLockOn = null;
    if (control.declarationOpen) patch.declarationOpen = false;
  }
  if (control.proofOpenFrom && today.slice(0, 7) >= control.proofOpenFrom) {
    patch.proofOpenFrom = null;
    if (!control.proofOpen) patch.proofOpen = true;
  }
  return Object.keys(patch).length ? patch : null;
}

// Items that need a proof and have an amount but none attached.
export function itemsMissingProof(
  lines: { itemId: string; amount: number }[],
  items: { id: string; name: string; proofRequired?: boolean }[],
  proofCount: Map<string, number>,
): string[] {
  const required = new Map(items.filter(i => i.proofRequired).map(i => [i.id, i.name]));
  return lines
    .filter(l => l.amount > 0 && required.has(l.itemId) && !(proofCount.get(l.itemId) || 0))
    .map(l => required.get(l.itemId)!);
}

// Landlord's PAN must be given when the year's rent is above one lakh.
export const LANDLORD_PAN_RENT_LIMIT = 100000;
export const rentNeedsLandlordPan = (annualRent: number) => annualRent > LANDLORD_PAN_RENT_LIMIT;

// Starter catalogue. Section numbers under the Income-tax Act, 2025 are
// noted beside the familiar ones. Caps are the usual statutory limits,
// each on its own item: limits shared between items (such as the health
// check-up inside the medical-insurance limit) are for HR to apply when
// approving. Where the law gives a higher limit for senior citizens or
// severe disability, the two cases are separate items. Review them each year.
export const DEFAULT_DECLARATION_ITEMS: [string, string, string, string, string, number | null, number][] = [
  // code, name, section, sectionNew, group, maxAmount, deductPercent
  ['LIFE_INSURANCE', 'Life insurance premium', '80C', '123', 'SECTION_80C', 150000, 100],
  ['PPF', 'Public Provident Fund', '80C', '123', 'SECTION_80C', 150000, 100],
  ['ELSS', 'ELSS / tax-saving mutual funds', '80C', '123', 'SECTION_80C', 150000, 100],
  ['TUITION_FEES', 'Children’s tuition fees', '80C', '123', 'SECTION_80C', 150000, 100],
  ['HOME_LOAN_PRINCIPAL', 'Housing loan principal repayment', '80C', '123', 'SECTION_80C', 150000, 100],
  ['NSC', 'National Savings Certificate', '80C', '123', 'SECTION_80C', 150000, 100],
  ['TAX_SAVER_FD', 'Five-year tax-saving fixed deposit', '80C', '123', 'SECTION_80C', 150000, 100],
  ['SUKANYA', 'Sukanya Samriddhi Yojana', '80C', '123', 'SECTION_80C', 150000, 100],
  ['ULIP', 'Unit-linked insurance plan (ULIP)', '80C', '123', 'SECTION_80C', 150000, 100],
  ['STAMP_DUTY', 'Stamp duty and registration charges', '80C', '123', 'SECTION_80C', 150000, 100],
  ['PENSION_FUND', 'Contribution to pension fund', '80CCC', '123', 'SECTION_80C', 150000, 100],
  ['NPS_EMPLOYEE', 'Employee contribution to NPS', '80CCD(1)', '124(5)', 'SECTION_80C', 150000, 100],
  ['NPS_ADDITIONAL', 'Additional contribution to NPS', '80CCD(1B)', '124(3)', 'OTHER', 50000, 100],
  ['MEDICLAIM_SELF', 'Medical insurance — self and family', '80D', '126', 'OTHER', 25000, 100],
  ['MEDICLAIM_PARENTS_BELOW_60', 'Medical insurance — parents (below 60)', '80D', '126', 'OTHER', 25000, 100],
  ['MEDICLAIM_PARENTS', 'Medical insurance — parents (senior citizens)', '80D', '126', 'OTHER', 50000, 100],
  ['HEALTH_CHECKUP', 'Preventive health check-up', '80D', '126', 'OTHER', 5000, 100],
  ['DISABLED_DEPENDANT_40', 'Dependant with disability (40% to 80%)', '80DD', '127', 'OTHER', 75000, 100],
  ['DISABLED_DEPENDANT', 'Dependant with severe disability (80% or more)', '80DD', '127', 'OTHER', 125000, 100],
  ['SPECIFIED_DISEASE_BELOW_60', 'Treatment of specified disease (patient below 60)', '80DDB', '128', 'OTHER', 40000, 100],
  ['SPECIFIED_DISEASE', 'Treatment of specified disease (senior citizen)', '80DDB', '128', 'OTHER', 100000, 100],
  ['EDUCATION_LOAN', 'Interest on education loan', '80E', '129', 'OTHER', null, 100],
  ['EV_LOAN', 'Interest on electric-vehicle loan', '80EEB', '132', 'OTHER', 150000, 100],
  ['DONATION_FULL', 'Donations — fully deductible', '80G', '133', 'OTHER', null, 100],
  ['DONATION_HALF', 'Donations — 50% deductible', '80G', '133', 'OTHER', null, 50],
  ['SAVINGS_INTEREST', 'Interest on savings account', '80TTA', '153(2)(A)', 'OTHER', 10000, 100],
  ['SELF_DISABILITY_40', 'Own disability (40% to 80%)', '80U', '154', 'OTHER', 75000, 100],
  ['SELF_DISABILITY', 'Own severe disability (80% or more)', '80U', '154', 'OTHER', 125000, 100],
];
