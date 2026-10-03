import { describe, it, expect } from 'vitest';
import {
  EMPLOYEE_COLUMNS, UPDATABLE_COLUMNS, checkEmployeeImport, checkRevisionImport, dateCell, employeeColumn, matchFile, matchFiles,
  monthCell, numberCell, textCell, yesNoCell,
} from '../importCalc';

const person = (over: any) => ({
  id: over.employeeNo, kind: 'CANDIDATE', isEmployee: true, name: '', employeeNo: '', designation: '', department: '', grade: '',
  joinDate: null, managerId: null, panNumber: '', bankName: '', ifscCode: '', isPfApplicable: false, probationMonths: 0,
  confirmationDate: null, noticePeriodDays: null, workLocationId: null, phone: '', ...over,
});
const ctx = {
  people: [
    person({ employeeNo: 'EMP-1', name: 'Asha', designation: 'Developer', department: 'Engineering', joinDate: '2021-09-01', phone: '9000000001' }),
    person({ employeeNo: 'EMP-2', name: 'Bala', designation: 'Trainee', managerId: 'EMP-1', joinDate: '2026-03-10' }),
    person({ employeeNo: 'EMP-10', name: 'Chitra', managerId: 'EMP-2' }),
    person({ employeeNo: 'C-1', name: 'Dinesh', isEmployee: false }), // a candidate
  ],
  lists: { DEPARTMENT: ['Engineering', 'Support'], DESIGNATION: ['Developer', 'Trainee'], BANK: ['HDFC Bank'] },
  locations: [{ id: 'loc1', name: 'Coimbatore Office' }],
};
const sheet = (headers: string[], ...lines: any[][]) => ({
  headers, rows: lines.map((line, i) => ({ row: i + 2, cells: Object.fromEntries(headers.map((h, c) => [h, line[c]])) })),
});
const add = (headers: string[], ...lines: any[][]) => { const s = sheet(headers, ...lines); return checkEmployeeImport(s.headers, s.rows, ctx, 'ADD'); };
const update = (chosen: string[] | undefined, headers: string[], ...lines: any[][]) => {
  const s = sheet(headers, ...lines);
  return checkEmployeeImport(s.headers, s.rows, ctx, 'UPDATE', chosen);
};

describe('reading cells', () => {
  it('reads dates however they are typed', () => {
    expect(dateCell('01-04-2026')).toBe('2026-04-01');
    expect(dateCell('1/4/2026')).toBe('2026-04-01');
    expect(dateCell('1.4.2026')).toBe('2026-04-01');
    expect(dateCell('2026-04-01')).toBe('2026-04-01');
    expect(dateCell('1 Apr 2026')).toBe('2026-04-01');
    expect(dateCell('15-August-1998')).toBe('1998-08-15');
    expect(dateCell(new Date('2026-04-01T00:00:00Z'))).toBe('2026-04-01');
    expect(dateCell('')).toBe('');
    expect(dateCell(null)).toBe('');
  });

  it('refuses what is not a date', () => {
    expect(dateCell('31-02-2026')).toBeNull();
    expect(dateCell('04-2026')).toBeNull();
    expect(dateCell('soon')).toBeNull();
    expect(dateCell(45748)).toBeNull(); // a bare number is not taken for a date
  });

  it('reads months, numbers and yes/no', () => {
    expect(monthCell('2026-10')).toBe('2026-10');
    expect(monthCell('10/2026')).toBe('2026-10');
    expect(monthCell('Oct 2026')).toBe('2026-10');
    expect(monthCell('October 2026')).toBe('2026-10');
    expect(monthCell('01-10-2026')).toBe('2026-10');
    expect(monthCell(new Date('2026-10-15T00:00:00Z'))).toBe('2026-10');
    expect(monthCell('13/2026')).toBeNull();
    expect(monthCell('next month')).toBeNull();
    expect(numberCell('45,000')).toBe(45000);
    expect(numberCell('₹ 52,500.50')).toBe(52500.5);
    expect(numberCell(45000)).toBe(45000);
    expect(numberCell('')).toBe('');
    expect(numberCell('forty')).toBeNull();
    expect(yesNoCell('Yes')).toBe(true);
    expect(yesNoCell('n')).toBe(false);
    expect(yesNoCell(true)).toBe(true);
    expect(yesNoCell('maybe')).toBeNull();
    expect(yesNoCell('')).toBe('');
  });

  it('writes a number typed for an account or phone out in full', () => {
    expect(textCell(50100123456789)).toBe('50100123456789');
    expect(textCell(9876543210)).toBe('9876543210');
    expect(textCell('  Lake   View \n Road ')).toBe('Lake View Road');
    expect(textCell(null)).toBe('');
  });

  it('knows a column by its heading or another name for it', () => {
    expect(employeeColumn('Employee Code')?.key).toBe('employeeNo');
    expect(employeeColumn('monthly package')?.key).toBe('currentMonthlyPackage');
    expect(employeeColumn('Monthly Package (₹)')?.key).toBe('currentMonthlyPackage');
    expect(employeeColumn('DOJ')?.key).toBe('joinDate');
    expect(employeeColumn('Shoe size')).toBeUndefined();
    const headers = EMPLOYEE_COLUMNS.map(c => c.header);
    expect(new Set(headers).size).toBe(headers.length);
    expect(UPDATABLE_COLUMNS.map(c => c.key)).not.toContain('employeeNo');
    expect(UPDATABLE_COLUMNS.map(c => c.key)).not.toContain('currentMonthlyPackage');
  });
});

