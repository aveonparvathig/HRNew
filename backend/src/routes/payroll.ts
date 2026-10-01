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
import { payrollDeclarationsController } from '../controllers/payrollDeclarationsController';
import { payrollPayoutController } from '../controllers/payrollPayoutController';
import { payrollControlController } from '../controllers/payrollControlController';

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

// Income-tax declarations
router.get('/declaration-items', asyncHandler((req, res) => payrollDeclarationsController.getItems(req, res)));
router.post('/declaration-items', asyncHandler((req, res) => payrollDeclarationsController.createItem(req, res)));
router.put('/declaration-items/:itemId', asyncHandler((req, res) => payrollDeclarationsController.updateItem(req, res)));
router.delete('/declaration-items/:itemId', asyncHandler((req, res) => payrollDeclarationsController.deleteItem(req, res)));
router.get('/declarations', asyncHandler((req, res) => payrollDeclarationsController.getOverview(req, res)));
router.put('/declarations/control', asyncHandler((req, res) => payrollDeclarationsController.updateControl(req, res)));
router.get('/declaration-proofs/:proofId', asyncHandler((req, res) => payrollDeclarationsController.getProof(req, res)));
router.delete('/declaration-proofs/:proofId', asyncHandler((req, res) => payrollDeclarationsController.deleteProof(req, res)));
router.get('/declarations/:personId', asyncHandler((req, res) => payrollDeclarationsController.getDeclaration(req, res)));
router.put('/declarations/:personId', asyncHandler((req, res) => payrollDeclarationsController.saveDeclaration(req, res)));
router.put('/declarations/:personId/approval', asyncHandler((req, res) => payrollDeclarationsController.saveApproval(req, res)));
router.post('/declarations/:personId/proofs', asyncHandler((req, res) => payrollDeclarationsController.addProof(req, res)));

// Payout: salary account, automation, journal ledgers, payment mode and salary stop per employee
router.get('/payout-settings', asyncHandler((req, res) => payrollPayoutController.getPayoutSettings(req, res)));
router.put('/payout-settings', asyncHandler((req, res) => payrollPayoutController.updatePayoutSettings(req, res)));
router.put('/ledger-mapping', asyncHandler((req, res) => payrollPayoutController.updateLedgerMapping(req, res)));
router.get('/people/:personId/pay-settings', asyncHandler((req, res) => payrollPayoutController.getPaySettings(req, res)));
router.put('/people/:personId/pay-settings', asyncHandler((req, res) => payrollPayoutController.updatePaySettings(req, res)));
router.get('/payout-batches/:batchId', asyncHandler((req, res) => payrollPayoutController.getBatch(req, res)));
router.post('/payout-batches/:batchId/paid', asyncHandler((req, res) => payrollPayoutController.markBatchPaid(req, res)));
router.delete('/payout-batches/:batchId', asyncHandler((req, res) => payrollPayoutController.deleteBatch(req, res)));
router.get('/payout-batches/:batchId/bank-file', asyncHandler((req, res) => payrollPayoutController.bankFile(req, res)));

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
router.get('/reports/bank-advice', asyncHandler((req, res) => payrollControlController.bankAdvice(req, res)));
router.get('/reports/hold-release', asyncHandler((req, res) => payrollControlController.holdRelease(req, res)));
router.get('/reports/duplicates', asyncHandler((req, res) => payrollControlController.duplicates(req, res)));
router.get('/reports/reimbursements', asyncHandler((req, res) => payrollControlController.reimbursements(req, res)));
router.get('/reports/form-12bb', asyncHandler((req, res) => payrollDeclarationsController.form12bb(req, res)));
router.get('/reports/declarations', asyncHandler((req, res) => payrollDeclarationsController.declarationsReport(req, res)));
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
router.post('/runs/:runId/release', asyncHandler((req, res) => payrollController.releaseRun(req, res)));
router.post('/runs/:runId/hold', asyncHandler((req, res) => payrollController.holdRun(req, res)));
router.post('/runs/:runId/lock-inputs', asyncHandler((req, res) => payrollPayoutController.lockInputs(req, res)));
router.post('/runs/:runId/unlock-inputs', asyncHandler((req, res) => payrollPayoutController.unlockInputs(req, res)));
router.get('/runs/:runId/payout', asyncHandler((req, res) => payrollPayoutController.getPayout(req, res)));
router.post('/runs/:runId/payout-batches', asyncHandler((req, res) => payrollPayoutController.createBatch(req, res)));
router.get('/runs/:runId/claims', asyncHandler((req, res) => payrollPayoutController.getRunClaims(req, res)));
router.put('/runs/:runId/claims', asyncHandler((req, res) => payrollPayoutController.setRunClaim(req, res)));
router.get('/runs/:runId/reports/payment-register', asyncHandler((req, res) => payrollControlController.paymentRegister(req, res)));
router.get('/runs/:runId/reports/cash-cheque', asyncHandler((req, res) => payrollControlController.cashChequeStatement(req, res)));
router.get('/runs/:runId/reports/payout-reconciliation', asyncHandler((req, res) => payrollControlController.payoutReconciliation(req, res)));
router.get('/runs/:runId/reports/journal-voucher', asyncHandler((req, res) => payrollControlController.journalVoucher(req, res)));
router.get('/runs/:runId/reports/reconciliation', asyncHandler((req, res) => payrollControlController.reconciliation(req, res)));
router.get('/runs/:runId/reports/headcount', asyncHandler((req, res) => payrollControlController.headcount(req, res)));
router.get('/runs/:runId/reports/negative-net', asyncHandler((req, res) => payrollControlController.negativeNet(req, res)));
router.get('/runs/:runId/reports/anomalies', asyncHandler((req, res) => payrollControlController.anomalies(req, res)));
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
router.post('/entries/:entryId/hold', asyncHandler((req, res) => payrollPayoutController.holdEntry(req, res)));
router.post('/entries/:entryId/release-hold', asyncHandler((req, res) => payrollPayoutController.releaseEntry(req, res)));
router.post('/entries/:entryId/remove-from-batch', asyncHandler((req, res) => payrollPayoutController.removeFromBatch(req, res)));
router.get('/entries/:entryId/payslip', asyncHandler((req, res) => payrollController.getPayslip(req, res)));

export default router;
