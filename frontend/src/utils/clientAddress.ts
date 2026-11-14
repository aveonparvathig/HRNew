// Client address, printed as Bill To on proforma invoices.
// Saved on the client's onboarding record (also editable on Implementation).

export interface ClientAddress {
  address: string;
  city: string;
  state: string;
  pincode: string;
  gstin: string;
}

export const EMPTY_ADDRESS: ClientAddress = { address: '', city: '', state: '', pincode: '', gstin: '' };

export const addressOf = (ob: any): ClientAddress => ({
  address: ob?.address || '',
  city: ob?.city || '',
  state: ob?.state || '',
  pincode: ob?.pincode || '',
  gstin: ob?.gstin || '',
});
