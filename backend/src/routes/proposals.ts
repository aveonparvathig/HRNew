import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { proposalsController } from '../controllers/proposalsController';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void> | Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

router.use(authMiddleware);
router.use(requireRole('SUPER_ADMIN'));

router.get('/catalog', asyncHandler((req, res) => proposalsController.getCatalog(req, res)));
router.get('/cms-features', asyncHandler((req, res) => proposalsController.getCmsFeatures(req, res)));
router.post('/preview', asyncHandler((req, res) => proposalsController.preview(req, res)));
router.post('/generate', asyncHandler((req, res) => proposalsController.generate(req, res)));
router.get('/history', asyncHandler((req, res) => proposalsController.getHistory(req, res)));
router.get('/history/:recordId', asyncHandler((req, res) => proposalsController.getRecord(req, res)));
router.delete('/history/:recordId', asyncHandler((req, res) => proposalsController.deleteRecord(req, res)));

export default router;
