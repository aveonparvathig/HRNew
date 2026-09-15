import { Router, Request, Response, NextFunction } from 'express';
import { authController } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

// Wrap async controllers to handle errors
const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

// Brute-force protection on credential endpoints
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Try again in a few minutes.',
});

router.post('/signup', authLimiter, asyncHandler((req: Request, res: Response) => authController.signup(req, res)));
router.post('/login', authLimiter, asyncHandler((req: Request, res: Response) => authController.login(req, res)));
router.post('/refresh', asyncHandler((req: Request, res: Response) => authController.refresh(req, res)));
router.post('/logout', asyncHandler((req: Request, res: Response) => authController.logout(req, res)));
router.get('/me', authMiddleware, asyncHandler((req: Request, res: Response) => authController.getCurrentUser(req, res)));
router.post('/change-password', authMiddleware, asyncHandler((req: Request, res: Response) => authController.changePassword(req, res)));

export default router;
