export const formatINR = (amount: number) =>
  '₹' + (amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

// Compact rupees for chart labels: ₹1.2Cr, ₹4.5L, ₹85K
export const formatINRCompact = (amount: number) => {
  const v = Math.abs(amount ?? 0);
  const sign = (amount ?? 0) < 0 ? '-' : '';
  if (v >= 1e7) return `${sign}₹${(v / 1e7).toFixed(v >= 1e8 ? 0 : 1)}Cr`;
  if (v >= 1e5) return `${sign}₹${(v / 1e5).toFixed(v >= 1e6 ? 0 : 1)}L`;
  if (v >= 1e3) return `${sign}₹${Math.round(v / 1e3)}K`;
  return `${sign}₹${Math.round(v)}`;
};

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
