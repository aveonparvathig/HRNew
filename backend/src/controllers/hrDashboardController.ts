// The HR panel on the dashboard: headcount, joiners and leavers, birthdays
// and anniversaries, confirmations due, records with gaps. Read-only.
import { Response } from 'express';
import { prisma } from '../config/database';
import { todayIST } from '../services/payroll/loanLedger';
import { confirmationsDue } from '../services/orgChart';
import {
  headcountOn, headcountTrend, leavingSoon, recentJoiners, recentLeavers, recordGaps, upcoming, upcomingAnniversaries,
} from '../services/hrDashboard';

const LEFT = ['RESIGNED', 'TERMINATED'];
const DAYS = { joiners: 30, occasions: 7, confirmations: 30 };

const card = (p: any) => ({ id: p.id, name: p.name, employeeNo: p.employeeNo, designation: p.designation, department: p.department });

export const hrDashboardController = {
  async getDashboard(req: any, res: Response) {
    const organizationId = req.user?.organizationId;
    const today = todayIST();
    // Everyone on the employee record, those who have left included: the
    // earlier months of the trend count them
    const everyone = await prisma.person.findMany({
      where: { organizationId, kind: 'CANDIDATE', isEmployee: true },
      select: {
        id: true, name: true, employeeNo: true, designation: true, department: true,
        joinDate: true, leavingDate: true, reasonForLeaving: true, employmentStatus: true, dateOfBirth: true,
        probationMonths: true, confirmationDate: true,
        panNumber: true, bankAccountNumber: true, workLocationId: true,
      },
      orderBy: { name: 'asc' },
    });
    const current = everyone.filter(p => !LEFT.includes(p.employmentStatus));
    const confirmations = confirmationsDue(current.filter(p => !p.confirmationDate && p.probationMonths > 0), today, DAYS.confirmations);

    res.json({
      today,
      days: DAYS,
      headcount: {
        // As the People list counts them: everyone not marked as left
        current: current.length,
        onRolls: headcountOn(everyone, today),
        trend: headcountTrend(everyone, today),
      },
      joiners: recentJoiners(everyone, today, DAYS.joiners).map(p => ({ ...card(p), joinDate: p.joinDate })),
      leavers: recentLeavers(everyone, today, DAYS.joiners)
        .map(p => ({ ...card(p), leavingDate: p.leavingDate, reasonForLeaving: p.reasonForLeaving })),
      leavingSoon: leavingSoon(everyone, today).map(p => ({ ...card(p), leavingDate: p.leavingDate })),
      birthdays: upcoming(current, p => p.dateOfBirth, today, DAYS.occasions)
        .map(u => ({ ...card(u.person), on: u.on, daysAway: u.daysAway })),
      anniversaries: upcomingAnniversaries(current, p => p.joinDate, today, DAYS.occasions)
        .map(u => ({ ...card(u.person), on: u.on, daysAway: u.daysAway, years: u.years })),
      confirmations: {
        due: confirmations.map(c => ({ ...card(c.person), dueOn: c.dueOn, daysLeft: c.daysLeft, overdue: c.overdue })),
        overdue: confirmations.filter(c => c.overdue).length,
      },
      // Counts that open the People list filtered to those employees
      gaps: recordGaps(current),
    });
  },
};
