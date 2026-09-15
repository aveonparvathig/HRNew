import apiClient from './client';

export const proposalsAPI = {
  getCatalog: () => apiClient.get('/proposals/catalog'),
  getCmsFeatures: () => apiClient.get('/proposals/cms-features'),
  generate: (data: any) => apiClient.post('/proposals/generate', data),
  getHistory: (q?: string) => apiClient.get('/proposals/history', { params: { q } }),
  getRecord: (recordId: string) => apiClient.get(`/proposals/history/${recordId}`),
  deleteRecord: (recordId: string) => apiClient.delete(`/proposals/history/${recordId}`),
};
