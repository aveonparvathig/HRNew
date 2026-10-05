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
};
