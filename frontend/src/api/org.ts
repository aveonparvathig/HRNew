import apiClient from './client';

export const orgAPI = {
  getProfile: () => apiClient.get('/org/profile'),
  updateProfile: (data: any) => apiClient.put('/org/profile', data),

  getTeam: () => apiClient.get('/org/team'),
  addMember: (data: any) => apiClient.post('/org/team', data),
  updateMember: (memberId: string, data: any) => apiClient.put(`/org/team/${memberId}`, data),
  resetMemberPassword: (memberId: string, password: string) =>
    apiClient.post(`/org/team/${memberId}/reset-password`, { password }),
};
