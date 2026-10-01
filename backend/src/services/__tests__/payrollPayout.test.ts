import { describe, it, expect } from 'vitest';
import {
  payAmount, paymentModeOf, hasBankDetails, runStage, prePayrollChecks, bankFileCsv,
  jvAccounts, journalVoucher, payrollReconciliation, headcountMovement, payrollAnomalies,
  duplicateGroups, nextRunDefaults,
} from '../payroll/payoutCalc';
import { computeEntry } from '../payrollCalc';

const SETTINGS = {
  basicPercentOfPackage: 50, daPercentOfBasic: 45, hraPercentOfBasic: 25,
  transportPercentOfBasic: 20, foodPercentOfBasic: 10, esiEmployeePercent: 0.75, esiEmployerPercent: 3.25,
  pfEmployeePercent: 12, pfEmployerPercent: 12, pfWageCap: 15000, pfWageFactor: 60, pfEmployerMatchesEmployee: true,
};

// A computed entry for a person, with overrides
const entry = (id: string, name: string, pkg: number, over: any = {}, person: any = {}) => ({
  id, personId: id, monthlyPackage: pkg, totalWorkingDays: 30, lopDays: 0, lines: [],
  professionalTax: 0, lwfEmployee: 0, lwfEmployer: 0, loanDeduction: 0, reimbursement: 0,
  payStatus: 'PAY', holdReason: '', paidOn: null,
  ...computeEntry({ monthlyPackage: pkg, totalWorkingDays: 30, isPfApplicable: true, isEsiEligible: false }, SETTINGS),
  person: {
    id, name, employeeNo: `E-${id}`, paymentMode: 'BANK', bankAccountNumber: `00${id}456`, ifscCode: 'hdfc0001234',
    bankName: 'HDFC Bank', panNumber: 'ABCDE1234F', pfUan: '100200300400', esiNumber: '', ...person,
  },
  ...over,
});
const validPan = (pan: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan);

describe('pay amount and mode', () => {
  it('adds expense claims to the net salary', () => {
    expect(payAmount({ netPayable: 18000.5, reimbursement: 1250.25 })).toBe(19250.75);
    expect(payAmount({ netPayable: 18000 })).toBe(18000);
  });

  it('takes the mode from the batch once there is one, else from the employee', () => {
    expect(paymentModeOf({ person: { paymentMode: 'CASH' } })).toBe('CASH');
    expect(paymentModeOf({ person: { paymentMode: 'CASH' }, payoutBatch: { mode: 'CHEQUE' } })).toBe('CHEQUE');
    expect(paymentModeOf({ person: {} })).toBe('BANK');
  });

  it('needs both account number and IFSC for a bank transfer', () => {
    expect(hasBankDetails({ bankAccountNumber: '123', ifscCode: 'HDFC0001' })).toBe(true);
    expect(hasBankDetails({ bankAccountNumber: '123', ifscCode: ' ' })).toBe(false);
    expect(hasBankDetails({})).toBe(false);
  });
});

describe('run stage', () => {
  const a = entry('1', 'Asha', 30000);
  const b = entry('2', 'Bala', 40000);

  it('walks from open inputs to paid', () => {
    expect(runStage({ status: 'DRAFT' }, [a, b]).key).toBe('INPUTS_OPEN');
    expect(runStage({ status: 'DRAFT', inputsLockedAt: new Date() }, [a, b]).key).toBe('INPUTS_LOCKED');
    expect(runStage({ status: 'FINALIZED' }, [a, b]).key).toBe('FINALIZED');
    expect(runStage({ status: 'FINALIZED', releasedAt: new Date() }, [a, b]).key).toBe('RELEASED');
    const paid = [{ ...a, paidOn: '2026-11-01' }, { ...b, paidOn: '2026-11-01' }];
    const stage = runStage({ status: 'FINALIZED', releasedAt: new Date() }, paid);
    expect(stage.key).toBe('PAID');
    expect(stage).toMatchObject({ payable: 2, paidCount: 2, heldCount: 0, paid: true });
  });

  it('is paid once everything except held salaries is paid', () => {
    const stage = runStage({ status: 'FINALIZED' }, [{ ...a, paidOn: '2026-11-01' }, { ...b, payStatus: 'HOLD' }]);
    expect(stage).toMatchObject({ key: 'PAID', payable: 1, paidCount: 1, heldCount: 1 });
  });

  it('is not paid while one salary is outstanding, or when there is nothing to pay', () => {
    expect(runStage({ status: 'FINALIZED' }, [{ ...a, paidOn: '2026-11-01' }, b]).paid).toBe(false);
    expect(runStage({ status: 'FINALIZED' }, [{ ...a, netPayable: 0 }]).paid).toBe(false);
  });
});

