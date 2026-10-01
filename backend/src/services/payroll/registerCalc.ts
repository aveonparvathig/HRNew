// Labour-law registers, each as a plain table: the columns the rules
// prescribe, in their order and with their numbers, filled from payroll.
// Pure, DB-independent. A cell the system has no data for is left blank
// rather than guessed.
//
// Layouts: Tamil Nadu Shops and Establishments Rules, 1948, Forms U, V, W
// and X (as substituted in March 2022); the central Ease of Compliance to
// Maintain Registers Rules, 2017, Forms A to D; Payment of Bonus Rules,
// 1975, Forms C and D.

const r2 = (n: number) => Math.round(n * 100) / 100;
const r0 = (n: number) => Math.round(n);

export type Cell = string | number | null;

export interface RegisterColumn {
  no: string;                 // the column's number in the form, "" when it has none
  label: string;
  group?: string;             // heading spanning neighbouring columns
  kind?: 'amount' | 'number' | 'text' | 'narrow';
}

export interface Register {
  form: string;               // "Form W"
  title: string;
  rule: string;               // the rule the form is prescribed under
  header: [string, string][]; // particulars printed above the table
  columns: RegisterColumn[];
  rows: Cell[][];
  totals?: Cell[];
  notes: string[];
}

export interface Establishment {
  name: string;
  address: string;
  employer: string;       // owner / employer
  manager: string;
  registrationNo: string; // Shops and Establishments registration certificate
  lin: string;            // Labour Identification Number
}

const col = (no: string, label: string, kind: RegisterColumn['kind'] = 'text', group?: string): RegisterColumn =>
  ({ no, label, kind, group });
const numbered = (labels: [string, RegisterColumn['kind']?, string?][], style: (n: number) => string): RegisterColumn[] =>
  labels.map(([label, kind, group], i) => col(style(i + 1), label, kind || 'text', group));
const paren = (n: number) => `(${n})`;
const plain = (n: number) => String(n);

// dd/mm/yyyy, or blank
export const dmy = (date?: string | null) => (date ? date.slice(0, 10).split('-').reverse().join('/') : '');
const monthName = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};
const lastDay = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const periodRange = (period: string) => `01/${period.slice(5)}/${period.slice(0, 4)} to ${lastDay(period)}/${period.slice(5)}/${period.slice(0, 4)}`;
const bank = (p: any) => [p.bankAccountNumber, p.bankName, p.ifscCode].filter(Boolean).join(', ');
const sumColumn = (rows: Cell[][], index: number) => r2(rows.reduce((s, r) => s + (typeof r[index] === 'number' ? (r[index] as number) : 0), 0));

// Totals row: the sum under every amount column, a label in the name column.
function totalsRow(columns: RegisterColumn[], rows: Cell[][], labelIndex: number): Cell[] {
  return columns.map((c, i) => (i === labelIndex ? `Total (${rows.length})` : c.kind === 'amount' ? sumColumn(rows, i) : null));
}

// Age in completed years on a date.
export function ageOn(dateOfBirth: string | null | undefined, on: string): number | null {
  if (!dateOfBirth) return null;
  const [by, bm, bd] = dateOfBirth.split('-').map(Number);
  const [y, m, d] = on.split('-').map(Number);
  if (!by) return null;
  return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
}

