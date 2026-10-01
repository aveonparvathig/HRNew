import { describe, it, expect } from 'vitest';
import {
  ageOn, headcount, wageBreakup, tnFormU, tnFormV, tnFormW, tnFormX, formA, formB, formC, formD,
  bonusFor, bonusFormC, dmy, WageEntry, Register,
} from '../payroll/registerCalc';
import { computeEntry } from '../payrollCalc';

const SETTINGS = {
  basicPercentOfPackage: 50, daPercentOfBasic: 45, hraPercentOfBasic: 25,
  transportPercentOfBasic: 20, foodPercentOfBasic: 10, esiEmployeePercent: 0.75, esiEmployerPercent: 3.25,
  pfEmployeePercent: 12, pfEmployerPercent: 12, pfWageCap: 15000, pfWageFactor: 60, pfEmployerMatchesEmployee: true,
};
const EST = { name: 'Acme Infotech', address: '1 Main Road, Coimbatore', employer: 'A. Kumar', manager: 'B. Devi', registrationNo: 'TN/SE/123', lin: 'L-9' };

const person = (name: string, over: any = {}) => ({
  name, employeeNo: `E-${name}`, gender: 'Male', parentSpouseName: 'Parent', dateOfBirth: '1990-05-10', joinDate: '2020-04-01',
  designation: 'Developer', address: '5 Cross Street', pfUan: '100200300400', esiNumber: '', aadharNo: '', phone: '9000000000',
  email: 'a@example.com', bankAccountNumber: '001234', bankName: 'HDFC Bank', ifscCode: 'HDFC0001234', panNumber: 'ABCDE1234F',
  leavingDate: null, reasonForLeaving: '', workLocation: { name: 'Coimbatore Office' }, ...over,
});

// A computed payslip for a package, with overrides
function entry(name: string, pkg: number, over: Partial<WageEntry> & { lopDays?: number } = {}): WageEntry {
  const lopDays = over.lopDays || 0;
  const c = computeEntry({ monthlyPackage: pkg, totalWorkingDays: 30, lopDays, isPfApplicable: true }, SETTINGS);
  return {
    monthlyPackage: pkg, totalWorkingDays: 30, empLeaveDays: 0, lopDays, ...c,
    lwfEmployee: 0, lwfEmployer: 0, professionalTax: 0, tds: 0, salaryAdvance: 0, loanDeduction: 0,
    lines: [], person: person(name), ...over,
  };
}
const column = (r: Register, no: string) => r.columns.findIndex(c => c.no === no);
const cell = (r: Register, row: number, no: string) => r.rows[row][column(r, no)];

describe('helpers', () => {
  it('formats dates and works out ages', () => {
    expect(dmy('2026-10-05')).toBe('05/10/2026');
    expect(dmy(null)).toBe('');
    expect(ageOn('2010-04-02', '2025-04-01')).toBe(14);
    expect(ageOn('2010-04-01', '2025-04-01')).toBe(15);
    expect(ageOn(null, '2025-04-01')).toBeNull();
  });

  it('counts men, women and young persons', () => {
    expect(headcount([
      { gender: 'Male', dateOfBirth: '1990-01-01' }, { gender: 'female', dateOfBirth: '1995-01-01' },
      { gender: 'F', dateOfBirth: '2010-01-01' }, { gender: 'M', dateOfBirth: '2009-12-31' }, { gender: '' },
    ], '2026-10-31')).toEqual({ men: 1, women: 1, maleYoung: 1, femaleYoung: 1, notRecorded: 1 });
  });
});

