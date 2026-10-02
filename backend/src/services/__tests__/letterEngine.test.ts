import { describe, it, expect } from 'vitest';
import {
  BUILT_IN_TEMPLATES, LETTER_FIELDS, SAMPLE_DATA, builtInTemplate, fieldsUsed, formFields, renderBody, renderInline,
  renderLetter, templateInput, templateProblems,
} from '../letterEngine';
import { DOC_TYPES, renderLetter as legacyLetter } from './fixtures/legacyLetters';

const brand = {
  name: 'Acme Systems', tagline: '', addressLine: '4, Race Course Road, Coimbatore', phone: '0422 4000000', email: 'hr@acme.test',
  website: '', logoData: '', brandPrimary: '#4f46e5', brandAccent: '#312e81', signatoryName: 'R. Kumar',
  signatoryDesignation: 'Director', signatureData: '', logoPosition: 'LEFT',
};

describe('field substitution', () => {
  it('puts a field where its name is', () => {
    expect(renderInline('Dear {{recipientName}},', { recipientName: 'Asha' })).toBe('Dear Asha,');
    expect(renderInline('{{designation}} in {{department}}', { designation: 'Developer', department: 'Engineering' }))
      .toBe('Developer in Engineering');
  });

  it('writes dates in full and money in rupees', () => {
    expect(renderInline('{{joiningDate}}', { joiningDate: '2026-04-01' })).toBe('1 April 2026');
    expect(renderInline('{{annualCtc}} per annum', { annualCtc: 600000 })).toBe('₹6,00,000 per annum');
    expect(renderInline('{{monthlyPackage}}', { monthlyPackage: '45000' })).toBe('₹45,000');
  });

  it('makes bold what is between ** marks', () => {
    expect(renderInline('the position of **{{designation}}** at **Acme**', { designation: 'Developer' }))
      .toBe('the position of <strong>Developer</strong> at <strong>Acme</strong>');
    expect(renderInline('within **{{acceptDays}} days**', { acceptDays: 7 })).toBe('within <strong>7 days</strong>');
  });
});

describe('a field with no value', () => {
  it('leaves nothing, or a line to write on for a date', () => {
    expect(renderInline('Department: {{department}}.', {})).toBe('Department: .');
    expect(renderInline('from {{joiningDate}}', {})).toBe('from _______________');
    expect(renderInline('{{annualCtc}}', { annualCtc: 0 })).toBe('');
    expect(renderInline('**{{designation}}**', { designation: '  ' })).toBe('');
  });

  it('uses the words given after | instead', () => {
    expect(renderInline('we found {{pronoun|them}} to be {{conduct|sincere and hardworking}}', {}))
      .toBe('we found them to be sincere and hardworking');
    expect(renderInline('we found {{pronoun|them}}', { pronoun: 'her' })).toBe('we found her');
  });

  it('drops a [[ ]] stretch when a field inside it is empty', () => {
    const text = 'as **{{designation}}**[[ in the **{{department}}** department]] of Acme';
    expect(renderInline(text, { designation: 'Developer', department: 'Engineering' }))
      .toBe('as <strong>Developer</strong> in the <strong>Engineering</strong> department of Acme');
    expect(renderInline(text, { designation: 'Developer' })).toBe('as <strong>Developer</strong> of Acme');
    expect(renderInline('[[{{probationMonths}} months]]', { probationMonths: 0 })).toBe('');
    expect(renderInline('[[{{probationMonths}} months]]', { probationMonths: 6 })).toBe('6 months');
  });

  it('uses the words after || in place of a dropped stretch', () => {
    expect(renderInline('[[{{stipend}} per month||Unpaid]]', { stipend: 8000 })).toBe('₹8,000 per month');
    expect(renderInline('[[{{stipend}} per month||Unpaid]]', {})).toBe('Unpaid');
  });

  it('judges a stretch inside another on its own fields', () => {
    const text = '**{{recipientName}}**[[, a student of **{{collegeName}}**[[ ({{course}})]],]] has completed';
    expect(renderInline(text, { recipientName: 'Asha', collegeName: 'PSG', course: 'B.E.' }))
      .toBe('<strong>Asha</strong>, a student of <strong>PSG</strong> (B.E.), has completed');
    expect(renderInline(text, { recipientName: 'Asha', collegeName: 'PSG' })).toBe('<strong>Asha</strong>, a student of <strong>PSG</strong>, has completed');
    expect(renderInline(text, { recipientName: 'Asha', course: 'B.E.' })).toBe('<strong>Asha</strong> has completed');
  });

  it('drops a paragraph left empty and a table row with no value', () => {
    const body = 'First paragraph.\n\n[[{{terms}}]]\n\n| Designation | {{designation}} |\n| Department | {{department}} |\n| Joining | {{joiningDate}} |';
    const html = renderBody(body, { designation: 'Developer' });
    expect((html.match(/<p /g) || []).length).toBe(1);
    expect(html).toContain('>Designation</td>');
    expect(html).not.toContain('Department');
    expect(html).toContain('_______________'); // a date is asked for, so its row stays
    expect(renderBody('| Department | {{department}} |', {})).toBe('');
    expect(renderBody(body, { designation: 'Developer', terms: 'Subject to verification.' })).toContain('Subject to verification.');
  });
});

