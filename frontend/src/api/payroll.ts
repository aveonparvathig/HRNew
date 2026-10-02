import apiClient from './client';

export const payrollAPI = {
  // Settings
  getSettings: () => apiClient.get('/payroll/settings'),
  updateSettings: (data: any) => apiClient.put('/payroll/settings', data),
  getStatutoryProfile: () => apiClient.get('/payroll/statutory-profile'),
  updateStatutoryProfile: (data: any) => apiClient.put('/payroll/statutory-profile', data),
  getLocations: () => apiClient.get('/payroll/locations'),
  createLocation: (data: any) => apiClient.post('/payroll/locations', data),
  updateLocation: (locationId: string, data: any) => apiClient.put(`/payroll/locations/${locationId}`, data),
  deleteLocation: (locationId: string) => apiClient.delete(`/payroll/locations/${locationId}`),
  getAuditLog: (params: { limit: number; offset: number; runId?: string }) =>
    apiClient.get('/payroll/audit-log', { params }),

  // Pay components
  getComponents: () => apiClient.get('/payroll/components'),
  createComponent: (data: any) => apiClient.post('/payroll/components', data),
  updateComponent: (componentId: string, data: any) => apiClient.put(`/payroll/components/${componentId}`, data),
  deleteComponent: (componentId: string) => apiClient.delete(`/payroll/components/${componentId}`),

  // Salary revisions
  // Structure templates (a salary split of its own) and who they apply to
  getStructureTemplates: () => apiClient.get('/payroll/structure-templates'),
  createStructureTemplate: (data: any) => apiClient.post('/payroll/structure-templates', data),
  updateStructureTemplate: (templateId: string, data: any) => apiClient.put(`/payroll/structure-templates/${templateId}`, data),
  deleteStructureTemplate: (templateId: string) => apiClient.delete(`/payroll/structure-templates/${templateId}`),
  // scope: EMPLOYEE | DESIGNATION | DEPARTMENT; a blank templateId takes the assignment away
  assignStructure: (data: { scope: string; target: string; templateId: string }) => apiClient.put('/payroll/structure-assignments', data),
  // One employee's structure and the components they get every month
  getPersonStructure: (personId: string) => apiClient.get(`/payroll/people/${personId}/structure`),
  createRecurring: (personId: string, data: any) => apiClient.post(`/payroll/people/${personId}/recurring`, data),
  updateRecurring: (recurringId: string, data: any) => apiClient.put(`/payroll/recurring/${recurringId}`, data),
  deleteRecurring: (recurringId: string) => apiClient.delete(`/payroll/recurring/${recurringId}`),
  // A package typed monthly (MONTHLY), as a yearly figure (ANNUAL) or as annual CTC (ANNUAL_CTC)
  packagePreview: (data: any) => apiClient.post('/payroll/package-preview', data),
  getRevisions: (personId: string) => apiClient.get(`/payroll/people/${personId}/revisions`),
  createRevision: (personId: string, data: any) => apiClient.post(`/payroll/people/${personId}/revisions`, data),
  // Take back what a back-dated cut overpaid in finalized months
  recoverRevision: (personId: string, revisionId: string) =>
    apiClient.post(`/payroll/people/${personId}/revisions/${revisionId}/recover`),
  deleteRevision: (personId: string, revisionId: string) =>
    apiClient.delete(`/payroll/people/${personId}/revisions/${revisionId}`),

  // Professional Tax and Labour Welfare Fund policies
  getPolicies: () => apiClient.get('/payroll/statutory-policies'),
  createPtPolicy: (data: any) => apiClient.post('/payroll/pt-policies', data),
  updatePtPolicy: (policyId: string, data: any) => apiClient.put(`/payroll/pt-policies/${policyId}`, data),
  deletePtPolicy: (policyId: string) => apiClient.delete(`/payroll/pt-policies/${policyId}`),
  createLwfPolicy: (data: any) => apiClient.post('/payroll/lwf-policies', data),
  updateLwfPolicy: (policyId: string, data: any) => apiClient.put(`/payroll/lwf-policies/${policyId}`, data),
  deleteLwfPolicy: (policyId: string) => apiClient.delete(`/payroll/lwf-policies/${policyId}`),

  // Statutory payments
  getRemittances: (fy: string) => apiClient.get('/payroll/remittances', { params: fy ? { fy } : {} }),
  createRemittance: (data: any) => apiClient.post('/payroll/remittances', data),
  deleteRemittance: (remittanceId: string) => apiClient.delete(`/payroll/remittances/${remittanceId}`),

  // Income tax
  getTaxConfig: (fy: string) => apiClient.get('/payroll/tax-config', { params: fy ? { fy } : {} }),
  updateTaxConfig: (configId: string, data: any) => apiClient.put(`/payroll/tax-config/${configId}`, data),
  updateTaxSettings: (data: any) => apiClient.put('/payroll/tax-settings', data),
  getTaxProfile: (personId: string, fy: string) =>
    apiClient.get(`/payroll/people/${personId}/tax-profile`, { params: fy ? { fy } : {} }),

  // Income-tax declarations
  getDeclarationItems: () => apiClient.get('/payroll/declaration-items'),
  createDeclarationItem: (data: any) => apiClient.post('/payroll/declaration-items', data),
  updateDeclarationItem: (itemId: string, data: any) => apiClient.put(`/payroll/declaration-items/${itemId}`, data),
  deleteDeclarationItem: (itemId: string) => apiClient.delete(`/payroll/declaration-items/${itemId}`),
  getDeclarations: (fy: string) => apiClient.get('/payroll/declarations', { params: fy ? { fy } : {} }),
  // The year's windows: declarationOpen, proofOpen, employeeCanChooseRegime
  updateDeclarationControl: (data: any) => apiClient.put('/payroll/declarations/control', data),
  getDeclaration: (personId: string, fy: string) =>
    apiClient.get(`/payroll/declarations/${personId}`, { params: fy ? { fy } : {} }),
  saveDeclaration: (personId: string, data: any) => apiClient.put(`/payroll/declarations/${personId}`, data),
  saveDeclarationApproval: (personId: string, data: any) =>
    apiClient.put(`/payroll/declarations/${personId}/approval`, data),
  addDeclarationProof: (personId: string, data: any) => apiClient.post(`/payroll/declarations/${personId}/proofs`, data),
  // Review: HR submits for the employee, marks it reviewed (REVIEW) or sends it back (SEND_BACK)
  submitDeclaration: (personId: string, data: any) => apiClient.post(`/payroll/declarations/${personId}/submit`, data),
  reviewDeclaration: (personId: string, data: { fyStart: number; action: string }) =>
    apiClient.post(`/payroll/declarations/${personId}/review`, data),
  decideReopenRequest: (requestId: string, data: { approve: boolean; note?: string }) =>
    apiClient.post(`/payroll/declaration-reopen-requests/${requestId}/decide`, data),
  getDeclarationProof: (proofId: string) => apiClient.get(`/payroll/declaration-proofs/${proofId}`),
  deleteDeclarationProof: (proofId: string) => apiClient.delete(`/payroll/declaration-proofs/${proofId}`),

  // Payout: salary account, automation, journal ledgers
  getPayoutSettings: () => apiClient.get('/payroll/payout-settings'),
  updatePayoutSettings: (data: any) => apiClient.put('/payroll/payout-settings', data),
  updateLedgerMapping: (mapping: Record<string, string>) => apiClient.put('/payroll/ledger-mapping', { mapping }),
  // A department's or work location's own ledger for one account; a blank name removes it
  updateLedgerOverride: (data: { dimension: string; groupName: string; key: string; ledgerName: string }) =>
    apiClient.put('/payroll/ledger-overrides', data),
  // An employee's payment mode and salary stop
  getPaySettings: (personId: string) => apiClient.get(`/payroll/people/${personId}/pay-settings`),
  updatePaySettings: (personId: string, data: any) => apiClient.put(`/payroll/people/${personId}/pay-settings`, data),
  // Payout of a run
  getPayout: (runId: string) => apiClient.get(`/payroll/runs/${runId}/payout`),
  createPayoutBatch: (runId: string, data: any) => apiClient.post(`/payroll/runs/${runId}/payout-batches`, data),
  // Salaries paid outside the system: mark the run's unpaid salaries as paid, or undo that
  markPaidOutside: (runId: string, data: { payDate: string; reference?: string; earlier?: boolean }) =>
    apiClient.post(`/payroll/runs/${runId}/paid-outside`, data),
  undoPaidOutside: (runId: string) => apiClient.delete(`/payroll/runs/${runId}/paid-outside`),
  getPayoutBatch: (batchId: string) => apiClient.get(`/payroll/payout-batches/${batchId}`),
  markPayoutBatchPaid: (batchId: string, data: any) => apiClient.post(`/payroll/payout-batches/${batchId}/paid`, data),
  deletePayoutBatch: (batchId: string) => apiClient.delete(`/payroll/payout-batches/${batchId}`),
  getBankFile: (batchId: string) => apiClient.get(`/payroll/payout-batches/${batchId}/bank-file`),
  holdSalary: (entryId: string, reason: string) => apiClient.post(`/payroll/entries/${entryId}/hold`, { reason }),
  releaseSalary: (entryId: string) => apiClient.post(`/payroll/entries/${entryId}/release-hold`),
  removeFromBatch: (entryId: string) => apiClient.post(`/payroll/entries/${entryId}/remove-from-batch`),
  // Expense claims paid with a run's salary
  getRunClaims: (runId: string) => apiClient.get(`/payroll/runs/${runId}/claims`),
  setRunClaim: (runId: string, reportId: string, attach: boolean) =>
    apiClient.put(`/payroll/runs/${runId}/claims`, { reportId, attach }),

  // TDS deposits, quarterly return and Form 16
  getTds: (fy: string) => apiClient.get('/payroll/tds', { params: fy ? { fy } : {} }),
  createTdsChallan: (data: any) => apiClient.post('/payroll/tds/challans', data),
  deleteTdsChallan: (challanId: string) => apiClient.delete(`/payroll/tds/challans/${challanId}`),
  getTdsReturnWorkbook: (fy: string, quarter: number) => apiClient.get('/payroll/tds/return-workbook', { params: { fy, quarter } }),
  // The receipt number the tax department gave a quarter's return
  saveTdsFiling: (data: { fyStart: number; quarter: number; receiptNo: string; filedOn: string }) =>
    apiClient.put('/payroll/tds/filings', data),
  // An employee's perquisites for a year, by Form 12BA line
  getPerquisites: (personId: string, fy: string) => apiClient.get(`/payroll/people/${personId}/perquisites`, { params: fy ? { fy } : {} }),
  savePerquisites: (personId: string, data: any) => apiClient.put(`/payroll/people/${personId}/perquisites`, data),
  // Form 16 as one PDF (Part A + Part B): downloadFile('/payroll/form16/:personId/file', { fy })
  getForm16List: (fy: string) => apiClient.get('/payroll/form16', { params: fy ? { fy } : {} }),
  setForm16Released: (fyStart: number, released: boolean) => apiClient.put('/payroll/form16/release', { fyStart, released }),
  getForm16PartA: (personId: string, fy: string) => apiClient.get(`/payroll/form16/${personId}/part-a`, { params: { fy } }),
  uploadForm16PartA: (personId: string, data: any) => apiClient.put(`/payroll/form16/${personId}/part-a`, data),
  deleteForm16PartA: (personId: string, fy: string) => apiClient.delete(`/payroll/form16/${personId}/part-a`, { params: { fy } }),

  // Arrears and final settlements
  getArrears: () => apiClient.get('/payroll/arrears'),
  getLopMonths: (personId: string) => apiClient.get(`/payroll/people/${personId}/lop-months`),
  reverseLop: (data: any) => apiClient.post('/payroll/arrears/lop-reversal', data),
  // Loss of pay added to a finalized month; the pay is taken back on the next payslip
  addRetroLop: (data: any) => apiClient.post('/payroll/arrears/retro-lop', data),
  cancelArrear: (arrearId: string, reason: string) => apiClient.post(`/payroll/arrears/${arrearId}/cancel`, { reason }),
  getSettlements: () => apiClient.get('/payroll/settlements'),
  previewSettlement: (personId: string, data: any) => apiClient.post(`/payroll/people/${personId}/settlement-preview`, data),
  getSettlement: (settlementId: string) => apiClient.get(`/payroll/settlements/${settlementId}`),
  createSettlement: (data: any) => apiClient.post('/payroll/settlements', data),
  updateSettlement: (settlementId: string, data: any) => apiClient.put(`/payroll/settlements/${settlementId}`, data),
  deleteSettlement: (settlementId: string) => apiClient.delete(`/payroll/settlements/${settlementId}`),
  applySettlement: (settlementId: string) => apiClient.post(`/payroll/settlements/${settlementId}/apply`),
  recoverSettlementLoans: (settlementId: string) => apiClient.post(`/payroll/settlements/${settlementId}/recover-loans`),

  // Loans and advances
  getLoans: (personId?: string) => apiClient.get('/payroll/loans', { params: personId ? { personId } : {} }),
  getLoan: (loanId: string) => apiClient.get(`/payroll/loans/${loanId}`),
  previewLoan: (data: any) => apiClient.post('/payroll/loans/preview', data),
  createLoan: (data: any) => apiClient.post('/payroll/loans', data),
  deleteLoan: (loanId: string) => apiClient.delete(`/payroll/loans/${loanId}`),
  // action: skip | prepay | foreclose | revise
  loanAction: (loanId: string, action: string, data: any) => apiClient.post(`/payroll/loans/${loanId}/${action}`, data),

  // Reports across runs
  // kind: ytd-statement | component-statement | salary-structure | ctc-breakup | revision-history
  //       | pt-half-year | loan-statement | loan-register | loan-transactions
  //       | tax-statement | tax-consolidated | pan-status | form-12bb | declarations
  //       | bank-advice | hold-release | duplicates | reimbursements
  //       | tds-challans | tds-return | form-27a | form-16 | form-16-all | form-12ba
  //       | arrears | pf-arrears | settlement-statement | settlements
  //       | register-<code>: tn-u, tn-v, tn-w, tn-x, form-a, form-b, form-c, form-d, bonus-c, bonus-d, gratuity-f
  getReportOptions: () => apiClient.get('/payroll/reports/options'),
  // A labour-law register as an Excel workbook
  getRegisterWorkbook: (code: string, params: Record<string, string>) =>
    apiClient.get(`/payroll/registers/${code}/workbook`, { params }),
  getReport: (kind: string, params: Record<string, string>) =>
    apiClient.get(`/payroll/reports/${kind}`, { params }),

  // Runs
  getRuns: () => apiClient.get('/payroll/runs'),
  createRun: (data: { period: string; totalWorkingDays: number; notes?: string }) =>
    apiClient.post('/payroll/runs', data),
  getRunDetail: (runId: string) => apiClient.get(`/payroll/runs/${runId}`),
  deleteRun: (runId: string) => apiClient.delete(`/payroll/runs/${runId}`),
  finalizeRun: (runId: string) => apiClient.post(`/payroll/runs/${runId}/finalize`),
  reopenRun: (runId: string) => apiClient.post(`/payroll/runs/${runId}/reopen`),
  // While a draft's inputs are locked, attendance and one-offs cannot be edited
  lockInputs: (runId: string) => apiClient.post(`/payroll/runs/${runId}/lock-inputs`),
  unlockInputs: (runId: string) => apiClient.post(`/payroll/runs/${runId}/unlock-inputs`),
  // Release shows a finalized run's payslips to employees; hold takes them back
  releaseRun: (runId: string) => apiClient.post(`/payroll/runs/${runId}/release`),
  holdRun: (runId: string) => apiClient.post(`/payroll/runs/${runId}/hold`),
  recalculateRun: (runId: string) => apiClient.post(`/payroll/runs/${runId}/recalculate`),
  exportRunCsv: (runId: string) =>
    apiClient.get(`/payroll/runs/${runId}/export.csv`, { responseType: 'blob' }),
  getRunPayslips: (runId: string) => apiClient.get(`/payroll/runs/${runId}/payslips`),
  // kind: pf-esi | comparison | overrides | input-history | register | summary
  //       | pf-statement | pt-statement | lwf-statement | tds-statement
  //       | payment-register | cash-cheque | payout-reconciliation | journal-voucher
  //       | reconciliation | headcount | negative-net | anomalies
  getRunReport: (runId: string, kind: string) => apiClient.get(`/payroll/runs/${runId}/reports/${kind}`),
  // Portal upload files — kind: pf-ecr | esi-upload
  getRunFile: (runId: string, kind: string) => apiClient.get(`/payroll/runs/${runId}/files/${kind}`),
  attendanceTemplate: (runId: string) =>
    apiClient.get(`/payroll/runs/${runId}/attendance-template.xlsx`, { responseType: 'blob' }),
  importAttendance: (runId: string, fileBase64: string, dryRun: boolean) =>
    apiClient.post(`/payroll/runs/${runId}/attendance-import`, { fileBase64, dryRun }),
  getPersonEntries: (personId: string) => apiClient.get(`/payroll/people/${personId}/entries`),

  // Entries
  updateEntry: (entryId: string, data: any) => apiClient.put(`/payroll/entries/${entryId}`, data),
  removeEntry: (entryId: string) => apiClient.delete(`/payroll/entries/${entryId}`),
  getPayslip: (entryId: string) => apiClient.get(`/payroll/entries/${entryId}/payslip`),

  // Payslips as files and by email. Files are fetched with downloadFile():
  //   /payroll/entries/:id/payslip.pdf · /payroll/runs/:id/payslips.zip · /payroll/runs/:id/payslips.pdf
  //   /payroll/runs/:id/journal-voucher/file?format=csv|xlsx · any report address with ?format=pdf
  getPayslipFileSettings: () => apiClient.get('/payroll/payslip-file-settings'),
  updatePayslipFileSettings: (data: any) => apiClient.put('/payroll/payslip-file-settings', data),
  getPayslipDelivery: (runId: string, to?: string) =>
    apiClient.get(`/payroll/runs/${runId}/payslip-delivery`, { params: to ? { to } : {} }),
  emailPayslip: (entryId: string, to: string) => apiClient.post(`/payroll/entries/${entryId}/email-payslip`, { to }),
};
