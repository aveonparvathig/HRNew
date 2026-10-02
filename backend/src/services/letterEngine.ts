// Letters from editable templates. A template is plain text with a small
// set of marks; whatever is typed is treated as text and escaped, so a
// template cannot carry markup or run anything. Pure, DB-independent.
//
//   {{designation}}            a field
//   {{pronoun|them}}           a field, with the words to use when it is empty
//   **bold**                   bold
//   [[ in the {{department}} department]]
//                              dropped when a field inside it is empty
//   [[{{stipend}} per month||Unpaid]]
//                              the same, with words to use instead
//   | Designation | {{designation}} |
//                              a row of a details table; a row with no value is dropped
//   a blank line               a new paragraph

export type FieldType = 'text' | 'date' | 'money' | 'number' | 'textarea' | 'select';
export interface LetterField {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  // Filled by the program, not typed on the letter form
  auto?: boolean;
}

// The only fields a template may use.
export const LETTER_FIELDS: LetterField[] = [
  { key: 'orgName', label: 'Company name', type: 'text', auto: true },
  { key: 'recipientName', label: 'Name', type: 'text', auto: true },
  { key: 'refNo', label: 'Reference no.', type: 'text', placeholder: 'e.g. AVN/HR/2026/041' },
  { key: 'letterDate', label: 'Letter date', type: 'date' },
  { key: 'recipientAddress', label: 'Address', type: 'textarea' },
  { key: 'employeeNo', label: 'Employee code', type: 'text' },
  { key: 'designation', label: 'Designation', type: 'text' },
  { key: 'department', label: 'Department', type: 'text' },
  { key: 'grade', label: 'Grade', type: 'text' },
  { key: 'workLocation', label: 'Work location', type: 'text' },
  { key: 'joiningDate', label: 'Date of joining', type: 'date' },
  { key: 'joinDate', label: 'Employed from', type: 'date' },
  { key: 'leavingDate', label: 'Last working day', type: 'date' },
  { key: 'confirmationDate', label: 'Date of confirmation', type: 'date' },
  { key: 'resignationDate', label: 'Date of resignation', type: 'date' },
  { key: 'annualCtc', label: 'Annual CTC', type: 'money' },
  { key: 'monthlyPackage', label: 'Monthly package', type: 'money' },
  { key: 'reportingTo', label: 'Reporting to', type: 'text' },
  { key: 'probationMonths', label: 'Probation (months)', type: 'number' },
  { key: 'noticeDays', label: 'Notice period (days)', type: 'number' },
  { key: 'acceptDays', label: 'Accept within (days)', type: 'number' },
  { key: 'workingHours', label: 'Working hours', type: 'text', placeholder: 'e.g. 9:30 AM – 6:30 PM' },
  { key: 'pronoun', label: 'Refer to as', type: 'select', options: ['them', 'him', 'her'] },
  { key: 'workSummary', label: 'Work handled', type: 'textarea', placeholder: 'e.g. client implementations and technical support' },
  { key: 'conduct', label: 'Conduct remark', type: 'text' },
  { key: 'performance', label: 'Performance remark', type: 'text' },
  { key: 'internshipRole', label: 'Internship role', type: 'text' },
  { key: 'collegeName', label: 'College', type: 'text' },
  { key: 'course', label: 'Course', type: 'text' },
  { key: 'rollNumber', label: 'Roll number', type: 'text' },
  { key: 'startDate', label: 'Start date', type: 'date' },
  { key: 'endDate', label: 'End date', type: 'date' },
  { key: 'stipend', label: 'Stipend a month', type: 'money' },
  { key: 'mentor', label: 'Mentor / guide', type: 'text' },
  { key: 'terms', label: 'Additional terms', type: 'textarea' },
  { key: 'signatoryName', label: 'Signatory name', type: 'text', placeholder: 'e.g. R. Kumar' },
  { key: 'signatoryTitle', label: 'Signatory title', type: 'text', placeholder: 'e.g. HR Manager' },
];
const FIELD = new Map(LETTER_FIELDS.map(f => [f.key, f]));
export const letterField = (key: string) => FIELD.get(key);