describe('a template with markup in it', () => {
  it('shows markup typed in the template as text', () => {
    const html = renderBody('Welcome <b>aboard</b> <script>alert(1)</script> & enjoy.', {});
    expect(html).toContain('&lt;b&gt;aboard&lt;/b&gt;');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; enjoy.');
    expect(html).not.toContain('<script');
    expect(renderInline('<img src=x onerror=alert(1)>', {})).toBe('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('shows markup typed into a field as text', () => {
    const html = renderLetter(builtInTemplate('APPOINTMENT')!, brand, {
      recipientName: '<i>Asha</i>', designation: '<script>x</script>', terms: '<a href="javascript:x">click</a>', letterDate: '2026-10-01',
      recipientAddress: '<b>12</b>, Lake Road', refNo: '<u>1</u>',
    });
    expect(html).not.toMatch(/<script|<a |<i>|<b>|<u>/);
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
    expect(html).toContain('&lt;a href="javascript:x"&gt;click&lt;/a&gt;');
  });

  it('keeps the lines of what was typed on several lines', () => {
    expect(renderInline('{{terms}}', { terms: 'One.\nTwo <b>.' })).toBe('One.<br/>Two &lt;b&gt;.');
    expect(renderBody('Line one\nLine two', {})).toContain('Line one<br/>Line two');
  });

  it('cannot reach anything that is not a listed field', () => {
    expect(templateProblems({ subject: '', salutation: '', body: 'Pay {{bankAccountNumber}} to {{constructor}}' }))
      .toEqual(['{{bankAccountNumber}} is not a field that can be used', '{{constructor}} is not a field that can be used']);
    expect(renderInline('{{constructor}}|{{__proto__}}|{{toString}}', {})).not.toMatch(/function|object/);
  });
});

describe('checking a template', () => {
  const ok = { subject: 'OFFER — {{designation}}', salutation: 'Dear {{recipientName}},', body: 'We offer you **{{designation}}**[[ at {{workLocation}}]].' };

  it('accepts what is well formed', () => {
    expect(templateProblems(ok)).toEqual([]);
    for (const t of BUILT_IN_TEMPLATES) expect(templateProblems(t)).toEqual([]);
  });

  it('names what is left open', () => {
    const problem = (body: string) => templateProblems({ ...ok, body });
    expect(problem('Dear {{recipientName')[0]).toMatch(/not closed with }}/);
    expect(problem('a **bold start')[0]).toMatch(/not closed with \*\*/);
    expect(problem('[[ in {{department}}')[0]).toMatch(/not closed with ]]/);
    expect(problem('department]] here')[0]).toMatch(/no \[\[ before it/);
    expect(problem('[[a||b||c]]')[0]).toMatch(/one \|\| at most/);
    expect(problem('{{first name}}')[0]).toMatch(/is not a field/);
    expect(problem('   ')[0]).toMatch(/no text/);
  });

  it('shows a template that cannot be read as it was typed', () => {
    expect(renderInline('a **bold <start>', {})).toBe('a **bold &lt;start&gt;');
  });

  it('lists the fields used, in order, and the form they need', () => {
    expect(fieldsUsed(ok)).toEqual(['designation', 'recipientName', 'workLocation']);
    expect(formFields(ok).map(f => f.key))
      .toEqual(['refNo', 'letterDate', 'recipientAddress', 'designation', 'workLocation', 'signatoryName', 'signatoryTitle']);
    expect(formFields(builtInTemplate('EXPERIENCE_EMPLOYEE')!).map(f => f.key))
      .toEqual(['refNo', 'letterDate', 'recipientAddress', 'designation', 'joinDate', 'leavingDate', 'workSummary', 'pronoun', 'conduct', 'signatoryName', 'signatoryTitle']);
  });

  it('takes a template as typed, tidied, or says what is wrong', () => {
    expect(templateInput({ name: '  Warning   Letter ', audience: 'CANDIDATE', subject: ' WARNING ', salutation: '', body: 'Dear {{recipientName}}\r\nPlease note.' }))
      .toEqual({ name: 'Warning Letter', audience: 'CANDIDATE', subject: 'WARNING', salutation: '', body: 'Dear {{recipientName}}\nPlease note.' });
    expect(templateInput({ name: '', body: 'x' })).toMatch(/name/);
    expect(templateInput({ name: 'X', body: '{{salary}}' })).toMatch(/\{\{salary\}\} is not a field/);
    expect(templateInput({ name: 'X', audience: 'INTERN', body: 'x' })).toMatchObject({ audience: 'INTERN' });
  });

  it('has one definition for each field', () => {
    const keys = LETTER_FIELDS.map(f => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of Object.keys(SAMPLE_DATA)) expect(keys).toContain(key);
  });
});

