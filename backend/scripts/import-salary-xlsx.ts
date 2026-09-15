/**
 * Import the Aveon salary workbook (Salary_25_26 format: Sheet1 + Sheet3
 * monthly blocks) into v2 payroll: one FINALIZED PayrollRun per month and a
 * PayslipEntry per employee, using the workbook's own computed values.
 *
 * - Rows are deduplicated per (month, person): the FIRST occurrence wins —
 *   this drops the duplicated May-2026 block and the trailing partial-payment
 *   blocks, which are reported for review, never silently lost.
 * - Sheet names are matched to People by normalized prefix; unmatched names
 *   are created as employees.
 * - Idempotent: existing runs/entries are skipped by (period, person).
 *
 * Usage (from backend/):
 *   DATABASE_URL=... npx ts-node scripts/import-salary-xlsx.ts \
 *     --file "path/to/Salary_25_26.xlsx" --owner owner@email.com
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const r2 = (x: number) => Math.round(x * 100) / 100;
const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Known spelling divergences between the sheet and People
const ALIASES: Record<string, string> = {
  vishnudharsanprabhu: 'vishnudharsanprabu',
};

async function main() {
  const file = arg('file');
  const ownerEmail = arg('owner');
  if (!file || !ownerEmail) throw new Error('Pass --file <xlsx> and --owner <email>');

  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) throw new Error(`No user with email ${ownerEmail}`);
  const orgId = owner.organizationId;

  // ---- Read workbook -----------------------------------------------------
  const Excel = require('exceljs');
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(file);
  const num = (v: any) => {
    if (v == null || v === '') return 0;
    if (typeof v === 'object') v = v.result ?? 0;
    const n = Number(v);
    return isNaN(n) ? 0 : n;
  };
  const val = (c: any) => {
    let v = c.value;
    if (v && typeof v === 'object' && 'result' in v) return v.result;
    if (v && typeof v === 'object' && v.richText) return v.richText.map((t: any) => t.text).join('');
    return v;
  };

  type Row = ReturnType<typeof makeRow>;
  const makeRow = (ws: any, r: number) => {
    const row = ws.getRow(r);
    const g = (c: number) => num(row.getCell(c).value);
    const month = val(row.getCell(1));
    return {
      sheet: ws.name as string, row: r,
      period: month instanceof Date ? month.toISOString().slice(0, 7) : '',
      name: String(val(row.getCell(3)) || '').trim(),
      designation: String(val(row.getCell(4)) || '').trim(),
      workingDays: g(5), empLeave: g(7), lop: g(8), presentDays: g(9), payDays: g(10),
      pkg: g(11), basic: g(12), da: g(13), hra: g(14), transport: g(15), food: g(16),
      internet: g(17), arrear: g(18), gross: g(19),
      esiEmp: g(20), esiEr: g(21), pfEmp: g(22), pfEr: g(23),
      advance: g(24), tds: g(25), deductions: g(26), net: g(27),
    };
  };

  const sheets = (arg('sheets', 'Sheet1,Sheet3') || '').split(',').map(s => s.trim()).filter(Boolean);
  const all: Row[] = [];
  for (const name of sheets) {
    const ws = wb.getWorksheet(name);
    if (!ws) continue;
    for (let r = 2; r <= ws.rowCount; r++) {
      const e = makeRow(ws, r);
      if (e.name && e.period) all.push(e);
    }
  }

  // ---- Dedupe (first occurrence per month+person wins) -------------------
  const seen = new Set<string>();
  const rows: Row[] = [];
  const skippedDup: Row[] = [];
  for (const e of all) {
    const key = `${e.period}|${ALIASES[norm(e.name)] || norm(e.name)}`;
    if (seen.has(key)) { skippedDup.push(e); continue; }
    seen.add(key);
    rows.push(e);
  }

  // ---- Match sheet names to People ---------------------------------------
  const people = await prisma.person.findMany({
    where: { organizationId: orgId, isEmployee: true },
  });
  const byNorm = new Map(people.map(p => [norm(p.name), p]));
  const resolve = (sheetName: string) => {
    const n = ALIASES[norm(sheetName)] || norm(sheetName);
    if (byNorm.has(n)) return byNorm.get(n)!;
    // Prefix match can be ambiguous ("naveenraj" prefixes both "naveenrajn"
    // and "naveenrajesh") — pick the candidate with the smallest length gap.
    let best: any = null, bestGap = Infinity;
    for (const [k, p] of byNorm) {
      if (k.startsWith(n) || n.startsWith(k)) {
        const gap = Math.abs(k.length - n.length);
        if (gap < bestGap) { best = p; bestGap = gap; }
      }
    }
    return best;
  };

  const distinctNames = [...new Set(rows.map(e => e.name))];
  const created: string[] = [];
  for (const sheetName of distinctNames) {
    if (resolve(sheetName)) continue;
    const latest = [...rows].reverse().find(e => e.name === sheetName)!;
    const p = await prisma.person.create({
      data: {
        organizationId: orgId, kind: 'CANDIDATE', isEmployee: true, stage: 'JOINED',
        name: sheetName, designation: latest.designation,
        currentMonthlyPackage: r2(latest.pkg),
        notes: 'Created by salary workbook import',
      },
    });
    byNorm.set(norm(sheetName), p);
    created.push(sheetName);
  }

  // ---- Import runs + entries ---------------------------------------------
  const periods = [...new Set(rows.map(e => e.period))].sort();
  console.log(`Importing ${rows.length} rows over ${periods.length} months -> org ${orgId}\n`);
  const report: string[] = [];
  let entriesCreated = 0, entriesSkipped = 0;
  let srcGross = 0, srcNet = 0, insGross = 0, insNet = 0;

  for (const period of periods) {
    const monthRows = rows.filter(e => e.period === period);
    const workingDays = monthRows[0].workingDays;
    let run = await prisma.payrollRun.findFirst({ where: { organizationId: orgId, period } });
    if (!run) {
      run = await prisma.payrollRun.create({
        data: {
          organizationId: orgId, period,
          status: 'FINALIZED', finalizedAt: new Date(),
          notes: 'Imported from Salary_25_26 workbook',
        },
      });
    }
    let mIns = 0, mSkip = 0;
    for (const e of monthRows) {
      srcGross = r2(srcGross + e.gross); srcNet = r2(srcNet + e.net);
      const person = resolve(e.name)!;
      const exists = await prisma.payslipEntry.findFirst({
        where: { runId: run.id, personId: person.id },
      });
      if (exists) { mSkip++; entriesSkipped++; continue; }
      const employerContributions = r2(e.esiEr + e.pfEr);
      await prisma.payslipEntry.create({
        data: {
          organizationId: orgId, runId: run.id, personId: person.id,
          monthlyPackage: r2(e.pkg), totalWorkingDays: e.workingDays,
          empLeaveDays: r2(e.empLeave), lopDays: r2(e.lop),
          presentDays: r2(e.presentDays), payDays: r2(e.payDays),
          internetAllowance: r2(e.internet), salaryArrearAllowance: r2(e.arrear),
          salaryAdvance: r2(e.advance), tds: r2(e.tds),
          basic: r2(e.basic), da: r2(e.da), hra: r2(e.hra),
          transportAllowance: r2(e.transport), foodAllowance: r2(e.food),
          grossSalary: r2(e.gross),
          isEsiEligible: e.esiEmp > 0, esiEmployee: r2(e.esiEmp), esiEmployer: r2(e.esiEr),
          isPfApplicable: e.pfEmp > 0, pfEmployee: r2(e.pfEmp), pfEmployer: r2(e.pfEr),
          totalDeductions: r2(e.deductions), netPayable: r2(e.net),
          employerContributions, ctc: r2(e.gross + employerContributions),
        },
      });
      insGross = r2(insGross + e.gross); insNet = r2(insNet + e.net);
      mIns++; entriesCreated++;
    }
    report.push(`  ${period}  entries=${String(mIns).padStart(2)} skipped=${mSkip}  workDays=${workingDays}`);
  }

  console.log(report.join('\n'));
  if (created.length) console.log(`\nNEW PEOPLE created (${created.length}): ${created.join(', ')}`);
  console.log(`\nEntries: ${entriesCreated} created, ${entriesSkipped} already existed`);
  console.log(`Source sums (deduped): gross=${srcGross.toFixed(2)} net=${srcNet.toFixed(2)}`);
  console.log(`Inserted sums:          gross=${insGross.toFixed(2)} net=${insNet.toFixed(2)}`);
  const match = entriesSkipped > 0 || (srcGross === insGross && srcNet === insNet);
  console.log(match ? 'RECONCILIATION OK' : 'RECONCILIATION MISMATCH');

  if (skippedDup.length) {
    console.log(`\nDUPLICATE/EXTRA rows NOT imported (${skippedDup.length}) — review:`);
    for (const e of skippedDup) {
      console.log(`  ${e.period} ${e.name.padEnd(22)} payDays=${e.payDays} gross=${r2(e.gross)} net=${r2(e.net)} (${e.sheet} r${e.row})`);
    }
  }
  await prisma.$disconnect();
  if (!match) process.exit(1);
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
