import { Response } from 'express';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import {
  ensureDefaultShifts, getRoster, assignShifts, clearAssignment, setProfile,
} from '../services/attendance/attendanceService';

const str = (v: any) => String(v ?? '');
const num = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n; };
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export const attendanceController = {
  async getMeta(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    await ensureDefaultShifts(orgId);
    const [shifts, employees] = await Promise.all([
      prisma.shift.findMany({ where: { organizationId: orgId }, orderBy: { sortOrder: 'asc' } }),
      prisma.person.findMany({ where: { organizationId: orgId, kind: 'CANDIDATE', isEmployee: true, employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] } }, orderBy: { name: 'asc' }, select: { id: true, name: true, employeeNo: true } }),
    ]);
    res.json({ shifts, employees });
  },

  async saveShift(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const name = str(b.name).trim();
    if (!name) throw new AppError(400, 'Enter the shift name');
    const startTime = str(b.startTime), endTime = str(b.endTime);
    if (!TIME.test(startTime) || !TIME.test(endTime)) throw new AppError(400, 'Enter valid start/end times (HH:MM)');
    const data = {
      name, startTime, endTime,
      workHours: Math.max(0, num(b.workHours)),
      isNight: Boolean(b.isNight),
      active: b.active === undefined ? true : Boolean(b.active),
      sortOrder: num(b.sortOrder),
    };
    if (b.id) {
      const shift = await prisma.shift.findFirst({ where: { id: str(b.id), organizationId: orgId } });
      if (!shift) throw new AppError(404, 'Shift not found');
      const updated = await prisma.shift.update({ where: { id: shift.id }, data });
      return res.json(updated);
    }
    const code = str(b.code).trim().toUpperCase();
    if (!code || code.length > 10) throw new AppError(400, 'Enter a short shift code');
    if (await prisma.shift.findUnique({ where: { organizationId_code: { organizationId: orgId, code } } })) {
      throw new AppError(409, 'A shift with this code already exists');
    }
    const created = await prisma.shift.create({ data: { organizationId: orgId, code, ...data } });
    res.status(201).json(created);
  },

  async deleteShift(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const shift = await prisma.shift.findFirst({ where: { id: req.params.shiftId, organizationId: orgId } });
    if (!shift) throw new AppError(404, 'Shift not found');
    const used = await prisma.shiftAssignment.count({ where: { shiftId: shift.id } });
    if (used > 0) throw new AppError(400, 'This shift is used in the roster. Mark it inactive instead of deleting.');
    await prisma.attendanceProfile.updateMany({ where: { defaultShiftId: shift.id }, data: { defaultShiftId: null } });
    await prisma.shift.delete({ where: { id: shift.id } });
    res.json({ message: `Deleted ${shift.code}` });
  },

  async getRoster(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const month = MONTH.test(str(req.query.month)) ? str(req.query.month) : new Date().toISOString().slice(0, 7);
    res.json(await getRoster(orgId, month));
  },

  async assignShifts(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const personIds = Array.isArray(b.personIds) ? b.personIds.map(str).filter(Boolean) : [];
    if (!personIds.length) throw new AppError(400, 'Pick at least one employee');
    const startDate = str(b.startDate), endDate = str(b.endDate);
    if (!DATE.test(startDate) || !DATE.test(endDate)) throw new AppError(400, 'Pick valid dates');
    if (endDate < startDate) throw new AppError(400, 'The end date is before the start date');
    const shift = await prisma.shift.findFirst({ where: { id: str(b.shiftId), organizationId: orgId } });
    if (!shift) throw new AppError(400, 'Pick a valid shift');
    const n = await assignShifts(orgId, personIds, startDate, endDate, shift.id);
    res.json({ message: `Assigned ${shift.code} to ${personIds.length} employee(s) across ${n / personIds.length} day(s)`, count: n });
  },

  async clearAssignment(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const { personId, date } = req.body;
    if (!DATE.test(str(date))) throw new AppError(400, 'Pick a valid date');
    await clearAssignment(orgId, str(personId), str(date));
    res.json({ message: 'Cleared' });
  },

  async setProfile(req: any, res: Response) {
    const orgId = req.user?.organizationId;
    const b = req.body;
    const person = await prisma.person.findFirst({ where: { id: str(b.personId), organizationId: orgId, isEmployee: true } });
    if (!person) throw new AppError(400, 'Pick a valid employee');
    let defaultShiftId: string | null | undefined;
    if (b.defaultShiftId !== undefined) {
      defaultShiftId = b.defaultShiftId || null;
      if (defaultShiftId && !(await prisma.shift.findFirst({ where: { id: defaultShiftId, organizationId: orgId } }))) {
        throw new AppError(400, 'Pick a valid shift');
      }
    }
    let weekOffDays: number[] | undefined;
    if (b.weekOffDays !== undefined) {
      if (!Array.isArray(b.weekOffDays)) throw new AppError(400, 'weekOffDays must be a list');
      const parsed = (b.weekOffDays as any[]).map((d: any) => parseInt(d)).filter((d: number) => d >= 0 && d <= 6);
      weekOffDays = [...new Set<number>(parsed)];
    }
    const profile = await setProfile(orgId, person.id, defaultShiftId as any, weekOffDays);
    res.json(profile);
  },
};