// The five letters that were fixed in the program must come out the same
// from their starting templates, whatever is and is not filled in.
describe('starting templates against the letters as they were', () => {
  const flat = (html: string) => html.replace(/\s+/g, ' ').replace(/<strong>\s*<\/strong>/g, '').replace(/\s+/g, ' ')
    .replace(/> </g, '><').replace(/ <\/p>/g, '</p>').trim();

  const full = { ...SAMPLE_DATA, letterDate: '2026-10-02', terms: 'Subject to background verification.' };
  const cases: Record<string, any> = {
    'everything filled': full,
    'only the name': { recipientName: 'Asha', letterDate: '2026-10-02' },
    'no department, location, mentor or optional remarks': {
      ...full, department: '', workLocation: '', mentor: '', terms: '', acceptDays: '', probationMonths: '', noticeDays: '',
      workSummary: '', pronoun: '', conduct: '', performance: '', course: '', stipend: '', annualCtc: '', reportingTo: '',
    },
    'no college': { ...full, collegeName: '' },
    'another signatory, no reference': { ...full, refNo: '', signatoryName: 'S. Priya', signatoryTitle: 'HR Manager', recipientAddress: '' },
  };

  for (const code of Object.keys(DOC_TYPES)) {
    for (const [label, data] of Object.entries(cases)) {
      it(`${code}: ${label}`, () => {
        expect(flat(renderLetter(builtInTemplate(code)!, brand, data))).toBe(flat(legacyLetter(code, brand, data)));
      });
    }
  }

  it('keeps the names and audiences of the five', () => {
    for (const [code, type] of Object.entries(DOC_TYPES)) {
      expect(builtInTemplate(code)).toMatchObject({ name: type.label, audience: type.kinds[0] });
    }
    expect(BUILT_IN_TEMPLATES.map(t => t.code)).toEqual(expect.arrayContaining(['CONFIRMATION', 'RELIEVING']));
  });

  it('writes the two new letters', () => {
    const confirmation = renderLetter(builtInTemplate('CONFIRMATION')!, brand, full);
    expect(confirmation).toContain('are confirmed with effect from <strong>1 October 2026</strong>');
    expect(confirmation).toContain('60 days');
    const relieving = renderLetter(builtInTemplate('RELIEVING')!, brand, { ...full, resignationDate: '' });
    expect(relieving).toContain('reference to your resignation from the position of <strong>Software Engineer</strong>');
    expect(relieving).toContain('close of working hours on <strong>30 September 2026</strong>');
  });
});
