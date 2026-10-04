import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getEnv } from '../config/env';
import { prisma } from '../config/database';
import { AppError } from './errorHandler';

// The platform owner behind a request, loaded once per request. Separate from
// the tenant `req.user` so org-scoped code can never see a platform caller.
export interface PlatformRequest {
  platformAdmin?: { id: string; email: string; name: string };
}

// Verifies a PLATFORM-scoped token and loads the (still active) owner. Any
// tenant token, or a token for a disabled/removed owner, is refused.
export function requirePlatform(req: any, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next(new AppError(401, 'No authorization token provided'));

  let decoded: any;
  try {
    decoded = jwt.verify(token, getEnv().JWT_SECRET);
  } catch {
    return next(new AppError(401, 'Invalid or expired token'));
  }
  if (decoded?.scope !== 'PLATFORM' || !decoded?.adminId) {
    return next(new AppError(401, 'Invalid or expired token'));
  }

  prisma.platformAdmin
    .findUnique({ where: { id: decoded.adminId }, select: { id: true, email: true, name: true, isActive: true } })
    .then(admin => {
      if (!admin || !admin.isActive) throw new AppError(401, 'Platform access is inactive');
      req.platformAdmin = { id: admin.id, email: admin.email, name: admin.name };
      next();
    })
    .catch(next);
}
