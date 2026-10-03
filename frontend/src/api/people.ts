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

  // Bulk imports: a dry run first, then the same call with dryRun false
  importEmployees: (data: any) => apiClient.post('/people/import/employees', data),
  importRevisions: (data: any) => apiClient.post('/people/import/revisions', data),
  // Photos and documents named by employee code: match the names, then send the files in batches
  matchImportFiles: (data: { kind: string; fileNames: string[] }) => apiClient.post('/people/import/files/match', data),
  importFiles: (data: any) => apiClient.post('/people/import/files', data),
  getImportLogs: () => apiClient.get('/people/import/logs'),
  getImportLog: (logId: string) => apiClient.get(`/people/import/logs/${logId}`),

  // Files kept against a person
  getFiles: (personId: string) => apiClient.get(`/people/${personId}/files`),
  uploadFile: (personId: string, data: any) => apiClient.post(`/people/${personId}/files`, data),
  updateFile: (fileId: string, data: any) => apiClient.put(`/people/files/${fileId}`, data),
  getFile: (fileId: string) => apiClient.get(`/people/files/${fileId}`),
  deleteFile: (fileId: string) => apiClient.delete(`/people/files/${fileId}`),

  // Separation (phase 25): the leaving record and its status flow
  getSeparation: (personId: string) => apiClient.get(`/people/${personId}/separation`),
  saveSeparation: (personId: string, data: any) => apiClient.put(`/people/${personId}/separation`, data),
  acceptSeparation: (personId: string) => apiClient.post(`/people/${personId}/separation/accept`),
  relieveSeparation: (personId: string, data: { relievedOn?: string }) => apiClient.post(`/people/${personId}/separation/relieve`, data),
  withdrawSeparation: (personId: string) => apiClient.post(`/people/${personId}/separation/withdraw`),
  deleteSeparation: (personId: string) => apiClient.delete(`/people/${personId}/separation`),

  // Employee communication (phase 26): change requests, mail, bulletins, policies
  getCommunicationMeta: () => apiClient.get('/people/communication/meta'),
  getChangeRequests: (status?: string) => apiClient.get('/people/communication/change-requests', { params: status ? { status } : {} }),
  getChangeRequestFile: (id: string) => apiClient.get(`/people/communication/change-requests/${id}/file`),
  reviewChangeRequest: (id: string, data: { approve: boolean; note?: string }) => apiClient.post(`/people/communication/change-requests/${id}/review`, data),
  getDetailsConfirmation: () => apiClient.get('/people/communication/details-confirmation'),
  getBulletins: () => apiClient.get('/people/communication/bulletins'),
  saveBulletin: (data: any) => apiClient.post('/people/communication/bulletins', data),
  updateBulletin: (id: string, data: any) => apiClient.put(`/people/communication/bulletins/${id}`, data),
  deleteBulletin: (id: string) => apiClient.delete(`/people/communication/bulletins/${id}`),
  getPolicies: () => apiClient.get('/people/communication/policies'),
  savePolicy: (data: any) => apiClient.post('/people/communication/policies', data),
  updatePolicy: (id: string, data: any) => apiClient.put(`/people/communication/policies/${id}`, data),
  deletePolicy: (id: string) => apiClient.delete(`/people/communication/policies/${id}`),
  getPolicyCoverage: (id: string) => apiClient.get(`/people/communication/policies/${id}/coverage`),
  mailAudienceCount: (data: any) => apiClient.post('/people/communication/mail/count', data),
  createCampaign: (data: any) => apiClient.post('/people/communication/mail', data),
  getCampaigns: () => apiClient.get('/people/communication/mail'),
  getCampaign: (id: string) => apiClient.get(`/people/communication/mail/${id}`),

  // Interview rounds
  addInterview: (personId: string, data: any) =>
    apiClient.post(`/people/${personId}/interviews`, data),
  updateInterview: (interviewId: string, data: any) =>
    apiClient.put(`/people/interviews/${interviewId}`, data),
  deleteInterview: (interviewId: string) =>
    apiClient.delete(`/people/interviews/${interviewId}`),
};
