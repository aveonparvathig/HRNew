import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { requireRole } from '../middleware/roles';
import { payrollController } from '../controllers/payrollController';
import { payrollSetupController } from '../controllers/payrollSetupController';
import { payrollStructureController } from '../controllers/payrollStructureController';
import { payrollReportsController } from '../controllers/payrollReportsController';
import { payrollStatutoryController } from '../controllers/payrollStatutoryController';
import { payrollLoansController } from '../controllers/payrollLoansController';
import { payrollTaxController } from '../controllers/payrollTaxController';

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
router.get('/statutory-profile', asyncHandler((req, res) => payrollSetupController.getStatutoryProfile(req, res)));
router.put('/statutory-profile', asyncHandler((req, res) => payrollSetupController.updateStatutoryProfile(req, res)));
router.get('/locations', asyncHandler((req, res) => payrollSetupController.getLocations(req, res)));
router.post('/locations', asyncHandler((req, res) => payrollSetupController.createLocation(req, res)));
router.put('/locations/:locationId', asyncHandler((req, res) => payrollSetupController.updateLocation(req, res)));
router.delete('/locations/:locationId', asyncHandler((req, res) => payrollSetupController.deleteLocation(req, res)));
router.get('/audit-log', asyncHandler((req, res) => payrollSetupController.getAuditLog(req, res)));

// Pay components
router.get('/components', asyncHandler((req, res) => payrollStructureController.getComponents(req, res)));
router.post('/components', asyncHandler((req, res) => payrollStructureController.createComponent(req, res)));
router.put('/components/:componentId', asyncHandler((req, res) => payrollStructureController.updateComponent(req, res)));
router.delete('/components/:componentId', asyncHandler((req, res) => payrollStructureController.deleteComponent(req, res)));

// Salary revisions
router.get('/people/:personId/revisions', asyncHandler((req, res) => payrollStructureController.getRevisions(req, res)));
router.post('/people/:personId/revisions', asyncHandler((req, res) => payrollStructureController.createRevision(req, res)));
router.delete('/people/:personId/revisions/:revisionId', asyncHandler((req, res) => payrollStructureController.deleteRevision(req, res)));

// Professional Tax and Labour Welfare Fund policies
router.get('/statutory-policies', asyncHandler((req, res) => payrollStatutoryController.getPolicies(req, res)));
router.post('/pt-policies', asyncHandler((req, res) => payrollStatutoryController.createPtPolicy(req, res)));
router.put('/pt-policies/:policyId', asyncHandler((req, res) => payrollStatutoryController.updatePtPolicy(req, res)));
router.delete('/pt-policies/:policyId', asyncHandler((req, res) => payrollStatutoryController.deletePtPolicy(req, res)));
router.post('/lwf-policies', asyncHandler((req, res) => payrollStatutoryController.createLwfPolicy(req, res)));
router.put('/lwf-policies/:policyId', asyncHandler((req, res) => payrollStatutoryController.updateLwfPolicy(req, res)));
router.delete('/lwf-policies/:policyId', asyncHandler((req, res) => payrollStatutoryController.deleteLwfPolicy(req, res)));

// Statutory payments
router.get('/remittances', asyncHandler((req, res) => payrollStatutoryController.getRemittances(req, res)));
router.post('/remittances', asyncHandler((req, res) => payrollStatutoryController.createRemittance(req, res)));
router.delete('/remittances/:remittanceId', asyncHandler((req, res) => payrollStatutoryController.deleteRemittance(req, res)));

// Income tax: rules per financial year, and each employee's tax details
router.get('/tax-config', asyncHandler((req, res) => payrollTaxController.getTaxConfig(req, res)));
router.put('/tax-config/:configId', asyncHandler((req, res) => payrollTaxController.updateTaxConfig(req, res)));
router.put('/tax-settings', asyncHandler((req, res) => payrollTaxController.updateTaxSettings(req, res)));
router.get('/people/:personId/tax-profile', asyncHandler((req, res) => payrollTaxController.getTaxProfile(req, res)));
router.put('/people/:personId/tax-profile', asyncHandler((req, res) => payrollTaxController.updateTaxProfile(req, res)));

