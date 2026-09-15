/**
 * Import employees from an XLSX export (Django app's "employees-all" format)
 * into a v2 organization as Person rows (kind CANDIDATE, isEmployee).
 *
 * Usage (from backend/):
 *   DATABASE_URL=postgresql://... npx ts-node scripts/import-employees-xlsx.ts \
 *     --file "path/to/employees-all.xlsx" --owner owner@email.com
 *
 * Idempotent: rows are matched by employee code (fallback: name, case
 * insensitive) within the owner's organization; existing people are skipped.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const s = (v: any) => (v == null ? '' : String(v).trim());
const yes = (v: any) => /^(yes|true|1)$/i.test(s(v));
const num = (v: any) => {
  const n = Number(String(v ?? '').replace(/[,\s₹]/g, ''));
  return isNaN(n) ? 0 : n;
};

// "02-02-2015" / "02/02/2015" (DD-MM-YYYY), "2015-02-02", or a JS Date -> "YYYY-MM-DD"
function toIso(v: any): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const str = s(v);
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function toStatus(statusCell: any, activeCell: any): string {
  const raw = s(statusCell).toUpperCase().replace(/[\s-]+/g, '_');
  const known = ['ACTIVE', 'PROBATION', 'NOTICE_PERIOD', 'RESIGNED', 'TERMINATED'];
  // The Active Yes/No flag is authoritative: an inactive person is never ACTIVE
  // even when the status column says so (the source export has that quirk).
  if (/^no$/i.test(s(activeCell))) {
    return ['RESIGNED', 'TERMINATED', 'NOTICE_PERIOD'].includes(raw) ? raw : 'RESIGNED';
  }
  if (known.includes(raw)) return raw;
  return 'ACTIVE';
}

async function main() {
  const file = arg('file');
  const ownerEmail = arg('owner');
  if (!file || !ownerEmail) throw new Error('Pass --file <xlsx> and --owner <email>');

  const owner = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!owner) throw new Error(`No user with email ${ownerEmail} — register that account in the app first`);
  const orgId = owner.organizationId;

  const Excel = require('exceljs');
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];

  // Header name -> column index
  const col: Record<string, number> = {};
  ws.getRow(1).eachCell((cell: any, i: number) => { col[s(cell.value)] = i; });
  const need = ['Name'];
  for (const h of need) if (!col[h]) throw new Error(`Column "${h}" not found in sheet`);
  const cellText = (row: any, header: string) => (col[header] ? s(row.getCell(col[header]).text) : '');
  const cellVal = (row: any, header: string) => (col[header] ? row.getCell(col[header]).value : null);

  console.log(`Importing "${file}" -> org ${orgId} (${ownerEmail})\n`);
  let created = 0, skipped = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const name = cellText(row, 'Name');
    if (!name) continue;
    const employeeNo = cellText(row, 'Employee Code');

    const existing = await prisma.person.findFirst({
      where: {
        organizationId: orgId,
        OR: [
          ...(employeeNo ? [{ employeeNo }] : []),
          { name: { equals: name, mode: 'insensitive' as const } },
        ],
      },
    });
    if (existing) { console.log(`  skip   ${name} (already exists)`); skipped++; continue; }

    await prisma.person.create({
      data: {
        organizationId: orgId,
        kind: 'CANDIDATE',
        isEmployee: true,
        stage: 'JOINED',
        name,
        employeeNo,
        designation: cellText(row, 'Designation'),
        department: cellText(row, 'Department'),
        joinDate: toIso(cellVal(row, 'Date of Joining')),
        leavingDate: toIso(cellVal(row, 'Relieving Date')),
        employmentStatus: toStatus(cellVal(row, 'Employment Status'), cellVal(row, 'Active')),
        currentMonthlyPackage: num(cellVal(row, 'Monthly Package (₹)') ?? cellVal(row, 'Monthly Package')),
        isEsiEligible: yes(cellVal(row, 'ESI Eligible')),
        isPfApplicable: yes(cellVal(row, 'PF Applicable')),
        panNumber: cellText(row, 'PAN Number'),
        pfNumber: cellText(row, 'PF Number'),
        pfUan: cellText(row, 'PF UAN'),
        esiNumber: cellText(row, 'ESI Number'),
        dateOfBirth: toIso(cellVal(row, 'Date of Birth')),
        bloodGroup: cellText(row, 'Blood Group'),
        maritalStatus: cellText(row, 'Marital Status'),
        aadharNo: cellText(row, 'Aadhaar Number'),
        address: cellText(row, 'Address'),
        email: cellText(row, 'Personal Email'),
        officialEmail: cellText(row, 'Official Email'),
        phone: cellText(row, 'Contact Number'),
        officialNo: cellText(row, 'Official Number'),
        emergencyNo: cellText(row, 'Emergency Number'),
        agreementSigned: yes(cellVal(row, 'Agreement Signed')),
        agreementSignDate: toIso(cellVal(row, 'Agreement Sign Date')),
        biometricId: cellText(row, 'Biometric ID'),
        reasonForLeaving: cellText(row, 'Reason for Leaving'),
        bankName: cellText(row, 'Bank Name'),
        bankAccountNumber: cellText(row, 'Account Number'),
        ifscCode: cellText(row, 'IFSC Code'),
      },
    });
    console.log(`  create ${employeeNo || '—'}  ${name}`);
    created++;
  }

  const total = await prisma.person.count({ where: { organizationId: orgId, isEmployee: true } });
  console.log(`\nDone: ${created} created, ${skipped} skipped. Employees in org now: ${total}`);
  await prisma.$disconnect();
}

main().catch(e => { console.error(e.message || e); process.exit(1); });