describe('adding employees: the row checks', () => {
  const H = ['Employee Code', 'Name', 'Designation', 'Department', 'Date of Joining', 'Monthly Package (₹)', 'IFSC Code', 'PF Applicable', 'Work Location', 'Employment Status'];

  it('takes a good row and says what it would write', () => {
    const check = add(H, ['EMP-20', 'Esther', 'developer', 'Engineering', '01-04-2026', '45,000', 'hdfc0001234', 'Yes', 'coimbatore office', 'Probation']);
    expect(check.problem).toBeNull();
    expect(check.counts).toEqual({ NEW: 1, UPDATE: 0, UNCHANGED: 0, ERROR: 0 });
    expect(check.results[0]).toMatchObject({ row: 2, employeeNo: 'EMP-20', name: 'Esther', result: 'NEW', errors: [] });
    expect(check.results[0].data).toEqual({
      name: 'Esther', designation: 'Developer', department: 'Engineering', joinDate: '2026-04-01', currentMonthlyPackage: 45000,
      ifscCode: 'HDFC0001234', isPfApplicable: true, workLocationId: 'loc1', employmentStatus: 'PROBATION',
    });
  });

  it('refuses a code or a name already on record', () => {
    const check = add(H, ['emp-1', 'Someone New'], ['EMP-21', 'asha'], ['', 'No Code'], ['EMP-22', '']);
    expect(check.results.map(r => r.result)).toEqual(['ERROR', 'ERROR', 'ERROR', 'ERROR']);
    expect(check.results[0].errors[0]).toMatch(/already in use, by Asha/);
    expect(check.results[1].errors[0]).toMatch(/Someone named asha is already on record/);
    expect(check.results[2].errors[0]).toMatch(/code is missing/);
    expect(check.results[3].errors[0]).toMatch(/name is missing/);
  });

  it('refuses a code or a name that is twice in the file', () => {
    const check = add(H, ['EMP-30', 'Farook'], ['EMP-31', 'Gita'], ['emp-30', 'Hari'], ['EMP-32', 'gita']);
    expect(check.results[0].errors[0]).toMatch(/EMP-30 is on rows 2 and 4 of the file/);
    expect(check.results[2].errors[0]).toMatch(/emp-30 is on rows 2 and 4/);
    expect(check.results[1].errors[0]).toMatch(/name Gita is on rows 3 and 5/);
    expect(check.results[3].errors[0]).toMatch(/rows 3 and 5/);
    expect(check.counts.ERROR).toBe(4);
  });

  it('says exactly what is wrong in a cell', () => {
    const check = add(H, ['EMP-40', 'Indu', '', '', '31-02-2026', 'lots', 'HDFC1234', 'perhaps', 'Mars Office', 'On leave']);
    const errors = check.results[0].errors.join(' | ');
    expect(errors).toMatch(/Date of Joining: "31-02-2026" is not a date/);
    expect(errors).toMatch(/Monthly Package \(₹\): "lots" is not a number/);
    expect(errors).toMatch(/IFSC Code: "HDFC1234" does not look like/);
    expect(errors).toMatch(/PF Applicable: write Yes or No/);
    expect(errors).toMatch(/Work Location: "Mars Office" is not one of the work locations/);
    expect(errors).toMatch(/Employment Status: "On leave" is not one of/);
  });

  it('reports a value new to a list instead of adding it quietly', () => {
    const check = add(H, ['EMP-50', 'Jaya', 'Team Lead', 'Delivery'], ['EMP-51', 'Kavin', 'team lead', 'Engineering'], ['EMP-1', 'Clash', 'Astronaut', 'Space']);
    expect(check.results[0].result).toBe('NEW');
    expect(check.results[0].newValues).toEqual([{ list: 'DESIGNATION', label: 'Team Lead' }, { list: 'DEPARTMENT', label: 'Delivery' }]);
    // Counted once however it is spelt, and not for a row that will not be taken
    expect(check.newValues).toEqual([
      { list: 'DESIGNATION', label: 'Team Lead', rows: 2 }, { list: 'DEPARTMENT', label: 'Delivery', rows: 1 },
    ]);
  });

  it('checks the job details as the record would read', () => {
    const check = add(['Employee Code', 'Name', 'Date of Joining', 'Confirmation Date', 'Probation (months)', 'Relieving Date'],
      ['EMP-60', 'Latha', '01-04-2026', '01-03-2026', '6', ''], ['EMP-61', 'Mani', '01-04-2026', '', '40', ''], ['EMP-62', 'Nila', '01-04-2026', '', '6', '01-01-2026']);
    expect(check.results[0].errors[0]).toMatch(/confirmation date cannot be before the joining date/);
    expect(check.results[1].errors[0]).toMatch(/up to 36/);
    expect(check.results[2].errors[0]).toMatch(/relieving date cannot be before/);
  });

  it('takes a manager from the record or from the same file', () => {
    const check = add(['Employee Code', 'Name', 'Reporting Manager Code'], ['EMP-70', 'Oviya', 'EMP-1'], ['EMP-71', 'Prem', 'EMP-70'], ['EMP-72', 'Ravi', 'EMP-99'], ['EMP-73', 'Sita', 'EMP-73'], ['EMP-74', 'Tara', 'C-1']);
    expect(check.results[0]).toMatchObject({ result: 'NEW', managerCode: 'EMP-1', data: { managerId: 'EMP-1' } });
    expect(check.results[1]).toMatchObject({ result: 'NEW', managerCode: 'EMP-70', data: { managerId: null } });
    expect(check.results[2].errors[0]).toMatch(/no employee has the code EMP-99/);
    expect(check.results[3].errors[0]).toMatch(/cannot report to themselves/);
    expect(check.results[4].errors[0]).toMatch(/no employee has the code C-1/); // a candidate is not a manager
  });

  it('warns when the manager is on a row of the file that will not be taken', () => {
    const check = add(['Employee Code', 'Name', 'Date of Joining', 'Reporting Manager Code'], ['EMP-75', 'Usha', '31-02-2026', ''], ['EMP-76', 'Varun', '', 'EMP-75']);
    expect(check.results[0].result).toBe('ERROR');
    expect(check.results[1].result).toBe('NEW');
    expect(check.results[1].warnings[0]).toMatch(/manager EMP-75 is on a row that will not be taken/);
  });

  it('warns about a PAN or Aadhaar that looks wrong, without refusing the row', () => {
    const check = add(['Employee Code', 'Name', 'PAN Number', 'Aadhaar Number', 'Account Number'], ['EMP-80', 'Uma', 'abcde1234f', '1234 1234 1234', 501001234567891234], ['EMP-81', 'Vel', 'ABC123', '1234', '']);
    expect(check.results[0]).toMatchObject({ result: 'NEW', data: { panNumber: 'ABCDE1234F', aadharNo: '123412341234' } });
    expect(check.results[0].warnings[0]).toMatch(/Excel keeps only 15 digits/);
    expect(check.results[1].result).toBe('NEW');
    expect(check.results[1].warnings).toHaveLength(2);
  });

  it('cannot be read without the code and name columns, or with no rows', () => {
    expect(add(['Name', 'Designation'], ['Asha', 'Developer']).problem).toMatch(/no "Employee Code" column/);
    expect(add(['Employee Code', 'Designation'], ['EMP-90', 'Developer']).problem).toMatch(/no "Name" column/);
    expect(add(['Employee Code', 'Name'], ['', '']).problem).toMatch(/no rows/);
    const check = add(['Employee Code', 'Name', 'Shoe size', 'Active'], ['EMP-90', 'Yamini', '7', 'Yes']);
    expect(check.unknownHeaders).toEqual(['Shoe size']);
    expect(check.results[0].result).toBe('NEW');
  });
});

