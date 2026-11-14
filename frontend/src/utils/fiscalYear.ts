// Indian financial year (April–March) of a YYYY-MM-DD date: "2026-27".
// Mirrors the backend's fiscalYearOf (proformaService).
export const fiscalYearOf = (date: string) => {
  const [y, m] = date.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};
