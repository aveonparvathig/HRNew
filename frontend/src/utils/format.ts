export const formatINR = (amount: number) =>
  '₹' + (amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export const formatDate = (date: string | Date) =>
  new Date(date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const PAYMENT_MODES = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'cash', label: 'Cash' },
  { value: 'card', label: 'Card' },
  { value: 'upi', label: 'UPI' },
];

export const paymentModeLabel = (value: string) =>
  PAYMENT_MODES.find(m => m.value === value)?.label || value;

// Collection progress tone bands: 100% green, 75%+ teal, 50%+ amber, below red
export const collectionTone = (pct: number) =>
  pct >= 100 ? 'green' : pct >= 75 ? 'teal' : pct >= 50 ? 'amber' : 'red';