describe('updating employees', () => {
  it('leaves a blank cell alone', () => {
    const check = update(undefined, ['Employee Code', 'Designation', 'Department', 'Contact Number'], ['EMP-1', '', 'Support', ''], ['EMP-2', '', '', '']);
    expect(check.results[0]).toMatchObject({ result: 'UPDATE', personId: 'EMP-1', data: { department: 'Support' } });
    expect(check.results[0].changes).toEqual([{ field: 'Department', from: 'Engineering', to: 'Support' }]);
    // Asha's phone and designation are not wiped by their empty cells
    expect(check.results[0].data).not.toHaveProperty('phone');
    expect(check.results[0].data).not.toHaveProperty('designation');
    expect(check.results[1]).toMatchObject({ result: 'UNCHANGED', data: {}, changes: [] });
    expect(check.counts).toEqual({ NEW: 0, UPDATE: 1, UNCHANGED: 1, ERROR: 0 });
  });

  it('touches only the columns chosen', () => {
    const check = update(['department'], ['Employee Code', 'Designation', 'Department'], ['EMP-1', 'Team Lead', 'Support']);
    expect(check.columns).toEqual([{ key: 'department', header: 'Department' }]);
    expect(check.results[0].data).toEqual({ department: 'Support' });
    expect(check.newValues).toEqual([]); // the designation column is not read at all
    expect(update(['grade'], ['Employee Code', 'Department'], ['EMP-1', 'Support']).problem).toMatch(/at least one column/);
  });

  it('counts a cell that says what the record already says as no change', () => {
    const check = update(undefined, ['Employee Code', 'Designation', 'Date of Joining', 'PF Applicable', 'Probation (months)'], ['EMP-1', 'developer', '01-09-2021', 'No', '0']);
    expect(check.results[0]).toMatchObject({ result: 'UNCHANGED', changes: [] });
  });

  it('never changes the package or the code', () => {
    const check = update(undefined, ['Employee Code', 'Monthly Package (₹)', 'Name'], ['EMP-1', '99999', 'Asha']);
    expect(check.columns.map(c => c.key)).toEqual(['name']);
    expect(check.results[0].result).toBe('UNCHANGED');
  });

  it('refuses a code not on record, a candidate, and a code twice in the file', () => {
    const check = update(undefined, ['Employee Code', 'Department'], ['EMP-404', 'Support'], ['C-1', 'Support'], ['EMP-2', 'Support'], ['emp-2', 'Engineering']);
    expect(check.results[0].errors[0]).toMatch(/No employee has the code EMP-404/);
    expect(check.results[1].errors[0]).toMatch(/Dinesh is not an employee/);
    expect(check.results[2].errors[0]).toMatch(/on rows 4 and 5/);
    expect(check.results[3].errors[0]).toMatch(/on rows 4 and 5/);
  });

  it('refuses a rename onto someone else and a manager that closes a loop', () => {
    expect(update(undefined, ['Employee Code', 'Name'], ['EMP-2', 'Asha']).results[0].errors[0]).toMatch(/already on record/);
    expect(update(undefined, ['Employee Code', 'Name'], ['EMP-2', 'BALA']).results[0].result).toBe('UPDATE'); // their own name, respelt
    const loop = update(undefined, ['Employee Code', 'Reporting Manager Code'], ['EMP-1', 'EMP-10']);
    expect(loop.results[0].errors[0]).toMatch(/reports to this employee/);
    const fine = update(undefined, ['Employee Code', 'Reporting Manager Code'], ['EMP-10', 'EMP-1']);
    expect(fine.results[0]).toMatchObject({ result: 'UPDATE', data: { managerId: 'EMP-1' } });
    expect(fine.results[0].changes).toEqual([{ field: 'Reporting Manager Code', from: 'Bala', to: 'Asha' }]);
  });

  it('does not call a name that differs only in its spacing a change', () => {
    const spaced = { ...ctx, people: [...ctx.people, person({ employeeNo: 'EMP-50', name: 'Naveen  Prasath ', address: 'Line one\nLine two' })] };
    const s = sheet(['Employee Code', 'Name', 'Address'], ['EMP-50', 'Naveen Prasath', 'Line one Line two']);
    expect(checkEmployeeImport(s.headers, s.rows, spaced, 'UPDATE').results[0]).toMatchObject({ result: 'UNCHANGED', changes: [] });
  });

  it('refuses a code that two people on record share, and lists no changes for a refused row', () => {
    const twins = { ...ctx, people: [...ctx.people, person({ employeeNo: 'emp-1', name: 'Asha Two', department: 'Support' })] };
    const s = sheet(['Employee Code', 'Department'], ['EMP-1', 'Support']);
    const check = checkEmployeeImport(s.headers, s.rows, twins, 'UPDATE');
    expect(check.results[0].result).toBe('ERROR');
    expect(check.results[0].errors[0]).toMatch(/Asha and Asha Two share the code EMP-1 on record/);
    expect(check.results[0].changes).toEqual([]);
  });

  it('shows a location change by name', () => {
    const check = update(undefined, ['Employee Code', 'Work Location'], ['EMP-1', 'Coimbatore Office']);
    expect(check.results[0].changes).toEqual([{ field: 'Work Location', from: '—', to: 'Coimbatore Office' }]);
  });
});

