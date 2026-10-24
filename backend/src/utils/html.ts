// The one HTML escaper for server-built documents (payslips, letters,
// reports). Double quotes are escaped too, so a value is also safe inside
// an attribute — the documents quote every attribute with "".
export const escapeHtml = (v: unknown) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
