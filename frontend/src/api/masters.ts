import apiClient from './client';

export const mastersAPI = {
  // Value lists (department, designation, bank, reasons…) and the states
  getLists: () => apiClient.get('/masters/lists'),
  addListValue: (type: string, label: string) => apiClient.post(`/masters/lists/${type}/values`, { label }),
  // label renames (merge: true folds it into a value that already exists); isActive switches it on or off
  updateListValue: (valueId: string, data: { label?: string; isActive?: boolean; merge?: boolean }) =>
    apiClient.put(`/masters/list-values/${valueId}`, data),
  deleteListValue: (valueId: string) => apiClient.delete(`/masters/list-values/${valueId}`),

  // Company bank accounts
  getBankAccounts: () => apiClient.get('/masters/bank-accounts'),
  createBankAccount: (data: any) => apiClient.post('/masters/bank-accounts', data),
  updateBankAccount: (accountId: string, data: any) => apiClient.put(`/masters/bank-accounts/${accountId}`, data),
  deleteBankAccount: (accountId: string) => apiClient.delete(`/masters/bank-accounts/${accountId}`),

  // Number series — key: EMPLOYEE_CODE | LETTER | SETTLEMENT | PAYOUT_BATCH
  getNumberSeries: () => apiClient.get('/masters/number-series'),
  updateNumberSeries: (key: string, data: any) => apiClient.put(`/masters/number-series/${key}`, data),
  deleteNumberSeries: (key: string) => apiClient.delete(`/masters/number-series/${key}`),
};

// The lists are read by many pickers at once; one request serves them all
// until something changes a list.
let listsRequest: Promise<any> | null = null;

export function loadLists(): Promise<any> {
  if (!listsRequest) {
    listsRequest = mastersAPI.getLists().then(res => res.data).catch(err => { listsRequest = null; throw err; });
  }
  return listsRequest;
}

export const forgetLists = () => { listsRequest = null; };