describe('salary revisions from a sheet', () => {
  const people = [
    { id: 'p1', name: 'Asha', employeeNo: 'EMP-1', isEmployee: true, currentMonthlyPackage: 50000, revisions: [], finalizedPeriods: ['2026-08', '2026-09'] },
    { id: 'p2', name: 'Bala', employeeNo: 'EMP-2', isEmployee: true, currentMonthlyPackage: 30000,
      revisions: [{ effectiveFrom: '2026-11-01', oldMonthlyPackage: 25000, newMonthlyPackage: 30000 }], finalizedPeriods: [] },
    { id: 'p3', name: 'Dinesh', employeeNo: 'C-1', isEmployee: false, currentMonthlyPackage: 0, revisions: [], finalizedPeriods: [] },
  ];
  const H = ['Employee Code', 'Name', 'New Monthly Package (₹)', 'Effective Month', 'Reason'];
  const check = (...lines: any[][]) => { const s = sheet(H, ...lines); return checkRevisionImport(s.headers, s.rows, people); };

  it('takes a good row and shows the old and new package', () => {
    const r = check(['emp-1', 'whoever', '55,000', 'Oct 2026', 'Annual increment']);
    expect(r.problem).toBeNull();
    expect(r.results[0]).toMatchObject({
      result: 'REVISE', personId: 'p1', name: 'Asha', effectiveMonth: '2026-10', oldMonthlyPackage: 50000, newMonthlyPackage: 55000,
      reason: 'Annual increment', errors: [], warnings: [],
    });
  });

  it('warns that finalized months will bring arrears', () => {
    const r = check(['EMP-1', '', 55000, '2026-08', '']);
    expect(r.results[0].result).toBe('REVISE');
    expect(r.results[0].warnings[0]).toMatch(/finalized for 2 months from then: the difference is raised as arrears/);
    expect(check(['EMP-1', '', 45000, '2026-09', '']).results[0].warnings[0]).toMatch(/nothing is taken back unless you ask/);
  });

  it('applies the rules of the revision screen', () => {
    const r = check(['EMP-1', '', 50000, 'Oct 2026', ''], ['EMP-2', '', 32000, 'Oct 2026', ''], ['C-1', '', 20000, 'Oct 2026', ''], ['EMP-9', '', 20000, 'Oct 2026', '']);
    expect(r.results[0].errors[0]).toMatch(/same as the present one/);
    expect(r.results[1].errors[0]).toMatch(/later revision is already on record/);
    expect(r.results[2].errors[0]).toMatch(/not an employee/);
    expect(r.results[3].errors[0]).toMatch(/No employee has the code EMP-9/);
    expect(r.counts).toEqual({ REVISE: 0, ERROR: 4 });
  });

  it('reads the package in force in the effective month', () => {
    // Bala's revision takes effect in November: before it the old package stands
    expect(check(['EMP-2', '', 28000, 'Dec 2026', '']).results[0]).toMatchObject({ result: 'REVISE', oldMonthlyPackage: 30000 });
  });

  it('refuses bad cells and an employee twice in the file', () => {
    const r = check(['EMP-1', '', 'a lot', 'someday', ''], ['EMP-2', '', '', '', 'x'], ['EMP-1', '', 60000, 'Nov 2026', '']);
    expect(r.results[0].errors.join(' | ')).toMatch(/on rows 2 and 4.*not a month.*not an amount/);
    expect(r.results[1].errors.join(' | ')).toMatch(/effective month is missing.*package is missing/);
    expect(r.results[2].errors[0]).toMatch(/one revision an employee at a time/);
  });

  it('refuses a code that two employees share', () => {
    const twins = [...people, { ...people[0], id: 'p9', name: 'Asha Two' }];
    const s = sheet(H, ['EMP-1', '', 55000, 'Oct 2026', '']);
    expect(checkRevisionImport(s.headers, s.rows, twins).results[0].errors[0]).toMatch(/Asha and Asha Two share the code EMP-1/);
  });

  it('needs its three columns', () => {
    const s = sheet(['Employee Code', 'Reason'], ['EMP-1', 'x']);
    expect(checkRevisionImport(s.headers, s.rows, people).problem).toMatch(/New Monthly Package \(₹\)", "Effective Month/);
  });
});

