import { Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

const str = (v: any) => String(v ?? '');

async function requireOwner(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== 'OWNER') {
    throw new AppError(403, 'Only organization owners can do this');
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
  createdAt: u.createdAt,
});

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
      orderBy: { createdAt: 'asc' },
    });
    const me = users.find(u => u.id === req.user?.userId);
    res.json({
      members: users.map(memberJSON),
      myRole: me?.role || 'MEMBER',
      myId: req.user?.userId,
    });
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
        role: role === 'OWNER' ? 'OWNER' : 'MEMBER',
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
      if (!['OWNER', 'MEMBER'].includes(b.role)) throw new AppError(400, 'Invalid role');
      data.role = b.role;
    }
    if (b.isActive !== undefined) data.isActive = Boolean(b.isActive);
    if (b.firstName !== undefined) data.firstName = str(b.firstName);
    if (b.lastName !== undefined) data.lastName = str(b.lastName);

    // Never lock the org out: keep at least one active owner.
    const becomesInactiveOrDemoted =
      (data.isActive === false || data.role === 'MEMBER');
    if (becomesInactiveOrDemoted && member.role === 'OWNER') {
      const otherActiveOwners = await prisma.user.count({
        where: {
          organizationId: orgId, role: 'OWNER', isActive: true,
          id: { not: member.id },
        },
      });
      if (otherActiveOwners === 0) {
        throw new AppError(400, 'The organization needs at least one active owner');
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
