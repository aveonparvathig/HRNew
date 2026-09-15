// Payroll calculation engine - pure, DB-independent.
// Direct port of the Django services/payroll_calc.py, which reproduces the
// source Salary Excel's formulas exactly:
//
//   Basic  = ROUND(((package * basic%) / total_working_days) * pay_days, 0)
//   DA/HRA/Transport/Food = Basic * their % (2dp)
//   Gross  = Basic + DA + HRA + Transport + Food + Internet + Arrear
//   ESI Emp/Er = ROUNDUP(base * %, 0), base = Basic+DA+HRA+Transport+Food
//   PF Emp = min((Basic+DA)*wage_factor%, wage_cap) * pf%
//   Net = Gross - (ESI Emp + PF Emp + Advance + TDS)
//
// Excel ROUND() = round half away from zero; ROUNDUP() = ceiling here.

const r0 = (n: number) => Math.round(n); // half-up for non-negative amounts
const r2 = (n: number) => Math.round(n * 100) / 100;
const ceil0 = (n: number) => Math.ceil(n - 1e-9); // guard float dust

export interface EntryInputs {
  monthlyPackage: number;
  totalWorkingDays: number;
  empLeaveDays?: number;
  lopDays?: number;
  internetAllowance?: number;
  salaryArrearAllowance?: number;
  salaryAdvance?: number;
  tds?: number;
  isEsiEligible?: boolean;
  isPfApplicable?: boolean;
}

export function computeEntry(inp: EntryInputs, s: any) {
  const twd = inp.totalWorkingDays || 0;
  const empLeave = Number(inp.empLeaveDays || 0);
  const lop = Number(inp.lopDays || 0);
  const internet = Number(inp.internetAllowance || 0);
  const arrear = Number(inp.salaryArrearAllowance || 0);
  const advance = Number(inp.salaryAdvance || 0);
  const tds = Number(inp.tds || 0);

  const presentDays = twd - empLeave;
  const payDays = twd - lop;

  const perDay = twd ? (inp.monthlyPackage * s.basicPercentOfPackage / 100) / twd : 0;
  const basic = r0(perDay * payDays);

  const da = r2(basic * s.daPercentOfBasic / 100);
  const hra = r2(basic * s.hraPercentOfBasic / 100);
  const transportAllowance = r2(basic * s.transportPercentOfBasic / 100);
  const foodAllowance = r2(basic * s.foodPercentOfBasic / 100);

  const grossSalary = r2(basic + da + hra + transportAllowance + foodAllowance + internet + arrear);

  const esiBase = basic + da + hra + transportAllowance + foodAllowance;
  const esiEmployee = inp.isEsiEligible ? ceil0(esiBase * s.esiEmployeePercent / 100) : 0;
  const esiEmployer = inp.isEsiEligible ? ceil0(esiBase * s.esiEmployerPercent / 100) : 0;

  let pfEmployee = 0;
  let pfEmployer = 0;
  if (inp.isPfApplicable) {
    const cappedBase = Math.min((basic + da) * s.pfWageFactor / 100, s.pfWageCap);
    pfEmployee = r2(cappedBase * s.pfEmployeePercent / 100);
    pfEmployer = s.pfEmployerMatchesEmployee
      ? pfEmployee
      : r2(cappedBase * s.pfEmployerPercent / 100);
  }

  const totalDeductions = r2(esiEmployee + pfEmployee + advance + tds);
  const netPayable = r2(grossSalary - totalDeductions);
  const employerContributions = r2(esiEmployer + pfEmployer);
  const ctc = r2(grossSalary + employerContributions);

  return {
    presentDays, payDays,
    basic, da, hra, transportAllowance, foodAllowance, grossSalary,
    esiEmployee, esiEmployer, pfEmployee, pfEmployer,
    totalDeductions, netPayable, employerContributions, ctc,
  };
}

// ---------------------------------------------------------------------------
// Amount in words (Indian numbering)
// ---------------------------------------------------------------------------
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return (TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '')).trim();
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  return [(h ? ONES[h] + ' Hundred' : ''), twoDigits(rest)].filter(Boolean).join(' ');
}

export function amountInWords(amount: number): string {
  const n = Math.round(Math.abs(amount));
  if (n === 0) return 'Zero Rupees Only';
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  const parts = [
    crore ? `${twoDigits(crore)} Crore` : '',
    lakh ? `${twoDigits(lakh)} Lakh` : '',
    thousand ? `${twoDigits(thousand)} Thousand` : '',
    rest ? threeDigits(rest) : '',
  ].filter(Boolean);
  return `${parts.join(' ')} Rupees Only`;
}

// ---------------------------------------------------------------------------
// Payslip HTML (print-ready, letterhead style)
// ---------------------------------------------------------------------------
const esc = (v: any) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const inr = (n: number) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