// On every letter form, whatever the template says: the letterhead block
// above the body and the signature under it use them.
const FORM_TOP = ['refNo', 'letterDate', 'recipientAddress'];
const FORM_END = ['signatoryName', 'signatoryTitle'];

export const esc = (v: any) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const BLANK = '_______________';
const longDate = (v: any) => {
  const d = new Date(v);
  return isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};
const rupees = (v: any) => {
  const n = Number(v);
  return !v || isNaN(n) ? '' : '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
};

// ---- Parsing ------------------------------------------------------------------------
type Node =
  | { kind: 'text'; text: string }
  | { kind: 'field'; key: string; fallback: string }
  | { kind: 'bold'; nodes: Node[] }
  | { kind: 'optional'; nodes: Node[]; otherwise: Node[] | null };

class TemplateError extends Error {}

const MARKS = ['{{', '**', '[[', '||', ']]'];

function parseInline(source: string): Node[] {
  let at = 0;
  const seq = (inBold: boolean, inOptional: boolean): Node[] => {
    const nodes: Node[] = [];
    let text = '';
    const flush = () => { if (text) { nodes.push({ kind: 'text', text }); text = ''; } };
    while (at < source.length) {
      const mark = MARKS.find(m => source.startsWith(m, at));
      if (!mark) { text += source[at++]; continue; }
      if (mark === '{{') {
        const end = source.indexOf('}}', at);
        if (end < 0) throw new TemplateError('A field is opened with {{ and not closed with }}');
        const [key, ...rest] = source.slice(at + 2, end).split('|');
        if (!/^[A-Za-z][A-Za-z0-9]*$/.test(key.trim())) throw new TemplateError(`"{{${source.slice(at + 2, end)}}}" is not a field`);
        flush();
        nodes.push({ kind: 'field', key: key.trim(), fallback: rest.join('|').trim() });
        at = end + 2;
      } else if (mark === '**') {
        if (inBold) { flush(); return nodes; } // the caller steps over the closing mark
        at += 2;
        flush();
        const inner = seq(true, false);
        if (!source.startsWith('**', at)) throw new TemplateError('Bold is opened with ** and not closed with **');
        at += 2;
        nodes.push({ kind: 'bold', nodes: inner });
      } else if (mark === '[[') {
        if (inBold) throw new TemplateError('Close the bold (**) before opening [[');
        at += 2;
        flush();
        const inner = seq(false, true);
        let otherwise: Node[] | null = null;
        if (source.startsWith('||', at)) {
          at += 2;
          otherwise = seq(false, true);
          if (source.startsWith('||', at)) throw new TemplateError('[[ … ]] takes one || at most');
        }
        if (!source.startsWith(']]', at)) throw new TemplateError('[[ is not closed with ]]');
        at += 2;
        nodes.push({ kind: 'optional', nodes: inner, otherwise });
      } else {
        // || or ]]
        if (inBold) throw new TemplateError('Close the bold (**) before ' + mark);
        if (inOptional) { flush(); return nodes; }
        if (mark === ']]') throw new TemplateError(']] has no [[ before it');
        text += mark; // a || outside [[ ]] is just text
        at += 2;
      }
    }
    flush();
    return nodes;
  };
  const nodes = seq(false, false);
  if (at < source.length) throw new TemplateError('Bold is closed with ** but was not opened');
  return nodes;
}

const fieldsOf = (nodes: Node[], out: string[] = []): string[] => {
  for (const n of nodes) {
    if (n.kind === 'field') { if (!out.includes(n.key)) out.push(n.key); }
    else if (n.kind === 'bold') fieldsOf(n.nodes, out);
    else if (n.kind === 'optional') { fieldsOf(n.nodes, out); if (n.otherwise) fieldsOf(n.otherwise, out); }
  }
  return out;
};

// ---- Blocks: paragraphs and details tables ----------------------------------------------
const blocksOf = (body: string) =>
  String(body ?? '').replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map(b => b.trim()).filter(Boolean);

const isTable = (block: string) => block.split('\n').every(line => line.trim().startsWith('|'));

