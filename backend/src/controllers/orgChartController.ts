// Reporting lines, the organization chart, and confirmation of employees
// on probation.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { logPayrollAudit } from '../services/payroll/audit';
import { todayIST } from '../services/payroll/loanLedger';
import { confirmationsDue, managerProblem, orgTree } from '../services/orgChart';

const str = (v: any) => String(v ?? '').trim();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Employees still with the company
const CURRENT = { kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } };
const CARD = { id: true, name: true, employeeNo: true, designation: true, department: true, managerId: true, employmentStatus: true };

// Everyone's reporting line, for the loop check
const reportingLines = (organizationId: string) =>
  prisma.person.findMany({ where: { organizationId, isEmployee: true }, select: { id: true, managerId: true } });

async function fetchEmployee(id: string, organizationId: string) {
  const person = await prisma.person.findFirst({ where: { id, organizationId, isEmployee: true } });
  if (!person) throw new AppError(404, 'Employee not found');
  return person;
}

// Checks a manager for a person and returns the manager's record (null = none).
export async function assertManager(organizationId: string, personId: string, managerId: string | null | undefined) {
  if (!managerId) return null;
  const problem = managerProblem(personId, managerId, await reportingLines(organizationId));
  if (problem) throw new AppError(400, problem);
  return prisma.person.findFirst({ where: { id: managerId, organizationId }, select: { id: true, name: true } });
}

export const orgChartController = {
  // The reporting tree of current employees. Open to every signed-in user,
  // like the directory: it carries no pay or personal details.
  async getChart(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const people = await prisma.person.findMany({ where: { organizationId, ...CURRENT }, select: CARD, orderBy: { name: 'asc' } });
    const ids = new Set(people.map(p => p.id));
    res.json({
      tree: orgTree(people),
      people,
      // Whose manager has left or was never set
      withoutManager: people.filter(p => !p.managerId || !ids.has(p.managerId)).length,
    });
  },

  async setManager(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const person = await fetchEmployee(req.params.personId, organizationId);
    const managerId = str(req.body.managerId) || null;
    const manager = await assertManager(organizationId, person.id, managerId);
    if (managerId && !manager) throw new AppError(400, 'Pick the manager from the employees of the company');
    if ((person.managerId || null) === managerId) return res.json({ message: 'Nothing changed' });
    const before = person.managerId
      ? await prisma.person.findUnique({ where: { id: person.managerId }, select: { name: true } }) : null;
    await prisma.person.update({ where: { id: person.id }, data: { managerId } });
    await logPayrollAudit(req, [{
      action: 'MANAGER_CHANGED', personId: person.id, personName: person.name,
      field: 'Reporting manager', oldValue: before?.name || 'None', newValue: manager?.name || 'None',
    }]);
    res.json({ message: manager ? `${person.name} now reports to ${manager.name}` : `${person.name} has no manager now` });
  },

  // Move everyone who reports directly to one manager under another (or
  // under nobody). The new manager is left where they are.
  async transferReports(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const from = await fetchEmployee(str(req.body.fromManagerId), organizationId);
    const toId = str(req.body.toManagerId) || null;
    if (toId === from.id) throw new AppError(400, 'Pick a different manager to move the team to');
    const to = toId ? await fetchEmployee(toId, organizationId) : null;
    const lines = await reportingLines(organizationId);
    const moving = await prisma.person.findMany({
      where: { organizationId, managerId: from.id, ...CURRENT, ...(toId ? { id: { not: toId } } : {}) },
      select: { id: true, name: true },
    });
    if (moving.length === 0) throw new AppError(400, `Nobody reports to ${from.name}`);
    for (const p of moving) {
      const problem = managerProblem(p.id, toId, lines);
      if (problem) throw new AppError(400, `${p.name}: ${problem}`);
    }
    await prisma.person.updateMany({ where: { id: { in: moving.map(p => p.id) } }, data: { managerId: toId } });
    await logPayrollAudit(req, moving.map(p => ({
      action: 'MANAGER_CHANGED' as const, personId: p.id, personName: p.name,
      field: 'Reporting manager', oldValue: from.name, newValue: to?.name || 'None',
    })));
    res.json({
      moved: moving.length,
      message: `${moving.length} ${moving.length === 1 ? 'person' : 'people'} moved from ${from.name} to ${to?.name || 'no manager'}`,
    });
  },

  // Confirmations overdue or falling due in the next days (30 unless asked).
  async getConfirmations(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const days = Math.min(365, Math.max(0, Number(req.query.days) || 30));
    const people = await prisma.person.findMany({
      where: { organizationId, ...CURRENT, confirmationDate: null, probationMonths: { gt: 0 } },
      select: { ...CARD, joinDate: true, probationMonths: true, confirmationDate: true },
      orderBy: { name: 'asc' },
    });
    const due = confirmationsDue(people, todayIST(), days);
    res.json({
      days,
      due: due.map(d => ({ ...d.person, dueOn: d.dueOn, daysLeft: d.daysLeft, overdue: d.overdue })),
      overdue: due.filter(d => d.overdue).length,
      onProbation: people.length,
    });
  },

  // Confirm an employee: the date is recorded and probation ends.
  async confirm(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const person = await fetchEmployee(req.params.personId, organizationId);
    const date = str(req.body.confirmationDate) || todayIST();
    if (!DATE.test(date) || isNaN(Date.parse(date))) throw new AppError(400, 'Enter the confirmation date');
    if (person.joinDate && date < person.joinDate) throw new AppError(400, 'The confirmation date cannot be before the joining date');
    if (['RESIGNED', 'TERMINATED'].includes(person.employmentStatus)) throw new AppError(400, `${person.name} has left the company`);
    const updated = await prisma.person.update({
      where: { id: person.id },
      data: { confirmationDate: date, ...(person.employmentStatus === 'PROBATION' ? { employmentStatus: 'ACTIVE' } : {}) },
    });
    await logPayrollAudit(req, [{
      action: 'EMPLOYEE_CONFIRMED', personId: person.id, personName: person.name,
      field: 'Confirmation date', oldValue: person.confirmationDate || '', newValue: date,
    }]);
    res.json({ confirmationDate: updated.confirmationDate, employmentStatus: updated.employmentStatus, message: `${person.name} confirmed from ${date}` });
  },
};
