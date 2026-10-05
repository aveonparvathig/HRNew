import apiClient from './client';

export const attendanceAPI = {
  getMeta: () => apiClient.get('/attendance/meta'),
  saveShift: (data: any) => apiClient.post('/attendance/shifts', data),
  deleteShift: (shiftId: string) => apiClient.delete(`/attendance/shifts/${shiftId}`),
  getRoster: (month?: string) => apiClient.get('/attendance/roster', { params: month ? { month } : {} }),
  assign: (data: { personIds: string[]; startDate: string; endDate: string; shiftId: string }) =>
    apiClient.post('/attendance/roster/assign', data),
  clear: (personId: string, date: string) => apiClient.post('/attendance/roster/clear', { personId, date }),
  setProfile: (data: { personId: string; defaultShiftId?: string | null; weekOffDays?: number[] }) =>
    apiClient.post('/attendance/profile', data),

  getSwipes: (personId: string, month?: string) => apiClient.get('/attendance/swipes', { params: { personId, ...(month ? { month } : {}) } }),
  addSwipe: (data: any) => apiClient.post('/attendance/swipes', data),
  deleteSwipe: (swipeId: string) => apiClient.delete(`/attendance/swipes/${swipeId}`),
  importSwipes: (text: string) => apiClient.post('/attendance/swipes/import', { text }),
  getExceptions: (month?: string) => apiClient.get('/attendance/exceptions', { params: month ? { month } : {} }),

  getMuster: (month?: string) => apiClient.get('/attendance/muster', { params: month ? { month } : {} }),
  process: (month: string) => apiClient.post('/attendance/process', { month }),
  override: (data: { personId: string; date: string; status: string; note?: string }) => apiClient.post('/attendance/override', data),
  finalise: (month: string) => apiClient.post('/attendance/finalise', { month }),
  reopen: (month: string) => apiClient.post('/attendance/reopen', { month }),
};