// "| Label | value |" → the label and the value. The first | outside
// [[ ]] and {{ }} divides them.
function tableRow(line: string): [string, string] {
  let row = line.trim().slice(1);
  if (row.endsWith('|') && !row.endsWith('||')) row = row.slice(0, -1);
  let depth = 0;
  for (let i = 0; i < row.length; i++) {
    const two = row.slice(i, i + 2);
    if (two === '[[' || two === '{{') { depth++; i++; }
    else if (two === ']]' || two === '}}') { depth = Math.max(0, depth - 1); i++; }
    else if (two === '||') i++;
    else if (row[i] === '|' && depth === 0) return [row.slice(0, i).trim(), row.slice(i + 1).trim()];
  }
  return [row.trim(), ''];
}

const inlineSources = (t: TemplateText): string[] => [
  t.subject || '', t.salutation || '',
  ...blocksOf(t.body).flatMap(block => (isTable(block) ? block.split('\n').flatMap(line => tableRow(line)) : [block])),
];

export interface TemplateText {
  subject: string;
  salutation: string;
  body: string;
}

// What is wrong with a template as typed: marks left open, fields that do
// not exist. An empty list means it can be saved.
export function templateProblems(t: TemplateText): string[] {
  const problems: string[] = [];
  const note = (p: string) => { if (!problems.includes(p)) problems.push(p); };
  if (!String(t.body ?? '').trim()) note('The letter has no text');
  for (const source of inlineSources(t)) {
    try {
      for (const key of fieldsOf(parseInline(source))) {
        if (!FIELD.has(key)) note(`{{${key}}} is not a field that can be used`);
      }
    } catch (err: any) {
      if (!(err instanceof TemplateError)) throw err;
      note(err.message);
    }
  }
  return problems;
}

// The fields a template uses, in the order they first appear.
export function fieldsUsed(t: TemplateText): string[] {
  const out: string[] = [];
  for (const source of inlineSources(t)) {
    try { fieldsOf(parseInline(source), out); } catch { /* reported by templateProblems */ }
  }
  return out;
}

// What the letter form asks for: reference, date and address, then the
// template's own fields as they come in the letter, then the signatory.
export function formFields(t: TemplateText): LetterField[] {
  const used = fieldsUsed(t).filter(k => FIELD.has(k) && !FIELD.get(k)!.auto && !FORM_TOP.includes(k) && !FORM_END.includes(k));
  return [...FORM_TOP, ...used, ...FORM_END].map(k => FIELD.get(k)!);
}

// ---- Rendering ----------------------------------------------------------------------------
type Data = Record<string, any>;

const filled = (key: string, data: Data) => {
  const raw = data[key];
  if (FIELD.get(key)?.type === 'money') return rupees(raw) !== '';
  // A record's zero (no probation, no notice) is nothing to print
  if (raw === 0) return false;
  return String(raw ?? '').trim() !== '';
};

function show(node: { key: string; fallback: string }, data: Data): string {
  if (!filled(node.key, data)) {
    if (node.fallback) return esc(node.fallback);
    return FIELD.get(node.key)?.type === 'date' ? BLANK : '';
  }
  const type = FIELD.get(node.key)?.type;
  const raw = data[node.key];
  if (type === 'date') return longDate(raw);
  if (type === 'money') return rupees(raw);
  // What was typed on several lines stays on several lines
  return esc(String(raw).trim()).replace(/\n/g, '<br/>');
}

// The fields a stretch depends on: its own, not those of a [[ ]] inside it.
const ownFields = (nodes: Node[]): { key: string; fallback: string }[] =>
  nodes.flatMap(n => (n.kind === 'field' ? [n] : n.kind === 'bold' ? ownFields(n.nodes) : []));

function renderNodes(nodes: Node[], data: Data): string {
  return nodes.map(n => {
    if (n.kind === 'text') return esc(n.text);
    if (n.kind === 'field') return show(n, data);
    if (n.kind === 'bold') {
      const inner = renderNodes(n.nodes, data);
      return inner.trim() ? `<strong>${inner}</strong>` : inner;
    }
    const complete = ownFields(n.nodes).every(f => f.fallback || filled(f.key, data));
    return complete ? renderNodes(n.nodes, data) : n.otherwise ? renderNodes(n.otherwise, data) : '';
  }).join('');
}

