// Payroll audit trail: who changed what, when. Rows are append-only.
import { prisma } from '../../config/database';

export type AuditAction =
  | 'RUN_CREATED' | 'RUN_DELETED' | 'RUN_FINALIZED' | 'RUN_REOPENED' | 'RUN_RECALCULATED'
  | 'ENTRY_UPDATED' | 'ENTRY_REMOVED'
  | 'SETTINGS_UPDATED' | 'STATUTORY_PROFILE_UPDATED'
  | 'LOCATION_CREATED' | 'LOCATION_UPDATED' | 'LOCATION_DELETED'
  | 'COMPONENT_CREATED' | 'COMPONENT_UPDATED' | 'COMPONENT_DELETED'
  | 'SALARY_REVISED' | 'SALARY_REVISION_REMOVED'
  | 'PT_POLICY_SAVED' | 'PT_POLICY_DELETED' | 'LWF_POLICY_SAVED' | 'LWF_POLICY_DELETED'
  | 'REMITTANCE_RECORDED' | 'REMITTANCE_DELETED'
  | 'LOAN_CREATED' | 'LOAN_CHANGED' | 'LOAN_DELETED'
  | 'TAX_CONFIG_UPDATED' | 'TAX_PROFILE_UPDATED'
  | 'DECLARATION_ITEM_SAVED' | 'DECLARATION_WINDOW_CHANGED' | 'DECLARATION_SAVED' | 'DECLARATION_APPROVED'
  | 'DECLARATION_SUBMITTED' | 'DECLARATION_REVIEWED' | 'DECLARATION_SENT_BACK' | 'DECLARATION_REOPEN_ASKED' | 'DECLARATION_REOPEN_DECIDED'
  | 'PERQUISITES_SAVED' | 'TDS_RETURN_FILED'
  | 'STRUCTURE_TEMPLATE_SAVED' | 'STRUCTURE_TEMPLATE_DELETED' | 'STRUCTURE_ASSIGNED'
  | 'RECURRING_SAVED' | 'RECURRING_DELETED' | 'NUMBER_SERIES_SAVED'
  | 'MANAGER_CHANGED' | 'EMPLOYEE_CONFIRMED' | 'POSITION_CHANGED'
  | 'RUN_RELEASED' | 'RUN_HELD'
  | 'INPUTS_LOCKED' | 'INPUTS_UNLOCKED' | 'SALARY_HELD' | 'SALARY_HOLD_RELEASED'
  | 'PAY_SETTINGS_UPDATED' | 'PAYOUT_SETTINGS_UPDATED' | 'LEDGER_MAPPING_UPDATED'
  | 'PAYOUT_BATCH_CREATED' | 'PAYOUT_BATCH_PAID' | 'PAYOUT_BATCH_DELETED' | 'PAYOUT_BATCH_CHANGED'
  | 'PAID_OUTSIDE_MARKED' | 'PAID_OUTSIDE_UNDONE'
  | 'BANK_ACCOUNT_SAVED' | 'BANK_ACCOUNT_DELETED' | 'LIST_VALUE_SAVED' | 'LIST_VALUE_DELETED'
  | 'SECURITY_POLICY_UPDATED' | 'ACCOUNT_UNLOCKED' | 'PASSWORD_RESET' | 'LOGIN_ROLE_CHANGED'
  | 'MAIL_SETTINGS_UPDATED'
  | 'CLAIM_ATTACHED' | 'CLAIM_DETACHED'
  | 'TDS_CHALLAN_RECORDED' | 'TDS_CHALLAN_DELETED' | 'FORM16_RELEASE_CHANGED' | 'FORM16_PART_A_SAVED'
  | 'ARREAR_RAISED' | 'ARREAR_CANCELLED' | 'SETTLEMENT_SAVED' | 'SETTLEMENT_DELETED';

