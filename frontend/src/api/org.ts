import apiClient from './client';

export const orgAPI = {
  getProfile: () => apiClient.get('/org/profile'),
  updateProfile: (data: any) => apiClient.put('/org/profile', data),

  getTeam: () => apiClient.get('/org/team'),
  addMember: (data: any) => apiClient.post('/org/team', data),
  updateMember: (memberId: string, data: any) => apiClient.put(`/org/team/${memberId}`, data),
  resetMemberPassword: (memberId: string, password: string) =>
    apiClient.post(`/org/team/${memberId}/reset-password`, { password }),
  generateLogins: () => apiClient.post('/org/team/generate-logins', {}, { responseType: 'blob' }),
  unlockMember: (memberId: string) => apiClient.post(`/org/team/${memberId}/unlock`),

  // Sign-in rules and the record of sign-in attempts
  getSecurity: () => apiClient.get('/org/security'),
  updateSecurity: (data: any) => apiClient.put('/org/security', data),
  getLoginHistory: (params: { limit?: number; offset?: number; failed?: string; userId?: string }) =>
    apiClient.get('/org/login-history', { params }),

};
