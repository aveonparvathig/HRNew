import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireModule, requireRole } from '../middleware/roles';
import { leaveController } from '../controllers/leaveController';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void> | Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

router.use(authMiddleware);
router.use(requireModule('leave'));

const hrOnly = requireRole('SUPER_ADMIN', 'HR');

router.get('/meta', asyncHandler((req, res) => leaveController.getMeta(req, res)));
router.get('/calendar', asyncHandler((req, res) => leaveController.getCalendar(req, res)));
router.get('/overview', hrOnly, asyncHandler((req, res) => leaveController.getOverview(req, res)));
router.post('/types', hrOnly, asyncHandler((req, res) => leaveController.createLeaveType(req, res)));
router.put('/types/:typeId', hrOnly, asyncHandler((req, res) => leaveController.updateLeaveType(req, res)));
router.post('/accrual/run', hrOnly, asyncHandler((req, res) => leaveController.runAccrual(req, res)));
router.get('/balances', asyncHandler((req, res) => leaveController.getBalances(req, res)));
router.post('/grant', hrOnly, asyncHandler((req, res) => leaveController.grantLeave(req, res)));

router.get('/holidays', asyncHandler((req, res) => leaveController.listHolidays(req, res)));
router.post('/holidays', hrOnly, asyncHandler((req, res) => leaveController.saveHoliday(req, res)));
router.delete('/holidays/:holidayId', hrOnly, asyncHandler((req, res) => leaveController.deleteHoliday(req, res)));

router.get('/settings', hrOnly, asyncHandler((req, res) => leaveController.getSettings(req, res)));
router.put('/settings', hrOnly, asyncHandler((req, res) => leaveController.saveSettings(req, res)));

router.get('/', asyncHandler((req, res) => leaveController.getRequests(req, res)));
router.post('/', asyncHandler((req, res) => leaveController.createRequest(req, res)));
router.get('/:requestId', asyncHandler((req, res) => leaveController.getRequestDetail(req, res)));
router.put('/:requestId', asyncHandler((req, res) => leaveController.updateRequest(req, res)));
router.delete('/:requestId', asyncHandler((req, res) => leaveController.deleteRequest(req, res)));
router.post('/:requestId/status', asyncHandler((req, res) => leaveController.changeStatus(req, res)));

export default router;
