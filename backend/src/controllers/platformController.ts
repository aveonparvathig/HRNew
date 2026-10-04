import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import {
  generatePlatformAccessToken, generatePlatformRefreshToken, verifyPlatformRefreshToken,
} from '../middleware/auth';
import { logPlatform, tenantsOverview, tenantDetail } from '../services/platform';

const adminJSON = (a: any) => ({ id: a.id, email: a.email, name: a.name });

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

  async getAudit(_req: any, res: Response) {
    const audit = await prisma.platformAuditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
    res.json({ audit });
  },
};
