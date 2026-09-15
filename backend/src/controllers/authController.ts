import { Request, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { prisma } from '../config/database';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

// Refresh tokens live in the database (hashed) - they survive restarts and
// can be revoked per-session.
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // matches the JWT's 7d expiry
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

async function storeRefreshToken(userId: string, token: string) {
  // Opportunistic cleanup of this user's expired sessions.
  await prisma.refreshToken.deleteMany({
    where: { userId, expiresAt: { lt: new Date() } },
  });
  await prisma.refreshToken.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
}

const userJSON = (user: any) => ({
  userId: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  organizationId: user.organizationId,
  role: user.role,
});

export const authController = {
  async signup(req: Request, res: Response) {
    const { email, password, firstName, lastName, organizationName } = req.body;

    if (!email || !password || !organizationName) {
      throw new AppError(400, 'Email, password, and organization name are required');
    }
    if (String(password).length < 8) {
      throw new AppError(400, 'Password must be at least 8 characters');
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new AppError(409, 'User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const organization = await prisma.organization.create({
      data: {
        name: String(organizationName).trim(),
        users: {
          create: {
            email,
            password: hashedPassword,
            firstName: firstName || '',
            lastName: lastName || '',
          },
        },
      },
      include: { users: true },
    });
    const user = organization.users[0];

    const accessToken = generateAccessToken(user.id, email, organization.id);
    const refreshToken = generateRefreshToken(user.id, organization.id);
    await storeRefreshToken(user.id, refreshToken);

    res.status(201).json({ user: userJSON(user), accessToken, refreshToken });
  },

  async login(req: Request, res: Response) {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError(400, 'Email and password are required');
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError(401, 'Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid email or password');
    }
    if (!user.isActive) {
      throw new AppError(403, 'This account has been disabled. Contact your organization owner.');
    }

    const accessToken = generateAccessToken(user.id, email, user.organizationId);
    const refreshToken = generateRefreshToken(user.id, user.organizationId);
    await storeRefreshToken(user.id, refreshToken);

    res.json({ user: userJSON(user), accessToken, refreshToken });
  },

  async refresh(req: Request, res: Response) {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError(400, 'Refresh token is required');
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      throw new AppError(401, 'Invalid or expired refresh token');
    }
    const stored = await prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (!stored || stored.expiresAt < new Date()) {
      throw new AppError(401, 'Refresh token has been revoked');
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    if (!user.isActive) {
      throw new AppError(403, 'This account has been disabled. Contact your organization owner.');
    }

    const newAccessToken = generateAccessToken(user.id, user.email, user.organizationId);
    res.json({ accessToken: newAccessToken, refreshToken });
  },

  async logout(req: Request, res: Response) {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { tokenHash: hashToken(refreshToken) },
      });
    }
    res.json({ message: 'Logged out successfully' });
  },

  async getCurrentUser(req: any, res: Response) {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      include: { organization: true },
    });
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    res.json({
      user: { ...userJSON(user), organizationName: user.organization.name },
    });
  },
};
