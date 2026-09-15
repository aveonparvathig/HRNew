// Letter HTML generators - self-contained inline-styled documents,
// stored verbatim so history shows exactly what was issued.

export const DOC_TYPES: Record<string, { label: string; kinds: string[] }> = {
  EMPLOYMENT_OFFER: { label: 'Offer Letter', kinds: ['CANDIDATE'] },
  APPOINTMENT: { label: 'Appointment Order', kinds: ['CANDIDATE'] },
  EXPERIENCE_EMPLOYEE: { label: 'Experience Letter', kinds: ['CANDIDATE'] },
  INTERNSHIP_OFFER: { label: 'Internship Offer Letter', kinds: ['INTERN'] },
  EXPERIENCE_INTERNSHIP: { label: 'Internship Experience Certificate', kinds: ['INTERN'] },
};

const esc = (v: any) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const fmtDate = (v: any) => {
  if (!v) return '_______________';
  const d = new Date(v);
  return isNaN(d.getTime()) ? esc(v)
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

const fmtINR = (v: any) => {
  const n = Number(v);
  return !v || isNaN(n) ? '' : '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

const para = (text: string) => `<p style="margin:0 0 14px;text-align:justify;">${text}</p>`;

function shell(orgName: string, d: any, subject: string, salutation: string, body: string) {
  const b = d._brand || {};
  const primary = b.brandPrimary || '#4f46e5';
  const accent = b.brandAccent || '#312e81';
  const contact = [b.phone, b.email, b.website].filter(Boolean).join(' · ');
  return `
<div style="font-family:Georgia,'Times New Roman',serif;color:#1a1a2e;font-size:14px;line-height:1.7;">
  <div style="border-bottom:3px solid ${primary};padding-bottom:14px;margin-bottom:8px;display:flex;align-items:center;gap:16px;">
    ${b.logoData ? `<img src="${b.logoData}" alt="" style="height:56px;max-width:150px;object-fit:contain;"/>` : ''}
    <div>
      <div style="font-size:26px;font-weight:bold;color:${accent};letter-spacing:0.5px;">${esc(orgName)}</div>
      ${d.orgAddress ? `<div style="font-size:12px;color:#555;margin-top:4px;">${esc(d.orgAddress)}</div>` : ''}
      ${contact ? `<div style="font-size:11.5px;color:#777;margin-top:2px;">${esc(contact)}</div>` : ''}
    </div>
  </div>
  <table style="width:100%;font-size:13px;color:#444;margin:14px 0 26px;"><tr>
    <td>${d.refNo ? `Ref: <strong>${esc(d.refNo)}</strong>` : ''}</td>
    <td style="text-align:right;">Date: <strong>${fmtDate(d.letterDate)}</strong></td>
  </tr></table>
  <div style="margin-bottom:22px;">
    <div><strong>${esc(d.recipientName)}</strong></div>
    ${d.recipientAddress ? `<div style="white-space:pre-line;color:#444;">${esc(d.recipientAddress)}</div>` : ''}
  </div>
  <div style="text-align:center;font-weight:bold;text-decoration:underline;margin-bottom:22px;font-size:15px;">
    ${subject}
  </div>
  <p style="margin:0 0 14px;">${salutation}</p>
  ${body}
  <table style="width:100%;margin-top:56px;"><tr>
    <td>
      <div style="margin-bottom:52px;">Yours sincerely,<br/>For <strong>${esc(orgName)}</strong></div>
      <div style="border-top:1px solid #999;display:inline-block;padding-top:6px;min-width:220px;">
        <strong>${esc(d.signatoryName || '')}</strong><br/>
        <span style="font-size:13px;color:#555;">${esc(d.signatoryTitle || 'Authorised Signatory')}</span>
      </div>
    </td>
  </tr></table>
</div>`;
}

const detailTable = (rows: [string, string][]) => `
<table style="width:100%;border-collapse:collapse;margin:8px 0 18px;font-size:13.5px;">
  ${rows.filter(([, v]) => v).map(([k, v]) => `
    <tr>
      <td style="border:1px solid #ccc;padding:7px 12px;background:#f4f4fb;width:40%;font-weight:bold;">${k}</td>
      <td style="border:1px solid #ccc;padding:7px 12px;">${v}</td>
    </tr>`).join('')}
</table>`;

const RENDERERS: Record<string, (orgName: string, d: any) => string> = {
  EMPLOYMENT_OFFER: (orgName, d) => shell(orgName, d,
    `OFFER OF EMPLOYMENT — ${esc(d.designation || '')}`,
    `Dear ${esc(d.recipientName)},`,
    [
      para(`With reference to your application and the subsequent interview you attended, we are
        pleased to offer you the position of <strong>${esc(d.designation)}</strong>
        ${d.department ? `in our <strong>${esc(d.department)}</strong> department` : ''} at
        <strong>${esc(orgName)}</strong>${d.workLocation ? `, ${esc(d.workLocation)}` : ''}.`),
      detailTable([
        ['Designation', esc(d.designation)],
        ['Department', esc(d.department)],
        ['Date of Joining', fmtDate(d.joiningDate)],
        ['Work Location', esc(d.workLocation)],
        ['Annual CTC', fmtINR(d.annualCtc) + (d.annualCtc ? ' per annum' : '')],
        ['Reporting To', esc(d.reportingTo)],
        ['Probation Period', d.probationMonths ? `${esc(d.probationMonths)} months` : ''],
      ]),
      para(`This offer is contingent upon you joining on or before <strong>${fmtDate(d.joiningDate)}</strong>
        and submitting the required documents at the time of joining. Please sign and return a copy
        of this letter${d.acceptDays ? ` within <strong>${esc(d.acceptDays)} days</strong>` : ''} as a
        token of your acceptance.`),
      d.terms ? para(esc(d.terms)) : '',
      para(`We look forward to a long and mutually rewarding association with you.`),
    ].join('')),

  APPOINTMENT: (orgName, d) => shell(orgName, d,
    'APPOINTMENT ORDER',
    `Dear ${esc(d.recipientName)},`,
    [
      para(`Further to your acceptance of our offer, we are pleased to appoint you as
        <strong>${esc(d.designation)}</strong>${d.department ? ` in the <strong>${esc(d.department)}</strong> department` : ''}
        of <strong>${esc(orgName)}</strong> with effect from <strong>${fmtDate(d.joiningDate)}</strong>,
        on the following terms:`),
      detailTable([
        ['Designation', esc(d.designation)],
        ['Department', esc(d.department)],
        ['Date of Appointment', fmtDate(d.joiningDate)],
        ['Work Location', esc(d.workLocation)],
        ['Annual CTC', fmtINR(d.annualCtc) + (d.annualCtc ? ' per annum' : '')],
        ['Probation Period', d.probationMonths ? `${esc(d.probationMonths)} months` : ''],
        ['Notice Period', d.noticeDays ? `${esc(d.noticeDays)} days` : ''],
        ['Working Hours', esc(d.workingHours)],
      ]),
      para(`During the probation period your performance will be reviewed, upon satisfactory
        completion of which your services will be confirmed in writing. You will be governed by
        the rules and regulations of the company as amended from time to time.`),
      d.terms ? para(esc(d.terms)) : '',
      para(`Please sign the duplicate copy of this order as a token of your acceptance of the above terms.`),
    ].join('')),

  EXPERIENCE_EMPLOYEE: (orgName, d) => shell(orgName, d,
    'TO WHOMSOEVER IT MAY CONCERN',
    '',
    [
      para(`This is to certify that <strong>${esc(d.recipientName)}</strong> was employed with
        <strong>${esc(orgName)}</strong> as <strong>${esc(d.designation)}</strong>
        from <strong>${fmtDate(d.joinDate)}</strong> to <strong>${fmtDate(d.leavingDate)}</strong>.`),
      d.workSummary ? para(`During this tenure, ${esc(d.recipientName)} was responsible for ${esc(d.workSummary)}.`) : '',
      para(`During the period of employment, we found ${esc(d.pronoun || 'them')} to be
        ${esc(d.conduct || 'sincere, hardworking and professional')}. ${esc(d.recipientName)} bears a good
        moral character and ${esc(d.pronoun || 'their')} conduct was satisfactory.`),
      para(`We wish ${esc(d.pronoun || 'them')} every success in future endeavours.`),
    ].join('')),

  INTERNSHIP_OFFER: (orgName, d) => shell(orgName, d,
    'INTERNSHIP OFFER LETTER',
    `Dear ${esc(d.recipientName)},`,
    [
      para(`We are pleased to offer you an internship at <strong>${esc(orgName)}</strong> as
        <strong>${esc(d.internshipRole)}</strong>. Your internship will commence on
        <strong>${fmtDate(d.startDate)}</strong> and conclude on <strong>${fmtDate(d.endDate)}</strong>.`),
      detailTable([
        ['Internship Role', esc(d.internshipRole)],
        ['Duration', `${fmtDate(d.startDate)} to ${fmtDate(d.endDate)}`],
        ['Location', esc(d.workLocation)],
        ['Stipend', d.stipend ? fmtINR(d.stipend) + ' per month' : 'Unpaid'],
        ['Mentor / Guide', esc(d.mentor)],
        ['College', esc(d.collegeName)],
      ]),
      para(`During the internship you will be expected to abide by the rules of the organisation
        and maintain confidentiality of all proprietary information. On successful completion,
        you will be issued an internship experience certificate.`),
      d.terms ? para(esc(d.terms)) : '',
      para(`We welcome you and wish you a rewarding learning experience.`),
    ].join('')),

  EXPERIENCE_INTERNSHIP: (orgName, d) => shell(orgName, d,
    'INTERNSHIP EXPERIENCE CERTIFICATE',
    '',
    [
      para(`This is to certify that <strong>${esc(d.recipientName)}</strong>${
        d.collegeName ? `, a student of <strong>${esc(d.collegeName)}</strong>${d.course ? ` (${esc(d.course)})` : ''},` : ''}
        has successfully completed an internship at <strong>${esc(orgName)}</strong> as
        <strong>${esc(d.internshipRole)}</strong> from <strong>${fmtDate(d.startDate)}</strong>
        to <strong>${fmtDate(d.endDate)}</strong>.`),
      d.workSummary ? para(`During the internship, ${esc(d.recipientName)} worked on ${esc(d.workSummary)}.`) : '',
      para(`Throughout the internship, we found ${esc(d.pronoun || 'them')} to be
        ${esc(d.conduct || 'dedicated, inquisitive and hardworking')}. ${esc(d.recipientName)}'s
        performance during the internship was ${esc(d.performance || 'commendable')}.`),
      para(`We wish ${esc(d.pronoun || 'them')} the very best in all future endeavours.`),
    ].join('')),
};

export function renderLetter(docType: string, brand: any, formData: any): string {
  const renderer = RENDERERS[docType];
  if (!renderer) throw new Error(`Unknown document type: ${docType}`);
  // Merge org branding: explicit form values win, brand fills the gaps.
  const d = {
    ...formData,
    _brand: brand,
    orgAddress: formData.orgAddress || brand.addressLine || '',
    signatoryName: formData.signatoryName || brand.signatoryName || '',
    signatoryTitle: formData.signatoryTitle || brand.signatoryDesignation || 'Authorised Signatory',
  };
  return renderer(brand.name, d);
}
