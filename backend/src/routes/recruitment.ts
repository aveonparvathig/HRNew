import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { recruitmentController } from '../controllers/recruitmentController';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void> | Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

router.use(authMiddleware);

router.get('/meta', asyncHandler((req, res) => recruitmentController.getMeta(req, res)));

// Postings
router.get('/postings', asyncHandler((req, res) => recruitmentController.getPostings(req, res)));
router.post('/postings', asyncHandler((req, res) => recruitmentController.createPosting(req, res)));
router.get('/postings/:postingId', asyncHandler((req, res) => recruitmentController.getPostingDetail(req, res)));
router.put('/postings/:postingId', asyncHandler((req, res) => recruitmentController.updatePosting(req, res)));
router.delete('/postings/:postingId', asyncHandler((req, res) => recruitmentController.deletePosting(req, res)));

// Applications
router.post('/postings/:postingId/applications', asyncHandler((req, res) => recruitmentController.createApplication(req, res)));
router.get('/applications/:applicationId', asyncHandler((req, res) => recruitmentController.getApplicationDetail(req, res)));
router.put('/applications/:applicationId', asyncHandler((req, res) => recruitmentController.updateApplication(req, res)));
router.post('/applications/:applicationId/add-to-people', asyncHandler((req, res) => recruitmentController.addApplicationToPeople(req, res)));
router.delete('/applications/:applicationId', asyncHandler((req, res) => recruitmentController.deleteApplication(req, res)));

export default router;
