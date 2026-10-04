import { Router, Request, Response, NextFunction } from 'express';
import { platformController } from '../controllers/platformController';
import { requirePlatform } from '../middleware/platformAuth';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

// Brute-force protection on the owner sign-in.
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Try again in a few minutes.',
});

// Public (credential) endpoints
router.post('/auth/login', authLimiter, asyncHandler((req, res) => platformController.login(req, res)));
router.post('/auth/refresh', asyncHandler((req, res) => platformController.refresh(req, res)));

// Everything below requires a platform-owner token
router.use(requirePlatform);
router.get('/auth/me', asyncHandler((req, res) => platformController.me(req, res)));
router.get('/tenants', asyncHandler((req, res) => platformController.getTenants(req, res)));
router.get('/tenants/:id', asyncHandler((req, res) => platformController.getTenant(req, res)));
router.post('/tenants/:id/suspend', asyncHandler((req, res) => platformController.suspend(req, res)));
router.post('/tenants/:id/reactivate', asyncHandler((req, res) => platformController.reactivate(req, res)));
router.get('/audit', asyncHandler((req, res) => platformController.getAudit(req, res)));

export default router;
