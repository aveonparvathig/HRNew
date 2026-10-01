import apiClient from './client';

export const payrollAPI = {
  // Settings
  getSettings: () => apiClient.get('/payroll/settings'),
  updateSettings: (data: any) => apiClient.put('/payroll/settings', data),
  getStatutoryProfile: () => apiClient.get('/payroll/statutory-profile'),
  updateStatutoryProfile: (data: any) => apiClient.put('/payroll/statutory-profile', data),
  getLocations: () => apiClient.get('/payroll/locations'),
  createLocation: (data: any) => apiClient.post('/payroll/locations', data),
  updateLocation: (locationId: string, data: any) => apiClient.put(`/payroll/locations/${locationId}`, data),
  deleteLocation: (locationId: string) => apiClient.delete(`/payroll/locations/${locationId}`),
  getAuditLog: (params: { limit: number; offset: number; runId?: string }) =>
    apiClient.get('/payroll/audit-log', { params }),

  // Pay components
  getComponents: () => apiClient.get('/payroll/components'),
  createComponent: (data: any) => apiClient.post('/payroll/components', data),
  updateComponent: (componentId: string, data: any) => apiClient.put(`/payroll/components/${componentId}`, data),
  deleteComponent: (componentId: string) => apiClient.delete(`/payroll/components/${componentId}`),

  // Salary revisions
  getRevisions: (personId: string) => apiClient.get(`/payroll/people/${personId}/revisions`),
  createRevision: (personId: string, data: any) => apiClient.post(`/payroll/people/${personId}/revisions`, data),
  deleteRevision: (personId: string, revisionId: string) =>
    apiClient.delete(`/payroll/people/${personId}/revisions/${revisionId}`),

  // Professional Tax and Labour Welfare Fund policies
  getPolicies: () => apiClient.get('/payroll/statutory-policies'),
  createPtPolicy: (data: any) => apiClient.post('/payroll/pt-policies', data),
  updatePtPolicy: (policyId: string, data: any) => apiClient.put(`/payroll/pt-policies/${policyId}`, data),
  deletePtPolicy: (policyId: string) => apiClient.delete(`/payroll/pt-policies/${policyId}`),
  createLwfPolicy: (data: any) => apiClient.post('/payroll/lwf-policies', data),
  updateLwfPolicy: (policyId: string, data: any) => apiClient.put(`/payroll/lwf-policies/${policyId}`, data),
  deleteLwfPolicy: (policyId: string) => apiClient.delete(`/payroll/lwf-policies/${policyId}`),

  // Statutory payments
  getRemittances: (fy: string) => apiClient.get('/payroll/remittances', { params: fy ? { fy } : {} }),
  createRemittance: (data: any) => apiClient.post('/payroll/remittances', data),
  deleteRemittance: (remittanceId: string) => apiClient.delete(`/payroll/remittances/${remittanceId}`),

  // Reports across runs
  // kind: ytd-statement | component-statement | salary-structure | ctc-breakup | revision-history | pt-half-year
  getReportOptions: () => apiClient.get('/payroll/reports/options'),
  getReport: (kind: string, params: Record<string, string>) =>
    apiClient.get(`/payroll/reports/${kind}`, { params }),

  // Runs
  getRuns: () => apiClient.get('/payroll/runs'),
  createRun: (data: { period: string; totalWorkingDays: number; notes?: string }) =>
    apiClient.post('/payroll/runs', data),
  getRunDetail: (runId: string) => apiClient.get(`/payroll/runs/${runId}`),
  deleteRun: (runId: string) => apiClient.delete(`/payroll/runs/${runId}`),
  finalizeRun: (runId: string) => apiClient.post(`/payroll/runs/${runId}/finalize`),
  reopenRun: (runId: string) => apiClient.post(`/payroll/runs/${runId}/reopen`),
  recalculateRun: (runId: string) => apiClient.post(`/payroll/runs/${runId}/recalculate`),
  exportRunCsv: (runId: string) =>
    apiClient.get(`/payroll/runs/${runId}/export.csv`, { responseType: 'blob' }),
  getRunPayslips: (runId: string) => apiClient.get(`/payroll/runs/${runId}/payslips`),
  // kind: pf-esi | comparison | overrides | input-history | register | summary
  //       | pf-statement | pt-statement | lwf-statement
  getRunReport: (runId: string, kind: string) => apiClient.get(`/payroll/runs/${runId}/reports/${kind}`),
  // Portal upload files — kind: pf-ecr | esi-upload
  getRunFile: (runId: string, kind: string) => apiClient.get(`/payroll/runs/${runId}/files/${kind}`),
  attendanceTemplate: (runId: string) =>
    apiClient.get(`/payroll/runs/${runId}/attendance-template.xlsx`, { responseType: 'blob' }),
  importAttendance: (runId: string, fileBase64: string, dryRun: boolean) =>
    apiClient.post(`/payroll/runs/${runId}/attendance-import`, { fileBase64, dryRun }),
  getPersonEntries: (personId: string) => apiClient.get(`/payroll/people/${personId}/entries`),

  // Entries
  updateEntry: (entryId: string, data: any) => apiClient.put(`/payroll/entries/${entryId}`, data),
  removeEntry: (entryId: string) => apiClient.delete(`/payroll/entries/${entryId}`),
  getPayslip: (entryId: string) => apiClient.get(`/payroll/entries/${entryId}/payslip`),
};