// Men, women and young persons (under 18) among the people employed.
export function headcount(people: { gender?: string; dateOfBirth?: string | null }[], on: string) {
  const out = { men: 0, women: 0, maleYoung: 0, femaleYoung: 0, notRecorded: 0 };
  for (const p of people) {
    const g = String(p.gender || '').trim().toUpperCase();
    const female = g.startsWith('F') || g.startsWith('W');
    const male = g.startsWith('M');
    const age = ageOn(p.dateOfBirth, on);
    const young = age !== null && age < 18;
    if (female) { if (young) out.femaleYoung++; else out.women++; }
    else if (male) { if (young) out.maleYoung++; else out.men++; }
    else out.notRecorded++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// What a payslip breaks down into for the wage registers
// ---------------------------------------------------------------------------
export interface WageEntry {
  monthlyPackage: number;
  payDays: number;
  totalWorkingDays: number;
  empLeaveDays: number;
  lopDays: number;
  basic: number; da: number; hra: number;
  grossSalary: number;
  pfEmployee: number; pfEmployer: number; esiEmployee: number; esiEmployer: number;
  lwfEmployee: number; lwfEmployer: number;
  professionalTax: number; tds: number; salaryAdvance: number; loanDeduction: number;
  totalDeductions: number; netPayable: number;
  payStatus?: string; paidOn?: string | null; paymentRef?: string;
  lines: { code?: string; name: string; type: string; amount: number }[];
  person: any;
  // From the loan ledger for the month
  advance?: { paid: number; opening: number; principalRecovered: number };
}

export function wageBreakup(e: WageEntry) {
  const line = (code: string) => r2(e.lines.filter(l => l.code === code).reduce((s, l) => s + l.amount, 0));
  const overtime = line('OVERTIME');
  const pf = r2(e.pfEmployee + line('PF_ON_ARREARS'));
  const esi = r2(e.esiEmployee + line('ESI_ON_ARREARS'));
  const loanPrincipal = Math.min(e.advance?.principalRecovered ?? e.loanDeduction, e.loanDeduction);
  const advanceRecovered = r2(e.salaryAdvance + loanPrincipal);
  const opening = r2(e.advance?.opening ?? 0);
  const paid = r2(e.advance?.paid ?? 0);
  return {
    overtime,
    otherAllowances: r2(e.grossSalary - e.basic - e.da - e.hra - overtime),
    pf, esi, lwf: e.lwfEmployee,
    advancePaid: paid, advanceOpening: opening, advanceRecovered,
    advancePending: r2(Math.max(0, opening + paid - loanPrincipal)),
    otherDeductions: r2(e.totalDeductions - pf - esi - e.lwfEmployee - advanceRecovered),
    gratuityPaid: line('GRATUITY'),
  };
}

// ---------------------------------------------------------------------------
// Tamil Nadu Shops and Establishments Rules: Forms U, V, W, X
// ---------------------------------------------------------------------------
const TN_RULE = 'Tamil Nadu Shops and Establishments Rules, 1948 — see sub-rule (1) of rule 16';
const tnHeader = (est: Establishment): [string, string][] => [
  ['Name and address of the establishment', [est.name, est.address].filter(Boolean).join(', ')],
  ['Registration certificate no.', est.registrationNo],
];
const tnHeaderFull = (est: Establishment): [string, string][] => [
  ['Name and address of the establishment', [est.name, est.address].filter(Boolean).join(', ')],
  ['Name and address of the employer', est.employer],
  ['Name of the manager / in-charge', est.manager],
  ['Registration certificate no.', est.registrationNo],
];

export function tnFormU(est: Establishment, people: any[]): Register {
  const columns = numbered([
    ['Serial Number', 'narrow'], ['Name of the employee'], ['Employee Identification No.'], ['Gender'], ['Father / Spouse Name'],
    ['Date of Birth'], ['Date of entry into service'], ['Designation'], ['Present Address'], ['Permanent address'],
    ["Employee's Provident Fund No."], ["Employee's State Insurance Corporation No."], ['Aadhaar No.'],
    ['Date on which completion of 480 days of service'], ['Date on which made permanent'], ['Period of Suspension if any'],
    ['Bank A/c Number, Name of Bank, Branch (IFSC Code)'], ['Photo'], ['Mobile Number'], ['e-mail I.D'],
    ['Specimen Signature / Thumb Impression'], ['Date of Exit'], ['Reason for Exit'], ['Remarks'],
  ], paren);
  const rows = people.map((p, i): Cell[] => [
    i + 1, p.name, p.employeeNo || '', p.gender || '', p.parentSpouseName || '', dmy(p.dateOfBirth), dmy(p.joinDate),
    p.designation || '', p.address || '', '', p.pfUan || p.pfNumber || '', p.esiNumber || '', p.aadharNo || '',
    '', '', '', bank(p), p.hasPhoto ? 'On file' : '', p.phone || '', p.officialEmail || p.email || '',
    '', dmy(p.leavingDate), p.reasonForLeaving || '', '',
  ]);
  return {
    form: 'Form U', title: 'Employee Register', rule: TN_RULE, header: tnHeader(est), columns, rows,
    notes: ['Permanent address, the dates of completing 480 days and of being made permanent, and periods of suspension are not recorded in the system: fill them in by hand.'],
  };
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function tnFormV(est: Establishment, period: string, entries: WageEntry[]): Register {
  const columns: RegisterColumn[] = [
    col('(1)', 'Serial Number', 'narrow'), col('(2)', 'Name of the Employee'), col('(3)', 'Employee Identification No.'),
    col('(4)', 'Time at which work commences'), col('(5)', 'Rest Interval'), col('(6)', 'Time at which work ends'),
    ...DAYS.map(d => col('', String(d), 'narrow', '(7) Daily hours of work including overtime (if any)')),
    col('(8)', 'Total Days Worked', 'number'), col('(9)', 'Total Hours Worked', 'number'),
    col('(10)', 'Number of days on Loss of Pay', 'number'),
    col('(11)', 'Benefit availed for working on National Holiday'), col('(12)', 'Benefit availed for working on Festival Holiday'),
    col('(13)', 'Remarks'),
  ];
  const rows = entries.map((e, i): Cell[] => [
    i + 1, e.person.name, e.person.employeeNo || '', '', '', '', ...DAYS.map(() => ''),
    e.payDays, '', e.lopDays || '', '', '', e.empLeaveDays ? `${e.empLeaveDays} day${e.empLeaveDays === 1 ? '' : 's'} leave` : '',
  ]);
  return {
    form: 'Form V', title: 'Register of Employment', rule: TN_RULE,
    header: [...tnHeaderFull(est), ['For the period', periodRange(period)], ['Festival holidays approval proceedings no. and date', ''], ['Approved festival holidays', '']],
    columns, rows,
    notes: [
      'Daily hours, work timings and holiday working are not recorded in the system: only the days worked, leave and loss of pay of the month are filled in.',
      'Abbreviations: H weekly holiday, FH festival holiday, NH national holiday, EL earned leave, ML medical leave, HW holiday with wages, MBL maternity leave, SH substituted holiday, SP suspension, LOP loss of pay.',
    ],
  };
}

export function tnFormW(est: Establishment, period: string, entries: WageEntry[], counts: ReturnType<typeof headcount>): Register {
  const A = 'Advances', F = 'Damages / Fine';
  const columns = numbered([
    ['Serial Number', 'narrow'], ['Name of the Employee'], ['Employee Identification No.'], ['Number of days worked', 'number'],
    ['Basic Wage', 'amount'], ['Dearness Allowance', 'amount'], ['House Rent Allowance', 'amount'],
    ['Other Allowances (nature may be specified)', 'amount'], ['Overtime Wages', 'amount'],
    ['Overtime Wages (wages for EL availed / double wages for National Festival Holidays / wages for accumulated leave)', 'amount'],
    ['Gross Wages', 'amount'],
    ['Provident Fund No.', 'amount', 'Deductions'], ["Employee's State Insurance Corporation No.", 'amount', 'Deductions'], ['Labour Welfare Fund', 'amount', 'Deductions'],
    ['Advance Paid', 'amount', A], ['Advance recovery pending at the beginning of the month', 'amount', A],
    ['Advance Recovered', 'amount', A], ['Pending Recovery', 'amount', A],
    ['Deduction imposed on Damages, Loss or Fines', 'amount', F], ['Deduction recovery pending at beginning of the month', 'amount', F],
    ['Deduction made on Damages, Loss or Fines', 'amount', F], ['Pending Recovery', 'amount', F],
    ['Any other Deductions', 'amount', 'Deductions'], ['Total Deductions', 'amount', 'Deductions'],
    ['Net Wages', 'amount'], ['Date of payment'], ['Unpaid accumulations', 'amount'],
    ['Rate at which subsistence allowance calculated and amount paid'], ['Receipt by Employee / Bank Transaction Identity and Date'], ['Remarks'],
  ], paren);
  const rows = entries.map((e, i): Cell[] => {
    const b = wageBreakup(e);
    return [
      i + 1, e.person.name, e.person.employeeNo || '', e.payDays,
      e.basic, e.da, e.hra, b.otherAllowances, b.overtime, 0, e.grossSalary,
      b.pf, b.esi, b.lwf, b.advancePaid, b.advanceOpening, b.advanceRecovered, b.advancePending,
      0, 0, 0, 0, b.otherDeductions, e.totalDeductions, e.netPayable,
      dmy(e.paidOn), 0, '', e.paymentRef || '', e.payStatus === 'HOLD' ? 'Salary on hold' : '',
    ];
  });
  return {
    form: 'Form W', title: 'Register of Wages', rule: TN_RULE,
    header: [
      ...tnHeaderFull(est),
      ['Total number of persons employed', `Men ${counts.men}, Women ${counts.women}, Male young persons ${counts.maleYoung}, Female young persons ${counts.femaleYoung}${counts.notRecorded ? ` (gender not recorded for ${counts.notRecorded})` : ''}`],
      ['Wage period', `${periodRange(period)} (Monthly)`],
    ],
    columns, rows, totals: totalsRow(columns, rows, 1),
    notes: [
      'Other allowances: Transport, Food and Internet allowances, salary arrears and one-off earnings. Any other deductions: Professional Tax, income tax (TDS), loan interest and other one-off deductions.',
      'Columns 12 and 13 show the Provident Fund and ESI amounts deducted; the PF and ESI numbers themselves are in Form U.',
      'Advances are salary advances and employee loans. Deductions for damages, loss or fines, unpaid accumulations and subsistence allowance are not recorded in the system.',
    ],
  };
}

export function tnFormX(est: Establishment, period: string, entries: WageEntry[]): Register {
  const EL = 'Earned Leave', ML = 'Medical Leave', OL = 'Other Leave', MB = 'Maternity Benefits', GB = 'Gratuity Benefits';
  const columns = numbered([
    ['Serial Number', 'narrow'], ['Name of the employee'], ['Employee Identification No.'],
    ['Leave at the beginning of the Month', 'number', EL], ['Leave earned during the Period', 'number', EL],
    ['Leave availed during the Month', 'number', EL], ['Leave balance at the end of the Month', 'number', EL],
    ['Leave at beginning of the Month', 'number', ML], ['Leave availed during the Month', 'number', ML], ['Leave balance at end of the Month', 'number', ML],
    ['Leave at beginning of the Month', 'number', OL], ['Leave availed during the Month', 'number', OL], ['Leave Balance at end of the Month', 'number', OL],
    ['Date of giving notice of pregnancy / delivery', 'text', MB],
    ['Amount of Maternity Benefit paid in advance of expected delivery and Date of Payment', 'text', MB],
    ['Subsequent payment of Maternity Benefit and date of payment', 'text', MB],
    ['Amount paid as Medical Bonus and Date of Payment', 'text', MB],
    ['Leave with Wages as per section 9 or 10 under Maternity Benefit Act, 1961', 'text', MB],
    ['Whether nomination received from the employee', 'text', GB], ['Amount paid as Gratuity in case of exit of the employee', 'amount', GB],
    ['Remarks'],
  ], paren);
  const rows = entries.map((e, i): Cell[] => [
    i + 1, e.person.name, e.person.employeeNo || '', '', '', '', '', '', '', '', '', e.empLeaveDays || '', '',
    '', '', '', '', '', '', wageBreakup(e).gratuityPaid, e.lopDays ? `${e.lopDays} day${e.lopDays === 1 ? '' : 's'} loss of pay` : '',
  ]);
  return {
    form: 'Form X', title: 'Register of Leave and Social Security Benefits', rule: TN_RULE,
    header: [...tnHeaderFull(est), ['For the month of', monthName(period)]],
    columns, rows,
    notes: ['Leave balances by type, maternity benefits and gratuity nominations are not recorded in the system. Leave taken in the month is shown under Other Leave, as its type is not recorded.'],
  };
}

// ---------------------------------------------------------------------------
// Central combined registers: Forms A, B, C, D
// ---------------------------------------------------------------------------
const CENTRAL_RULE = 'Ease of Compliance to Maintain Registers under various Labour Laws Rules, 2017';
const centralHeader = (est: Establishment): [string, string][] => [
  ['Name of the establishment', est.name], ['Name of owner', est.employer], ['LIN', est.lin],
];

export function formA(est: Establishment, people: any[]): Register {
  const columns = numbered([
    ['Sl. No.', 'narrow'], ['Employee Code'], ['Name'], ['Surname'], ['Gender'], ["Father's / Spouse Name"], ['Date of Birth'],
    ['Nationality'], ['Education Level'], ['Date of Joining'], ['Designation'], ['Category Address (HS/S/SS/US)'], ['Type of Employment'],
    ['Mobile'], ['UAN'], ['PAN'], ['ESIC IP'], ['LWF'], ['AADHAAR'], ['Bank A/c Number'], ['Bank'], ['Branch (IFSC)'],
    ['Present Address'], ['Permanent'], ['Service Book No.'], ['Date of Exit'], ['Reason for Exit'], ['Mark of Identification'],
    ['Photo'], ['Specimen Signature / Thumb Impression'], ['Remarks'],
  ], plain);
  const rows = people.map((p, i): Cell[] => [
    i + 1, p.employeeNo || '', p.name, '', p.gender || '', p.parentSpouseName || '', dmy(p.dateOfBirth), '', '',
    dmy(p.joinDate), p.designation || '', '', '', p.phone || '', p.pfUan || '', p.panNumber || '', p.esiNumber || '', '',
    p.aadharNo || '', p.bankAccountNumber || '', p.bankName || '', p.ifscCode || '', p.address || '', '', '',
    dmy(p.leavingDate), p.reasonForLeaving || '', '', p.hasPhoto ? 'On file' : '', '', '',
  ]);
  return {
    form: 'Form A', title: 'Employee Register', rule: CENTRAL_RULE, header: centralHeader(est), columns, rows,
    notes: ['The full name is under Name. Nationality, education, skill category, type of employment, permanent address and identification mark are not recorded in the system.'],
  };
}

export function formB(est: Establishment, period: string, entries: WageEntry[]): Register {
  const E = 'Earned Wages', D = 'Deduction';
  const columns = numbered([
    ['Sl. No. in Employee register'], ['Name'], ['Rate of Wage', 'amount'], ['No. of Days worked', 'number'], ['Overtime hours worked', 'number'],
    ['Basic', 'amount', E], ['Special Basic', 'amount', E], ['DA', 'amount', E], ['Payments Overtime', 'amount', E], ['HRA', 'amount', E],
    ['Others', 'amount', E], ['Total', 'amount', E],
    ['PF', 'amount', D], ['ESIC', 'amount', D], ['Society', 'amount', D], ['Income Tax', 'amount', D], ['Insurance', 'amount', D],
    ['Others', 'amount', D], ['Recoveries', 'amount', D], ['Total', 'amount', D],
    ['Net Payment', 'amount'], ['Employer Share PF / Welfare Fund', 'amount'], ['Receipt by Employee / Bank Transaction ID'], ['Date of Payment'], ['Remarks'],
  ], plain);
  const rows = entries.map((e): Cell[] => {
    const b = wageBreakup(e);
    return [
      e.person.employeeNo || '', e.person.name, e.monthlyPackage, e.payDays, '',
      e.basic, 0, e.da, b.overtime, e.hra, b.otherAllowances, e.grossSalary,
      b.pf, b.esi, 0, e.tds, 0, r2(b.otherDeductions + b.lwf - e.tds), b.advanceRecovered, e.totalDeductions,
      e.netPayable, r2(e.pfEmployer + e.lwfEmployer), e.paymentRef || '', dmy(e.paidOn), e.payStatus === 'HOLD' ? 'Salary on hold' : '',
    ];
  });
  return {
    form: 'Form B', title: 'Wage Register', rule: CENTRAL_RULE,
    header: [...centralHeader(est), ['Wage period', `${periodRange(period)} (Monthly)`]],
    columns, rows, totals: totalsRow(columns, rows, 1),
    notes: ['Rate of wage is the monthly package. Others under earned wages: Transport, Food and Internet allowances, arrears and one-off earnings. Others under deductions: Professional Tax, Labour Welfare Fund, loan interest and one-off deductions. Recoveries: salary advances and loan principal.'],
  };
}

export interface LoanRow {
  employeeNo: string; name: string; loanNo: string; title: string; annualRate: number;
  loanDate: string; totalLent: number; instalments: number; firstPeriod: string; lastPeriod: string;
  closedOn: string | null; outstanding: number;
}
const monthYear = (period: string) => (period ? `${period.slice(5)}/${period.slice(0, 4)}` : '');

export function formC(est: Establishment, yearLabel: string, loans: LoanRow[]): Register {
  const columns = numbered([
    ['Sl. Number in Employee register'], ['Name'], ['Recovery Type (Damage / loss / fine / advance / loans)'], ['Particulars'],
    ['Date of damage / Loss'], ['Amount', 'amount'], ['Whether show cause issued'], ['Explanation heard in presence of'],
    ['Number of Installments', 'number'], ['First Month / Year'], ['Last Month / Year'], ['Date of Complete Recovery'], ['Remarks'],
  ], plain);
  const rows = loans.map((l): Cell[] => [
    l.employeeNo, l.name, l.annualRate > 0 ? 'Loan' : 'Advance', [l.loanNo, l.title, `given ${dmy(l.loanDate)}`].filter(Boolean).join(' · '),
    '', l.totalLent, '', '', l.instalments, monthYear(l.firstPeriod), monthYear(l.lastPeriod), dmy(l.closedOn),
    l.closedOn ? '' : `Outstanding ${l.outstanding.toLocaleString('en-IN')}`,
  ]);
  return {
    form: 'Form C', title: 'Register of Loans / Recoveries', rule: CENTRAL_RULE,
    header: [['Name of establishment', est.name], ['LIN', est.lin], ['For the year', yearLabel]],
    columns, rows, totals: totalsRow(columns, rows, 1),
    notes: ['Lists employee loans and advances from the loan ledger. Deductions for damage, loss or fines are not recorded in the system.'],
  };
}

export function formD(est: Establishment, period: string, entries: WageEntry[]): Register {
  const columns: RegisterColumn[] = [
    col('1', 'Sl. Number in Employee register'), col('2', 'Name'), col('3', 'Relay # or set work'), col('4', 'Place of work'),
    ...DAYS.map(d => col('', String(d), 'narrow', '5. Date (IN / OUT)')),
    col('6', 'Summary No. of Days', 'number'), col('7', 'Remarks'), col('8', 'No. of hours', 'number'),
  ];
  const rows = entries.map((e): Cell[] => [
    e.person.employeeNo || '', e.person.name, '', e.person.workLocation?.name || '', ...DAYS.map(() => ''), e.payDays,
    [e.empLeaveDays ? `${e.empLeaveDays} leave` : '', e.lopDays ? `${e.lopDays} loss of pay` : ''].filter(Boolean).join(', '), '',
  ]);
  return {
    form: 'Form D', title: 'Attendance Register', rule: CENTRAL_RULE,
    header: [...centralHeader(est), ['For the period', periodRange(period)]],
    columns, rows,
    notes: ['Daily in and out times are not recorded in the system: only the month’s days paid, leave and loss of pay are filled in.'],
  };
}

// ---------------------------------------------------------------------------
// Payment of Bonus Act: statutory bonus, Forms C and D
// ---------------------------------------------------------------------------
export interface BonusRules {
  bonusPercent: number;          // 8.33 to 20
  bonusEligibilityLimit: number; // monthly Basic + DA up to which an employee is covered
  bonusWageCeiling: number;      // monthly Basic + DA counted for the bonus
}

export interface BonusMonth {
  basic: number;
  da: number;
  payDays: number;
  totalWorkingDays: number;
}

// The year's bonus for one employee. Salary is Basic + DA. An employee is
// covered when the full-month rate is within the limit, and qualifies with
// at least 30 days worked. Each month counts up to the ceiling, in
// proportion to the days paid.
export function bonusFor(months: BonusMonth[], rules: BonusRules) {
  let salary = 0, counted = 0, daysWorked = 0, rate = 0;
  for (const m of months) {
    const earned = r2(m.basic + m.da);
    salary = r2(salary + earned);
    daysWorked = r2(daysWorked + m.payDays);
    const share = m.totalWorkingDays ? m.payDays / m.totalWorkingDays : 0;
    counted = r2(counted + Math.min(earned, rules.bonusWageCeiling * share));
    if (m.payDays > 0) rate = r2((earned * m.totalWorkingDays) / m.payDays); // the latest month's full rate
  }
  const covered = rate > 0 && rate <= rules.bonusEligibilityLimit;
  const eligible = covered && daysWorked >= 30;
  return {
    salary, daysWorked, monthlyRate: rate, covered, eligible,
    bonusWage: eligible ? counted : 0,
    payable: eligible ? r0((counted * rules.bonusPercent) / 100) : 0,
  };
}

export interface BonusEmployee {
  name: string; employeeNo: string; fatherName: string; designation: string; dateOfBirth: string | null;
  months: BonusMonth[];
  paidInYear: number; // bonus paid through payroll during the accounting year
}

export function bonusFormC(est: Establishment, yearStart: number, employees: BonusEmployee[], rules: BonusRules) {
  const yearEnd = `31/03/${yearStart + 1}`;
  const columns: RegisterColumn[] = [
    col('1', 'Sl. No.', 'narrow'), col('2', 'Name of the employee'), col('3', "Father's name"),
    col('4', 'Whether he has completed 15 years of age at the beginning of the accounting year'),
    col('5', 'Designation'), col('6', 'No. of days worked in the year', 'number'),
    col('7', 'Total salary or wage in respect of the accounting year', 'amount'),
    col('8', 'Amount of bonus payable under section 10 or section 11 as the case may be', 'amount'),
    col('9', 'Puja bonus or other customary bonus paid during the accounting year', 'amount', 'Deductions'),
    col('10', 'Interim bonus or bonus paid in advance', 'amount', 'Deductions'),
    col('10A', 'Amount of income-tax deducted', 'amount', 'Deductions'),
    col('11', 'Deduction on account of financial loss, if any, caused by misconduct of the employee', 'amount', 'Deductions'),
    col('12', 'Total sum deducted under columns 9, 10, 10A and 11', 'amount', 'Deductions'),
    col('13', 'Net amount payable (column 8 minus column 12)', 'amount'), col('14', 'Amount actually paid', 'amount'),
    col('15', 'Date on which paid'), col('16', 'Signature / thumb impression of the employee'),
  ];
  const worked = employees.map(e => ({ e, b: bonusFor(e.months, rules) }));
  const eligible = worked.filter(w => w.b.eligible);
  const rows = eligible.map(({ e, b }, i): Cell[] => {
    const age = ageOn(e.dateOfBirth, `${yearStart}-04-01`);
    return [
      i + 1, e.name, e.fatherName, age === null ? '' : age >= 15 ? 'Yes' : 'No', e.designation, b.daysWorked, b.salary, b.payable,
      0, e.paidInYear, 0, 0, e.paidInYear, r2(b.payable - e.paidInYear), null, '', '',
    ];
  });
  const register: Register = {
    form: 'Form C', title: `Bonus paid to employees for the accounting year ending on ${yearEnd}`,
    rule: 'Payment of Bonus Rules, 1975 — see rule 4(c)',
    header: [['Name of the establishment', est.name], ['No. of working days in the year', '']],
    columns, rows, totals: totalsRow(columns, rows, 1),
    notes: [
      `Bonus at ${rules.bonusPercent}% of Basic + DA, each month counted up to ₹${rules.bonusWageCeiling.toLocaleString('en-IN')}. Covered: Basic + DA up to ₹${rules.bonusEligibilityLimit.toLocaleString('en-IN')} a month, with at least 30 days worked.`,
      `${worked.length - eligible.length} of ${worked.length} employees paid in the year are not covered or did not work 30 days, and are left out.`,
      'Column 10 holds bonus already paid through payroll during the year. Amount actually paid and its date are filled in when the bonus is paid.',
    ],
  };
  return {
    register,
    summary: {
      employees: worked.length, benefited: eligible.length,
      payable: r2(eligible.reduce((s, w) => s + w.b.payable, 0)),
      paidInYear: r2(eligible.reduce((s, w) => s + w.e.paidInYear, 0)),
    },
  };
}
