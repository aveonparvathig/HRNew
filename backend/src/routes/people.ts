import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { peopleController } from '../controllers/peopleController';
import { orgChartController } from '../controllers/orgChartController';
import { positionsController } from '../controllers/positionsController';
import { applyDuePositions } from '../services/positions';
import { hrDashboardController } from '../controllers/hrDashboardController';
import { lettersController } from '../controllers/lettersController';
import { employeeFilesController } from '../controllers/employeeFilesController';
import { profileController } from '../controllers/profileController';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void> | Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

router.use(authMiddleware);
const staffOnly = requireRole('SUPER_ADMIN', 'HR');
// Position changes dated ahead take effect on their day, before anything is read
router.use((req: any, _res: Response, next: NextFunction) => {
  applyDuePositions(req.user?.organizationId).then(() => next()).catch(next);
});

router.get('/meta', asyncHandler((req, res) => peopleController.getMeta(req, res)));

// Pipeline & openings (before /:personId routes)
router.get('/pipeline', staffOnly, asyncHandler((req, res) => peopleController.getPipeline(req, res)));
router.get('/openings', staffOnly, asyncHandler((req, res) => peopleController.getOpenings(req, res)));
router.post('/openings', staffOnly, asyncHandler((req, res) => peopleController.createOpening(req, res)));
router.put('/openings/:openingId', staffOnly, asyncHandler((req, res) => peopleController.updateOpening(req, res)));

// Organization chart and confirmations (before /:personId routes)
router.get('/org-chart', asyncHandler((req, res) => orgChartController.getChart(req, res)));
router.get('/confirmations', staffOnly, asyncHandler((req, res) => orgChartController.getConfirmations(req, res)));
// The HR panel on the dashboard
router.get('/hr-dashboard', staffOnly, asyncHandler((req, res) => hrDashboardController.getDashboard(req, res)));
router.post('/transfer-reports', staffOnly, asyncHandler((req, res) => orgChartController.transferReports(req, res)));

// Letter templates, and the same letter for several people (before /:personId routes)
router.get('/letter-templates', staffOnly, asyncHandler((req, res) => lettersController.getTemplates(req, res)));
router.post('/letter-templates', staffOnly, asyncHandler((req, res) => lettersController.createTemplate(req, res)));
router.put('/letter-templates/:templateId', staffOnly, asyncHandler((req, res) => lettersController.updateTemplate(req, res)));
router.post('/letter-templates/:templateId/reset', staffOnly, asyncHandler((req, res) => lettersController.resetTemplate(req, res)));
router.delete('/letter-templates/:templateId', staffOnly, asyncHandler((req, res) => lettersController.deleteTemplate(req, res)));
router.post('/letters/preview', staffOnly, asyncHandler((req, res) => lettersController.preview(req, res)));
router.post('/letters', staffOnly, asyncHandler((req, res) => lettersController.createLetters(req, res)));

// Bulk imports: employees and salary revisions from a workbook, photos
// and documents named by employee code (before /:personId routes)
router.get('/import/employees/template.xlsx', staffOnly, asyncHandler((req, res) => importController.employeeTemplate(req, res)));
router.post('/import/employees', staffOnly, asyncHandler((req, res) => importController.importEmployees(req, res)));
router.get('/import/revisions/template.xlsx', staffOnly, asyncHandler((req, res) => importController.revisionTemplate(req, res)));
router.post('/import/revisions', staffOnly, asyncHandler((req, res) => importController.importRevisions(req, res)));
router.post('/import/files/match', staffOnly, asyncHandler((req, res) => importController.matchFiles(req, res)));
router.post('/import/files', staffOnly, asyncHandler((req, res) => importController.importFiles(req, res)));
router.get('/import/logs', staffOnly, asyncHandler((req, res) => importController.getLogs(req, res)));
router.get('/import/logs/:logId', staffOnly, asyncHandler((req, res) => importController.getLog(req, res)));

// Employee register export
router.get('/export/employees.csv', staffOnly, asyncHandler((req, res) => peopleController.exportEmployeesCsv(req, res)));
router.get('/export/employees.xlsx', staffOnly, asyncHandler((req, res) => peopleController.exportEmployeesXlsx(req, res)));

// People
router.get('/', asyncHandler((req, res) => peopleController.getPeople(req, res)));
router.post('/', staffOnly, asyncHandler((req, res) => peopleController.createPerson(req, res)));
// Every employee's identity documents in one list (before /:personId)
router.get('/identity-documents', staffOnly, asyncHandler((req, res) => profileController.listIdentityDocuments(req, res)));
router.get('/:personId', asyncHandler((req, res) => peopleController.getPersonDetail(req, res)));
router.put('/:personId', staffOnly, asyncHandler((req, res) => peopleController.updatePerson(req, res)));
router.post('/:personId/stage', staffOnly, asyncHandler((req, res) => peopleController.updatePersonStage(req, res)));
router.put('/:personId/manager', staffOnly, asyncHandler((req, res) => orgChartController.setManager(req, res)));
router.post('/:personId/confirm', staffOnly, asyncHandler((req, res) => orgChartController.confirm(req, res)));
router.delete('/:personId', staffOnly, asyncHandler((req, res) => peopleController.deletePerson(req, res)));

