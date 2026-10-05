import apiClient from './client';

export const leaveAPI = {
  getMeta: () => apiClient.get('/leave/meta'),

  getRequests: (params?: { status?: string; personId?: string; q?: string; awaiting?: string }) =>
    apiClient.get('/leave', { params }),
  createRequest: (data: any) => apiClient.post('/leave', data),
  getRequestDetail: (requestId: string) => apiClient.get(`/leave/${requestId}`),
  updateRequest: (requestId: string, data: any) => apiClient.put(`/leave/${requestId}`, data),
  deleteRequest: (requestId: string) => apiClient.delete(`/leave/${requestId}`),
  changeStatus: (requestId: string, action: string, note?: string) =>
    apiClient.post(`/leave/${requestId}/status`, { action, note }),

  getCalendar: (month?: string) => apiClient.get('/leave/calendar', { params: month ? { month } : {} }),
  getOverview: () => apiClient.get('/leave/overview'),
  createType: (data: any) => apiClient.post('/leave/types', data),
  updateType: (typeId: string, data: any) => apiClient.put(`/leave/types/${typeId}`, data),
  runAccrual: (period: string, dryRun: boolean) => apiClient.post('/leave/accrual/run', { period, dryRun }),
  runYearEnd: (year: number, dryRun: boolean) => apiClient.post('/leave/year-end/run', { year, dryRun }),
  recalculate: (personId?: string) => apiClient.post('/leave/recalculate', personId ? { personId } : {}),
  encash: (data: any) => apiClient.post('/leave/encash', data),

  // HR: balances & grants
  getBalances: (params: { personId: string; year?: number }) => apiClient.get('/leave/balances', { params }),
  grant: (data: any) => apiClient.post('/leave/grant', data),

  // HR: holidays
  listHolidays: (year?: string) => apiClient.get('/leave/holidays', { params: year ? { year } : {} }),
  saveHoliday: (data: any) => apiClient.post('/leave/holidays', data),
  deleteHoliday: (holidayId: string) => apiClient.delete(`/leave/holidays/${holidayId}`),

  // HR: settings
  getSettings: () => apiClient.get('/leave/settings'),
  saveSettings: (data: any) => apiClient.put('/leave/settings', data),
};
