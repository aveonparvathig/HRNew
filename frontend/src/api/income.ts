import apiClient from './client';

export const incomeAPI = {
  // Meta / dashboard / analytics
  getMeta: () => apiClient.get('/income/meta'),
  getDashboard: () => apiClient.get('/income/dashboard'),
  getAnalytics: () => apiClient.get('/income/analytics'),

  // Academic years
  getAcademicYears: () => apiClient.get('/income/academic-years'),
  createAcademicYear: (label: string) =>
    apiClient.post('/income/academic-years', { label }),
  toggleAcademicYear: (yearId: string) =>
    apiClient.post(`/income/academic-years/${yearId}/toggle`),

  // Clients
  getClients: (params?: { q?: string; engineer?: string; show?: string; sort?: string }) =>
    apiClient.get('/income/clients', { params }),
  createClient: (data: { name: string; agreementStatus?: string; notes?: string }) =>
    apiClient.post('/income/clients', data),
  getClientDetail: (clientId: string) =>
    apiClient.get(`/income/clients/${clientId}`),
  updateClient: (clientId: string, data: any) =>
    apiClient.put(`/income/clients/${clientId}`, data),
  deleteClient: (clientId: string) =>
    apiClient.delete(`/income/clients/${clientId}`),
  toggleClientActive: (clientId: string) =>
    apiClient.post(`/income/clients/${clientId}/toggle-active`),
  updateClientEngineer: (clientId: string, engineer: string) =>
    apiClient.post(`/income/clients/${clientId}/engineer`, { engineer }),

  // Billings
  getBillingPrefill: (clientId: string) =>
    apiClient.get(`/income/clients/${clientId}/billing-prefill`),
  createBilling: (clientId: string, data: any) =>
    apiClient.post(`/income/clients/${clientId}/billings`, data),
  updateBilling: (billingId: string, data: any) =>
    apiClient.put(`/income/billings/${billingId}`, data),
  deleteBilling: (billingId: string) =>
    apiClient.delete(`/income/billings/${billingId}`),

  // Payments
  addPayment: (billingId: string, data: { amount: number; receivedOn?: string; mode?: string; note?: string }) =>
    apiClient.post(`/income/billings/${billingId}/payments`, data),
  deletePayment: (paymentId: string) =>
    apiClient.delete(`/income/payments/${paymentId}`),

  // Onboarding / implementation
  getImplementation: () => apiClient.get('/income/implementation'),
  getOnboarding: (clientId: string) =>
    apiClient.get(`/income/clients/${clientId}/onboarding`),
  saveOnboarding: (clientId: string, data: any) =>
    apiClient.put(`/income/clients/${clientId}/onboarding`, data),

  // Feature delivery status
  addFeature: (clientId: string, name: string) =>
    apiClient.post(`/income/clients/${clientId}/features`, { name }),
  seedFeatures: (clientId: string) =>
    apiClient.post(`/income/clients/${clientId}/features/seed`),
  updateFeature: (featureId: string, data: { status?: string; engineer?: string; remarks?: string }) =>
    apiClient.put(`/income/features/${featureId}`, data),
  deleteFeature: (featureId: string) =>
    apiClient.delete(`/income/features/${featureId}`),

  // Export / import
  exportCsv: () => apiClient.get('/income/export.csv', { responseType: 'blob' }),
  exportXlsx: () => apiClient.get('/income/export.xlsx', { responseType: 'blob' }),
  importCsv: (csv: string, dryRun: boolean) =>
    apiClient.post('/income/import', { csv, dryRun }),
  importXlsx: (fileBase64: string, dryRun: boolean) =>
    apiClient.post('/income/import-xlsx', { fileBase64, dryRun }),
  getOnboardingDocument: (clientId: string, kind: 'po' | 'agreement') =>
    apiClient.get(`/income/clients/${clientId}/onboarding-document/${kind}`),
};
