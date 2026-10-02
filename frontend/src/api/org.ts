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

  // Outgoing mail
  getMailSettings: () => apiClient.get('/org/mail-settings'),
  updateMailSettings: (data: any) => apiClient.put('/org/mail-settings', data),
  testMail: (to: string) => apiClient.post('/org/mail-settings/test', { to }),
  getMailLog: (params: { limit?: number; offset?: number }) => apiClient.get('/org/mail-log', { params }),

  // Where uploaded files are kept: the database or the company's object storage
  getStorageSettings: () => apiClient.get('/org/storage-settings'),
  updateStorageSettings: (data: any) => apiClient.put('/org/storage-settings', data),
  testStorage: (data: any) => apiClient.post('/org/storage-settings/test', data),
  // Moves a batch of the files that are not where the setting says; call until none remains
  moveStoredFiles: () => apiClient.post('/org/storage-settings/move'),

  // Sign-in rules and the record of sign-in attempts
  getSecurity: () => apiClient.get('/org/security'),
  updateSecurity: (data: any) => apiClient.put('/org/security', data),
  getLoginHistory: (params: { limit?: number; offset?: number; failed?: string; userId?: string }) =>
    apiClient.get('/org/login-history', { params }),

};