describe('files named by employee code', () => {
  const people = [
    { id: 'a', employeeNo: 'EMP-1', name: 'Asha' }, { id: 'b', employeeNo: 'EMP-10', name: 'Bala' },
    { id: 'c', employeeNo: 'AV 007', name: 'Chitra' }, { id: 'd', employeeNo: '', name: 'No Code' },
  ];

  it('finds the employee whose code the name starts with', () => {
    expect(matchFile('EMP-1.jpg', people)).toMatchObject({ personId: 'a', title: '', problem: null });
    expect(matchFile('emp-10.PNG', people)).toMatchObject({ personId: 'b', title: '' });
    expect(matchFile('photos/EMP-10.jpg', people)).toMatchObject({ personId: 'b' });
    expect(matchFile('C:\\scans\\EMP-1.pdf', people)).toMatchObject({ personId: 'a' });
  });

  it('takes the longest code, so EMP-10 is not EMP-1', () => {
    expect(matchFile('EMP-10_pan card.pdf', people)).toMatchObject({ personId: 'b', title: 'pan card' });
    expect(matchFile('EMP-1 - Degree certificate.pdf', people)).toMatchObject({ personId: 'a', title: 'Degree certificate' });
    expect(matchFile('EMP-100.pdf', people).problem).toMatch(/No employee code matches/);
    expect(matchFile('EMP-1x.pdf', people).personId).toBeNull();
    expect(matchFile('AV 007 (passport).pdf', people)).toMatchObject({ personId: 'c', title: 'passport' });
    expect(matchFile('random.pdf', people).personId).toBeNull();
  });

  it('does not guess between two employees who share a code', () => {
    const twins = [...people, { id: 'z', employeeNo: 'emp-1', name: 'Asha Two' }];
    expect(matchFile('EMP-1.jpg', twins)).toMatchObject({ personId: null, problem: 'Asha and Asha Two share the code EMP-1 on record. Give each their own code first.' });
    expect(matchFile('EMP-10.jpg', twins)).toMatchObject({ personId: 'b', problem: null });
  });

  it('allows one photo an employee', () => {
    const photos = matchFiles(['EMP-1.jpg', 'EMP-10.jpg', 'EMP-1 (2).jpg', 'nobody.jpg'], people, true);
    expect(photos.map(m => m.problem)).toEqual([null, null, 'A second file for Asha: one photo each', 'No employee code matches this file name']);
    const documents = matchFiles(['EMP-1_pan.pdf', 'EMP-1_degree.pdf'], people);
    expect(documents.every(m => m.problem === null)).toBe(true);
  });
});
