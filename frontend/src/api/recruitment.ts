import apiClient from './client';

export const recruitmentAPI = {
  getMeta: () => apiClient.get('/recruitment/meta'),

  // Postings
  getPostings: () => apiClient.get('/recruitment/postings'),
  createPosting: (data: any) => apiClient.post('/recruitment/postings', data),
  getPostingDetail: (postingId: string) =>
    apiClient.get(`/recruitment/postings/${postingId}`),
  updatePosting: (postingId: string, data: any) =>
    apiClient.put(`/recruitment/postings/${postingId}`, data),
  deletePosting: (postingId: string) =>
    apiClient.delete(`/recruitment/postings/${postingId}`),

  // Applications
  createApplication: (postingId: string, data: any) =>
    apiClient.post(`/recruitment/postings/${postingId}/applications`, data),
  getApplicationDetail: (applicationId: string) =>
    apiClient.get(`/recruitment/applications/${applicationId}`),
  updateApplication: (applicationId: string, data: any) =>
    apiClient.put(`/recruitment/applications/${applicationId}`, data),
  deleteApplication: (applicationId: string) =>
    apiClient.delete(`/recruitment/applications/${applicationId}`),
  addApplicationToPeople: (applicationId: string) =>
    apiClient.post(`/recruitment/applications/${applicationId}/add-to-people`),
};