// One line of template text as HTML. Text that cannot be read as a
// template is shown as it was typed.
export function renderInline(source: string, data: Data): string {
  try {
    return renderNodes(parseInline(String(source ?? '')), data);
  } catch (err) {
    if (!(err instanceof TemplateError)) throw err;
    return esc(source);
  }
}

const paragraph = (html: string) => `<p style="margin:0 0 14px;text-align:justify;">${html}</p>`;

const detailTable = (rows: [string, string][]) => `
<table style="width:100%;border-collapse:collapse;margin:8px 0 18px;font-size:13.5px;">
  ${rows.map(([k, v]) => `
    <tr>
      <td style="border:1px solid #ccc;padding:7px 12px;background:#f4f4fb;width:40%;font-weight:bold;">${k}</td>
      <td style="border:1px solid #ccc;padding:7px 12px;">${v}</td>
    </tr>`).join('')}
</table>`;

// The body: paragraphs and details tables. A paragraph left with nothing
// in it, and a table row with no value, are dropped.
export function renderBody(body: string, data: Data): string {
  return blocksOf(body).map(block => {
    if (isTable(block)) {
      const rows = block.split('\n').map(tableRow)
        .map(([label, value]) => [renderInline(label, data), renderInline(value, data)] as [string, string])
        .filter(([, value]) => value.trim());
      return rows.length ? detailTable(rows) : '';
    }
    const html = block.split('\n').map(line => renderInline(line.trim(), data)).join('<br/>');
    return html.replace(/<br\/>/g, '').trim() ? paragraph(html) : '';
  }).join('');
}

// ---- The letter on the letterhead ----------------------------------------------------------
export interface LetterBrand {
  name: string;
  addressLine?: string;
  phone?: string; email?: string; website?: string;
  logoData?: string; logoPosition?: string;
  brandPrimary?: string; brandAccent?: string;
  signatoryName?: string; signatoryDesignation?: string; signatureData?: string;
}

function sheet(orgName: string, d: any, subject: string, salutation: string, body: string) {
  const b = d._brand || {};
  const primary = b.brandPrimary || '#4f46e5';
  const accent = b.brandAccent || '#312e81';
  const contact = [b.phone, b.email, b.website].filter(Boolean).join(' · ');
  return `
<div style="font-family:'Times New Roman',Times,serif;color:#1a1a2e;font-size:14px;line-height:1.7;">
  <div style="border-bottom:3px solid ${primary};padding-bottom:14px;margin-bottom:8px;display:flex;align-items:center;gap:16px;${
    b.logoPosition === 'CENTER' ? 'flex-direction:column;text-align:center;gap:8px;'
      : b.logoPosition === 'RIGHT' ? 'flex-direction:row-reverse;text-align:right;' : ''}">
    ${b.logoData ? `<img src="${b.logoData}" alt="" style="height:56px;max-width:150px;object-fit:contain;"/>` : ''}
    <div>
      <div style="font-size:26px;font-weight:bold;color:${accent};letter-spacing:0.5px;">${esc(orgName)}</div>
      ${d.orgAddress ? `<div style="font-size:12px;color:#555;margin-top:4px;">${esc(d.orgAddress)}</div>` : ''}
      ${contact ? `<div style="font-size:11.5px;color:#777;margin-top:2px;">${esc(contact)}</div>` : ''}
    </div>
  </div>
  <table style="width:100%;font-size:13px;color:#444;margin:14px 0 26px;"><tr>
    <td>${d.refNo ? `Ref: <strong>${esc(d.refNo)}</strong>` : ''}</td>
    <td style="text-align:right;">Date: <strong>${d.letterDate ? longDate(d.letterDate) : BLANK}</strong></td>
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
      <div style="margin-bottom:${d._signature ? 6 : 52}px;">Yours sincerely,<br/>For <strong>${esc(orgName)}</strong></div>
      ${d._signature ? `<img src="${d._signature}" alt="" style="height:46px;max-width:220px;object-fit:contain;display:block;"/>` : ''}
      <div style="border-top:1px solid #999;display:inline-block;padding-top:6px;min-width:220px;">
        <strong>${esc(d.signatoryName || '')}</strong><br/>
        <span style="font-size:13px;color:#555;">${esc(d.signatoryTitle || 'Authorised Signatory')}</span>
      </div>
    </td>
  </tr></table>
</div>`;
}