export function renderPayslipHtml(brand: any, run: any, entry: any, person: any): string {
  const orgName = brand.name || 'Organization';
  const primary = brand.brandPrimary || '#4f46e5';
  const accent = brand.brandAccent || '#312e81';
  const row = (label: string, amount: number) =>
    `<tr><td>${label}</td><td class="amt">${inr(amount)}</td></tr>`;

  const earnings = [
    row('Basic', entry.basic), row('Dearness Allowance', entry.da),
    row('House Rent Allowance', entry.hra), row('Transport Allowance', entry.transportAllowance),
    row('Food Allowance', entry.foodAllowance),
    entry.internetAllowance ? row('Internet Allowance', entry.internetAllowance) : '',
    entry.salaryArrearAllowance ? row('Salary Arrear', entry.salaryArrearAllowance) : '',
  ].join('');

  const deductions = [
    entry.esiEmployee ? row('ESI (Employee)', entry.esiEmployee) : '',
    entry.pfEmployee ? row('PF (Employee)', entry.pfEmployee) : '',
    entry.salaryAdvance ? row('Salary Advance', entry.salaryAdvance) : '',
    entry.tds ? row('TDS', entry.tds) : '',
  ].join('') || '<tr><td class="muted">No deductions</td><td class="amt">₹0.00</td></tr>';

  return `
<div style="font-family:'Segoe UI',-apple-system,sans-serif;color:#1a1a2e;font-size:13.5px;line-height:1.6;">
  <style>
    .ps-table { width:100%; border-collapse:collapse; }
    .ps-table th, .ps-table td { border:1px solid #d6dbe3; padding:8px 12px; font-size:13px; }
    .ps-table th { background:#eef2ff; color:#312e81; text-align:left; }
    .ps-table .amt { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .ps-table .muted { color:#6b7280; }
    .ps-info td { border:1px solid #e2e8f0; padding:6px 12px; font-size:12.5px; }
    .ps-info td:nth-child(odd) { background:#f8fafc; color:#475569; width:18%; font-weight:600; }
  </style>
  <div style="border-bottom:3px solid ${primary};padding-bottom:12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:flex-end;">
    <div style="display:flex;align-items:center;gap:14px;">
      ${brand.logoData ? `<img src="${brand.logoData}" alt="" style="height:48px;max-width:140px;object-fit:contain;"/>` : ''}
      <div>
        <div style="font-size:24px;font-weight:bold;color:${accent};">${esc(orgName)}</div>
        ${brand.addressLine ? `<div style="font-size:11.5px;color:#666;">${esc(brand.addressLine)}</div>` : ''}
      </div>
    </div>
    <div style="font-size:13px;color:#555;">Payslip — <strong>${monthLabel(run.period)}</strong></div>
  </div>

  <table class="ps-info" style="width:100%;border-collapse:collapse;margin:16px 0 18px;">
    <tr>
      <td>Employee</td><td><strong>${esc(person.name)}</strong></td>
      <td>Employee Code</td><td>${esc(person.employeeNo || '—')}</td>
    </tr>
    <tr>
      <td>Designation</td><td>${esc(person.designation || '—')}</td>
      <td>Department</td><td>${esc(person.department || '—')}</td>
    </tr>
    <tr>
      <td>Monthly Package</td><td>${inr(entry.monthlyPackage)}</td>
      <td>Bank A/c</td><td>${esc(person.bankAccountNumber || '—')}${person.bankName ? ` (${esc(person.bankName)})` : ''}</td>
    </tr>
    <tr>
      <td>PAN</td><td>${esc(person.panNumber || '—')}</td>
      <td>PF UAN</td><td>${esc(person.pfUan || '—')}</td>
    </tr>
    <tr>
      <td>Working Days</td><td>${entry.totalWorkingDays}</td>
      <td>Pay Days</td><td>${entry.payDays}${entry.lopDays ? ` <span style="color:#b45309;">(${entry.lopDays} LOP)</span>` : ''}</td>
    </tr>
  </table>

  <div style="display:flex;gap:18px;align-items:flex-start;">
    <div style="flex:1;">
      <table class="ps-table">
        <tr><th>Earnings</th><th style="text-align:right;">Amount</th></tr>
        ${earnings}
        <tr><td><strong>Gross Salary</strong></td><td class="amt"><strong>${inr(entry.grossSalary)}</strong></td></tr>
      </table>
    </div>
    <div style="flex:1;">
      <table class="ps-table">
        <tr><th>Deductions</th><th style="text-align:right;">Amount</th></tr>
        ${deductions}
        <tr><td><strong>Total Deductions</strong></td><td class="amt"><strong>${inr(entry.totalDeductions)}</strong></td></tr>
      </table>
      <table class="ps-table" style="margin-top:14px;">
        <tr><th>Employer Contributions</th><th style="text-align:right;">Amount</th></tr>
        ${entry.esiEmployer ? row('ESI (Employer)', entry.esiEmployer) : ''}
        ${entry.pfEmployer ? row('PF (Employer)', entry.pfEmployer) : ''}
        <tr><td>CTC (this month)</td><td class="amt">${inr(entry.ctc)}</td></tr>
      </table>
    </div>
  </div>

  <div style="margin-top:20px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:8px;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:12px;color:#4338ca;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Net Payable</div>
      <div style="font-size:12.5px;color:#475569;margin-top:2px;">${esc(amountInWords(entry.netPayable))}</div>
    </div>
    <div style="font-size:26px;font-weight:800;color:#312e81;">${inr(entry.netPayable)}</div>
  </div>

  ${entry.remarks ? `<p style="margin-top:14px;font-size:12.5px;color:#64748b;"><strong>Remarks:</strong> ${esc(entry.remarks)}</p>` : ''}

  <p style="margin-top:26px;font-size:11.5px;color:#94a3b8;">
    This is a computer-generated payslip and does not require a signature.
  </p>
</div>`;
}
