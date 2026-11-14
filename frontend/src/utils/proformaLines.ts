// Proforma form defaults, kept pure so they can be tested.

export const GST_RATE = 18;
export const SUBSCRIPTION_TEXT = 'CMS Software Subscription Charges for';
export const ONE_TIME_TEXT = 'One-time implementation fee';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface DraftLine {
  key: string;
  billingId: string | null; // period lines share their billing row's id
  description: string;
  detail: string;
  qty: string;  // kept as text while editing
  rate: string;
  gst: boolean;
}

// "Academic Year 2025 - 26" (matches the server's periodDetail)
export const periodDetail = (b: { periodType?: string; academicYear: string; periodLabel?: string }) => {
  const m = /^(\d{4})-(\d{4})$/.exec(b.academicYear || '');
  return b.periodType !== 'CUSTOM' && m ? `Academic Year ${m[1]} - ${m[2].slice(2)}` : `Period ${b.periodLabel || b.academicYear}`;
};

// A billing row as invoice lines: QTY = students, RATE = rate per student.
// A fixed-fee row bills qty 1 at its taxable value. The row's one-time fee
// is its own line without GST (as in the billing row's net amount).
export function periodLines(b: {
  id: string; periodType?: string; academicYear: string; periodLabel?: string;
  overrideAmounts?: boolean; studentCount?: number | null; rate?: number | null;
  taxableValue?: number | null; oneTimePayment?: number | null;
}): DraftLine[] {
  const detail = periodDetail(b);
  const perStudent = !b.overrideAmounts && Number(b.studentCount) > 0 && Number(b.rate) > 0;
  const lines: DraftLine[] = [{
    key: b.id, billingId: b.id, description: SUBSCRIPTION_TEXT, detail,
    qty: perStudent ? String(b.studentCount) : '1',
    rate: perStudent ? String(b.rate) : (Number(b.taxableValue) > 0 ? String(b.taxableValue) : ''),
    gst: true,
  }];
  if (Number(b.oneTimePayment) > 0) {
    lines.push({
      key: `${b.id}-onetime`, billingId: b.id, description: ONE_TIME_TEXT, detail,
      qty: '1', rate: String(b.oneTimePayment), gst: false,
    });
  }
  return lines;
}

export function lineAmounts(l: Pick<DraftLine, 'qty' | 'rate' | 'gst'>) {
  const taxable = round2((Number(l.qty) || 0) * (Number(l.rate) || 0));
  const gst = l.gst ? round2(taxable * GST_RATE / 100) : 0;
  return { taxable, gst, total: round2(taxable + gst) };
}

// Same rounding as the server: per-line GST summed; CGST = half, SGST = rest
// Previous pending (carry-forward) adds after the grand total with no GST:
// balance due = total + previous pending − received.
export function draftTotals(
  lines: Pick<DraftLine, 'qty' | 'rate' | 'gst'>[], intra: boolean, advance = 0, previousPending = 0,
) {
  const amounts = lines.map(lineAmounts);
  const subtotal = round2(amounts.reduce((s, a) => s + a.taxable, 0));
  const gst = round2(amounts.reduce((s, a) => s + a.gst, 0));
  const cgst = intra ? round2(gst / 2) : 0;
  const sgst = intra ? round2(gst - cgst) : 0;
  const total = round2(subtotal + gst);
  const adv = round2(Math.max(Number(advance) || 0, 0));
  const pending = round2(Math.max(Number(previousPending) || 0, 0));
  const totalDue = round2(total + pending);
  return {
    subtotal, gst, cgst, sgst, igst: intra ? 0 : gst, total,
    previousPending: pending, totalDue, advance: adv, balanceDue: round2(totalDue - adv),
  };
}

// Carry-forward recorded on the ticked periods
export const previousPendingFor = (billings: { id: string; previousPending?: number }[], ticked: Set<string>) =>
  round2(billings.filter(b => ticked.has(b.id)).reduce((s, b) => s + (Number(b.previousPending) || 0), 0));

// Payments already recorded on the ticked periods
export const advanceFor = (billings: { id: string; received?: number }[], ticked: Set<string>) =>
  round2(billings.filter(b => ticked.has(b.id)).reduce((s, b) => s + (Number(b.received) || 0), 0));