describe('wage breakup', () => {
  it('splits a payslip so the parts add back to gross and to total deductions', () => {
    const e = entry('Asha', 40000, {
      tds: 500, professionalTax: 208, salaryAdvance: 1000, loanDeduction: 2100,
      advance: { paid: 0, opening: 12000, principalRecovered: 2000 },
      lines: [
        { code: 'OVERTIME', name: 'Overtime', type: 'EARNING', amount: 1500 },
        { code: 'BONUS', name: 'Bonus', type: 'EARNING', amount: 2000 },
        { code: 'OTHER_DEDUCTION', name: 'Canteen', type: 'DEDUCTION', amount: 300 },
        { code: 'PF_ON_ARREARS', name: 'PF on Arrears', type: 'DEDUCTION', amount: 120 },
      ],
    });
    e.grossSalary += 3500;
    e.totalDeductions += 500 + 208 + 1000 + 2100 + 300 + 120;
    e.netPayable = e.grossSalary - e.totalDeductions;
    const b = wageBreakup(e);
    expect(b.overtime).toBe(1500);
    expect(e.basic + e.da + e.hra + b.otherAllowances + b.overtime).toBe(e.grossSalary);
    expect(b.pf).toBe(e.pfEmployee + 120);
    expect(b.advanceRecovered).toBe(3000);           // salary advance + loan principal
    expect(b.advancePending).toBe(10000);            // 12,000 less the principal recovered
    expect(b.otherDeductions).toBe(500 + 208 + 100 + 300); // TDS, PT, loan interest, canteen
    expect(Math.round((b.pf + b.esi + b.lwf + b.advanceRecovered + b.otherDeductions) * 100) / 100).toBe(e.totalDeductions);
  });

  it('treats the whole loan deduction as principal when the ledger is not given', () => {
    const b = wageBreakup(entry('Asha', 40000, { loanDeduction: 1000 }));
    expect(b.advanceRecovered).toBe(1000);
  });
});

describe('Tamil Nadu Shops and Establishments registers', () => {
  const entries = [entry('Asha', 40000), entry('Bala', 30000, { lopDays: 2, empLeaveDays: 1, paidOn: '2026-11-01', paymentRef: 'UTR1' })];

  it('Form U keeps the 24 prescribed columns in order', () => {
    const r = tnFormU(EST, [person('Asha', { hasPhoto: true, leavingDate: '2026-10-20', reasonForLeaving: 'Resigned' })]);
    expect(r.columns.map(c => c.no)).toEqual(Array.from({ length: 24 }, (_, i) => `(${i + 1})`));
    expect(r.columns[13].label).toBe('Date on which completion of 480 days of service');
    expect(r.rows[0][1]).toBe('Asha');
    expect(cell(r, 0, '(7)')).toBe('01/04/2020');
    expect(cell(r, 0, '(17)')).toBe('001234, HDFC Bank, HDFC0001234');
    expect(cell(r, 0, '(18)')).toBe('On file');
    expect(cell(r, 0, '(22)')).toBe('20/10/2026');
    expect(r.header[1]).toEqual(['Registration certificate no.', 'TN/SE/123']);
  });

  it('Form V has 13 numbered columns with a 31-day grid under column 7', () => {
    const r = tnFormV(EST, '2026-10', entries);
    expect(r.columns.filter(c => c.no).map(c => c.no)).toEqual(['(1)', '(2)', '(3)', '(4)', '(5)', '(6)', '(8)', '(9)', '(10)', '(11)', '(12)', '(13)']);
    expect(r.columns.filter(c => c.group?.startsWith('(7)')).map(c => c.label)).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1)));
    expect(cell(r, 1, '(8)')).toBe(28);
    expect(cell(r, 1, '(10)')).toBe(2);
    expect(cell(r, 1, '(13)')).toBe('1 day leave');
    expect(r.header.find(h => h[0] === 'For the period')![1]).toBe('01/10/2026 to 31/10/2026');
  });

  it('Form W has 30 columns, and each row and the totals add up', () => {
    const r = tnFormW(EST, '2026-10', entries, headcount(entries.map(e => e.person), '2026-10-31'));
    expect(r.columns.map(c => c.no)).toEqual(Array.from({ length: 30 }, (_, i) => `(${i + 1})`));
    for (let i = 0; i < entries.length; i++) {
      const n = (no: string) => cell(r, i, no) as number;
      expect(Math.round((n('(5)') + n('(6)') + n('(7)') + n('(8)') + n('(9)') + n('(10)')) * 100) / 100).toBe(n('(11)'));
      expect(Math.round((n('(12)') + n('(13)') + n('(14)') + n('(17)') + n('(21)') + n('(23)')) * 100) / 100).toBe(n('(24)'));
      expect(Math.round((n('(11)') - n('(24)')) * 100) / 100).toBe(n('(25)'));
    }
    expect(cell(r, 1, '(26)')).toBe('01/11/2026');
    expect(cell(r, 1, '(29)')).toBe('UTR1');
    expect(r.totals![column(r, '(11)')]).toBe(entries[0].grossSalary + entries[1].grossSalary);
    expect(r.totals![1]).toBe('Total (2)');
    expect(r.header.find(h => h[0] === 'Total number of persons employed')![1]).toBe('Men 2, Women 0, Male young persons 0, Female young persons 0');
  });

  it('Form X has 21 columns, with leave under Other Leave and gratuity paid on exit', () => {
    const leaver = entry('Chitra', 30000, { empLeaveDays: 2, lines: [{ code: 'GRATUITY', name: 'Gratuity', type: 'EARNING', amount: 90000 }] });
    const r = tnFormX(EST, '2026-10', [leaver]);
    expect(r.columns.map(c => c.no)).toEqual(Array.from({ length: 21 }, (_, i) => `(${i + 1})`));
    expect(cell(r, 0, '(12)')).toBe(2);
    expect(cell(r, 0, '(20)')).toBe(90000);
    expect(r.columns[19].group).toBe('Gratuity Benefits');
  });
});

