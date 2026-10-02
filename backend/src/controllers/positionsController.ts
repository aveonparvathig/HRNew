// Position history: each dated change to an employee's designation,
// department, work location and grade.
import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { loadActor } from '../middleware/roles';
import { actorName, logPayrollAudit } from '../services/payroll/audit';
import { todayIST } from '../services/payroll/loanLedger';
import { ensureListValues } from '../services/listValues';
import { POSITION_REASONS, STARTING, changeProblem, positionInput, reasonLabel } from '../services/positionCalc';
import { carryIntoLater, ensureStartingPosition, positionHistory, syncCurrentPosition } from '../services/positions';

const STAFF = ['SUPER_ADMIN', 'HR'];

async function fetchEmployee(personId: string, organizationId: string) {
  const person = await prisma.person.findFirst({ where: { id: personId, organizationId }, omit: { photoData: true } });
  if (!person) throw new AppError(404, 'Person not found');
  if (!person.isEmployee) throw new AppError(400, 'Position history is kept for employees');
  return person;
}

async function locationNames(organizationId: string) {
  const locations = await prisma.workLocation.findMany({ where: { organizationId }, select: { id: true, name: true } });
  return new Map(locations.map(l => [l.id, l.name]));
}

// "Developer, Engineering, Chennai, L2" — for the audit trail
const carriedNote = (n: number) => (n ? ` ${n} later record${n === 1 ? '' : 's'} that held the old value ${n === 1 ? 'was' : 'were'} updated too.` : '');

const inWords = (p: any, names: Map<string, string>) =>
  [p.designation, p.department, p.workLocationId ? names.get(p.workLocationId) : '', p.grade].filter(Boolean).join(', ') || 'Nothing set';

export const positionsController = {
  // HR sees anyone's history; an employee sees their own.
  async getPositions(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const actor = await loadActor(req);
    const staff = STAFF.includes(actor.role);
    if (!staff && actor.personId !== req.params.personId) throw new AppError(403, 'You do not have access to this section');
    const person = await fetchEmployee(req.params.personId, organizationId);
    await ensureStartingPosition(person);
    res.json({ ...(await positionHistory(person, staff)), reasons: POSITION_REASONS });
  },

  // Record a change from a date. A date that already has a record
  // replaces that record; a date ahead waits until its day.
  async changePosition(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const person = await fetchEmployee(req.params.personId, organizationId);
    const input = positionInput(req.body);
    if (typeof input === 'string') throw new AppError(400, input);
    const names = await locationNames(organizationId);
    if (input.workLocationId && !names.has(input.workLocationId)) throw new AppError(400, 'Work location not found');

    await ensureStartingPosition(person);
    const rows = await prisma.positionChange.findMany({ where: { personId: person.id }, orderBy: { effectiveFrom: 'asc' } });
    const problem = changeProblem(rows, input);
    if (problem) throw new AppError(400, problem);

    const same = rows.find(r => r.effectiveFrom === input.effectiveFrom);
    const before = same || rows.filter(r => r.effectiveFrom < input.effectiveFrom).pop() || null;
    const { effectiveFrom, reason, remarks, ...position } = input;
    const enteredByName = await actorName(req.user?.userId);
    if (same) {
      await prisma.positionChange.update({
        where: { id: same.id },
        // The first record stays the starting record however it is corrected,
        // and a corrected promotion is still a promotion
        data: { ...position, remarks, enteredByName, reason: same.reason === STARTING || reason === 'CORRECTION' ? same.reason : reason, appliedAt: null },
      });
    } else {
      await prisma.positionChange.create({
        data: { organizationId, personId: person.id, effectiveFrom, ...position, reason, remarks, enteredByName },
      });
    }
    // What this changes holds in later records too, until one of them set it itself
    const carried = before ? await carryIntoLater(person.id, effectiveFrom, before, input) : 0;
    await ensureListValues(organizationId, { DESIGNATION: input.designation, DEPARTMENT: input.department, GRADE: input.grade });
    await syncCurrentPosition(person.id);
    await logPayrollAudit(req, [{
      action: 'POSITION_CHANGED', personId: person.id, personName: person.name,
      field: `Position from ${effectiveFrom} (${reasonLabel(same?.reason === STARTING ? STARTING : reason)})`,
      oldValue: before ? inWords(before, names) : '', newValue: inWords(input, names),
    }]);
    const ahead = effectiveFrom > todayIST();
    res.status(same ? 200 : 201).json({
      ...(await positionHistory(person, true)),
      carried,
      message: (same ? `The record of ${effectiveFrom} was corrected.`
        : ahead ? `Recorded. ${person.name}'s position changes on ${effectiveFrom}.`
          : `${person.name}'s position changed from ${effectiveFrom}.`) + carriedNote(carried),
    });
  },

  async deletePosition(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const change = await prisma.positionChange.findFirst({ where: { id: req.params.changeId, organizationId } });
    if (!change) throw new AppError(404, 'Position record not found');
    const person = await fetchEmployee(change.personId, organizationId);
    const earlier = await prisma.positionChange.findFirst({
      where: { personId: person.id, effectiveFrom: { lt: change.effectiveFrom } }, orderBy: { effectiveFrom: 'desc' },
    });
    if (!earlier) {
      throw new AppError(400, 'The first record cannot be removed. To correct it, record a change on the same date.');
    }
    await prisma.positionChange.delete({ where: { id: change.id } });
    // Later records give back what they had carried from this one
    const carried = await carryIntoLater(person.id, change.effectiveFrom, change, earlier);
    await syncCurrentPosition(person.id);
    await logPayrollAudit(req, [{
      action: 'POSITION_CHANGED', personId: person.id, personName: person.name,
      field: `Position record of ${change.effectiveFrom} removed`, oldValue: inWords(change, await locationNames(organizationId)),
    }]);
    res.json({ ...(await positionHistory(person, true)), carried, message: `Removed the record of ${change.effectiveFrom}.${carriedNote(carried)}` });
  },
};