describe('pre-payroll checks', () => {
  const base = { period: '2026-10', missing: [], stopped: [], tdsComputed: false, validPan };
  const codes = (entries: any[], extra: any = {}) => prePayrollChecks({ ...base, entries, ...extra }).map(c => c.code);

  it('passes a clean entry', () => {
    expect(codes([entry('1', 'Asha', 30000)])).toEqual([]);
  });

  it('blocks on negative net pay only', () => {
    const checks = prePayrollChecks({ ...base, entries: [entry('1', 'Asha', 30000, { netPayable: -500 })] });
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ code: 'NEGATIVE_NET', blocking: true });
  });

  it('flags a bank transfer without account details, but not cash', () => {
    expect(codes([entry('1', 'Asha', 30000, {}, { ifscCode: '' })])).toEqual(['NO_BANK_ACCOUNT']);
    expect(codes([entry('1', 'Asha', 30000, {}, { ifscCode: '', paymentMode: 'CASH' })])).toEqual([]);
  });

  it('asks for a PAN only when tax is involved', () => {
    const noPan = entry('1', 'Asha', 30000, {}, { panNumber: '' });
    expect(codes([noPan])).toEqual([]);
    expect(codes([noPan], { tdsComputed: true })).toEqual(['NO_PAN']);
    expect(codes([{ ...noPan, tds: 500 }])).toEqual(['NO_PAN']);
  });

  it('catches leavers and joiners paid for the full month', () => {
    expect(codes([entry('1', 'Asha', 30000, {}, { leavingDate: '2026-09-20' })])).toEqual(['LEFT_EARLIER']);
    expect(codes([entry('1', 'Asha', 30000, {}, { leavingDate: '2026-10-15' })])).toEqual(['LEFT_FULL_PAY']);
    expect(codes([entry('1', 'Asha', 30000, { payDays: 15 }, { leavingDate: '2026-10-15' })])).toEqual([]);
    expect(codes([entry('1', 'Asha', 30000, {}, { leavingDate: '2026-10-31' })])).toEqual([]); // worked the whole month
    expect(codes([entry('1', 'Asha', 30000, {}, { joinDate: '2026-10-12' })])).toEqual(['JOINED_FULL_PAY']);
    expect(codes([entry('1', 'Asha', 30000, {}, { joinDate: '2026-10-01' })])).toEqual([]);
    expect(codes([entry('1', 'Asha', 30000, { payDays: 20 }, { joinDate: '2026-10-12' })])).toEqual([]);
  });

  it('lists held, missing and stopped employees', () => {
    const held = entry('1', 'Asha', 30000, { payStatus: 'HOLD', holdReason: 'Documents pending' });
    const checks = prePayrollChecks({
      ...base, entries: [held],
      missing: [{ id: '9', name: 'Mani' }], stopped: [{ id: '8', name: 'Siva', salaryStopReason: 'On sabbatical' }],
    });
    expect(checks.map(c => c.code)).toEqual(['SALARY_HELD', 'NOT_IN_RUN', 'SALARY_STOPPED']);
    expect(checks[0].message).toContain('Documents pending');
    expect(checks[2].message).toContain('On sabbatical');
    expect(checks.some(c => c.blocking)).toBe(false);
  });
});

describe('bank file', () => {
  it('writes one row per employee with the amount to two decimals', () => {
    const csv = bankFileCsv([entry('1', 'Asha, R', 30000, { netPayable: 28200, reimbursement: 300.5 })], 'Salary Oct 2026');
    const [head, row] = csv.split('\n');
    expect(head).toBe('Sl No,Employee Code,Beneficiary Name,Account Number,IFSC,Bank,Amount,Narration');
    expect(row).toBe(`1,E-1,"Asha, R",'001456,HDFC0001234,HDFC Bank,28500.50,Salary Oct 2026`);
  });
});

