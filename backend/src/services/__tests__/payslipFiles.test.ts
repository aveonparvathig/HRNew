import { describe, it, expect } from 'vitest';
import {
  payslipPassword, passwordHint, filePart, payslipFileName, uniqueNames, jvFileName,
  payslipAddress, isEmail, payslipEmail, jvRows, toCsv, JV_HEADER,
} from '../payroll/payslipFiles';
import { seal, unseal } from '../secretBox';

describe('payslip file password', () => {
  it('is nothing when protection is off', () => {
    expect(payslipPassword('NONE', {})).toEqual({ password: null, missing: null });
  });

  it('is the PAN in capitals', () => {
    expect(payslipPassword('PAN', { panNumber: ' abcde1234f ' })).toEqual({ password: 'ABCDE1234F', missing: null });
  });

  it('is the date of birth, day first', () => {
    expect(payslipPassword('DOB', { dateOfBirth: '1990-03-05' })).toEqual({ password: '05031990', missing: null });
  });

  it('refuses to make a file when the record lacks the detail, and never falls back to no password', () => {
    expect(payslipPassword('PAN', { panNumber: '' }).password).toBeNull();
    expect(payslipPassword('PAN', { panNumber: 'NOTAPAN' }).missing).toMatch(/PAN/);
    expect(payslipPassword('DOB', { dateOfBirth: null }).missing).toMatch(/date of birth/);
  });

  it('tells the employee how to open the file without stating the password', () => {
    expect(passwordHint('PAN')).toMatch(/PAN in capital letters/);
    expect(passwordHint('DOB')).toMatch(/05031990/); // the worked example, not a real one
    expect(passwordHint('NONE')).toBe('');
  });
});

describe('file names', () => {
  it('keeps letters, digits and dashes', () => {
    expect(filePart('  Arun  Kumar. S ')).toBe('Arun-Kumar-S');
    expect(filePart('EMP-0002')).toBe('EMP-0002');
    expect(filePart('../../etc/passwd')).toBe('etcpasswd');
    expect(filePart('a"b\r\nc')).toBe('ab-c');
  });

  it('names a payslip by prefix, employee and month', () => {
    const person = { name: 'Arun Kumar', employeeNo: 'EMP-0002' };
    expect(payslipFileName({}, person, '2026-06')).toBe('Payslip_EMP-0002_2026-06.pdf');
    expect(payslipFileName({ payslipFilePrefix: 'Salary Slip', payslipFileContext: 'NAME' }, person, '2026-06')).toBe('Salary-Slip_Arun-Kumar_2026-06.pdf');
    expect(payslipFileName({ payslipFileContext: 'EMPNO_NAME' }, person, '2026-06')).toBe('Payslip_EMP-0002_Arun-Kumar_2026-06.pdf');
  });

  it('falls back to the name when there is no employee code', () => {
    expect(payslipFileName({}, { name: 'Dharun', employeeNo: '' }, '2026-06')).toBe('Payslip_Dharun_2026-06.pdf');
  });

  it('keeps names in one archive apart', () => {
    expect(uniqueNames(['a.pdf', 'b.pdf', 'A.pdf', 'a.pdf'])).toEqual(['a.pdf', 'b.pdf', 'A-2.pdf', 'a-3.pdf']);
  });

  it('names the journal voucher file', () => {
    expect(jvFileName('JV', '2026-06', 'csv')).toBe('JV_2026-06.csv');
    expect(jvFileName('', '2026-06', 'xlsx')).toBe('JV_2026-06.xlsx');
  });
});

describe('who a payslip is mailed to', () => {
  const both = { officialEmail: 'arun@aveon.test', email: 'arun@home.test' };

  it('uses the preferred address', () => {
    expect(payslipAddress('OFFICIAL', both)).toEqual({ address: 'arun@aveon.test', fallback: false });
    expect(payslipAddress('PERSONAL', both)).toEqual({ address: 'arun@home.test', fallback: false });
  });

  it('falls back to the other address when the preferred one is blank or malformed', () => {
    expect(payslipAddress('OFFICIAL', { officialEmail: '', email: 'arun@home.test' })).toEqual({ address: 'arun@home.test', fallback: true });
    expect(payslipAddress('PERSONAL', { officialEmail: 'arun@aveon.test', email: 'not an address' })).toEqual({ address: 'arun@aveon.test', fallback: true });
  });

  it('has nobody to send to when neither is usable', () => {
    expect(payslipAddress('OFFICIAL', { officialEmail: '', email: '' })).toEqual({ address: '', fallback: false });
  });

  it('accepts one plain address only', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('a@b.co, c@d.co')).toBe(false);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('a b@c.co')).toBe(false);
  });
});

describe('the payslip mail', () => {
  const company = { name: 'Aveon Infotech', email: 'hr@aveon.test' };

  it('names the month and the company, with the hint when the file is protected', () => {
    const mail = payslipEmail(company, { name: 'Arun Kumar' }, '2026-06', 'PAN');
    expect(mail.subject).toBe('Payslip for June 2026 — Aveon Infotech');
    expect(mail.text).toContain('Dear Arun Kumar,');
    expect(mail.text).toContain('PAN in capital letters');
    expect(mail.text).toContain('hr@aveon.test');
  });

  it('says nothing about a password when there is none', () => {
    expect(payslipEmail(company, { name: 'Arun' }, '2026-06', 'NONE').text).not.toMatch(/opens with/);
  });

  it('escapes names in the HTML part', () => {
    expect(payslipEmail(company, { name: '<b>x</b>' }, '2026-06', 'NONE').html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});

describe('journal voucher file', () => {
  const lines = [
    { ledger: 'Salaries', detail: '', debit: 737816, credit: 0 },
    { ledger: 'Salaries, payable', detail: '', debit: 0, credit: 718622 },
    { ledger: '=cmd', detail: '', debit: 0, credit: 19194 },
  ];

  it('gives a row per ledger with the date and narration', () => {
    expect(jvRows(lines, '2026-06-30', 'June salaries')[0]).toEqual(['2026-06-30', 'Salaries', 737816, '', 'June salaries']);
  });

  it('writes CSV that a spreadsheet reads safely', () => {
    const csv = toCsv([JV_HEADER, ...jvRows(lines, '2026-06-30', 'June salaries')]);
    const rows = csv.trim().split('\r\n');
    expect(rows[0]).toBe('Date,Ledger account,Debit,Credit,Narration');
    expect(rows[2]).toBe('2026-06-30,"Salaries, payable",,718622,June salaries');
    expect(rows[3]).toContain("'=cmd"); // not run as a formula
  });
});

describe('stored secrets', () => {
  process.env.SETTINGS_SECRET = 'a-test-secret-of-at-least-thirty-two-chars';

  it('come back as they went in, and are not stored in the clear', () => {
    const sealed = seal('smtp-password-123');
    expect(sealed).not.toContain('smtp-password-123');
    expect(unseal(sealed)).toBe('smtp-password-123');
  });

  it('seal differently each time', () => {
    expect(seal('same')).not.toBe(seal('same'));
  });

  it('read as empty when damaged or blank', () => {
    const sealed = seal('secret');
    expect(unseal(sealed.slice(0, -4) + 'AAAA')).toBe('');
    expect(unseal('')).toBe('');
    expect(seal('')).toBe('');
  });
});