// Position history: designation, department, work location and grade over time
router.get('/:personId/positions', asyncHandler((req, res) => positionsController.getPositions(req, res)));
router.post('/:personId/positions', staffOnly, asyncHandler((req, res) => positionsController.changePosition(req, res)));
router.delete('/positions/:changeId', staffOnly, asyncHandler((req, res) => positionsController.deletePosition(req, res)));

// Documents (generated letters)
router.get('/documents/:docId', staffOnly, asyncHandler((req, res) => lettersController.getLetter(req, res)));
router.put('/documents/:docId', staffOnly, asyncHandler((req, res) => lettersController.updateLetter(req, res)));
router.get('/documents/:docId/file', staffOnly, asyncHandler((req, res) => lettersController.letterFile(req, res)));
router.post('/documents/:docId/email', staffOnly, asyncHandler((req, res) => lettersController.emailLetter(req, res)));
router.delete('/documents/:docId', staffOnly, asyncHandler((req, res) => peopleController.deleteDocument(req, res)));
router.get('/:personId/document-prefill', staffOnly, asyncHandler((req, res) => lettersController.getPrefill(req, res)));
router.post('/:personId/documents', staffOnly, asyncHandler((req, res) => lettersController.createLetter(req, res)));

// Uploaded files: identity proofs, certificates, signed letters
router.get('/files/:fileId', staffOnly, asyncHandler((req, res) => employeeFilesController.getFile(req, res)));
router.put('/files/:fileId', staffOnly, asyncHandler((req, res) => employeeFilesController.updateFile(req, res)));
router.delete('/files/:fileId', staffOnly, asyncHandler((req, res) => employeeFilesController.deleteFile(req, res)));
router.get('/:personId/files', staffOnly, asyncHandler((req, res) => employeeFilesController.getFiles(req, res)));
router.post('/:personId/files', staffOnly, asyncHandler((req, res) => employeeFilesController.uploadFile(req, res)));

// Fuller profile (phase 24): family, education, previous employment, identity documents
router.get('/:personId/family', staffOnly, asyncHandler((req, res) => profileController.getFamily(req, res)));
router.post('/:personId/family', staffOnly, asyncHandler((req, res) => profileController.addFamily(req, res)));
router.put('/family/:id', staffOnly, asyncHandler((req, res) => profileController.updateFamily(req, res)));
router.delete('/family/:id', staffOnly, asyncHandler((req, res) => profileController.deleteFamily(req, res)));
router.get('/:personId/education', staffOnly, asyncHandler((req, res) => profileController.getEducation(req, res)));
router.post('/:personId/education', staffOnly, asyncHandler((req, res) => profileController.addEducation(req, res)));
router.put('/education/:id', staffOnly, asyncHandler((req, res) => profileController.updateEducation(req, res)));
router.delete('/education/:id', staffOnly, asyncHandler((req, res) => profileController.deleteEducation(req, res)));
router.get('/:personId/previous-employment', staffOnly, asyncHandler((req, res) => profileController.getPreviousEmployment(req, res)));
router.post('/:personId/previous-employment', staffOnly, asyncHandler((req, res) => profileController.addPreviousEmployment(req, res)));
router.put('/previous-employment/:id', staffOnly, asyncHandler((req, res) => profileController.updatePreviousEmployment(req, res)));
router.delete('/previous-employment/:id', staffOnly, asyncHandler((req, res) => profileController.deletePreviousEmployment(req, res)));
router.get('/:personId/identity-documents', staffOnly, asyncHandler((req, res) => profileController.getIdentityDocuments(req, res)));
router.post('/:personId/identity-documents', staffOnly, asyncHandler((req, res) => profileController.addIdentityDocument(req, res)));
router.put('/identity-documents/:id', staffOnly, asyncHandler((req, res) => profileController.updateIdentityDocument(req, res)));
router.post('/identity-documents/:id/verify', staffOnly, asyncHandler((req, res) => profileController.verifyIdentityDocument(req, res)));
router.get('/identity-documents/:id/file', staffOnly, asyncHandler((req, res) => profileController.openIdentityFile(req, res)));
router.delete('/identity-documents/:id', staffOnly, asyncHandler((req, res) => profileController.deleteIdentityDocument(req, res)));

// Interview rounds
router.post('/:personId/interviews', staffOnly, asyncHandler((req, res) => peopleController.addInterview(req, res)));
router.put('/interviews/:interviewId', staffOnly, asyncHandler((req, res) => peopleController.updateInterview(req, res)));
router.delete('/interviews/:interviewId', staffOnly, asyncHandler((req, res) => peopleController.deleteInterview(req, res)));

export default router;