describe('journal voucher', () => {
  const entries = [
    entry('1', 'Asha', 30000, { tds: 0 }),
    entry('2', 'Bala', 40000, { reimbursement: 1500 }),
  ];

  it('balances, with salary expense debited and payables credited', () => {
    const jv = journalVoucher(entries);
    expect(jv.totalDebit).toBe(jv.totalCredit);
    const ledger = (name: string) => jv.lines.find(l => l.ledger === name)!;
    const gross = entries[0].grossSalary + entries[1].grossSalary;
    expect(ledger('Salaries and Wages').debit).toBe(gross);
    expect(ledger('PF Payable').credit).toBe(
      entries[0].pfEmployee + entries[0].pfEmployer + entries[1].pfEmployee + entries[1].pfEmployer);
    expect(ledger('Staff Expense Reimbursements').debit).toBe(1500);
    expect(ledger('Salaries Payable').credit).toBe(entries[0].netPayable + entries[1].netPayable + 1500);
    expect(jv.lines.some(l => l.ledger === 'Rounding Off')).toBe(false);
    expect(jv.lines.some(l => l.ledger === 'TDS Payable')).toBe(false); // nothing to post
  });

  it('uses mapped ledgers and merges amounts sharing one', () => {
    const jv = journalVoucher(entries, { basic: 'Basic Pay', hra: 'Allowances', transportAllowance: 'Allowances', netPayable: 'Bank — Salary A/c' });
    const allowances = jv.lines.find(l => l.ledger === 'Allowances')!;
    expect(allowances.debit).toBe(entries[0].hra + entries[1].hra + entries[0].transportAllowance + entries[1].transportAllowance);
    expect(allowances.detail).toBe('House Rent Allowance, Transport Allowance');
    expect(jv.lines.find(l => l.ledger === 'Basic Pay')!.debit).toBe(entries[0].basic + entries[1].basic);
    expect(jv.lines.some(l => l.ledger === 'Bank — Salary A/c')).toBe(true);
    expect(jv.totalDebit).toBe(jv.totalCredit);
  });

  it('posts catalogue lines and absorbs rounding', () => {
    const withLines = entry('3', 'Chitra', 30000, {
      lines: [
        { componentId: 'bonus', name: 'Bonus', type: 'EARNING', amount: 2000 },
        { componentId: 'canteen', name: 'Canteen', type: 'DEDUCTION', amount: 350 },
      ],
    });
    withLines.grossSalary += 2000;
    withLines.totalDeductions += 350;
    withLines.netPayable += 1650.01; // a paisa off, as legacy imports can be
    const jv = journalVoucher([withLines]);
    expect(jv.lines.find(l => l.ledger === 'Other Payroll Deductions')!.credit).toBe(350);
    expect(jvAccounts([withLines]).map(a => a.label)).toContain('Bonus');
    expect(jv.lines.find(l => l.ledger === 'Rounding Off')).toMatchObject({ debit: 0.01, credit: 0 });
    expect(jv.totalDebit).toBe(jv.totalCredit);
  });
});

