import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { mastersController } from '../controllers/mastersController';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void> | Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

router.use(authMiddleware);
const staffOnly = requireRole('SUPER_ADMIN', 'HR');

// Value lists: read by every form that picks from them, managed by staff
router.get('/lists', asyncHandler((req, res) => mastersController.getLists(req, res)));
router.post('/lists/:type/values', staffOnly, asyncHandler((req, res) => mastersController.createListValue(req, res)));
router.put('/list-values/:valueId', staffOnly, asyncHandler((req, res) => mastersController.updateListValue(req, res)));
router.delete('/list-values/:valueId', staffOnly, asyncHandler((req, res) => mastersController.deleteListValue(req, res)));

// Company bank accounts
router.get('/bank-accounts', staffOnly, asyncHandler((req, res) => mastersController.getBankAccounts(req, res)));
router.post('/bank-accounts', staffOnly, asyncHandler((req, res) => mastersController.createBankAccount(req, res)));
router.put('/bank-accounts/:accountId', staffOnly, asyncHandler((req, res) => mastersController.updateBankAccount(req, res)));
router.delete('/bank-accounts/:accountId', staffOnly, asyncHandler((req, res) => mastersController.deleteBankAccount(req, res)));

export default router;
