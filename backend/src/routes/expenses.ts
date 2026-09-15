import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { expensesController } from '../controllers/expensesController';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void> | Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

router.use(authMiddleware);

router.get('/meta', asyncHandler((req, res) => expensesController.getMeta(req, res)));

// Lines addressed directly (before /:reportId)
router.put('/lines/:lineId', asyncHandler((req, res) => expensesController.updateLine(req, res)));
router.delete('/lines/:lineId', asyncHandler((req, res) => expensesController.deleteLine(req, res)));
router.get('/lines/:lineId/receipt', asyncHandler((req, res) => expensesController.getReceipt(req, res)));

// Reports
router.get('/', asyncHandler((req, res) => expensesController.getReports(req, res)));
router.post('/', asyncHandler((req, res) => expensesController.createReport(req, res)));
router.get('/:reportId', asyncHandler((req, res) => expensesController.getReportDetail(req, res)));
router.put('/:reportId', asyncHandler((req, res) => expensesController.updateReport(req, res)));
router.delete('/:reportId', asyncHandler((req, res) => expensesController.deleteReport(req, res)));
router.post('/:reportId/status', asyncHandler((req, res) => expensesController.changeStatus(req, res)));
router.post('/:reportId/lines', asyncHandler((req, res) => expensesController.addLine(req, res)));
router.get('/:reportId/print', asyncHandler((req, res) => expensesController.printReport(req, res)));

export default router;
