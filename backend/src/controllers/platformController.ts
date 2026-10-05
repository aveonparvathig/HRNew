import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import {
  generatePlatformAccessToken, generatePlatformRefreshToken, verifyPlatformRefreshToken,
} from '../middleware/auth';
import { logPlatform, tenantsOverview, tenantDetail, genTempPassword } from '../services/platform';

const adminJSON = (a: any) => ({ id: a.id, email: a.email, name: a.name });
const ownerJSON = (o: any) => ({
  id: o.id, email: o.email, name: o.name, isActive: o.isActive,
  lastLoginAt: o.lastLoginAt, createdAt: o.createdAt,
});
const str = (v: any) => (v == null ? '' : String(v)).trim();

export const platformController = {
  // Platform-owner sign-in. Separate from tenant /auth/login: no org, no
  // per-org lockout policy — just the owner's own credentials.
  async login(req: Request, res: Response) {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) throw new AppError(400, 'Email and password are required');

    const admin = await prisma.platformAdmin.findUnique({ where: { email } });
    // Same message whether the email is unknown or the password is wrong.
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      throw new AppError(401, 'Invalid email or password');
    }
    if (!admin.isActive) throw new AppError(403, 'This platform login has been disabled');

    await prisma.platformAdmin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    await logPlatform(admin.email, 'PLATFORM_LOGIN');

    res.json({
      admin: adminJSON(admin),
      accessToken: generatePlatformAccessToken(admin.id, admin.email),
      refreshToken: generatePlatformRefreshToken(admin.id),
    });
  },

  async refresh(req: Request, res: Response) {
    const token = String(req.body.refreshToken || '');
    const payload = verifyPlatformRefreshToken(token);
    if (!payload) throw new AppError(401, 'Invalid or expired refresh token');
    const admin = await prisma.platformAdmin.findUnique({ where: { id: payload.adminId } });
    if (!admin || !admin.isActive) throw new AppError(401, 'Platform access is inactive');
    res.json({ accessToken: generatePlatformAccessToken(admin.id, admin.email) });
  },

  async me(req: any, res: Response) {
    res.json({ admin: req.platformAdmin });
  },

  // Every tenant with headline usage.
  async getTenants(_req: any, res: Response) {
    res.json({ tenants: await tenantsOverview() });
  },

  // Owner-created tenant: a new org + its first SUPER_ADMIN. Self-service
  // signup still exists; this one is tagged createdVia=OWNER. The admin's
  // password is temporary (must be changed at first sign-in) and returned
  // once so the owner can pass it on — there is no platform-side mail.
  async createTenant(req: any, res: Response) {
    const name = str(req.body.organizationName);
    const email = str(req.body.adminEmail).toLowerCase();
    if (!name) throw new AppError(400, 'Organization name is required');
    if (!email) throw new AppError(400, 'Admin email is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError(400, 'Enter a valid admin email');

    const provided = String(req.body.adminPassword || '');
    if (provided && provided.length < 8) throw new AppError(400, 'Password must be at least 8 characters');
    if (await prisma.user.findUnique({ where: { email } })) {
      throw new AppError(409, 'A user with this email already exists');
    }
    const tempPassword = provided || genTempPassword();

    const org = await prisma.organization.create({
      data: {
        name, createdVia: 'OWNER',
        users: {
          create: {
            email, password: await bcrypt.hash(tempPassword, 10),
            firstName: str(req.body.adminFirstName), lastName: str(req.body.adminLastName),
            role: 'SUPER_ADMIN', mustChangePassword: true, passwordChangedAt: new Date(),
          },
        },
      },
    });
    await logPlatform(req.platformAdmin.email, 'TENANT_CREATED', org.id, name);
    res.status(201).json({ tenant: await tenantDetail(org.id), adminEmail: email, tempPassword });
  },

  // Permanently removes a tenant and all its data (cascade). The exact name
  // must be echoed back as a guard against a mistaken click.
  async deleteTenant(req: any, res: Response) {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw new AppError(404, 'Tenant not found');
    if (str(req.body.confirmName) !== org.name) {
      throw new AppError(400, 'Type the organization name exactly to confirm deletion');
    }
    await prisma.organization.delete({ where: { id: org.id } });
    await logPlatform(req.platformAdmin.email, 'TENANT_DELETED', org.id, org.name);
    res.json({ ok: true });
  },

  // One tenant + its recent platform-side history.
  async getTenant(req: any, res: Response) {
    const tenant = await tenantDetail(req.params.id);
    if (!tenant) throw new AppError(404, 'Tenant not found');
    const audit = await prisma.platformAuditLog.findMany({
      where: { organizationId: tenant.id }, orderBy: { createdAt: 'desc' }, take: 20,
    });
    res.json({ tenant, audit });
  },

  async suspend(req: any, res: Response) {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw new AppError(404, 'Tenant not found');
    const reason = String(req.body.reason || '').trim();
    if (org.status === 'SUSPENDED') throw new AppError(400, 'This tenant is already suspended');

    await prisma.organization.update({
      where: { id: org.id },
      data: { status: 'SUSPENDED', suspendedAt: new Date(), suspendedReason: reason },
    });
    await logPlatform(req.platformAdmin.email, 'TENANT_SUSPENDED', org.id, reason);
    res.json({ tenant: await tenantDetail(org.id) });
  },

  async reactivate(req: any, res: Response) {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw new AppError(404, 'Tenant not found');
    if (org.status === 'ACTIVE') throw new AppError(400, 'This tenant is already active');

    await prisma.organization.update({
      where: { id: org.id },
      data: { status: 'ACTIVE', suspendedAt: null, suspendedReason: '' },
    });
    await logPlatform(req.platformAdmin.email, 'TENANT_REACTIVATED', org.id);
    res.json({ tenant: await tenantDetail(org.id) });
  },

  // Platform owners — the people who can open this console.
  async getOwners(_req: any, res: Response) {
    const owners = await prisma.platformAdmin.findMany({ orderBy: { createdAt: 'asc' } });
    res.json({ owners: owners.map(ownerJSON) });
  },

  async addOwner(req: any, res: Response) {
    const email = str(req.body.email).toLowerCase();
    const password = String(req.body.password || '');
    if (!email) throw new AppError(400, 'Email is required');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new AppError(400, 'Enter a valid email');
    if (password.length < 8) throw new AppError(400, 'Password must be at least 8 characters');
    if (await prisma.platformAdmin.findUnique({ where: { email } })) {
      throw new AppError(409, 'A platform owner with this email already exists');
    }
    const owner = await prisma.platformAdmin.create({
      data: { email, name: str(req.body.name) || 'Platform Owner', password: await bcrypt.hash(password, 10) },
    });
    await logPlatform(req.platformAdmin.email, 'OWNER_ADDED', null, email);
    res.status(201).json({ owner: ownerJSON(owner) });
  },

  // Enable or disable an owner. An owner cannot disable their own login, and
  // the last active owner cannot be disabled (that would lock everyone out).
  async setOwnerActive(req: any, res: Response) {
    const target = await prisma.platformAdmin.findUnique({ where: { id: req.params.id } });
    if (!target) throw new AppError(404, 'Platform owner not found');
    const makeActive = Boolean(req.body.isActive);
    if (!makeActive) {
      if (target.id === req.platformAdmin.id) throw new AppError(400, 'You cannot disable your own login');
      const otherActive = await prisma.platformAdmin.count({ where: { isActive: true, id: { not: target.id } } });
      if (otherActive === 0) throw new AppError(400, 'At least one platform owner must stay active');
    }
    const owner = await prisma.platformAdmin.update({ where: { id: target.id }, data: { isActive: makeActive } });
    await logPlatform(req.platformAdmin.email, makeActive ? 'OWNER_ENABLED' : 'OWNER_DISABLED', null, target.email);
    res.json({ owner: ownerJSON(owner) });
  },

  async getAudit(_req: any, res: Response) {
    const audit = await prisma.platformAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    // Attach the current org name where the tenant still exists (deleted ones
    // keep their name in `detail`).
    const ids = [...new Set(audit.map(a => a.organizationId).filter(Boolean))] as string[];
    const orgs = ids.length
      ? await prisma.organization.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const nameBy = new Map(orgs.map(o => [o.id, o.name]));
    res.json({
      audit: audit.map(a => ({ ...a, orgName: a.organizationId ? nameBy.get(a.organizationId) ?? null : null })),
    });
  },
};