describe('central combined registers', () => {
  it('Form A has the 31 prescribed columns', () => {
    const r = formA(EST, [person('Asha')]);
    expect(r.columns).toHaveLength(31);
    expect(r.columns[0].label).toBe('Sl. No.');
    expect(r.columns[30].label).toBe('Remarks');
    expect(cell(r, 0, '15')).toBe('100200300400'); // UAN
    expect(cell(r, 0, '16')).toBe('ABCDE1234F');
    expect(r.header[2]).toEqual(['LIN', 'L-9']);
  });

  it('Form B earned wages and deductions add up to their totals', () => {
    const e = entry('Asha', 40000, { tds: 500, professionalTax: 208, lwfEmployee: 20, lwfEmployer: 40, loanDeduction: 1000 });
    e.totalDeductions += 500 + 208 + 20 + 1000;
    e.netPayable = e.grossSalary - e.totalDeductions;
    const r = formB(EST, '2026-10', [e]);
    expect(r.columns).toHaveLength(25);
    const n = (no: string) => cell(r, 0, no) as number;
    expect(n('6') + n('7') + n('8') + n('9') + n('10') + n('11')).toBe(n('12'));
    expect(Math.round((n('13') + n('14') + n('15') + n('16') + n('17') + n('18') + n('19')) * 100) / 100).toBe(n('20'));
    expect(n('16')).toBe(500);
    expect(n('18')).toBe(228);   // Professional Tax + LWF
    expect(n('19')).toBe(1000);
    expect(n('21')).toBe(e.netPayable);
    expect(n('22')).toBe(e.pfEmployer + 40);
  });

  it('Form C lists loans and advances with their instalment months', () => {
    const r = formC(EST, '2026-27', [
      { employeeNo: 'E-1', name: 'Asha', loanNo: 'LN-0001', title: 'Advance', annualRate: 0, loanDate: '2026-10-01', totalLent: 6000, instalments: 6, firstPeriod: '2026-10', lastPeriod: '2027-03', closedOn: null, outstanding: 5000 },
      { employeeNo: 'E-2', name: 'Bala', loanNo: 'LN-0002', title: '', annualRate: 9, loanDate: '2026-05-10', totalLent: 50000, instalments: 10, firstPeriod: '2026-06', lastPeriod: '2027-03', closedOn: '2026-09-30', outstanding: 0 },
    ]);
    expect(r.columns).toHaveLength(13);
    expect(r.rows[0].slice(0, 3)).toEqual(['E-1', 'Asha', 'Advance']);
    expect(cell(r, 0, '10')).toBe('10/2026');
    expect(cell(r, 0, '11')).toBe('03/2027');
    expect(cell(r, 0, '13')).toBe('Outstanding 5,000');
    expect(cell(r, 1, '3')).toBe('Loan');
    expect(cell(r, 1, '12')).toBe('30/09/2026');
    expect(r.totals![column(r, '6')]).toBe(56000);
  });

  it('Form D summarises the month, with the place of work', () => {
    const r = formD(EST, '2026-10', [entry('Asha', 40000, { lopDays: 1.5 })]);
    expect(cell(r, 0, '4')).toBe('Coimbatore Office');
    expect(cell(r, 0, '6')).toBe(28.5);
    expect(cell(r, 0, '7')).toBe('1.5 loss of pay');
    expect(r.columns.filter(c => c.group).length).toBe(31);
  });
});

