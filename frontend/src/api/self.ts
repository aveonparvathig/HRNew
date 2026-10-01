import apiClient from './client';

// An employee's own payroll: payslips, tax declaration, loans, reports.
export const selfAPI = {
  getPayslips: () => apiClient.get('/self/payslips'),
  getPayslip: (entryId: string) => apiClient.get(`/self/payslips/${entryId}`),

  getDeclaration: (fy: string) => apiClient.get('/self/declaration', { params: fy ? { fy } : {} }),
  saveDeclaration: (data: any) => apiClient.put('/self/declaration', data),
  addProof: (data: any) => apiClient.post('/self/declaration/proofs', data),
  getProof: (proofId: string) => apiClient.get(`/self/declaration/proofs/${proofId}`),
  deleteProof: (proofId: string) => apiClient.delete(`/self/declaration/proofs/${proofId}`),

  getLoans: () => apiClient.get('/self/loans'),
  // kind: tax-statement | form-12bb | ytd-statement | loan-statement
  getReport: (kind: string, params: Record<string, string>) => apiClient.get(`/self/reports/${kind}`, { params }),
};