// A letter as HTML: the template filled from what was typed on the form,
// on the company letterhead.
export function renderLetter(template: TemplateText, brand: LetterBrand, formData: Data): string {
  // Explicit form values win, the company's details fill the gaps
  const d = {
    ...formData,
    orgName: brand.name,
    _brand: brand,
    orgAddress: formData.orgAddress || brand.addressLine || '',
    signatoryName: formData.signatoryName || brand.signatoryName || '',
    signatoryTitle: formData.signatoryTitle || brand.signatoryDesignation || 'Authorised Signatory',
    // The stored signature is the default signatory's: it is printed only
    // when the letter is signed by them, not by someone named on the letter.
    _signature: brand.signatureData && (!formData.signatoryName || formData.signatoryName === brand.signatoryName)
      ? brand.signatureData : '',
  };
  return sheet(brand.name, d, renderInline(template.subject, d), renderInline(template.salutation, d), renderBody(template.body, d));
}

// ---- The templates every company starts with -------------------------------------------------
export interface BuiltInTemplate extends TemplateText {
  code: string;
  name: string;
  audience: 'CANDIDATE' | 'INTERN';
}

const lines = (...parts: string[]) => parts.join('\n\n');

export const BUILT_IN_TEMPLATES: BuiltInTemplate[] = [
  {
    code: 'EMPLOYMENT_OFFER', name: 'Offer Letter', audience: 'CANDIDATE',
    subject: 'OFFER OF EMPLOYMENT — {{designation}}',
    salutation: 'Dear {{recipientName}},',
    body: lines(
      'With reference to your application and the subsequent interview you attended, we are pleased to offer you the position of **{{designation}}** [[in our **{{department}}** department]] at **{{orgName}}**[[, {{workLocation}}]].',
      [
        '| Designation | {{designation}} |',
        '| Department | {{department}} |',
        '| Date of Joining | {{joiningDate}} |',
        '| Work Location | {{workLocation}} |',
        '| Annual CTC | [[{{annualCtc}} per annum]] |',
        '| Reporting To | {{reportingTo}} |',
        '| Probation Period | [[{{probationMonths}} months]] |',
      ].join('\n'),
      'This offer is contingent upon you joining on or before **{{joiningDate}}** and submitting the required documents at the time of joining. Please sign and return a copy of this letter[[ within **{{acceptDays}} days**]] as a token of your acceptance.',
      '[[{{terms}}]]',
      'We look forward to a long and mutually rewarding association with you.',
    ),
  },
  {
    code: 'APPOINTMENT', name: 'Appointment Order', audience: 'CANDIDATE',
    subject: 'APPOINTMENT ORDER',
    salutation: 'Dear {{recipientName}},',
    body: lines(
      'Further to your acceptance of our offer, we are pleased to appoint you as **{{designation}}**[[ in the **{{department}}** department]] of **{{orgName}}** with effect from **{{joiningDate}}**, on the following terms:',
      [
        '| Designation | {{designation}} |',
        '| Department | {{department}} |',
        '| Date of Appointment | {{joiningDate}} |',
        '| Work Location | {{workLocation}} |',
        '| Annual CTC | [[{{annualCtc}} per annum]] |',
        '| Probation Period | [[{{probationMonths}} months]] |',
        '| Notice Period | [[{{noticeDays}} days]] |',
        '| Working Hours | {{workingHours}} |',
      ].join('\n'),
      'During the probation period your performance will be reviewed, upon satisfactory completion of which your services will be confirmed in writing. You will be governed by the rules and regulations of the company as amended from time to time.',
      '[[{{terms}}]]',
      'Please sign the duplicate copy of this order as a token of your acceptance of the above terms.',
    ),
  },
  {
    code: 'CONFIRMATION', name: 'Confirmation Letter', audience: 'CANDIDATE',
    subject: 'CONFIRMATION OF EMPLOYMENT',
    salutation: 'Dear {{recipientName}},',
    body: lines(
      'We are pleased to inform you that, on satisfactory completion of your probation, your services as **{{designation}}**[[ in the **{{department}}** department]] of **{{orgName}}** are confirmed with effect from **{{confirmationDate}}**.',
      [
        '| Employee Code | {{employeeNo}} |',
        '| Designation | {{designation}} |',
        '| Department | {{department}} |',
        '| Date of Joining | {{joiningDate}} |',
        '| Date of Confirmation | {{confirmationDate}} |',
        '| Notice Period | [[{{noticeDays}} days]] |',
      ].join('\n'),
      'All other terms and conditions of your appointment remain unchanged.',
      '[[{{terms}}]]',
      'We appreciate your contribution and look forward to your continued association with us.',
    ),
  },
  {
    code: 'EXPERIENCE_EMPLOYEE', name: 'Experience Letter', audience: 'CANDIDATE',
    subject: 'TO WHOMSOEVER IT MAY CONCERN',
    salutation: '',
    body: lines(
      'This is to certify that **{{recipientName}}** was employed with **{{orgName}}** as **{{designation}}** from **{{joinDate}}** to **{{leavingDate}}**.',
      '[[During this tenure, {{recipientName}} was responsible for {{workSummary}}.]]',
      'During the period of employment, we found {{pronoun|them}} to be {{conduct|sincere, hardworking and professional}}. {{recipientName}} bears a good moral character and {{pronoun|their}} conduct was satisfactory.',
      'We wish {{pronoun|them}} every success in future endeavours.',
    ),
  },
  {
    code: 'RELIEVING', name: 'Relieving Letter', audience: 'CANDIDATE',
    subject: 'RELIEVING LETTER',
    salutation: 'Dear {{recipientName}},',
    body: lines(
      'This is with reference to your resignation[[ dated **{{resignationDate}}**]] from the position of **{{designation}}**[[ in the **{{department}}** department]]. Your resignation has been accepted and you are relieved from the services of **{{orgName}}** at the close of working hours on **{{leavingDate}}**.',
      [
        '| Employee Code | {{employeeNo}} |',
        '| Designation | {{designation}} |',
        '| Date of Joining | {{joinDate}} |',
        '| Last Working Day | {{leavingDate}} |',
      ].join('\n'),
      'Your final settlement will be processed as per the policy of the company.',
      '[[{{terms}}]]',
      'We thank you for your services and wish you every success in your future endeavours.',
    ),
  },
  {
    code: 'INTERNSHIP_OFFER', name: 'Internship Offer Letter', audience: 'INTERN',
    subject: 'INTERNSHIP OFFER LETTER',
    salutation: 'Dear {{recipientName}},',
    body: lines(
      'With reference to your application[[ through **{{collegeName}}**]], we are pleased to offer you an internship at **{{orgName}}** as **{{internshipRole}}**. Your internship will commence on **{{startDate}}** and conclude on **{{endDate}}**, on the following terms:',
      [
        '| Internship Role | {{internshipRole}} |',
        '| College | {{collegeName}} |',
        '| Course | {{course}} |',
        '| Roll Number | {{rollNumber}} |',
        '| Duration | {{startDate}} to {{endDate}} |',
        '| Location | {{workLocation}} |',
        '| Stipend | [[{{stipend}} per month||Unpaid]] |',
        '| Mentor / Guide | {{mentor}} |',
      ].join('\n'),
      'During the internship you will work on assigned projects and activities under the guidance of your mentor[[, **{{mentor}}**]]. You are expected to abide by the rules and regulations of the organisation, maintain regular attendance, and keep all proprietary and client information strictly confidential.',
      'This internship is a training engagement and does not constitute an offer of employment. On successful completion, you will be issued an internship experience certificate.',
      '[[{{terms}}]]',
      'Please sign and return a copy of this letter as a token of your acceptance. We welcome you to **{{orgName}}** and wish you a rewarding learning experience.',
    ),
  },
  {
    code: 'EXPERIENCE_INTERNSHIP', name: 'Internship Experience Certificate', audience: 'INTERN',
    subject: 'INTERNSHIP EXPERIENCE CERTIFICATE',
    salutation: '',
    body: lines(
      'This is to certify that **{{recipientName}}**[[, a student of **{{collegeName}}**[[ ({{course}})]],]] has successfully completed an internship at **{{orgName}}** as **{{internshipRole}}** from **{{startDate}}** to **{{endDate}}**.',
      '[[During the internship, {{recipientName}} worked on {{workSummary}}.]]',
      'Throughout the internship, we found {{pronoun|them}} to be {{conduct|dedicated, inquisitive and hardworking}}. {{recipientName}}\'s performance during the internship was {{performance|commendable}}.',
      'We wish {{pronoun|them}} the very best in all future endeavours.',
    ),
  },
];

