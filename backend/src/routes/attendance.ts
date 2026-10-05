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

router.get('/swipes', asyncHandler((req, res) => attendanceController.getSwipes(req, res)));
router.post('/swipes', hrOnly, asyncHandler((req, res) => attendanceController.addSwipe(req, res)));
router.delete('/swipes/:swipeId', hrOnly, asyncHandler((req, res) => attendanceController.deleteSwipe(req, res)));
router.post('/swipes/import', hrOnly, asyncHandler((req, res) => attendanceController.importSwipes(req, res)));
router.get('/exceptions', hrOnly, asyncHandler((req, res) => attendanceController.exceptions(req, res)));

router.get('/muster', hrOnly, asyncHandler((req, res) => attendanceController.getMuster(req, res)));
router.post('/process', hrOnly, asyncHandler((req, res) => attendanceController.process(req, res)));
router.post('/override', hrOnly, asyncHandler((req, res) => attendanceController.override(req, res)));
router.post('/finalise', hrOnly, asyncHandler((req, res) => attendanceController.finalise(req, res)));
router.post('/reopen', hrOnly, asyncHandler((req, res) => attendanceController.reopen(req, res)));

export default router;
