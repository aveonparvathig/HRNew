import apiClient from './client';

export const peopleAPI = {
  getMeta: () => apiClient.get('/people/meta'),

  // People
  getPeople: (params?: { q?: string }) => apiClient.get('/people', { params }),
  createPerson: (data: any) => apiClient.post('/people', data),
  getPersonDetail: (personId: string) => apiClient.get(`/people/${personId}`),
  updatePerson: (personId: string, data: any) => apiClient.put(`/people/${personId}`, data),
  updatePersonStage: (personId: string, stage: string) =>
    apiClient.post(`/people/${personId}/stage`, { stage }),
  deletePerson: (personId: string) => apiClient.delete(`/people/${personId}`),

  // Pipeline
  getPipeline: (params?: { stage?: string; source?: string; job?: string; q?: string }) =>
    apiClient.get('/people/pipeline', { params }),

  // Job openings
  getOpenings: (show?: string) => apiClient.get('/people/openings', { params: { show } }),
  createOpening: (data: any) => apiClient.post('/people/openings', data),
  updateOpening: (openingId: string, data: any) =>
    apiClient.put(`/people/openings/${openingId}`, data),

  // Documents (generated letters)
  getDocumentPrefill: (personId: string, docType: string) =>
    apiClient.get(`/people/${personId}/document-prefill`, { params: { docType } }),
  createDocument: (personId: string, docType: string, formData: any) =>
    apiClient.post(`/people/${personId}/documents`, { docType, formData }),
  getDocument: (docId: string) => apiClient.get(`/people/documents/${docId}`),
  deleteDocument: (docId: string) => apiClient.delete(`/people/documents/${docId}`),

  // Interview rounds
  addInterview: (personId: string, data: any) =>
    apiClient.post(`/people/${personId}/interviews`, data),
  updateInterview: (interviewId: string, data: any) =>
    apiClient.put(`/people/interviews/${interviewId}`, data),
  deleteInterview: (interviewId: string) =>
    apiClient.delete(`/people/interviews/${interviewId}`),
};
