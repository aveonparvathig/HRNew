import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { selfServiceController } from '../controllers/selfServiceController';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void> | Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

// Any signed-in user whose login is linked to an employee record. The
// controller scopes every query to that record.
router.use(authMiddleware);

router.get('/payslips', asyncHandler((req, res) => selfServiceController.getPayslips(req, res)));
router.get('/payslips/:entryId', asyncHandler((req, res) => selfServiceController.getPayslip(req, res)));

router.get('/declaration', asyncHandler((req, res) => selfServiceController.getDeclaration(req, res)));
router.put('/declaration', asyncHandler((req, res) => selfServiceController.saveDeclaration(req, res)));
router.post('/declaration/proofs', asyncHandler((req, res) => selfServiceController.addProof(req, res)));
router.get('/declaration/proofs/:proofId', asyncHandler((req, res) => selfServiceController.getProof(req, res)));
router.delete('/declaration/proofs/:proofId', asyncHandler((req, res) => selfServiceController.deleteProof(req, res)));

router.get('/loans', asyncHandler((req, res) => selfServiceController.getLoans(req, res)));
router.get('/reports/:kind', asyncHandler((req, res) => selfServiceController.getReport(req, res)));

export default router;
