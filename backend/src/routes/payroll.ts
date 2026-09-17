import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { payrollController } from '../controllers/payrollController';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void> | Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

router.use(authMiddleware);
router.use(requireRole('SUPER_ADMIN', 'HR'));

// Settings
router.get('/settings', asyncHandler((req, res) => payrollController.getSettings(req, res)));
router.put('/settings', asyncHandler((req, res) => payrollController.updateSettings(req, res)));

// Runs
router.get('/runs', asyncHandler((req, res) => payrollController.getRuns(req, res)));
router.post('/runs', asyncHandler((req, res) => payrollController.createRun(req, res)));
router.get('/runs/:runId', asyncHandler((req, res) => payrollController.getRunDetail(req, res)));
router.delete('/runs/:runId', asyncHandler((req, res) => payrollController.deleteRun(req, res)));
router.post('/runs/:runId/finalize', asyncHandler((req, res) => payrollController.finalizeRun(req, res)));
router.post('/runs/:runId/reopen', asyncHandler((req, res) => payrollController.reopenRun(req, res)));
router.post('/runs/:runId/recalculate', asyncHandler((req, res) => payrollController.recalculateRun(req, res)));
router.get('/runs/:runId/reports/pf-esi', asyncHandler((req, res) => payrollController.pfEsiStatement(req, res)));
router.get('/runs/:runId/reports/comparison', asyncHandler((req, res) => payrollController.runComparison(req, res)));
router.get('/runs/:runId/attendance-template.xlsx', asyncHandler((req, res) => payrollController.attendanceTemplate(req, res)));
router.post('/runs/:runId/attendance-import', asyncHandler((req, res) => payrollController.importAttendance(req, res)));
router.get('/runs/:runId/export.csv', asyncHandler((req, res) => payrollController.exportRunCsv(req, res)));
router.get('/runs/:runId/payslips', asyncHandler((req, res) => payrollController.getRunPayslips(req, res)));

// Entries
router.get('/people/:personId/entries', asyncHandler((req, res) => payrollController.getPersonEntries(req, res)));
router.put('/entries/:entryId', asyncHandler((req, res) => payrollController.updateEntry(req, res)));
router.delete('/entries/:entryId', asyncHandler((req, res) => payrollController.removeEntry(req, res)));
router.get('/entries/:entryId/payslip', asyncHandler((req, res) => payrollController.getPayslip(req, res)));

export default router;