export interface AuditRow {
  action: AuditAction;
  runId?: string | null;
  entryId?: string | null;
  personId?: string | null;
  period?: string;
  personName?: string;
  field?: string;
  oldValue?: string;
  newValue?: string;
  source?: 'MANUAL' | 'IMPORT' | 'REVISION' | 'LOAN';
}

export interface FieldChange {
  field: string;
  oldValue: string;
  newValue: string;
}

const FIELD_LABELS: Record<string, string> = {
  totalWorkingDays: 'Working days',
  empLeaveDays: 'Leave days',
  lopDays: 'LOP days',
  internetAllowance: 'Internet allowance',
  salaryArrearAllowance: 'Salary arrear',
  salaryAdvance: 'Salary advance',
  tds: 'TDS',
  monthlyPackage: 'Monthly package',
  isEsiEligible: 'ESI eligible',
  isPfApplicable: 'PF applicable',
  remarks: 'Remarks',
  professionalTax: 'Professional Tax',
  loanDeduction: 'Loan instalment',
  tdsAutoFrom: 'Compute TDS from',
  bonusPercent: 'Bonus %',
  bonusEligibilityLimit: 'Bonus eligibility limit',
  bonusWageCeiling: 'Bonus wage ceiling',
  shopsRegistrationNo: 'Shops and Establishments registration no.',
  labourIdNumber: 'Labour Identification Number',
  natureOfBusiness: 'Nature of business',
  managerName: 'Manager or person in charge',
  lopReversalMonths: 'Months back loss of pay can be reversed',
  noticePeriodDays: 'Usual notice period (days)',
  settlementDayBasis: 'Days in a month for encashment and notice',
  gratuityMinYears: 'Service needed for gratuity (years)',
  gratuityCap: 'Gratuity limit',
  form24qName: 'Name of the quarterly TDS return',
  form16Name: 'Name of the salary TDS certificate',
  form12baName: 'Name of the perquisites statement',
  form27aName: 'Name of the return control sheet',
  jvSplitBy: 'Journal voucher split by',
  tdsAnnexure1IncludeZero: 'List employees with no tax in Annexure I',
  tdsAnnexure2SkipZero: 'Leave employees with no tax out of Annexure II',
  deductorFlat: 'Employer address — flat / door no.',
  deductorBuilding: 'Employer address — building',
  deductorStreet: 'Employer address — street',
  deductorArea: 'Employer address — area',
  deductorCity: 'Employer address — town',
  deductorState: 'Employer address — state',
  deductorPin: 'Employer address — PIN code',
  deductorAddressChanged: 'Employer address changed since the last return',
  responsibleFlat: 'Responsible person — flat / door no.',
  responsibleBuilding: 'Responsible person — building',
  responsibleStreet: 'Responsible person — street',
  responsibleArea: 'Responsible person — area',
  responsibleCity: 'Responsible person — town',
  responsibleState: 'Responsible person — state',
  responsiblePin: 'Responsible person — PIN code',
  responsibleAddressChanged: 'Responsible person’s address changed since the last return',
  paymentMode: 'Payment mode',
  salaryStopped: 'Salary stopped',
  salaryStopReason: 'Reason for stopping salary',
  autoReleaseOnFinalize: 'Release payslips on finalizing',
  autoCreateNextRun: 'Open next month on finalizing',
  payoutBankName: 'Salary account bank',
  payoutBranch: 'Salary account branch',
  payoutAccountNumber: 'Salary account number',
  payoutIfsc: 'Salary account IFSC',
  declarationOpen: 'Declaration window open',
  proofOpen: 'Proof submission open',
  employeeCanChooseRegime: 'Employees may choose regime',
  defaultTaxRegime: 'Default tax regime',
  loanBenchmarkRate: 'Loan benchmark rate %',
  loanPerquisiteExemptLimit: 'Loan perquisite exempt limit',
  professionalTaxLimit: 'Professional Tax deduction limit',
  employerNpsLimitPercent: 'Employer NPS deductible, % of Basic + DA',
  releaseMail: 'Mail employees when payslips are released',
  pfRoundToRupee: 'Round PF to the rupee',
  esiAutoCoverage: 'Automatic ESI coverage',
  epsPercent: 'EPS %',
  epsWageCap: 'EPS wage cap',
  edliPercent: 'EDLI %',
  edliWageCap: 'EDLI wage cap',
  pfAdminPercent: 'PF admin charge %',
  pfAdminMinimum: 'PF admin charge minimum',
  basicPercentOfPackage: 'Basic % of package',
  daPercentOfBasic: 'DA % of basic',
  hraPercentOfBasic: 'HRA % of basic',
  transportPercentOfBasic: 'Transport % of basic',
  foodPercentOfBasic: 'Food % of basic',
  esiEmployeePercent: 'ESI employee %',
  esiEmployerPercent: 'ESI employer %',
  esiWageCeiling: 'ESI wage ceiling',
  pfEmployeePercent: 'PF employee %',
  pfEmployerPercent: 'PF employer %',
  pfWageCap: 'PF wage cap',
  pfWageFactor: 'PF wage factor',
  pfEmployerMatchesEmployee: 'Employer PF matches employee',
  panNumber: 'Company PAN',
  tanNumber: 'TAN',
  pfCode: 'PF establishment code',
  esiCode: 'ESI employer code',
  ptRegistrationNo: 'Professional Tax registration no.',
  lwfRegistrationNo: 'Labour Welfare Fund no.',
  gstNumber: 'GST number',
  excludeFromPt: 'Excluded from Professional Tax',
  payslipPdfPassword: 'Payslip file password',
  payslipFilePrefix: 'Payslip file name starts with',
  payslipFileContext: 'Payslip file name identifies the employee by',
  payslipEmailTo: 'Payslips are emailed to',
  jvFilePrefix: 'Journal voucher file name starts with',
  inputCutoffDay: 'Inputs lock after day of the month',
  declarationLockOn: 'Declaration window closes after',
  proofOpenFrom: 'Proof submission opens from',
  employeeTaxEstimate: 'Employees see a tax estimate',
  proofRequired: 'Proof required',
  tdsCircleAddress: 'Tax office address',
};

