import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env';

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    email: string;
    organizationId: string;
  };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No authorization token provided' });
  }

  try {
    const decoded = jwt.verify(token, getEnv().JWT_SECRET) as any;
    // A platform-owner token must not open tenant routes (missing scope = tenant,
    // for tokens issued before scopes existed).
    if (decoded?.scope === 'PLATFORM') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function optionalAuthMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, getEnv().JWT_SECRET) as AuthRequest['user'];
      req.user = decoded;
    } catch (error) {
      // Token is invalid, but continue without auth
    }
  }
  next();
}

export function generateAccessToken(userId: string, email: string, organizationId: string): string {
  return jwt.sign(
    { userId, email, organizationId, scope: 'TENANT' },
    getEnv().JWT_SECRET,
    { expiresIn: '1h' }
  );
}

export function generateRefreshToken(userId: string, organizationId: string): string {
  return jwt.sign(
    { userId, organizationId },
    getEnv().JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyRefreshToken(token: string): { userId: string; organizationId: string } | null {
  try {
    return jwt.verify(token, getEnv().JWT_REFRESH_SECRET) as any;
  } catch (error) {
    return null;
  }
}

// Platform-owner tokens live outside every tenant: they carry adminId + the
// PLATFORM scope, never an organizationId.
export function generatePlatformAccessToken(adminId: string, email: string): string {
  return jwt.sign(
    { adminId, email, scope: 'PLATFORM' },
    getEnv().JWT_SECRET,
    { expiresIn: '1h' }
  );
}

export function generatePlatformRefreshToken(adminId: string): string {
  return jwt.sign(
    { adminId, scope: 'PLATFORM' },
    getEnv().JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
}

export function verifyPlatformRefreshToken(token: string): { adminId: string } | null {
  try {
    const decoded = jwt.verify(token, getEnv().JWT_REFRESH_SECRET) as any;
    if (decoded?.scope !== 'PLATFORM' || !decoded?.adminId) return null;
    return { adminId: decoded.adminId };
  } catch (error) {
    return null;
  }
}
