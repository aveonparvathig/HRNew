import apiClient from './client';

// An employee's own payroll: payslips, tax declaration, loans, reports.
export const selfAPI = {
  getPayslips: () => apiClient.get('/self/payslips'),
  getPayslip: (entryId: string) => apiClient.get(`/self/payslips/${entryId}`),

  getDeclaration: (fy: string) => apiClient.get('/self/declaration', { params: fy ? { fy } : {} }),
  saveDeclaration: (data: any) => apiClient.put('/self/declaration', data),
  // Hand the declaration in; ask HR to reopen one that can no longer be changed
  submitDeclaration: (data: any) => apiClient.post('/self/declaration/submit', data),
  requestReopen: (data: { fyStart: number; reason: string }) => apiClient.post('/self/declaration/reopen-request', data),
  addProof: (data: any) => apiClient.post('/self/declaration/proofs', data),
  getProof: (proofId: string) => apiClient.get(`/self/declaration/proofs/${proofId}`),
  deleteProof: (proofId: string) => apiClient.delete(`/self/declaration/proofs/${proofId}`),

  // Letters and files HR has shared with the employee
  getDocuments: () => apiClient.get('/self/documents'),
  getDocumentLetter: (docId: string) => apiClient.get(`/self/documents/letters/${docId}`),
  getDocumentFile: (fileId: string) => apiClient.get(`/self/documents/files/${fileId}`),

  getLoans: () => apiClient.get('/self/loans'),
  getForm16PartA: (fy: string) => apiClient.get('/self/form16-part-a', { params: { fy } }),
  // Form 16 as one PDF (Part A + Part B): downloadFile('/self/form16.pdf', { fy })
  // kind: tax-statement | form-12bb | ytd-statement | loan-statement | form-16 | form-12ba
  getReport: (kind: string, params: Record<string, string>) => apiClient.get(`/self/reports/${kind}`, { params }),
};