// Readable name for a stored field key; unknown camelCase keys are spaced out
// ("responsibleName" → "Responsible name"), anything else passes through.
export function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  if (!/^[a-z][a-zA-Z0-9]*$/.test(field)) return field;
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const show = (v: any) => (v == null ? '' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));

// Field-by-field difference between two records. Numbers compare by value
// so 26 and "26" are not reported as a change. Pure.
export function diffFields(before: any, after: any, fields: string[]): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const a = before?.[field];
    const b = after?.[field];
    const same = typeof a === 'number' || typeof b === 'number'
      ? Number(a ?? 0) === Number(b ?? 0)
      : show(a) === show(b);
    if (!same) changes.push({ field, oldValue: show(a), newValue: show(b) });
  }
  return changes;
}

export async function actorName(userId?: string): Promise<string> {
  if (!userId) return '';
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true, email: true },
  });
  if (!user) return '';
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || user.email;
}

export async function logPayrollAudit(req: any, rows: AuditRow[]): Promise<void> {
  if (rows.length === 0) return;
  const userId = req.user?.userId;
  const userName = await actorName(userId);
  await prisma.payrollAuditLog.createMany({
    data: rows.map(r => ({
      organizationId: req.user?.organizationId,
      userId: userId || null,
      userName,
      action: r.action,
      runId: r.runId || null,
      entryId: r.entryId || null,
      personId: r.personId || null,
      period: r.period || '',
      personName: r.personName || '',
      field: r.field || '',
      oldValue: r.oldValue || '',
      newValue: r.newValue || '',
      source: r.source || 'MANUAL',
    })),
  });
}