// Loans and advances
router.get('/loans', asyncHandler((req, res) => payrollLoansController.getLoans(req, res)));
router.post('/loans', asyncHandler((req, res) => payrollLoansController.createLoan(req, res)));
router.post('/loans/preview', asyncHandler((req, res) => payrollLoansController.previewSchedule(req, res)));
router.get('/loans/:loanId', asyncHandler((req, res) => payrollLoansController.getLoanDetail(req, res)));
router.delete('/loans/:loanId', asyncHandler((req, res) => payrollLoansController.deleteLoan(req, res)));
router.post('/loans/:loanId/skip', asyncHandler((req, res) => payrollLoansController.skipMonth(req, res)));
router.post('/loans/:loanId/prepay', asyncHandler((req, res) => payrollLoansController.prepay(req, res)));
router.post('/loans/:loanId/foreclose', asyncHandler((req, res) => payrollLoansController.foreclose(req, res)));
router.post('/loans/:loanId/revise', asyncHandler((req, res) => payrollLoansController.revise(req, res)));

// Reports across runs
router.get('/reports/tax-statement', asyncHandler((req, res) => payrollTaxController.taxStatement(req, res)));
router.get('/reports/tax-consolidated', asyncHandler((req, res) => payrollTaxController.taxConsolidated(req, res)));
router.get('/reports/pan-status', asyncHandler((req, res) => payrollTaxController.panStatus(req, res)));
router.get('/reports/loan-statement', asyncHandler((req, res) => payrollLoansController.loanStatement(req, res)));
router.get('/reports/loan-register', asyncHandler((req, res) => payrollLoansController.loanRegister(req, res)));
router.get('/reports/loan-transactions', asyncHandler((req, res) => payrollLoansController.loanTransactions(req, res)));
router.get('/reports/pt-half-year', asyncHandler((req, res) => payrollStatutoryController.ptHalfYear(req, res)));
router.get('/reports/options', asyncHandler((req, res) => payrollReportsController.getOptions(req, res)));
router.get('/reports/ytd-statement', asyncHandler((req, res) => payrollReportsController.ytdStatement(req, res)));
router.get('/reports/component-statement', asyncHandler((req, res) => payrollReportsController.componentStatement(req, res)));
router.get('/reports/salary-structure', asyncHandler((req, res) => payrollReportsController.salaryStructureReport(req, res)));
router.get('/reports/ctc-breakup', asyncHandler((req, res) => payrollReportsController.ctcBreakup(req, res)));
router.get('/reports/revision-history', asyncHandler((req, res) => payrollReportsController.revisionHistory(req, res)));

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
router.get('/runs/:runId/reports/overrides', asyncHandler((req, res) => payrollController.overridesReport(req, res)));
router.get('/runs/:runId/reports/input-history', asyncHandler((req, res) => payrollController.inputHistoryReport(req, res)));
router.get('/runs/:runId/reports/register', asyncHandler((req, res) => payrollReportsController.salaryRegister(req, res)));
router.get('/runs/:runId/reports/summary', asyncHandler((req, res) => payrollReportsController.salarySummary(req, res)));
router.get('/runs/:runId/reports/pf-statement', asyncHandler((req, res) => payrollStatutoryController.pfStatement(req, res)));
router.get('/runs/:runId/reports/pt-statement', asyncHandler((req, res) => payrollStatutoryController.ptStatement(req, res)));
router.get('/runs/:runId/reports/tds-statement', asyncHandler((req, res) => payrollTaxController.tdsStatement(req, res)));
router.get('/runs/:runId/reports/lwf-statement', asyncHandler((req, res) => payrollStatutoryController.lwfStatement(req, res)));
router.get('/runs/:runId/files/pf-ecr', asyncHandler((req, res) => payrollStatutoryController.pfEcr(req, res)));
router.get('/runs/:runId/files/esi-upload', asyncHandler((req, res) => payrollStatutoryController.esiUpload(req, res)));
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
