// Perquisites as Form 12BA lists them: the value of each, what the
// employee paid for it, and what is left to tax. Pure, DB-independent.

const r2 = (n: number) => Math.round(n * 100) / 100;

// The lines of Form 12BA, in its order. A head is its 1-based line number.
export const PERQUISITE_HEADS = [
  'Accommodation', 'Cars / other automotive', 'Sweeper, gardener, watchman or personal attendant', 'Gas, electricity, water',
  'Interest-free or concessional loans', 'Holiday expenses', 'Free or concessional travel', 'Free meals', 'Free education',
  'Gifts, vouchers and the like', 'Credit card expenses', 'Club expenses', 'Use of movable assets by employees',
  'Transfer of assets to employees', 'Value of any other benefit, amenity, service or privilege',
  'Stock options allotted or transferred by an eligible start-up', 'Stock options (other than eligible start-ups)',
  'Contribution by the employer to funds and schemes taxable under section 17(2)(vii)',
  'Annual accretion to those funds and schemes taxable under section 17(2)(viia)', 'Other benefits or amenities',
];
// Worked out from the loan ledger, not typed
export const LOAN_HEAD = 5;

export interface PerquisiteLike {
  head: number;
  value: number;
  recovered: number;
}

export const perquisiteTaxable = (p: { value: number; recovered: number }) =>
  Math.max(0, r2(Number(p.value || 0) - Number(p.recovered || 0)));

// Taxable value of the perquisites typed for an employee. The loan line
// is left out: the loan ledger gives it.
export const typedPerquisites = (values: PerquisiteLike[]) =>
  r2(values.filter(v => v.head !== LOAN_HEAD && v.head >= 1 && v.head <= PERQUISITE_HEADS.length)
    .reduce((s, v) => s + perquisiteTaxable(v), 0));

// Every line of the form for one employee, with totals.
export function perquisiteRows(values: PerquisiteLike[], loan: number) {
  const byHead = new Map(values.map(v => [v.head, v]));
  const rows = PERQUISITE_HEADS.map((label, i) => {
    const head = i + 1;
    if (head === LOAN_HEAD) {
      const value = r2(Math.max(0, loan));
      return { head, label, value, recovered: 0, taxable: value, automatic: true };
    }
    const v = byHead.get(head);
    const value = r2(Math.max(0, Number(v?.value || 0)));
    const recovered = r2(Math.max(0, Number(v?.recovered || 0)));
    return { head, label, value, recovered, taxable: perquisiteTaxable({ value, recovered }), automatic: false };
  });
  const sum = (f: 'value' | 'recovered' | 'taxable') => r2(rows.reduce((s, r) => s + r[f], 0));
  return { rows, total: { value: sum('value'), recovered: sum('recovered'), taxable: sum('taxable') } };
}

// What HR typed for one line, checked. Null = the line is cleared.
export function perquisiteInput(raw: any): PerquisiteLike | null | string {
  const head = Number(raw?.head);
  if (!Number.isInteger(head) || head < 1 || head > PERQUISITE_HEADS.length) return 'Unknown perquisite';
  if (head === LOAN_HEAD) return 'The value of concessional loans comes from the loan ledger and cannot be typed';
  const value = Number(raw?.value || 0);
  const recovered = Number(raw?.recovered || 0);
  if (!isFinite(value) || value < 0 || !isFinite(recovered) || recovered < 0) return 'Amounts cannot be negative';
  if (recovered > value) return `${PERQUISITE_HEADS[head - 1]}: the amount recovered cannot be more than the value`;
  if (value === 0) return null;
  return { head, value: r2(value), recovered: r2(recovered) };
}
