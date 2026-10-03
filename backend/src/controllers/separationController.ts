// Separation (phase 25): the leaving record and its status flow. Accepting
// a resignation moves the person to Notice Period; relieving sets the
// leaving fields, stops the login, and points at the final settlement and
// the relieving / experience letters. HR-facing (SUPER_ADMIN / HR).
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { actorName, logPayrollAudit } from '../services/payroll/audit';
import {
  FIT_TO_REHIRE, SEPARATION_MODES, SEPARATION_STATUSES, canAccept, canRelieve, canWithdraw,
  exitComplete, finalStatusForMode, relievingDate, separationInput,
} from '../services/separationCalc';

// The relieving and experience letters offered once someone is leaving
const LEAVING_LETTERS = [
  { code: 'RELIEVING', label: 'Relieving Letter' },
  { code: 'EXPERIENCE_EMPLOYEE', label: 'Experience Letter' },
];

async function fetchEmployee(personId: string, organizationId: string) {
  const person = await prisma.person.findFirst({
    where: { id: personId, organizationId },
    select: { id: true, name: true, kind: true, isEmployee: true, employmentStatus: true, leavingDate: true, reasonForLeaving: true, noticePeriodDays: true },
  });
  if (!person) throw new AppError(404, 'Person not found');
  return person;
}

const view = (s: any) => s && ({
  ...s,
  exitComplete: exitComplete(s),
  canAccept: canAccept(s), canRelieve: canRelieve(s), canWithdraw: canWithdraw(s),
});

async function respond(res: Response, organizationId: string, person: any) {
  const separation = await prisma.separation.findUnique({ where: { personId: person.id } });
  const settlement = await prisma.settlement.findFirst({ where: { organizationId, personId: person.id }, select: { id: true, sequence: true }, orderBy: { sequence: 'desc' } });
  res.json({
    person: { id: person.id, name: person.name, employmentStatus: person.employmentStatus, leavingDate: person.leavingDate },
    separation: view(separation),
    modes: SEPARATION_MODES, statuses: SEPARATION_STATUSES, fitOptions: FIT_TO_REHIRE,
    letters: LEAVING_LETTERS, settlement,
  });
}

