// Consultants paid through payroll, and the employer's NPS contribution.
// Pure, DB-independent.

const r2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Consultants: fees with tax deducted at a flat rate
// ---------------------------------------------------------------------------
// The sections fees are paid under, the rate each usually carries, and its
// code in the quarterly return for payments other than salary (Form 26Q).
export const CONSULTANT_SECTIONS = [
  { value: '194J', label: '194J — professional or technical fees', defaultPercent: 10, returnCode: '94J' },
  { value: '194C', label: '194C — contract work', defaultPercent: 1, returnCode: '94C' },
  { value: '194H', label: '194H — commission or brokerage', defaultPercent: 2, returnCode: '94H' },
];
export const isConsultantSection = (value: any) => CONSULTANT_SECTIONS.some(s => s.value === value);
export const sectionLabel = (value: string) => CONSULTANT_SECTIONS.find(s => s.value === value)?.label || value;
export const returnCode = (value: string) => CONSULTANT_SECTIONS.find(s => s.value === value)?.returnCode || value;

export const TAX_TREATMENTS = [
  { value: 'SALARY', label: 'Employee — taxed on salary' },
  { value: 'CONSULTANT', label: 'Consultant — tax at a flat rate on fees' },
];
export const isConsultant = (person: { taxTreatment?: string | null } | null | undefined) => person?.taxTreatment === 'CONSULTANT';

// Without a valid PAN, tax is deducted at 20% when that is higher
export const NO_PAN_PERCENT = 20;

// A consultant's fee is one amount: all of the package, no allowances.
export const CONSULTANT_SPLIT = {
  basicPercentOfPackage: 100, daPercentOfBasic: 0, hraPercentOfBasic: 0, transportPercentOfBasic: 0, foodPercentOfBasic: 0,
};
export const CONSULTANT_STRUCTURE = 'Consultant fee';

// Tax on a month's fee: the rate, raised to 20% without a PAN, on the
// whole fee, rounded up to the rupee.
export function consultantTds(fee: number, percent: number, hasValidPan: boolean) {
  const rate = hasValidPan ? Number(percent || 0) : Math.max(Number(percent || 0), NO_PAN_PERCENT);
  return { rate, tds: fee > 0 ? Math.ceil(fee * rate / 100 - 1e-9) : 0 };
}

// How a person is paid, as typed. Returns what is wrong, or the fields.
export function taxTreatmentInput(b: any): string | { taxTreatment: string; consultantSection: string; consultantTdsPercent: number } {
  const taxTreatment = String(b?.taxTreatment || 'SALARY');
  if (!TAX_TREATMENTS.some(t => t.value === taxTreatment)) return 'Pick how the person is paid';
  const consultantSection = String(b?.consultantSection || '194J');
  if (!isConsultantSection(consultantSection)) return 'Pick the section tax is deducted under';
  const raw = b?.consultantTdsPercent;
  const percent = raw === '' || raw == null
    ? CONSULTANT_SECTIONS.find(s => s.value === consultantSection)!.defaultPercent : Number(raw);
  if (!isFinite(percent) || percent < 0 || percent > 40) return 'The tax rate must be between 0% and 40%';
  return { taxTreatment, consultantSection, consultantTdsPercent: percent };
}

// ---------------------------------------------------------------------------
// Employer's contribution to the National Pension System
// ---------------------------------------------------------------------------
// The month's contribution: a share of Basic + DA, to the rupee.
export const employerNps = (basic: number, da: number, percent: number) =>
  (percent > 0 ? Math.round((Number(basic || 0) + Number(da || 0)) * percent / 100) : 0);

// How much of the year's contribution is deductible (section 80CCD(2)):
// up to the limit share of the year's Basic + DA.
export const employerNpsDeduction = (contribution: number, basicAndDa: number, limitPercent: number) =>
  Math.max(0, Math.min(r2(contribution), r2(basicAndDa * Number(limitPercent || 0) / 100)));

export function npsPercentInput(raw: any): string | number {
  const percent = raw === '' || raw == null ? 0 : Number(raw);
  if (!isFinite(percent) || percent < 0 || percent > 20) return 'The employer’s NPS contribution must be between 0% and 20% of Basic + DA';
  return percent;
}
