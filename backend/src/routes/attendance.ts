import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireModule, requireRole } from '../middleware/roles';
import { attendanceController } from '../controllers/attendanceController';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void> | Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

router.use(authMiddleware);
router.use(requireModule('leave'));

const hrOnly = requireRole('SUPER_ADMIN', 'HR');

router.get('/meta', asyncHandler((req, res) => attendanceController.getMeta(req, res)));
router.get('/roster', asyncHandler((req, res) => attendanceController.getRoster(req, res)));
router.post('/shifts', hrOnly, asyncHandler((req, res) => attendanceController.saveShift(req, res)));
router.delete('/shifts/:shiftId', hrOnly, asyncHandler((req, res) => attendanceController.deleteShift(req, res)));
router.post('/roster/assign', hrOnly, asyncHandler((req, res) => attendanceController.assignShifts(req, res)));
router.post('/roster/clear', hrOnly, asyncHandler((req, res) => attendanceController.clearAssignment(req, res)));
router.post('/profile', hrOnly, asyncHandler((req, res) => attendanceController.setProfile(req, res)));

export default router;
