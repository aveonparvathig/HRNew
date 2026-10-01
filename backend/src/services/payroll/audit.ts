// Payroll audit trail: who changed what, when. Rows are append-only.
import { prisma } from '../../config/database';

export type AuditAction =
  | 'RUN_CREATED' | 'RUN_DELETED' | 'RUN_FINALIZED' | 'RUN_REOPENED' | 'RUN_RECALCULATED'
  | 'ENTRY_UPDATED' | 'ENTRY_REMOVED'
  | 'SETTINGS_UPDATED' | 'STATUTORY_PROFILE_UPDATED'
  | 'LOCATION_CREATED' | 'LOCATION_UPDATED' | 'LOCATION_DELETED'
  | 'COMPONENT_CREATED' | 'COMPONENT_UPDATED' | 'COMPONENT_DELETED'
  | 'SALARY_REVISED' | 'SALARY_REVISION_REMOVED';

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
  source?: 'MANUAL' | 'IMPORT' | 'REVISION';
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
