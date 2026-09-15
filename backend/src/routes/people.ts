import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { peopleController } from '../controllers/peopleController';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void> | Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

router.use(authMiddleware);

router.get('/meta', asyncHandler((req, res) => peopleController.getMeta(req, res)));

// Pipeline & openings (before /:personId routes)
router.get('/pipeline', asyncHandler((req, res) => peopleController.getPipeline(req, res)));
router.get('/openings', asyncHandler((req, res) => peopleController.getOpenings(req, res)));
router.post('/openings', asyncHandler((req, res) => peopleController.createOpening(req, res)));
router.put('/openings/:openingId', asyncHandler((req, res) => peopleController.updateOpening(req, res)));

// Employee register export
router.get('/export/employees.csv', asyncHandler((req, res) => peopleController.exportEmployeesCsv(req, res)));
router.get('/export/employees.xlsx', asyncHandler((req, res) => peopleController.exportEmployeesXlsx(req, res)));

// People
router.get('/', asyncHandler((req, res) => peopleController.getPeople(req, res)));
router.post('/', asyncHandler((req, res) => peopleController.createPerson(req, res)));
router.get('/:personId', asyncHandler((req, res) => peopleController.getPersonDetail(req, res)));
router.put('/:personId', asyncHandler((req, res) => peopleController.updatePerson(req, res)));
router.post('/:personId/stage', asyncHandler((req, res) => peopleController.updatePersonStage(req, res)));
router.delete('/:personId', asyncHandler((req, res) => peopleController.deletePerson(req, res)));

// Documents (generated letters)
router.get('/documents/:docId', asyncHandler((req, res) => peopleController.getDocument(req, res)));
router.delete('/documents/:docId', asyncHandler((req, res) => peopleController.deleteDocument(req, res)));
router.get('/:personId/document-prefill', asyncHandler((req, res) => peopleController.getDocumentPrefill(req, res)));
router.post('/:personId/documents', asyncHandler((req, res) => peopleController.createDocument(req, res)));

// Interview rounds
router.post('/:personId/interviews', asyncHandler((req, res) => peopleController.addInterview(req, res)));
router.put('/interviews/:interviewId', asyncHandler((req, res) => peopleController.updateInterview(req, res)));
router.delete('/interviews/:interviewId', asyncHandler((req, res) => peopleController.deleteInterview(req, res)));

export default router;
