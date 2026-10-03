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

  // Position history: designation, department, work location and grade over time
  getPositions: (personId: string) => apiClient.get(`/people/${personId}/positions`),
  changePosition: (personId: string, data: any) => apiClient.post(`/people/${personId}/positions`, data),
  deletePosition: (changeId: string) => apiClient.delete(`/people/positions/${changeId}`),

  // Reporting lines and confirmation
  getOrgChart: () => apiClient.get('/people/org-chart'),
  setManager: (personId: string, managerId: string) => apiClient.put(`/people/${personId}/manager`, { managerId }),
  // Everyone reporting directly to one manager moves under another ('' = no manager)
  transferReports: (data: { fromManagerId: string; toManagerId: string }) => apiClient.post('/people/transfer-reports', data),
  // Headcount, joiners and leavers, birthdays, confirmations due, records with gaps
  getHrDashboard: () => apiClient.get('/people/hr-dashboard'),
  getConfirmations: (days?: number) => apiClient.get('/people/confirmations', { params: days ? { days } : {} }),
  confirmEmployee: (personId: string, confirmationDate: string) => apiClient.post(`/people/${personId}/confirm`, { confirmationDate }),

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
  createDocument: (personId: string, docType: string, formData: any, visibleToEmployee = false) =>
    apiClient.post(`/people/${personId}/documents`, { docType, formData, visibleToEmployee }),
  getDocument: (docId: string) => apiClient.get(`/people/documents/${docId}`),
  // Show a letter to the employee under My Documents, or take it back
  updateDocument: (docId: string, data: { visibleToEmployee: boolean }) => apiClient.put(`/people/documents/${docId}`, data),
  emailDocument: (docId: string) => apiClient.post(`/people/documents/${docId}/email`),
  deleteDocument: (docId: string) => apiClient.delete(`/people/documents/${docId}`),

  // Letter templates, previews, and one letter for several people
  getLetterTemplates: () => apiClient.get('/people/letter-templates'),
  createLetterTemplate: (data: any) => apiClient.post('/people/letter-templates', data),
  updateLetterTemplate: (templateId: string, data: any) => apiClient.put(`/people/letter-templates/${templateId}`, data),
  resetLetterTemplate: (templateId: string) => apiClient.post(`/people/letter-templates/${templateId}/reset`),
  deleteLetterTemplate: (templateId: string) => apiClient.delete(`/people/letter-templates/${templateId}`),
  previewLetter: (data: { code?: string; template?: any; personId?: string; formData?: any }) => apiClient.post('/people/letters/preview', data),
  createLetters: (data: { docType: string; personIds: string[]; formData: any; visibleToEmployee: boolean }) => apiClient.post('/people/letters', data),

  // Files kept against a person
  getFiles: (personId: string) => apiClient.get(`/people/${personId}/files`),
  uploadFile: (personId: string, data: any) => apiClient.post(`/people/${personId}/files`, data),
  updateFile: (fileId: string, data: any) => apiClient.put(`/people/files/${fileId}`, data),
  getFile: (fileId: string) => apiClient.get(`/people/files/${fileId}`),
  deleteFile: (fileId: string) => apiClient.delete(`/people/files/${fileId}`),

  // Fuller profile (phase 24): family, education, previous employment, identity documents
  getFamily: (personId: string) => apiClient.get(`/people/${personId}/family`),
  addFamily: (personId: string, data: any) => apiClient.post(`/people/${personId}/family`, data),
  updateFamily: (id: string, data: any) => apiClient.put(`/people/family/${id}`, data),
  deleteFamily: (id: string) => apiClient.delete(`/people/family/${id}`),
  getEducation: (personId: string) => apiClient.get(`/people/${personId}/education`),
  addEducation: (personId: string, data: any) => apiClient.post(`/people/${personId}/education`, data),
  updateEducation: (id: string, data: any) => apiClient.put(`/people/education/${id}`, data),
  deleteEducation: (id: string) => apiClient.delete(`/people/education/${id}`),
  getPreviousEmployment: (personId: string) => apiClient.get(`/people/${personId}/previous-employment`),
  addPreviousEmployment: (personId: string, data: any) => apiClient.post(`/people/${personId}/previous-employment`, data),
  updatePreviousEmployment: (id: string, data: any) => apiClient.put(`/people/previous-employment/${id}`, data),
  deletePreviousEmployment: (id: string) => apiClient.delete(`/people/previous-employment/${id}`),
  getIdentityDocuments: (personId: string) => apiClient.get(`/people/${personId}/identity-documents`),
  addIdentityDocument: (personId: string, data: any) => apiClient.post(`/people/${personId}/identity-documents`, data),
  updateIdentityDocument: (id: string, data: any) => apiClient.put(`/people/identity-documents/${id}`, data),
  verifyIdentityDocument: (id: string, verified: boolean) => apiClient.post(`/people/identity-documents/${id}/verify`, { verified }),
  getIdentityFile: (id: string) => apiClient.get(`/people/identity-documents/${id}/file`),
  deleteIdentityDocument: (id: string) => apiClient.delete(`/people/identity-documents/${id}`),
  listIdentityDocuments: (params?: { type?: string; verified?: string; expiring?: string }) => apiClient.get('/people/identity-documents', { params }),

  // Interview rounds
  addInterview: (personId: string, data: any) =>
    apiClient.post(`/people/${personId}/interviews`, data),
  updateInterview: (interviewId: string, data: any) =>
    apiClient.put(`/people/interviews/${interviewId}`, data),
  deleteInterview: (interviewId: string) =>
    apiClient.delete(`/people/interviews/${interviewId}`),
};
