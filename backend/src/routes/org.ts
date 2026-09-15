import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { orgController } from '../controllers/orgController';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void> | Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

router.use(authMiddleware);

router.get('/profile', asyncHandler((req, res) => orgController.getProfile(req, res)));
router.put('/profile', asyncHandler((req, res) => orgController.updateProfile(req, res)));

router.get('/team', asyncHandler((req, res) => orgController.getTeam(req, res)));
router.post('/team', asyncHandler((req, res) => orgController.addMember(req, res)));
router.put('/team/:memberId', asyncHandler((req, res) => orgController.updateMember(req, res)));
router.post('/team/:memberId/reset-password', asyncHandler((req, res) => orgController.resetMemberPassword(req, res)));

export default router;
