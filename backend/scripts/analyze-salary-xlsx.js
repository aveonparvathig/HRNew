/**
 * Analyze the Aveon salary workbook (Salary_25_26 format): extract every
 * monthly row, recompute the sheet's own formulas from the inputs, and
 * report any cell where the stored value differs (manual overrides,
 * rounding drift). Prints a month-by-month summary + full-row JSON dump.
 *
 * Usage: node scripts/analyze-salary-xlsx.js "<path to xlsx>" [--dump out.json]
 */
const Excel = require('exceljs');
const fs = require('fs');

const file = process.argv[2];
const dumpIdx = process.argv.indexOf('--dump');
const dumpPath = dumpIdx > 0 ? process.argv[dumpIdx + 1] : null;

const num = v => {
  if (v == null || v === '') return 0;
  if (typeof v === 'object') v = v.result ?? 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};
const val = c => {
  let v = c.value;
  if (v && typeof v === 'object' && 'result' in v) return v.result;
  if (v && typeof v === 'object' && v.richText) return v.richText.map(t => t.text).join('');
  return v;
};
const r2 = x => Math.round(x * 100) / 100;

(async () => {
  const wb = new Excel.Workbook();
  await wb.xlsx.readFile(file);

  const rows = [];
  for (const ws of [wb.getWorksheet('Sheet1'), wb.getWorksheet('Sheet3')].filter(Boolean)) {
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const month = val(row.getCell(1));
      const name = String(val(row.getCell(3)) || '').trim();
      if (!name || !(month instanceof Date)) continue;
      const g = c => num(row.getCell(c).value);
      rows.push({
        sheet: ws.name, row: r,
        period: month.toISOString().slice(0, 7),
        name,
        designation: String(val(row.getCell(4)) || '').trim(),
        workingDays: g(5), clCredit: g(6), empLeave: g(7), lop: g(8),
        presentDays: g(9), payDays: g(10),
        package: g(11), basic: g(12), da: g(13), hra: g(14),
        transport: g(15), food: g(16), internet: g(17), arrear: g(18),
        gross: g(19), esiEmp: g(20), esiEr: g(21), pfEmp: g(22), pfEr: g(23),
        advance: g(24), tds: g(25), deductions: g(26), net: g(27),
      });
    }
  }

  // Recompute per the sheet's formulas and compare
  const issues = [];
  for (const e of rows) {
    const exp = {};
    exp.payDays = e.workingDays - e.lop;
    exp.basic = Math.round(((e.package * 0.5) / e.workingDays) * e.payDays);
    exp.da = r2(exp.basic * 0.45);
    exp.hra = r2(exp.basic * 0.25);
    exp.transport = r2(exp.basic * 0.2);
    exp.food = r2(exp.basic * 0.1);
    exp.gross = r2(exp.basic + exp.da + exp.hra + exp.transport + exp.food + e.internet + e.arrear);
    // PF: IF((basic+da)*0.6 > 15000, cap path, else 12% of (basic+da)*0.6) — infer both
    const pfBase = (e.basic + e.da) * 0.6;
    exp.pfCapped = Math.round(15000 * 0.12);
    exp.pfUncapped = Math.round(pfBase * 0.12);
    exp.deductions = r2(e.esiEmp + e.pfEmp + e.advance + e.tds);
    exp.net = r2(e.gross - e.deductions);

    const diff = (field, got, want, tol = 1.01) => {
      if (Math.abs(got - want) > tol) issues.push({ where: `${e.sheet} r${e.row}`, period: e.period, name: e.name, field, stored: got, computed: r2(want) });
    };
    diff('payDays', e.payDays, exp.payDays, 0.01);
    diff('basic', e.basic, exp.basic);
    diff('da', e.da, exp.da);
    diff('hra', e.hra, exp.hra);
    diff('transport', e.transport, exp.transport);
    diff('food', e.food, exp.food);
    diff('gross', e.gross, exp.gross);
    if (e.pfEmp !== 0 && Math.abs(e.pfEmp - exp.pfCapped) > 1.01 && Math.abs(e.pfEmp - exp.pfUncapped) > 1.01) {
      issues.push({ where: `${e.sheet} r${e.row}`, period: e.period, name: e.name, field: 'pfEmp', stored: e.pfEmp, computed: `${exp.pfUncapped} (uncapped) / ${exp.pfCapped} (capped)` });
    }
    diff('deductions', e.deductions, exp.deductions);
    diff('net', e.net, exp.net);
  }

  // Month summary
  const byMonth = {};
  for (const e of rows) {
    const m = (byMonth[e.period] ||= { rows: 0, workingDays: new Set(), gross: 0, net: 0, deductions: 0 });
    m.rows++; m.workingDays.add(e.workingDays);
    m.gross = r2(m.gross + e.gross); m.net = r2(m.net + e.net); m.deductions = r2(m.deductions + e.deductions);
  }
  console.log('MONTHS:');
  for (const [p, m] of Object.entries(byMonth).sort()) {
    console.log(`  ${p}  rows=${String(m.rows).padStart(2)}  workDays=${[...m.workingDays].join('/')}  gross=${m.gross.toFixed(2)}  net=${m.net.toFixed(2)}`);
  }
  const names = [...new Set(rows.map(e => e.name))].sort();
  console.log(`\nTOTAL rows: ${rows.length} | distinct names: ${names.length}`);
  console.log('NAMES:', names.join(' | '));
  console.log(`\nFORMULA MISMATCHES (stored vs recomputed): ${issues.length}`);
  for (const i of issues.slice(0, 40)) {
    console.log(`  ${i.period} ${i.name.padEnd(20)} ${i.field.padEnd(11)} stored=${i.stored} computed=${i.computed} (${i.where})`);
  }
  if (issues.length > 40) console.log(`  ...and ${issues.length - 40} more`);

  if (dumpPath) fs.writeFileSync(dumpPath, JSON.stringify(rows, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