describe('month-on-month reconciliation', () => {
  const prev = [entry('1', 'Asha', 30000), entry('2', 'Bala', 40000), entry('3', 'Chitra', 20000), entry('5', 'Eswar', 25000)];
  const cur = [
    entry('1', 'Asha', 33000),                                              // revision
    entry('2', 'Bala', 40000, computeEntry({ monthlyPackage: 40000, totalWorkingDays: 30, lopDays: 3, isPfApplicable: true }, SETTINGS)), // LOP
    entry('4', 'Deepa', 28000),                                             // joiner
    entry('5', 'Eswar', 25000),                                             // unchanged
  ];
  const rec = payrollReconciliation(prev, cur);

  it('puts every change under one cause and adds up to the difference', () => {
    expect(rec.causes.map(c => c.cause)).toEqual(['JOINERS', 'LEAVERS', 'REVISIONS', 'ATTENDANCE']);
    const sumGross = rec.causes.reduce((s, c) => s + c.gross, 0);
    expect(Math.round(sumGross * 100) / 100).toBe(Math.round((rec.current.gross - rec.previous.gross) * 100) / 100);
    const sumNet = rec.causes.reduce((s, c) => s + c.net, 0);
    expect(Math.round(sumNet * 100) / 100).toBe(Math.round((rec.current.net - rec.previous.net) * 100) / 100);
  });

  it('names the people and why', () => {
    const cause = (c: string) => rec.causes.find(x => x.cause === c)!;
    expect(cause('JOINERS').people.map(p => p.name)).toEqual(['Deepa']);
    expect(cause('LEAVERS').people[0]).toMatchObject({ name: 'Chitra', gross: -prev[2].grossSalary });
    expect(cause('REVISIONS').people[0].note).toContain('₹30,000 → ₹33,000');
    expect(cause('ATTENDANCE').people[0].note).toBe('pay days 30/30 → 27/30');
  });

  it('shows component movement', () => {
    const basic = rec.components.find(c => c.key === 'basic')!;
    expect(basic.change).toBe(Math.round((basic.current - basic.previous) * 100) / 100);
    expect(rec.components.some(c => c.key === 'ctc')).toBe(false);
  });

  it('counts heads', () => {
    const h = headcountMovement(prev, cur);
    expect(h).toMatchObject({ opening: 4, closing: 4 });
    expect(h.joiners.map(e => e.person.name)).toEqual(['Deepa']);
    expect(h.leavers.map(e => e.person.name)).toEqual(['Chitra']);
  });
});

describe('anomalies and duplicates', () => {
  it('flags swings, zero and negative pay, and missing statutory numbers', () => {
    const prev = [entry('1', 'Asha', 30000), entry('2', 'Bala', 40000)];
    const cur = [
      entry('1', 'Asha', 30000, { netPayable: 15000 }),
      entry('2', 'Bala', 40000, {}, { pfUan: '' }),
      entry('3', 'Chitra', 20000, { netPayable: 0, payDays: 0 }),
      entry('4', 'Deepa', 20000, { netPayable: -200 }),
    ];
    const found = payrollAnomalies(prev, cur).map(a => `${a.personName}: ${a.kind}`);
    expect(found).toEqual([
      'Asha: Sudden fall in net pay',
      'Bala: PF deducted without UAN',
      'Chitra: Zero net pay',
      'Deepa: Negative net pay',
    ]);
  });

  it('is quiet for a steady month', () => {
    const month = [entry('1', 'Asha', 30000), entry('2', 'Bala', 40000)];
    expect(payrollAnomalies(month, month)).toEqual([]);
  });

  it('groups employees sharing a bank account or PAN, ignoring blanks and formatting', () => {
    const people = [
      { id: '1', name: 'Asha', bankAccountNumber: '0012 3456', panNumber: 'abcde1234f' },
      { id: '2', name: 'Bala', bankAccountNumber: '00123456', panNumber: '' },
      { id: '3', name: 'Chitra', bankAccountNumber: '', panNumber: 'ABCDE1234F' },
      { id: '4', name: 'Deepa', bankAccountNumber: '999', panNumber: '' },
    ];
    expect(duplicateGroups(people, 'bankAccountNumber').map(g => g.people.map(p => p.name))).toEqual([['Asha', 'Bala']]);
    expect(duplicateGroups(people, 'panNumber').map(g => g.people.map(p => p.name))).toEqual([['Asha', 'Chitra']]);
  });
});

describe('next run', () => {
  it('moves to the next month, across the year end', () => {
    expect(nextRunDefaults('2026-10', 26)).toEqual({ period: '2026-11', totalWorkingDays: 26 });
    expect(nextRunDefaults('2026-12', 26).period).toBe('2027-01');
  });

  it('follows the calendar when this run used the full month', () => {
    expect(nextRunDefaults('2026-10', 31)).toEqual({ period: '2026-11', totalWorkingDays: 30 });
    expect(nextRunDefaults('2027-01', 31)).toEqual({ period: '2027-02', totalWorkingDays: 28 });
    expect(nextRunDefaults('2027-01', 30)).toEqual({ period: '2027-02', totalWorkingDays: 28 }); // February has only 28
  });
});
