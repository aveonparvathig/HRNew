// Income-tax declarations: how declared and approved amounts turn into
// the deductions the tax engine uses. Pure, DB-independent.
import { ExemptionRuleLike, TaxProfileLike } from './taxCalc';

const r2 = (n: number) => Math.round(n * 100) / 100;

// How an item feeds the tax computation
export const ITEM_GROUPS = [
  { value: 'SECTION_80C', label: 'Deduction — Section 80C pool (shared limit, with PF)' },
  { value: 'OTHER', label: 'Deduction — its own limit' },
  { value: 'OTHER_INCOME', label: 'Other income (added to taxable income)' },
  { value: 'LET_OUT_INCOME', label: 'Income from let-out property' },
  { value: 'LET_OUT_LOSS', label: 'Loss from let-out property' },
  { value: 'TAX_CREDIT', label: 'Tax already deducted or collected elsewhere' },
  { value: 'EXEMPTION', label: 'Exempt allowance (a pay component, up to a limit)' },
];
export const isItemGroup = (value: any) => ITEM_GROUPS.some(g => g.value === value);
const DEDUCTION_GROUPS = new Set(['SECTION_80C', 'OTHER']);

export interface DeclarationItemLike {
  id: string;
  name: string;
  section: string;
  group: string; // see ITEM_GROUPS
  maxAmount: number | null;
  deductPercent: number;
  // EXEMPTION items: the pay component, what the limit is for, the regimes
  componentKey?: string | null;
  limitPeriod?: string | null;  // MONTH | YEAR
  regime?: string | null;       // OLD | BOTH
  proofRequired?: boolean;
  isActive?: boolean;
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
// together with PF later, inside the tax engine. Only deductions appear
// by section (the Chapter VI-A rows of Form 16); income, credits and
// allowance claims feed their own totals.
export function declarationTotals(lines: DeclarationLineLike[], items: DeclarationItemLike[], usePoi: boolean) {
  const byId = new Map(items.map(i => [i.id, i]));
  let section80C = 0;
  let otherDeductions = 0;
  let otherIncome = 0;
  let letOutIncome = 0;
  let letOutLoss = 0;
  let taxCredit = 0;
  const sections = new Map<string, SectionTotal>();
  for (const line of lines) {
    const item = byId.get(line.itemId);
    if (!item) continue;
    const allowed = lineDeduction(line, item, usePoi);
    if (!DEDUCTION_GROUPS.has(item.group)) {
      if (item.group === 'OTHER_INCOME') otherIncome += allowed;
      else if (item.group === 'LET_OUT_INCOME') letOutIncome += allowed;
      else if (item.group === 'LET_OUT_LOSS') letOutLoss += allowed;
      else if (item.group === 'TAX_CREDIT') taxCredit += allowed;
      continue;
    }
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
    otherIncome: r2(otherIncome),
    letOutIncome: r2(letOutIncome),
    letOutLoss: r2(letOutLoss),
    taxCredit: r2(taxCredit),
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
  rentByMonth?: any; // { "YYYY-MM": rent } when rent differs by month
}

// The allowance exemptions that apply to one employee: every active rule,
// with what the employee claimed where the rule needs a proof.
export function exemptionRulesFor(lines: DeclarationLineLike[], items: DeclarationItemLike[], usePoi: boolean): ExemptionRuleLike[] {
  const lineOf = new Map(lines.map(l => [l.itemId, l]));
  return items
    .filter(i => i.group === 'EXEMPTION' && i.componentKey && i.isActive !== false)
    .map(i => {
      const line = lineOf.get(i.id);
      return {
        name: i.name, key: String(i.componentKey), limit: i.maxAmount,
        period: i.limitPeriod === 'MONTH' ? 'MONTH' : 'YEAR', regime: i.regime === 'BOTH' ? 'BOTH' : 'OLD',
        claimed: i.proofRequired ? (line ? Math.max(0, lineAmount(line, usePoi)) : 0) : null,
      };
    });
}

// Month-wise rent as the tax engine takes it. Once proofs are considered,
// each month is scaled to the share of the year's rent that was approved.
export function rentByMonthFor(profile: DeclarationProfileLike): Record<string, number> | null {
  const raw = profile.rentByMonth;
  if (!raw || typeof raw !== 'object') return null;
  const months = Object.entries(raw as Record<string, any>).filter(([p, v]) => /^\d{4}-\d{2}$/.test(p) && Number(v) > 0);
  if (months.length === 0) return null;
  const declared = months.reduce((s, [, v]) => s + Number(v), 0);
  const factor = profile.poiConsidered ? Math.min(1, Math.max(0, Number(profile.rentApproved ?? 0)) / declared) : 1;
  return Object.fromEntries(months.map(([p, v]) => [p, r2(Number(v) * factor)]));
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
    otherIncome: r2(profile.otherIncome + totals.otherIncome),
    letOutIncome: totals.letOutIncome,
    letOutLoss: totals.letOutLoss,
    taxCredit: totals.taxCredit,
    rentByMonth: rentByMonthFor(profile),
    exemptions: exemptionRulesFor(lines, items, usePoi),
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

// Landlords of the year, as many as the return has room for
export const MAX_LANDLORDS = 4;
export interface LandlordLike {
  name: string;
  pan: string;
  address: string;
  rent: number;
}
const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// The landlords an employee typed, tidied: blank rows dropped.
export function cleanLandlords(raw: any): LandlordLike[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((l: any) => ({
    name: String(l?.name ?? '').trim(), pan: String(l?.pan ?? '').trim().toUpperCase(),
    address: String(l?.address ?? '').trim(), rent: r2(Number(l?.rent || 0)),
  })).filter(l => l.name || l.pan || l.address || l.rent);
}

// What is wrong with the landlords given for a year's rent, if anything.
export function landlordProblem(landlords: LandlordLike[], annualRent: number): string | null {
  if (landlords.length > MAX_LANDLORDS) return `Up to ${MAX_LANDLORDS} landlords can be given`;
  for (const l of landlords) {
    if (!l.name) return 'Enter the name of each landlord';
    if (!isFinite(l.rent) || l.rent < 0) return 'Rent cannot be negative';
    if (l.pan && !PAN.test(l.pan)) return `${l.name}: the PAN must look like ABCDE1234F`;
    if (rentNeedsLandlordPan(annualRent) && !l.pan) {
      return `${l.name}: the landlord’s PAN is required when the year’s rent is above ₹1,00,000`;
    }
  }
  const paid = r2(landlords.reduce((s, l) => s + l.rent, 0));
  if (landlords.length > 1 && Math.abs(paid - annualRent) > 1) {
    return `The landlords’ rent adds up to ${paid}, but the year’s rent is ${annualRent}. Make them agree.`;
  }
  return null;
}

// Month-wise rent as typed, kept to the months of the financial year.
// Null when no month has any rent.
export function cleanRentByMonth(raw: any, periods: string[]): Record<string, number> | null | string {
  if (raw == null || typeof raw !== 'object') return null;
  const out: Record<string, number> = {};
  for (const period of periods) {
    const v = Number(raw[period] || 0);
    if (!isFinite(v) || v < 0) return 'Rent cannot be negative';
    if (v > 0) out[period] = r2(v);
  }
  return Object.keys(out).length ? out : null;
}

// What an employee may do with their own declaration. They can change it
// while it is a draft and the window is open — or HR has reopened it for
// them. Once submitted, it is HR's to review or send back.
export const DECLARATION_STATUSES = ['DRAFT', 'SUBMITTED', 'REVIEWED'];
export function selfEditState(
  profile: { status: string; editGranted: boolean }, control: { declarationOpen: boolean },
) {
  const draft = profile.status === 'DRAFT' || !DECLARATION_STATUSES.includes(profile.status);
  const canEdit = draft && (control.declarationOpen || profile.editGranted);
  const why = canEdit ? ''
    : !draft ? 'You have submitted this declaration. Ask for it to be reopened if you need to make a change.'
      : 'The declaration window is closed. Ask HR to open it if you need to make a change.';
  return { canEdit, why };
}

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
  ['POST_OFFICE_TD', 'Post Office five-year time deposit', '80C', '123', 'SECTION_80C', 150000, 100],
  ['SCSS', 'Senior Citizens Savings Scheme', '80C', '123', 'SECTION_80C', 150000, 100],
  ['NSC_INTEREST', 'Interest on NSC reinvested', '80C', '123', 'SECTION_80C', 150000, 100],
  ['NABARD_BONDS', 'NABARD rural bonds', '80C', '123', 'SECTION_80C', 150000, 100],
  ['NHB_DEPOSIT', 'National Housing Bank deposit scheme', '80C', '123', 'SECTION_80C', 150000, 100],
  ['INFRA_BONDS', 'Infrastructure bonds or units', '80C', '123', 'SECTION_80C', 150000, 100],
  ['PENSION_FUND', 'Contribution to pension fund', '80CCC', '123', 'SECTION_80C', 150000, 100],
  ['NPS_EMPLOYEE', 'Employee contribution to NPS', '80CCD(1)', '124(5)', 'SECTION_80C', 150000, 100],
  ['NPS_ADDITIONAL', 'Additional contribution to NPS', '80CCD(1B)', '124(3)', 'OTHER', 50000, 100],
  ['MEDICLAIM_SELF', 'Medical insurance — self and family', '80D', '126', 'OTHER', 25000, 100],
  ['MEDICLAIM_PARENTS_BELOW_60', 'Medical insurance — parents (below 60)', '80D', '126', 'OTHER', 25000, 100],
  ['MEDICLAIM_PARENTS', 'Medical insurance — parents (senior citizens)', '80D', '126', 'OTHER', 50000, 100],
  ['HEALTH_CHECKUP', 'Preventive health check-up', '80D', '126', 'OTHER', 5000, 100],
  ['MEDICAL_BILLS_SENIOR', 'Medical expenses of a senior citizen with no insurance', '80D', '126', 'OTHER', 50000, 100],
  ['DISABLED_DEPENDANT_40', 'Dependant with disability (40% to 80%)', '80DD', '127', 'OTHER', 75000, 100],
  ['DISABLED_DEPENDANT', 'Dependant with severe disability (80% or more)', '80DD', '127', 'OTHER', 125000, 100],
  ['SPECIFIED_DISEASE_BELOW_60', 'Treatment of specified disease (patient below 60)', '80DDB', '128', 'OTHER', 40000, 100],
  ['SPECIFIED_DISEASE', 'Treatment of specified disease (senior citizen)', '80DDB', '128', 'OTHER', 100000, 100],
  ['EDUCATION_LOAN', 'Interest on education loan', '80E', '129', 'OTHER', null, 100],
  ['HOME_LOAN_INTEREST_80EE', 'Additional housing-loan interest (loan sanctioned in 2016-17)', '80EE', '130', 'OTHER', 50000, 100],
  ['HOME_LOAN_INTEREST_80EEA', 'Additional housing-loan interest (affordable housing, 2019-22)', '80EEA', '131', 'OTHER', 150000, 100],
  ['EV_LOAN', 'Interest on electric-vehicle loan', '80EEB', '132', 'OTHER', 150000, 100],
  ['DONATION_FULL', 'Donations — fully deductible', '80G', '133', 'OTHER', null, 100],
  ['DONATION_HALF', 'Donations — 50% deductible', '80G', '133', 'OTHER', null, 50],
  ['RENT_WITHOUT_HRA', 'Rent paid where no HRA is received', '80GG', '134', 'OTHER', 60000, 100],
  ['DONATION_RESEARCH', 'Donations for scientific research or rural development', '80GGA', '135', 'OTHER', null, 100],
  ['DONATION_POLITICAL', 'Donations to political parties', '80GGC', '137', 'OTHER', null, 100],
  ['SAVINGS_INTEREST', 'Interest on savings account', '80TTA', '153(2)(A)', 'OTHER', 10000, 100],
  ['DEPOSIT_INTEREST_SENIOR', 'Interest on deposits — senior citizens', '80TTB', '153(2)(B)', 'OTHER', 50000, 100],
  ['SELF_DISABILITY_40', 'Own disability (40% to 80%)', '80U', '154', 'OTHER', 75000, 100],
  ['SELF_DISABILITY', 'Own severe disability (80% or more)', '80U', '154', 'OTHER', 125000, 100],
  // Not deductions: income from other heads, and tax already paid on it
  ['INTEREST_INCOME', 'Interest income (deposits, savings, bonds)', 'Other sources', '', 'OTHER_INCOME', null, 100],
  ['ANY_OTHER_INCOME', 'Any other income', 'Other sources', '', 'OTHER_INCOME', null, 100],
  ['LET_OUT_INCOME', 'Income from let-out property (after the 30% deduction and interest)', 'House property', '', 'LET_OUT_INCOME', null, 100],
  ['LET_OUT_LOSS', 'Loss from let-out property', 'House property', '', 'LET_OUT_LOSS', null, 100],
  ['TDS_ELSEWHERE', 'Tax deducted at source on other income', 'TDS', '', 'TAX_CREDIT', null, 100],
  ['TCS_PAID', 'Tax collected at source', 'TCS', '', 'TAX_CREDIT', null, 100],
];

// Items added to the starter catalogue after organizations already had
// one; a migration gives these to existing organizations.
export const ITEMS_ADDED_LATER = [
  'POST_OFFICE_TD', 'SCSS', 'NSC_INTEREST', 'NABARD_BONDS', 'NHB_DEPOSIT', 'INFRA_BONDS', 'MEDICAL_BILLS_SENIOR',
  'HOME_LOAN_INTEREST_80EE', 'HOME_LOAN_INTEREST_80EEA', 'RENT_WITHOUT_HRA', 'DONATION_RESEARCH', 'DONATION_POLITICAL',
  'DEPOSIT_INTEREST_SENIOR', 'INTEREST_INCOME', 'ANY_OTHER_INCOME', 'LET_OUT_INCOME', 'LET_OUT_LOSS', 'TDS_ELSEWHERE', 'TCS_PAID',
];
