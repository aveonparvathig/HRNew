/**
 * Import a Django export (scripts/export_django_data.py) into a v2 organization.
 *
 * Usage (from backend/):
 *   npx ts-node scripts/import-django.ts --file ../scripts/django_export.json --owner ranjith@aveon.com
 *
 * Idempotent by natural keys: clients by name, billings by client+year,
 * employees by name, runs by period, entries by run+person. Payments and
 * historical entries are only inserted for parents created in this import,
 * so re-running never duplicates. Prints a reconciliation table comparing
 * source sums against exactly what was inserted - the numbers must match.
 */
import 'dotenv/config';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const s = (v: any) => (v == null ? '' : String(v));
const n = (v: any) => (v == null || v === '' ? 0 : Number(v));
const numOrNull = (v: any) => (v == null || v === '' ? null : Number(v));
const bool = (v: any) => Boolean(Number(v || 0));
const dateStr = (v: any) => (v ? String(v).slice(0, 10) : null);
const ts = (v: any) => (v ? new Date(String(v).replace(' ', 'T')) : new Date());
const r2 = (x: number) => Math.round(x * 100) / 100;

async function main() {
  const file = arg('file', '../scripts/django_export.json')!;
  const ownerEmail = arg('owner');
  if (!ownerEmail) throw new Error('Pass --owner <email> (the v2 account to import into)');

  const data = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) throw new Error(`No v2 user with email ${ownerEmail}`);
  const orgId = owner.organizationId;
  console.log(`Importing "${data.sourceDb}" org ${data.sourceOrgId} -> v2 org ${orgId} (${ownerEmail})\n`);

  const report: [string, number, number, number][] = []; // table, source, inserted, skipped
  const inserted = {
    billingNet: 0, billingPrev: 0, payments: 0, packages: 0, entryNet: 0, entryGross: 0,
  };

  // ---- Income clients ----------------------------------------------------
  const clientIdMap = new Map<number, string>(); // django id -> v2 id
  let cIns = 0, cSkip = 0;
  for (const c of data.incomeClients) {
    const existing = await prisma.incomeClient.findFirst({
      where: { organizationId: orgId, name: { equals: s(c.name), mode: 'insensitive' } },
    });
    if (existing) {
      clientIdMap.set(c.id, existing.id);
      cSkip++;
      continue;
    }
    const created = await prisma.incomeClient.create({
      data: {
        organizationId: orgId,
        name: s(c.name),
        agreementStatus: s(c.agreement_status),
        notes: s(c.notes),
        isActive: bool(c.is_active),
        createdAt: ts(c.created_at),
      },
    });
    clientIdMap.set(c.id, created.id);
    cIns++;
  }
  report.push(['incomeClients', data.incomeClients.length, cIns, cSkip]);

  // ---- Billings ----------------------------------------------------------
  const billingIdMap = new Map<number, { id: string; clientId: string; isNew: boolean }>();
  let bIns = 0, bSkip = 0;
  for (const b of data.clientBillings) {
    const clientId = clientIdMap.get(b.client_id);
    if (!clientId) { bSkip++; continue; }
    const existing = await prisma.clientBilling.findUnique({
      where: { clientId_academicYear: { clientId, academicYear: s(b.academic_year) } },
    });
    if (existing) {
      billingIdMap.set(b.id, { id: existing.id, clientId, isNew: false });
      bSkip++;
      continue;
    }
    const created = await prisma.clientBilling.create({
      data: {
        clientId,
        organizationId: orgId,
        academicYear: s(b.academic_year),
        yearStart: n(b.year_start) || parseInt(s(b.academic_year).slice(0, 4)) || 0,
        studentCount: numOrNull(b.student_count),
        rate: numOrNull(b.rate),
        oneTimePayment: n(b.one_time_payment),
        overrideAmounts: bool(b.override_amounts),
        taxableValue: numOrNull(b.taxable_value),
        gstAmount: n(b.gst_amount),
        netAmount: n(b.net_amount),
        previousPending: n(b.previous_pending),
        engineer: s(b.engineer),
        invoiceStatus: s(b.invoice_status),
        remarks: s(b.remarks),
        nextFollowupDate: dateStr(b.next_followup_date),
        followupNote: s(b.followup_note),
        createdAt: ts(b.created_at),
      },
    });
    billingIdMap.set(b.id, { id: created.id, clientId, isNew: true });
    inserted.billingNet = r2(inserted.billingNet + n(b.net_amount));
    inserted.billingPrev = r2(inserted.billingPrev + n(b.previous_pending));
    bIns++;
  }
  report.push(['clientBillings', data.clientBillings.length, bIns, bSkip]);

  // ---- Payments (only for billings created in this import) ---------------
  let pIns = 0, pSkip = 0;
  for (const p of data.paymentReceipts) {
    const billing = billingIdMap.get(p.billing_id);
    if (!billing || !billing.isNew) { pSkip++; continue; }
    await prisma.paymentReceipt.create({
      data: {
        billingId: billing.id,
        clientId: billing.clientId,
        organizationId: orgId,
        amount: n(p.amount),
        receivedOn: dateStr(p.received_on),
        mode: s(p.mode),
        note: s(p.note),
        createdAt: ts(p.created_at),
      },
    });
    inserted.payments = r2(inserted.payments + n(p.amount));
    pIns++;
  }
  report.push(['paymentReceipts', data.paymentReceipts.length, pIns, pSkip]);

  // ---- Onboardings -------------------------------------------------------
  let oIns = 0, oSkip = 0;
  for (const o of data.clientOnboardings) {
    const clientId = clientIdMap.get(o.client_id);
    if (!clientId) { oSkip++; continue; }
    const exists = await prisma.clientOnboarding.findUnique({ where: { clientId } });
    if (exists) { oSkip++; continue; }
    await prisma.clientOnboarding.create({
      data: {
        clientId,
        organizationId: orgId,
        stage: s(o.stage) || 'ONBOARDING',
        contactPerson: s(o.contact_person),
        contactDesignation: s(o.contact_designation),
        contactPhone: s(o.contact_phone),
        contactEmail: s(o.contact_email),
        institutionType: s(o.institution_type),
        address: s(o.address),
        city: s(o.city),
        studentStrength: numOrNull(o.student_strength),
        onboardedOn: dateStr(o.onboarded_on),
        goLiveDate: dateStr(o.go_live_date),
        engineer: s(o.engineer),
        poReceived: bool(o.po_received),
        poNumber: s(o.po_number),
        poDate: dateStr(o.po_date),
        agreementSigned: bool(o.agreement_signed),
        agreementYears: numOrNull(o.agreement_years),
        agreementStart: dateStr(o.agreement_start),
        agreementEnd: dateStr(o.agreement_end),
        reminderDays: n(o.reminder_days) || 90,
        notes: s(o.notes),
      },
    });
    oIns++;
  }
  report.push(['clientOnboardings', data.clientOnboardings.length, oIns, oSkip]);

  // ---- Employees -> Person (isEmployee) ----------------------------------
  const employeeIdMap = new Map<number, string>();
  let eIns = 0, eSkip = 0;
  for (const e of data.employees) {
    const existing = await prisma.person.findFirst({
      where: {
        organizationId: orgId, kind: 'CANDIDATE',
        name: { equals: s(e.name), mode: 'insensitive' },
      },
    });
    if (existing) {
      employeeIdMap.set(e.id, existing.id);
      eSkip++;
      continue;
    }
    // The Django is_active flag is the payroll gate; inactive employees
    // become RESIGNED so v2's run creation excludes them the same way.
    let employmentStatus = s(e.employment_status) || 'ACTIVE';
    if (!bool(e.is_active) && ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD'].includes(employmentStatus)) {
      employmentStatus = 'RESIGNED';
    }
    const created = await prisma.person.create({
      data: {
        organizationId: orgId,
        kind: 'CANDIDATE',
        isEmployee: true,
        name: s(e.name),
        employeeNo: s(e.employee_code),
        designation: s(e.designation),
        department: s(e.department),
        joinDate: dateStr(e.doj),
        leavingDate: dateStr(e.relieving_date),
        employmentStatus,
        currentMonthlyPackage: n(e.current_monthly_package),
        isEsiEligible: bool(e.is_esi_eligible),
        isPfApplicable: bool(e.is_pf_applicable),
        dateOfBirth: dateStr(e.date_of_birth),
        bloodGroup: s(e.blood_group),
        maritalStatus: s(e.marital_status),
        parentSpouseName: s(e.parent_spouse_name),
        aadharNo: s(e.aadhar_no),
        address: s(e.address),
        email: s(e.personal_email),
        officialEmail: s(e.official_email),
        phone: s(e.contact_no),
        officialNo: s(e.official_no),
        emergencyNo: s(e.emergency_no),
        agreementSigned: bool(e.agreement_signed),
        agreementSignDate: dateStr(e.agreement_sign_date),
        biometricId: s(e.biometric_id),
        reasonForLeaving: s(e.reason_for_leaving),
        bankName: s(e.bank_name),
        bankAccountNumber: s(e.bank_account_number),
        ifscCode: s(e.ifsc_code),
        panNumber: s(e.pan_number),
        pfNumber: s(e.pf_number),
        pfUan: s(e.pf_uan),
        esiNumber: s(e.esi_number),
        notes: s(e.notes),
        createdAt: ts(e.created_at),
      },
    });
    employeeIdMap.set(e.id, created.id);
    inserted.packages = r2(inserted.packages + n(e.current_monthly_package));
    eIns++;
  }
  report.push(['employees', data.employees.length, eIns, eSkip]);

  // ---- Payroll settings --------------------------------------------------
  const ps = data.payrollSettings[0];
  if (ps) {
    await prisma.payrollSettings.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId },
      update: {},
    });
    await prisma.payrollSettings.update({
      where: { organizationId: orgId },
      data: {
        basicPercentOfPackage: n(ps.basic_percent_of_package),
        daPercentOfBasic: n(ps.da_percent_of_basic),
        hraPercentOfBasic: n(ps.hra_percent_of_basic),
        transportPercentOfBasic: n(ps.transport_percent_of_basic),
        foodPercentOfBasic: n(ps.food_percent_of_basic),
        esiEmployeePercent: n(ps.esi_employee_percent),
        esiEmployerPercent: n(ps.esi_employer_percent),
        esiWageCeiling: n(ps.esi_wage_ceiling),
        pfEmployeePercent: n(ps.pf_employee_percent),
        pfEmployerPercent: n(ps.pf_employer_percent),
        pfWageCap: n(ps.pf_wage_cap),
        pfWageFactor: n(ps.pf_wage_factor),
        pfEmployerMatchesEmployee: bool(ps.pf_employer_matches_employee),
      },
    });
    report.push(['payrollSettings', 1, 1, 0]);
  }

  // ---- Payroll runs + entries (historical values kept verbatim) ----------
  const runIdMap = new Map<number, { id: string; isNew: boolean }>();
  let rIns = 0, rSkip = 0;
  for (const r of data.payrollRuns) {
    const period = s(r.period).slice(0, 7); // "YYYY-MM"
    const existing = await prisma.payrollRun.findUnique({
      where: { organizationId_period: { organizationId: orgId, period } },
    });
    if (existing) {
      runIdMap.set(r.id, { id: existing.id, isNew: false });
      rSkip++;
      continue;
    }
    const created = await prisma.payrollRun.create({
      data: {
        organizationId: orgId,
        period,
        status: s(r.status) === 'FINALIZED' ? 'FINALIZED' : 'DRAFT',
        finalizedAt: r.finalized_at ? ts(r.finalized_at) : null,
        notes: s(r.notes),
        createdAt: ts(r.created_at),
      },
    });
    runIdMap.set(r.id, { id: created.id, isNew: true });
    rIns++;
  }
  report.push(['payrollRuns', data.payrollRuns.length, rIns, rSkip]);

  let enIns = 0, enSkip = 0;
  for (const e of data.payslipEntries) {
    const run = runIdMap.get(e.run_id);
    const personId = employeeIdMap.get(e.employee_id);
    if (!run || !run.isNew || !personId) { enSkip++; continue; }
    await prisma.payslipEntry.create({
      data: {
        organizationId: orgId,
        runId: run.id,
        personId,
        monthlyPackage: n(e.monthly_package),
        totalWorkingDays: n(e.total_working_days) || 26,
        empLeaveDays: n(e.emp_leave_days),
        lopDays: n(e.lop_days),
        presentDays: n(e.present_days),
        payDays: n(e.pay_days),
        internetAllowance: n(e.internet_allowance),
        salaryArrearAllowance: n(e.salary_arrear_allowance),
        salaryAdvance: n(e.salary_advance),
        tds: n(e.tds),
        basic: n(e.basic),
        da: n(e.da),
        hra: n(e.hra),
        transportAllowance: n(e.transport_allowance),
        foodAllowance: n(e.food_allowance),
        grossSalary: n(e.gross_salary),
        isEsiEligible: bool(e.is_esi_eligible),
        esiEmployee: n(e.esi_employee),
        esiEmployer: n(e.esi_employer),
        isPfApplicable: bool(e.is_pf_applicable),
        pfEmployee: n(e.pf_employee),
        pfEmployer: n(e.pf_employer),
        totalDeductions: n(e.total_deductions),
        netPayable: n(e.net_payable),
        employerContributions: n(e.employer_contributions),
        ctc: n(e.ctc),
        remarks: s(e.remarks),
      },
    });
    inserted.entryNet = r2(inserted.entryNet + n(e.net_payable));
    inserted.entryGross = r2(inserted.entryGross + n(e.gross_salary));
    enIns++;
  }
  report.push(['payslipEntries', data.payslipEntries.length, enIns, enSkip]);

  // ---- Reconciliation ----------------------------------------------------
  console.log('TABLE                 SOURCE  INSERTED  SKIPPED');
  for (const [t, src, ins, skip] of report) {
    console.log(`${t.padEnd(22)}${String(src).padStart(6)}${String(ins).padStart(10)}${String(skip).padStart(9)}`);
  }
  const rec = data.reconciliation;
  const check = (label: string, source: number, got: number) => {
    const ok = Math.abs(source - got) < 0.01 ? 'OK ' : 'MISMATCH';
    console.log(`${ok}  ${label.padEnd(24)} source=${source}  imported=${got}`);
    return ok === 'OK ';
  };
  console.log('\nRECONCILIATION (source sums vs imported sums):');
  const allOk = [
    check('billing net', rec.billingNetSum, inserted.billingNet),
    check('billing prev pending', rec.billingPrevPendingSum, inserted.billingPrev),
    check('payments', rec.paymentSum, inserted.payments),
    check('employee packages', rec.employeePackageSum, inserted.packages),
    check('entry net payable', rec.entryNetPayableSum, inserted.entryNet),
    check('entry gross', rec.entryGrossSum, inserted.entryGross),
  ].every(Boolean);
  console.log(allOk ? '\n✓ All reconciliation checks passed.' : '\n✗ RECONCILIATION FAILED - review before trusting this import.');
  if (!allOk) process.exitCode = 1;
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