export const builtInTemplate = (code: string) => BUILT_IN_TEMPLATES.find(t => t.code === code);

// A template as typed on the screen, checked. Returns what is wrong, or
// the cleaned template.
export function templateInput(b: any): string | (TemplateText & { name: string; audience: 'CANDIDATE' | 'INTERN' }) {
  const name = String(b?.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return 'Give the letter a name';
  if (name.length > 80) return 'Keep the name under 80 characters';
  const audience = b?.audience === 'INTERN' ? 'INTERN' : 'CANDIDATE';
  const text = {
    subject: String(b?.subject ?? '').trim(), salutation: String(b?.salutation ?? '').trim(),
    body: String(b?.body ?? '').replace(/\r\n?/g, '\n').trim(),
  };
  if (text.subject.length > 200) return 'Keep the subject under 200 characters';
  if (text.body.length > 20000) return 'The letter is too long';
  const problems = templateProblems(text);
  if (problems.length) return problems.join('. ');
  return { name, audience, ...text };
}

// The code of a letter HR adds: made from its name, and not one already taken.
export function templateCode(name: string, taken: string[]): string {
  const base = (name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'LETTER').slice(0, 40);
  let code = base;
  for (let n = 2; taken.includes(code); n++) code = `${base}_${n}`;
  return code;
}

// What is typed on a letter form, kept to the fields there are: text and
// numbers only, nothing endless.
export function cleanFormData(formData: any): Data {
  const out: Data = {};
  for (const f of LETTER_FIELDS) {
    const v = formData?.[f.key];
    if (f.key === 'orgName' || v === undefined || v === null) continue;
    if (typeof v === 'number') { if (isFinite(v)) out[f.key] = v; continue; }
    if (typeof v === 'string') out[f.key] = v.slice(0, 5000);
  }
  return out;
}

// Values that show every part of a template, for a preview with nobody picked.
export const SAMPLE_DATA: Data = {
  recipientName: 'Priya Raman', recipientAddress: '12, Lake View Road\nCoimbatore 641001', refNo: 'HR/2026/041',
  employeeNo: 'EMP-0042', designation: 'Software Engineer', department: 'Engineering', grade: 'L2', workLocation: 'Coimbatore',
  joiningDate: '2026-04-01', joinDate: '2024-04-01', leavingDate: '2026-09-30', confirmationDate: '2026-10-01', resignationDate: '2026-08-31',
  annualCtc: 600000, monthlyPackage: 45000, reportingTo: 'R. Kumar', probationMonths: 6, noticeDays: 60, acceptDays: 7,
  workingHours: '9:30 AM – 6:30 PM', pronoun: 'her', workSummary: 'client implementations and technical support',
  conduct: 'sincere, hardworking and professional', performance: 'commendable', internshipRole: 'Frontend Intern',
  collegeName: 'PSG College of Technology', course: 'B.E. Computer Science', rollNumber: '21CS042', startDate: '2026-06-01',
  endDate: '2026-08-31', stipend: 8000, mentor: 'S. Anand', terms: '',
};
