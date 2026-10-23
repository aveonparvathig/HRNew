import apiClient from './client';

export const proposalsAPI = {
  getCatalog: () => apiClient.get('/proposals/catalog'),
  getCmsFeatures: () => apiClient.get('/proposals/cms-features'),
  preview: (data: any) => apiClient.post('/proposals/preview', data),
  generate: (data: any) => apiClient.post('/proposals/generate', data),
  getHistory: (q?: string) => apiClient.get('/proposals/history', { params: { q } }),
  getRecord: (recordId: string) => apiClient.get(`/proposals/history/${recordId}`),
  deleteRecord: (recordId: string) => apiClient.delete(`/proposals/history/${recordId}`),
  addClientLogo: (data: { name: string; logoUri: string }) => apiClient.post('/proposals/client-logos', data),
  deleteClientLogo: (name: string) => apiClient.delete(`/proposals/client-logos/${encodeURIComponent(name)}`),
};