export const separationController = {
  async getSeparation(req: any, res: Response) {
    const person = await fetchEmployee(req.params.personId, req.user?.organizationId);
    await respond(res, req.user?.organizationId, person);
  },

  // Create or edit the separation details. Status is changed only by the
  // accept / relieve / withdraw actions, never here.
  async saveSeparation(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchEmployee(req.params.personId, orgId);
    if (!(person.kind === 'CANDIDATE' && person.isEmployee)) throw new AppError(400, 'Only an employee can have a separation record');
    const input = separationInput(req.body);
    if (typeof input === 'string') throw new AppError(400, input);
    const existing = await prisma.separation.findUnique({ where: { personId: person.id } });
    if (existing && (existing.status === 'RELIEVED')) {
      // A relieved record keeps its outcome; only the exit checklist and remarks stay editable
      await prisma.separation.update({
        where: { personId: person.id },
        data: {
          remarks: (input as any).remarks, fitToRehire: (input as any).fitToRehire,
          assetsReturned: (input as any).assetsReturned, accessRevoked: (input as any).accessRevoked,
          handoverDone: (input as any).handoverDone, exitInterviewDone: (input as any).exitInterviewDone,
        },
      });
    } else {
      await prisma.separation.upsert({
        where: { personId: person.id },
        create: { organizationId: orgId, personId: person.id, status: 'SUBMITTED', ...(input as any), createdByName: await actorName(req.user?.userId) },
        // Re-opening a withdrawn record starts it fresh at Submitted
        update: { ...(input as any), ...(existing?.status === 'WITHDRAWN' ? { status: 'SUBMITTED' } : {}) },
      });
    }
    await logPayrollAudit(req, [{ action: 'SEPARATION_SAVED', personId: person.id, personName: person.name, field: (input as any).mode }]);
    await respond(res, orgId, person);
  },

  async acceptSeparation(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchEmployee(req.params.personId, orgId);
    const sep = await prisma.separation.findUnique({ where: { personId: person.id } });
    if (!sep || !canAccept(sep)) throw new AppError(400, 'This separation cannot be accepted');
    await prisma.separation.update({ where: { personId: person.id }, data: { status: 'ACCEPTED', acceptedByName: await actorName(req.user?.userId) } });
    // The employee is now serving notice
    await prisma.person.update({ where: { id: person.id }, data: { employmentStatus: 'NOTICE_PERIOD' } });
    await logPayrollAudit(req, [{ action: 'SEPARATION_ACCEPTED', personId: person.id, personName: person.name, field: 'Notice period' }]);
    await respond(res, orgId, { ...person, employmentStatus: 'NOTICE_PERIOD' });
  },

  // Relieving sets the leaving date and status, stops the login, and leaves
  // the final settlement and the leaving letters to be done from the page.
  async relieveSeparation(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchEmployee(req.params.personId, orgId);
    const sep = await prisma.separation.findUnique({ where: { personId: person.id } });
    if (!sep || !canRelieve(sep)) throw new AppError(400, 'This separation cannot be relieved yet');
    const relievedOn = relievingDate(req.body.relievedOn, sep);
    if (!relievedOn) throw new AppError(400, 'Set the relieving date (or an agreed last working day)');
    const finalStatus = finalStatusForMode(sep.mode);
    await prisma.$transaction([
      prisma.separation.update({ where: { personId: person.id }, data: { status: 'RELIEVED', relievedOn, relievedByName: await actorName(req.user?.userId) } }),
      prisma.person.update({ where: { id: person.id }, data: { employmentStatus: finalStatus, leavingDate: relievedOn, reasonForLeaving: sep.reason || person.reasonForLeaving } }),
      // Stop the employee's login, if they have one
      prisma.user.updateMany({ where: { personId: person.id }, data: { isActive: false } }),
    ]);
    await logPayrollAudit(req, [{
      action: 'SEPARATION_RELIEVED', personId: person.id, personName: person.name, field: finalStatus,
      newValue: `Relieved ${relievedOn}`,
    }]);
    await respond(res, orgId, { ...person, employmentStatus: finalStatus, leavingDate: relievedOn });
  },

  async withdrawSeparation(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchEmployee(req.params.personId, orgId);
    const sep = await prisma.separation.findUnique({ where: { personId: person.id } });
    if (!sep || !canWithdraw(sep)) throw new AppError(400, 'This separation cannot be withdrawn');
    await prisma.separation.update({ where: { personId: person.id }, data: { status: 'WITHDRAWN' } });
    // Someone put on notice goes back to active
    if (person.employmentStatus === 'NOTICE_PERIOD') {
      await prisma.person.update({ where: { id: person.id }, data: { employmentStatus: 'ACTIVE' } });
    }
    await logPayrollAudit(req, [{ action: 'SEPARATION_WITHDRAWN', personId: person.id, personName: person.name }]);
    await respond(res, orgId, { ...person, employmentStatus: person.employmentStatus === 'NOTICE_PERIOD' ? 'ACTIVE' : person.employmentStatus });
  },

  // Remove the record entirely (before relieving) — e.g. created in error.
  async deleteSeparation(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const person = await fetchEmployee(req.params.personId, orgId);
    const sep = await prisma.separation.findUnique({ where: { personId: person.id } });
    if (!sep) throw new AppError(404, 'No separation record');
    if (sep.status === 'RELIEVED') throw new AppError(400, 'A relieved record cannot be removed. The employee has already left.');
    await prisma.separation.delete({ where: { personId: person.id } });
    if (person.employmentStatus === 'NOTICE_PERIOD') {
      await prisma.person.update({ where: { id: person.id }, data: { employmentStatus: 'ACTIVE' } });
    }
    await respond(res, orgId, { ...person, employmentStatus: person.employmentStatus === 'NOTICE_PERIOD' ? 'ACTIVE' : person.employmentStatus });
  },
};
