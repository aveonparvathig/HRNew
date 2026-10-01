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
  // kind: pf-esi | comparison | overrides | input-history
  getRunReport: (runId: string, kind: string) => apiClient.get(`/payroll/runs/${runId}/reports/${kind}`),
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
