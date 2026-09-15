import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth';
import { incomeController } from '../controllers/incomeController';

const router = Router();

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void> | Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

router.use(authMiddleware);

// Meta / dashboard / analytics
router.get('/meta', asyncHandler((req, res) => incomeController.getMeta(req, res)));
router.get('/dashboard', asyncHandler((req, res) => incomeController.getDashboard(req, res)));
router.get('/analytics', asyncHandler((req, res) => incomeController.getAnalytics(req, res)));

// Academic years
router.get('/academic-years', asyncHandler((req, res) => incomeController.getAcademicYears(req, res)));
router.post('/academic-years', asyncHandler((req, res) => incomeController.createAcademicYear(req, res)));
router.post('/academic-years/:yearId/toggle', asyncHandler((req, res) => incomeController.toggleAcademicYear(req, res)));

// Clients
router.get('/clients', asyncHandler((req, res) => incomeController.getClients(req, res)));
router.post('/clients', asyncHandler((req, res) => incomeController.createClient(req, res)));
router.get('/clients/:clientId', asyncHandler((req, res) => incomeController.getClientDetail(req, res)));
router.put('/clients/:clientId', asyncHandler((req, res) => incomeController.updateClient(req, res)));
router.delete('/clients/:clientId', asyncHandler((req, res) => incomeController.deleteClient(req, res)));
router.post('/clients/:clientId/toggle-active', asyncHandler((req, res) => incomeController.toggleClientActive(req, res)));
router.post('/clients/:clientId/engineer', asyncHandler((req, res) => incomeController.updateClientEngineer(req, res)));

// Billings
router.get('/clients/:clientId/billing-prefill', asyncHandler((req, res) => incomeController.getBillingPrefill(req, res)));
router.post('/clients/:clientId/billings', asyncHandler((req, res) => incomeController.createBilling(req, res)));
router.put('/billings/:billingId', asyncHandler((req, res) => incomeController.updateBilling(req, res)));
router.delete('/billings/:billingId', asyncHandler((req, res) => incomeController.deleteBilling(req, res)));

// Payments
router.post('/billings/:billingId/payments', asyncHandler((req, res) => incomeController.addPayment(req, res)));
router.delete('/payments/:paymentId', asyncHandler((req, res) => incomeController.deletePayment(req, res)));

// Onboarding / implementation
router.get('/implementation', asyncHandler((req, res) => incomeController.getImplementationDashboard(req, res)));
router.get('/clients/:clientId/onboarding', asyncHandler((req, res) => incomeController.getOnboarding(req, res)));
router.put('/clients/:clientId/onboarding', asyncHandler((req, res) => incomeController.saveOnboarding(req, res)));
router.get('/clients/:clientId/onboarding-document/:kind', asyncHandler((req, res) => incomeController.getOnboardingDocument(req, res)));

// Feature delivery status
router.post('/clients/:clientId/features', asyncHandler((req, res) => incomeController.addFeature(req, res)));
router.post('/clients/:clientId/features/seed', asyncHandler((req, res) => incomeController.seedFeatures(req, res)));
router.put('/features/:featureId', asyncHandler((req, res) => incomeController.updateFeature(req, res)));
router.delete('/features/:featureId', asyncHandler((req, res) => incomeController.deleteFeature(req, res)));

// Export / import
router.get('/export.csv', asyncHandler((req, res) => incomeController.exportCsv(req, res)));
router.get('/export.xlsx', asyncHandler((req, res) => incomeController.exportXlsx(req, res)));
router.post('/import', asyncHandler((req, res) => incomeController.importCsv(req, res)));
router.post('/import-xlsx', asyncHandler((req, res) => incomeController.importXlsx(req, res)));

export default router;
