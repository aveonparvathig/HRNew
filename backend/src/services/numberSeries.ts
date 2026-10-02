// Running numbers in the database: looking at the next one, and taking it.
import { prisma } from '../config/database';
import { DEFAULT_EMPLOYEE_SERIES, firstFree, formatNumber } from './payroll/numberSeriesCalc';
import { todayIST } from './payroll/loanLedger';

export const seriesRow = (organizationId: string, key: string) =>
  prisma.numberSeries.findUnique({ where: { organizationId_key: { organizationId, key } } });

// The next number of a series, without taking it. Null when the series is
// not set up.
export async function peekNumber(organizationId: string, key: string): Promise<string | null> {
  const series = await seriesRow(organizationId, key);
  return series ? formatNumber(series, series.nextNumber, todayIST()) : null;
}

// Take the next number of a series. Null when the series is not set up.
export async function takeNumber(organizationId: string, key: string): Promise<string | null> {
  const series = await seriesRow(organizationId, key);
  if (!series) return null;
  const taken = await prisma.numberSeries.update({
    where: { organizationId_key: { organizationId, key } }, data: { nextNumber: { increment: 1 } },
  });
  return formatNumber(taken, taken.nextNumber - 1, todayIST());
}

// The employee code offered for a new employee: the next free one of the
// series. Until a series is saved, EMP-0001 onward, counted from the
// number of employees, as before.
export async function nextEmployeeCode(organizationId: string): Promise<string> {
  const [series, people, employees] = await Promise.all([
    seriesRow(organizationId, 'EMPLOYEE_CODE'),
    prisma.person.findMany({ where: { organizationId, NOT: { employeeNo: '' } }, select: { employeeNo: true } }),
    prisma.person.count({ where: { organizationId, kind: 'CANDIDATE', isEmployee: true } }),
  ]);
  const used = new Set(people.map(p => p.employeeNo.trim().toLowerCase()));
  const from = series ? series.nextNumber : employees + 1;
  return firstFree(series || DEFAULT_EMPLOYEE_SERIES, from, todayIST(), used).text;
}

// Once a code offered by the series is given to someone, the series moves on.
export async function noteEmployeeCodeUsed(organizationId: string, code: string) {
  const series = await seriesRow(organizationId, 'EMPLOYEE_CODE');
  if (!series || !code) return;
  const today = todayIST();
  // Codes typed by hand that jump ahead are followed too, within reason
  for (let n = series.nextNumber; n < series.nextNumber + 50; n++) {
    if (formatNumber(series, n, today).toLowerCase() === code.trim().toLowerCase()) {
      await prisma.numberSeries.update({ where: { organizationId_key: { organizationId, key: 'EMPLOYEE_CODE' } }, data: { nextNumber: n + 1 } });
      return;
    }
  }
}
