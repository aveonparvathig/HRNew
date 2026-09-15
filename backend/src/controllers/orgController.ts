import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

const str = (v: any) => String(v ?? '');

const ROLES = ['SUPER_ADMIN', 'HR', 'EMPLOYEE'];

async function requireOwner(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'SUPER_ADMIN') {
    throw new AppError(403, 'Only a Super Admin can do this');
  }
  return user;
}

const memberJSON = (u: any) => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  role: u.role,
  isActive: u.isActive,
  personId: u.personId || null,
  personName: u.person?.name || null,
  mustChangePassword: u.mustChangePassword || false,
  createdAt: u.createdAt,
});

// Readable random temp password, e.g. "kite-9382-lamp"
function tempPassword(): string {
  const words = ['kite', 'lamp', 'rock', 'leaf', 'moon', 'star', 'wave', 'fern', 'sand', 'bell',
    'drum', 'gate', 'hill', 'iris', 'jade', 'knot', 'lion', 'mint', 'nest', 'opal'];
  const w = () => words[Math.floor(Math.random() * words.length)];
  return `${w()}-${1000 + Math.floor(Math.random() * 9000)}-${w()}`;
}

export const orgController = {
  // ---- Company profile ---------------------------------------------------
  async getProfile(req: any, res: Response) {
    const org = await prisma.organization.findUnique({
      where: { id: req.user?.organizationId },
    });
    if (!org) throw new AppError(404, 'Organization not found');
    res.json(org);
  },

  async updateProfile(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const b = req.body;
    const data: any = {};
    if (b.name !== undefined) {
      const name = str(b.name).trim();
      if (!name) throw new AppError(400, 'Organization name is required');
      data.name = name;
    }
    for (const f of ['tagline', 'address', 'city', 'state', 'country', 'phone',
      'email', 'website', 'jurisdiction', 'logoData',
      'signatoryName', 'signatoryDesignation']) {
      if (b[f] !== undefined) data[f] = str(b[f]);
    }
    for (const f of ['brandPrimary', 'brandAccent']) {
      if (b[f] !== undefined) {
        if (!/^#[0-9a-fA-F]{6}$/.test(b[f])) throw new AppError(400, 'Colors must be hex like #4f46e5');
        data[f] = b[f];
      }
    }
    const org = await prisma.organization.update({
      where: { id: req.user?.organizationId },
      data,
    });
    res.json(org);
  },

  // ---- Team --------------------------------------------------------------
  async getTeam(req: any, res: Response) {
    const users = await prisma.user.findMany({
      where: { organizationId: req.user?.organizationId },
      include: { person: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const me = users.find(u => u.id === req.user?.userId);
    const linkedIds = users.map(u => u.personId).filter(Boolean) as string[];
    const withoutLogin = await prisma.person.count({
      where: {
        organizationId: req.user?.organizationId,
        isEmployee: true,
        employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] },
        id: { notIn: linkedIds },
      },
    });
    res.json({
      members: users.map(memberJSON),
      myRole: me?.role || 'EMPLOYEE',
      myId: req.user?.userId,
      employeesWithoutLogin: withoutLogin,
    });
  },

  // One click: a login for every active employee that doesn't have one yet.
  // Responds with an XLSX credential sheet (name, email, temp password);
  // every generated account must change its password at first sign-in.
  async generateEmployeeLogins(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const orgId = req.user?.organizationId;
    const linked = (await prisma.user.findMany({
      where: { organizationId: orgId, personId: { not: null } },
      select: { personId: true },
    })).map(u => u.personId as string);
    const employees = await prisma.person.findMany({
      where: {
        organizationId: orgId, isEmployee: true,
        employmentStatus: { notIn: ['RESIGNED', 'TERMINATED'] },
        id: { notIn: linked },
      },
      orderBy: { name: 'asc' },
    });

    const created: { name: string; email: string; password: string }[] = [];
    const skipped: { name: string; reason: string }[] = [];
    for (const p of employees) {
      const email = (p.officialEmail || p.email || '').trim().toLowerCase();
      if (!email) { skipped.push({ name: p.name, reason: 'no email on record' }); continue; }
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) { skipped.push({ name: p.name, reason: `email ${email} already has a login` }); continue; }
      const password = tempPassword();
      const [firstName, ...rest] = p.name.split(' ');
      await prisma.user.create({
        data: {
          email,
          password: await bcrypt.hash(password, 10),
          firstName, lastName: rest.join(' '),
          organizationId: orgId,
          role: 'EMPLOYEE',
          personId: p.id,
          mustChangePassword: true,
        },
      });
      created.push({ name: p.name, email, password });
    }

    const Excel = await import('exceljs');
    const wb = new Excel.Workbook();
    const ws = wb.addWorksheet('Logins');
    ws.addRow(['Name', 'Email (login)', 'Temporary password', 'Note']);
    ws.getRow(1).font = { bold: true };
    for (const c of created) ws.addRow([c.name, c.email, c.password, 'Must change password at first sign-in']);
    if (skipped.length) {
      ws.addRow([]);
      ws.addRow(['Skipped', '', '', '']).font = { bold: true };
      for (const s of skipped) ws.addRow([s.name, '', '', s.reason]);
    }
    ws.columns.forEach((c: any) => { c.width = 32; });
    res.setHeader('X-Created-Count', String(created.length));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="employee-logins-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  },

  async addMember(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const { email, password, firstName, lastName, role } = req.body;
    if (!email || !password) throw new AppError(400, 'Email and password are required');
    if (String(password).length < 8) throw new AppError(400, 'Password must be at least 8 characters');
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw new AppError(409, 'A user with this email already exists');
    const user = await prisma.user.create({
      data: {
        email,
        password: await bcrypt.hash(password, 10),
        firstName: str(firstName),
        lastName: str(lastName),
        organizationId: req.user?.organizationId,
        role: ROLES.includes(role) ? role : 'EMPLOYEE',
      },
    });
    res.status(201).json(memberJSON(user));
  },

  async updateMember(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const orgId = req.user?.organizationId;
    const member = await prisma.user.findFirst({
      where: { id: req.params.memberId, organizationId: orgId },
    });
    if (!member) throw new AppError(404, 'Team member not found');

    const b = req.body;
    const data: any = {};
    if (b.role !== undefined) {
      if (!ROLES.includes(b.role)) throw new AppError(400, 'Invalid role');
      data.role = b.role;
    }
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);
    if (b.firstName !== undefined) data.firstName = str(b.firstName);
    if (b.lastName !== undefined) data.lastName = str(b.lastName);
    if (b.personId !== undefined) data.personId = b.personId || null;

    // Never lock the org out: keep at least one active Super Admin.
    const becomesInactiveOrDemoted =
      (data.isActive === false || (data.role && data.role !== 'SUPER_ADMIN'));
    if (becomesInactiveOrDemoted && member.role === 'SUPER_ADMIN') {
      const otherActiveAdmins = await prisma.user.count({
        where: {
          organizationId: orgId, role: 'SUPER_ADMIN', isActive: true,
          id: { not: member.id },
        },
      });
      if (otherActiveAdmins === 0) {
        throw new AppError(400, 'The organization needs at least one active Super Admin');
      }
    }
    const updated = await prisma.user.update({ where: { id: member.id }, data });
    res.json(memberJSON(updated));
  },

  async resetMemberPassword(req: any, res: Response) {
    await requireOwner(req.user?.userId);
    const member = await prisma.user.findFirst({
      where: { id: req.params.memberId, organizationId: req.user?.organizationId },
    });
    if (!member) throw new AppError(404, 'Team member not found');
    const password = String(req.body.password || '');
    if (password.length < 8) throw new AppError(400, 'Password must be at least 8 characters');
    await prisma.user.update({
      where: { id: member.id },
      data: { password: await bcrypt.hash(password, 10) },
    });
    res.json({ message: `Password reset for ${member.email}` });
  },
};
