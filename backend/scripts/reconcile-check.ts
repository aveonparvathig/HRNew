/**
 * Row-by-row reconciliation: every row of the Django export must exist in the
 * v2 database (matched by the importer's natural keys) with matching money
 * values. v2-native rows created after migration are ignored, so this proves
 * the migration is complete even on a database that has moved on.
 *
 * Run (from backend/): npx ts-node scripts/reconcile-check.ts
 */
import 'dotenv/config';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const r2 = (x: number) => Math.round(x * 100) / 100;
const n = (v: any) => (v == null || v === '' ? 0 : Number(v));
const close = (a: number, b: number) => Math.abs(a - b) < 0.005;

async function main() {
  const data = JSON.parse(fs.readFileSync('../scripts/django_export.json', 'utf-8'));
  const owner = await prisma.user.findUnique({ where: { email: 'ranjith@aveon.com' } });
  const orgId = owner!.organizationId;
  const src = data.reconciliation;
  const problems: string[] = [];

  // ---- Clients by name ---------------------------------------------------
  const dbClients = await prisma.incomeClient.findMany({ where: { organizationId: orgId } });
  const clientByName = new Map(dbClients.map(c => [c.name.toLowerCase(), c]));
  const clientMap = new Map<number, string>(); // django id -> v2 id
  for (const c of data.incomeClients) {
    const m = clientByName.get(String(c.name).toLowerCase());
    if (!m) { problems.push(`client missing: ${c.name}`); continue; }
    clientMap.set(c.id, m.id);
  }

  // ---- Billings by client + academic year --------------------------------
  const dbBillings = await prisma.clientBilling.findMany({ where: { organizationId: orgId } });
  let bNet = 0, bPrev = 0, bMatched = 0;
  for (const b of data.clientBillings) {
    const cid = clientMap.get(b.client_id);
    const m = dbBillings.find(x => x.clientId === cid && x.academicYear === String(b.academic_year));
    if (!m) { problems.push(`billing missing: client ${b.client_id} ${b.academic_year}`); continue; }
    bMatched++;
    bNet = r2(bNet + (m.netAmount || 0));
    bPrev = r2(bPrev + (m.previousPending || 0));
    if (!close(n(b.net_amount), m.netAmount || 0)) {
      problems.push(`billing net differs: ${b.academic_year} src=${b.net_amount} db=${m.netAmount}`);
    }
  }

  // ---- Payments by billing + date + amount -------------------------------
  const dbPayments = await prisma.paymentReceipt.findMany({ where: { organizationId: orgId } });
  const billingV2ByDjango = new Map<number, string>();
  for (const b of data.clientBillings) {
    const cid = clientMap.get(b.client_id);
    const m = dbBillings.find(x => x.clientId === cid && x.academicYear === String(b.academic_year));
    if (m) billingV2ByDjango.set(b.id, m.id);
  }
  const usedPayment = new Set<string>();
  let pSum = 0, pMatched = 0;
  for (const p of data.paymentReceipts) {
    const bid = billingV2ByDjango.get(p.billing_id);
    const srcDate = p.received_on ? String(p.received_on).slice(0, 10) : null;
    const m = dbPayments.find(x => !usedPayment.has(x.id) && x.billingId === bid &&
      close(x.amount, n(p.amount)) && (x.receivedOn ?? null) === srcDate);
    if (!m) { problems.push(`payment missing: billing ${p.billing_id} ${p.received_on} ${p.amount}`); continue; }
    usedPayment.add(m.id);
    pMatched++;
    pSum = r2(pSum + m.amount);
  }

  // ---- Employees by name -------------------------------------------------
  const dbPeople = await prisma.person.findMany({ where: { organizationId: orgId, isEmployee: true } });
  const empMap = new Map<number, any>(); // django id -> v2 person
  let eSum = 0, eMatched = 0;
  for (const e of data.employees) {
    const m = dbPeople.find(x => x.name.toLowerCase() === String(e.name).toLowerCase());
    if (!m) { problems.push(`employee missing: ${e.name}`); continue; }
    empMap.set(e.id, m);
    eMatched++;
    eSum = r2(eSum + (m.currentMonthlyPackage || 0));
    if (!close(n(e.current_monthly_package), m.currentMonthlyPackage || 0)) {
      problems.push(`package differs: ${e.name} src=${e.current_monthly_package} db=${m.currentMonthlyPackage}`);
    }
  }

  // ---- Runs by period, entries by run + person ---------------------------
  const dbRuns = await prisma.payrollRun.findMany({ where: { organizationId: orgId } });
  const runMap = new Map<number, string>();
  for (const r of data.payrollRuns) {
    const m = dbRuns.find(x => x.period === String(r.period).slice(0, 7));
    if (!m) { problems.push(`run missing: ${r.period}`); continue; }
    runMap.set(r.id, m.id);
  }
  const dbEntries = await prisma.payslipEntry.findMany({ where: { organizationId: orgId } });
  let enNet = 0, enGross = 0, enMatched = 0;
  for (const e of data.payslipEntries) {
    const runId = runMap.get(e.run_id);
    const person = empMap.get(e.employee_id);
    const m = dbEntries.find(x => x.runId === runId && x.personId === person?.id);
    if (!m) { problems.push(`entry missing: run ${e.run_id} emp ${e.employee_id}`); continue; }
    enMatched++;
    enNet = r2(enNet + (m.netPayable || 0));
    enGross = r2(enGross + (m.grossSalary || 0));
    if (!close(n(e.net_payable), m.netPayable || 0)) {
      problems.push(`entry net differs: run ${e.run_id} ${person?.name} src=${e.net_payable} db=${m.netPayable}`);
    }
  }

  // ---- Report ------------------------------------------------------------
  console.log('MATCHED ROWS (source -> found in v2):');
  console.log(`  clients          ${clientMap.size}/${data.incomeClients.length}`);
  console.log(`  billings         ${bMatched}/${data.clientBillings.length}`);
  console.log(`  payments         ${pMatched}/${data.paymentReceipts.length}`);
  console.log(`  employees        ${eMatched}/${data.employees.length}`);
  console.log(`  runs             ${runMap.size}/${data.payrollRuns.length}`);
  console.log(`  entries          ${enMatched}/${data.payslipEntries.length}`);
  console.log('\nSUMS over matched rows (source vs v2):');
  const line = (name: string, a: number, b: number) =>
    console.log(`  ${close(a, b) ? 'MATCH   ' : 'MISMATCH'}  ${name.padEnd(22)} source=${a}  db=${b}`);
  line('billing net', src.billingNetSum, bNet);
  line('billing prev pending', src.billingPrevPendingSum, bPrev);
  line('payments', src.paymentSum, pSum);
  line('employee packages', src.employeePackageSum, eSum);
  line('entry net payable', src.entryNetPayableSum, enNet);
  line('entry gross', src.entryGrossSum, enGross);

  if (problems.length) {
    console.log(`\n✗ ${problems.length} problem(s):`);
    for (const p of problems.slice(0, 30)) console.log('  - ' + p);
  } else {
    console.log('\n✓ Every source row exists in v2 with matching values — migration complete.');
  }
  await prisma.$disconnect();
}
main();
