import apiClient from './client';

export const expensesAPI = {
  getMeta: () => apiClient.get('/expenses/meta'),

  getReports: (params?: { status?: string; personId?: string; q?: string }) =>
    apiClient.get('/expenses', { params }),
  createReport: (data: any) => apiClient.post('/expenses', data),
  getReportDetail: (reportId: string) => apiClient.get(`/expenses/${reportId}`),
  updateReport: (reportId: string, data: any) => apiClient.put(`/expenses/${reportId}`, data),
  deleteReport: (reportId: string) => apiClient.delete(`/expenses/${reportId}`),
  changeStatus: (reportId: string, action: string) =>
    apiClient.post(`/expenses/${reportId}/status`, { action }),
  printReport: (reportId: string) => apiClient.get(`/expenses/${reportId}/print`),

  addLine: (reportId: string, data: any) => apiClient.post(`/expenses/${reportId}/lines`, data),
  updateLine: (lineId: string, data: any) => apiClient.put(`/expenses/lines/${lineId}`, data),
  deleteLine: (lineId: string) => apiClient.delete(`/expenses/lines/${lineId}`),
  getReceipt: (lineId: string) => apiClient.get(`/expenses/lines/${lineId}/receipt`),
};