describe('statutory bonus', () => {
  const RULES = { bonusPercent: 8.33, bonusEligibilityLimit: 21000, bonusWageCeiling: 7000 };
  const year = (basicDa: number, months = 12, payDays = 30) =>
    Array.from({ length: months }, () => ({ basic: basicDa * 0.69, da: basicDa * 0.31, payDays, totalWorkingDays: 30 }));

  it('pays the percentage on Basic + DA below the ceiling', () => {
    const b = bonusFor(year(6000), RULES);
    expect(b).toMatchObject({ eligible: true, salary: 72000, daysWorked: 360, bonusWage: 72000, payable: 5998 });
  });

  it('counts each month only up to the ceiling', () => {
    const b = bonusFor(year(15000), RULES);
    expect(b.salary).toBe(180000);
    expect(b.bonusWage).toBe(84000);
    expect(b.payable).toBe(6997);
  });

  it('leaves out those above the limit and those who worked under 30 days', () => {
    expect(bonusFor(year(21000), RULES).eligible).toBe(true);
    expect(bonusFor(year(21001), RULES)).toMatchObject({ covered: false, eligible: false, payable: 0 });
    expect(bonusFor(year(10000, 1, 20), RULES)).toMatchObject({ covered: true, eligible: false, payable: 0 });
  });

  it('scales the ceiling to the days paid in a part month', () => {
    const b = bonusFor([{ basic: 6000, da: 4000, payDays: 15, totalWorkingDays: 30 }, ...year(20000, 1)], RULES);
    expect(b.bonusWage).toBe(3500 + 7000);
  });

  it('builds Form C for covered employees and sums what is payable', () => {
    const { register, summary } = bonusFormC(EST, 2025, [
      { name: 'Asha', employeeNo: 'E-1', fatherName: 'Ravi', designation: 'Clerk', dateOfBirth: '1995-01-01', months: year(12000), paidInYear: 2000 },
      { name: 'Bala', employeeNo: 'E-2', fatherName: '', designation: 'Manager', dateOfBirth: null, months: year(40000), paidInYear: 0 },
    ], RULES);
    expect(register.columns.map(c => c.no)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '10A', '11', '12', '13', '14', '15', '16']);
    expect(register.rows).toHaveLength(1);
    expect(register.rows[0].slice(0, 8)).toEqual([1, 'Asha', 'Ravi', 'Yes', 'Clerk', 360, 144000, 6997]);
    expect(cell(register, 0, '10')).toBe(2000);
    expect(cell(register, 0, '12')).toBe(2000);
    expect(cell(register, 0, '13')).toBe(4997);
    expect(register.title).toContain('31/03/2026');
    expect(summary).toEqual({ employees: 2, benefited: 1, payable: 6997, paidInYear: 2000 });
  });
});
