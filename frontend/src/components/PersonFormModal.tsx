import { useState, useEffect, useRef, useMemo } from 'react';
import { peopleAPI } from '../api/people';
import { Modal, ErrorAlert } from './ui';
import ListSelect from './ListSelect';
import PackageField from './PackageField';
import { SectionedForm, SectionCard, FieldGrid, Field, CheckCard, FormFootBar } from './form';
import { Segmented } from './report';

interface Props {
  open: boolean;
  onClose: () => void;
  person?: any | null; // null = create
  defaultKind?: string;
  meta: any;
  onSaved: (person: any) => void;
  // Designations already in use, offered as suggestions while typing
  existingDesignations?: string[];
}

const RESIDENTIAL_STATUSES = [
  { value: 'RESIDENT', label: 'Resident' },
  { value: 'NON_RESIDENT', label: 'Non-resident' },
  { value: 'NOT_ORDINARILY_RESIDENT', label: 'Not ordinarily resident' },
];
const ACCOUNT_TYPES = [{ value: 'SAVINGS', label: 'Savings' }, { value: 'CURRENT', label: 'Current' }];
const LWF_COVERAGE = [
  { value: 'AUTO', label: 'Follow the work location' },
  { value: 'YES', label: 'Covered' },
  { value: 'NO', label: 'Not covered' },
];
const EXIT_STATUSES = ['RESIGNED', 'TERMINATED', 'NOTICE_PERIOD'];
const INACTIVE_STATUSES = ['RESIGNED', 'TERMINATED'];

const EMPTY = {
  kind: 'CANDIDATE', name: '', title: '', gender: '', email: '', phone: '',
  address: '', notes: '',
  // employment
  employeeNo: '', designation: '', department: '', joinDate: '', leavingDate: '',
  employmentStatus: 'ACTIVE', biometricId: '', agreementSigned: false,
  agreementSignDate: '', currentMonthlyPackage: '', reasonForLeaving: '',
  workLocationId: '',
  grade: '', employmentType: '', probationMonths: '', confirmationDate: '', noticePeriodDays: '', firstHireDate: '', referredBy: '', managerId: '',
  // personal
  photoData: '', dateOfBirth: '', bloodGroup: '', maritalStatus: '',
  parentSpouseName: '', aadharNo: '',
  // personal, fuller (phase 24)
  fatherName: '', spouseName: '', marriageDate: '', nationality: '', placeOfBirth: '',
  residentialStatus: '', religion: '', physicallyChallenged: false, disabilityType: '', isDirector: false,
  permanentAddress: '', emergencyName: '', emergencyRelation: '',
  bankAccountName: '', bankBranch: '', bankAccountType: '',
  pfJoinDate: '', epsMember: false, lwfCovered: 'AUTO',
  // contact
  officialEmail: '', officialNo: '', emergencyNo: '',
  // bank & statutory
  bankName: '', bankAccountNumber: '', ifscCode: '', panNumber: '',
  pfNumber: '', pfUan: '', esiNumber: '', isEsiEligible: false, isPfApplicable: false,
  npsEmployerPercent: '', npsPran: '', taxTreatment: 'SALARY', consultantSection: '194J', consultantTdsPercent: 10,
  // pipeline
  source: '', stage: '', appliedForId: '', expectedCtc: '',
  // intern
  rollNumber: '', course: '', collegeName: '', collegeAddress: '',
  internshipRole: '', startDate: '', endDate: '',
};

// Mirror the original PIL logic: resize to max 512px, JPEG
function resizePhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 512 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

const EMPLOYEE_SECTIONS = [
  { id: 'sec-basics', label: 'Basics' },
  { id: 'sec-employment', label: 'Employment & pay' },
  { id: 'sec-personal', label: 'Personal' },
  { id: 'sec-contact', label: 'Contact' },
  { id: 'sec-statutory', label: 'Bank & statutory' },
  { id: 'sec-exit', label: 'Exit' },
];
const INTERN_SECTIONS = [
  { id: 'sec-basics', label: 'Basics' },
  { id: 'sec-internship', label: 'Internship' },
  { id: 'sec-contact', label: 'Contact' },
  { id: 'sec-notes', label: 'Notes' },
];

// The month an employee joining on this date is first paid for
const firstRunLabel = (joinDate: string) => {
  if (!joinDate) return '';
  const d = new Date(`${joinDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

// Hoisted so the component type is stable across renders (inputs keep focus).
// One field of the form: label above, the control, helper text under.
function F({ form, set, label, k, type = 'text', placeholder = '', options = null, unit = '', full = false, list = '', help = '', required = false, inputMode, autoFocus }: any) {
  const id = `pf-${k}`;
  const value = form[k] ?? '';
  return (
    <Field label={label} htmlFor={id} help={help} full={full} required={required}>
      {list ? (
        <ListSelect listType={list} value={value || ''} onChange={v => set(k, v)} />
      ) : options ? (
        <select id={id} className="select" value={value || ''} onChange={e => set(k, e.target.value)}>
          <option value="">—</option>
          {options.map((o: any) => typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : unit ? (
        <div className="input-unit"><span className="unit">{unit}</span>
          <input id={id} className="input" type="number" min={0} step="0.01" placeholder={placeholder || '0'}
            value={value} onChange={e => set(k, e.target.value)} />
        </div>
      ) : type === 'textarea' ? (
        <textarea id={id} className="input" rows={2} placeholder={placeholder} value={value}
          onChange={e => set(k, e.target.value)} />
      ) : (
        <input id={id} className="input" type={type} placeholder={placeholder} inputMode={inputMode} autoFocus={autoFocus}
          required={required} value={value} onChange={e => set(k, e.target.value)} />
      )}
    </Field>
  );
}

export default function PersonFormModal({ open, onClose, person, defaultKind, meta, onSaved, existingDesignations = [] }: Props) {
  const [form, setForm] = useState<any>(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isEdit = Boolean(person);

  useEffect(() => {
    if (!open) return;
    setError('');
    if (person) {
      setForm(Object.fromEntries(
        Object.keys(EMPTY).map(k => [k, person[k] ?? (typeof (EMPTY as any)[k] === 'boolean' ? false : '')])
      ));
    } else {
      setForm({
        ...EMPTY,
        kind: defaultKind || 'CANDIDATE',
        employeeNo: meta?.nextEmployeeCode || '',
      });
    }
  }, [open, person, defaultKind, meta]);

  const set = (key: string, value: any) => setForm((f: any) => ({ ...f, [key]: value }));
  const isIntern = form.kind === 'INTERN';
  const consultant = form.taxTreatment === 'CONSULTANT';
  const isExit = EXIT_STATUSES.includes(form.employmentStatus);
  const isActive = !INACTIVE_STATUSES.includes(form.employmentStatus);

  // Designations to suggest: the company's list plus whatever is already in use
  const designationOptions = useMemo(() => {
    const seen = new Map<string, string>();
    [...(meta?.lists?.DESIGNATION || []), ...existingDesignations, ...(meta?.managers || []).map((m: any) => m.designation)]
      .filter(Boolean).forEach((d: string) => { const key = d.trim().toLowerCase(); if (key && !seen.has(key)) seen.set(key, d.trim()); });
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [meta, existingDesignations]);

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      set('photoData', await resizePhoto(file));
    } catch {
      setError('Could not read that image');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = isEdit
        ? await peopleAPI.updatePerson(person.id, form)
        : await peopleAPI.createPerson(form);
      onSaved(res.data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save person');
    } finally {
      setSaving(false);
    }
  };

  const fp = { form, set };

  // The foot bar: the name is required to save; the rest is what payroll needs
  const blocking = !String(form.name || '').trim() ? ['Full name'] : [];
  const missing = isIntern
    ? [['internshipRole', 'Internship role'], ['collegeName', 'College name'], ['startDate', 'Start date']]
      .filter(([k]) => !String(form[k] ?? '').trim()).map(([, label]) => label)
    : [['employeeNo', 'Employee code'], ['designation', 'Designation'], ['joinDate', 'Date of joining'], ['currentMonthlyPackage', 'Monthly package']]
      .filter(([k]) => !String(form[k] ?? '').trim() || form[k] === 0).map(([, label]) => label);

  const sections = isIntern ? INTERN_SECTIONS : EMPLOYEE_SECTIONS;
  const saveLabel = saving ? 'Saving…' : isEdit ? 'Save changes' : isIntern ? 'Add intern' : 'Add employee';

  return (
    <Modal size="xl" title={isEdit ? `Edit — ${person?.name}` : isIntern ? 'Add intern' : 'Add employee'}
      open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <ErrorAlert message={error} />

        {!isEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginBottom: 16 }}>
            <Segmented label="Kind of person" value={form.kind}
              options={(meta.kinds || []).map((k: any) => ({ value: k.value, label: k.value === 'INTERN' ? 'Intern' : 'Employee' }))}
              onChange={v => set('kind', v)} />
            <span className="help">
              {isIntern ? 'A student on an internship: college, course and period instead of pay.' : 'Only the first two sections are needed to run payroll. Everything else can be filled later.'}
            </span>
          </div>
        )}

        <SectionedForm sections={sections}
          note={<>Required fields are marked <span className="req">*</span>. Changes are saved only when you press {isEdit ? 'Save changes' : 'Save'}.</>}>

          {/* 1 — Basics */}
          <SectionCard id="sec-basics" title="Basics" description="Who this person is and how they appear on payslips and letters.">
            {!isIntern && (
              <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                <span aria-hidden="true" style={{
                  width: 76, height: 76, borderRadius: 14, overflow: 'hidden', flex: '0 0 76px',
                  background: form.photoData ? 'transparent' : 'var(--surface-2)', border: form.photoData ? 'none' : '1px dashed var(--border-strong)',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 26, fontWeight: 700,
                }}>
                  {form.photoData
                    ? <img src={form.photoData} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : (form.name?.[0]?.toUpperCase() || (
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>
                    ))}
                </span>
                <div className="f" style={{ flex: '1 1 220px' }}>
                  <span className="lbl">Photo</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                      {form.photoData ? 'Change photo' : 'Upload photo'}
                    </button>
                    {form.photoData && (
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('photoData', '')}>Remove</button>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
                  </div>
                  <span className="help">JPG or PNG. Resized to 512 px and shown on the profile and payslip header.</span>
                </div>
              </div>
            )}
            <FieldGrid>
              <div className="f" style={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: 'minmax(90px, 110px) minmax(0, 1fr)', gap: '16px 20px' }}>
                <Field label="Title" htmlFor="pf-title">
                  <select id="pf-title" className="select" value={form.title} onChange={e => set('title', e.target.value)}>
                    <option value="">—</option>
                    <option>Mr.</option><option>Ms.</option><option>Mrs.</option><option>Dr.</option>
                  </select>
                </Field>
                <Field label="Full name" htmlFor="pf-name" required help="As it should print on the payslip.">
                  <input id="pf-name" className="input" required autoFocus={!isEdit}
                    value={form.name} onChange={e => set('name', e.target.value)} />
                </Field>
              </div>
              {!isIntern && (
                <F {...fp} label="Employee code" k="employeeNo" placeholder="EMP-0001"
                  help={isEdit ? 'Must be unique.' : 'The next free code is suggested. Must be unique.'} />
              )}
              {!isIntern && (
                <Field label="Designation" htmlFor="pf-designation" help="Start typing to pick an existing one. Reusing a designation keeps the Employees report groupable.">
                  <input id="pf-designation" className="input" list="pf-designation-list" autoComplete="off"
                    placeholder="e.g. Software Engineer" value={form.designation || ''}
                    onChange={e => set('designation', e.target.value)} />
                  <datalist id="pf-designation-list">
                    {designationOptions.map(d => <option key={d} value={d} />)}
                  </datalist>
                </Field>
              )}
              {!isIntern && <F {...fp} label="Department" k="department" list="DEPARTMENT" />}
              <F {...fp} label="Gender" k="gender" options={['Male', 'Female', 'Other']} />
            </FieldGrid>

            {!isIntern && (
              <details className="pipeline-toggle" open={Boolean(form.stage)}>
                <summary>{form.stage ? 'Tracked as a hiring candidate' : 'Track as a hiring candidate instead (optional)'}</summary>
                <p className="help" style={{ marginBottom: 12 }}>
                  Pick a stage to track this person through hiring. They become an employee automatically once the stage reaches <strong>Selected</strong>.
                </p>
                <FieldGrid>
                  <Field label="Stage" htmlFor="pf-stage">
                    <select id="pf-stage" className="select" value={form.stage} onChange={e => set('stage', e.target.value)}>
                      <option value="">Not in pipeline</option>
                      {meta.stages.map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </Field>
                  <F {...fp} label="Source" k="source" options={meta.sources} />
                  <Field label="Applied for" htmlFor="pf-appliedForId">
                    <select id="pf-appliedForId" className="select" value={form.appliedForId || ''}
                      onChange={e => set('appliedForId', e.target.value)}>
                      <option value="">—</option>
                      {meta.openOpenings.map((o: any) => (
                        <option key={o.id} value={o.id}>{o.title}</option>
                      ))}
                    </select>
                  </Field>
                  <F {...fp} label="Expected CTC" k="expectedCtc" unit="₹" />
                </FieldGrid>
              </details>
            )}
          </SectionCard>

          {!isIntern ? (
            <>
              {/* 2 — Employment & pay */}
              <SectionCard id="sec-employment" title="Employment & pay"
                description="Drives pay days, tenure and the monthly package snapshot in every run.">
                <FieldGrid>
                  <F {...fp} label="Date of joining" k="joinDate" type="date"
                    help={form.joinDate ? `First payroll run that includes them: ${firstRunLabel(form.joinDate)}.` : 'Tenure and the first payroll run are counted from this date.'} />
                  <Field label="Employment status" htmlFor="pf-employmentStatus">
                    <select id="pf-employmentStatus" className="select" value={form.employmentStatus || ''} onChange={e => {
                      const status = e.target.value;
                      // Someone put on probation gets the usual period unless one is typed
                      setForm((f: any) => ({
                        ...f, employmentStatus: status,
                        ...(status === 'PROBATION' && !Number(f.probationMonths) ? { probationMonths: meta.usualProbationMonths || 6 } : {}),
                      }));
                    }}>
                      <option value="">—</option>
                      {(meta.employmentStatuses || []).map((o: any) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </Field>
                  <F {...fp} label="Employment type" k="employmentType" list="EMPLOYMENT_TYPE" />
                  <F {...fp} label="Grade" k="grade" list="GRADE" />
                  <F {...fp} label="Reports to" k="managerId"
                    options={(meta.managers || []).filter((m: any) => m.id !== person?.id)
                      .map((m: any) => ({ value: m.id, label: `${m.name}${m.designation ? ` — ${m.designation}` : ''}` }))} />
                  <F {...fp} label="Work location" k="workLocationId"
                    help="Sets Professional Tax and Labour Welfare Fund."
                    options={(meta.workLocations || []).map((l: any) => ({ value: l.id, label: `${l.name} — ${l.state}` }))} />
                  <Field label="Probation" htmlFor="pf-probationMonths" help="Counted from the date of joining. Confirmation falls due when it ends.">
                    <div className="input-unit"><span className="unit">months</span>
                      <input id="pf-probationMonths" className="input" type="number" min={0} max={36} step={1} placeholder="None"
                        value={form.probationMonths || ''} onChange={e => set('probationMonths', e.target.value)} />
                    </div>
                  </Field>
                  <F {...fp} label="Confirmation date" k="confirmationDate" type="date" />
                  <Field label="Notice period" htmlFor="pf-noticePeriodDays" help="Leave blank to use the company's usual notice period.">
                    <div className="input-unit"><span className="unit">days</span>
                      <input id="pf-noticePeriodDays" className="input" type="number" min={0} max={365} step={1}
                        placeholder={`Company's: ${meta.companyNoticeDays ?? 30}`}
                        value={form.noticePeriodDays ?? ''} onChange={e => set('noticePeriodDays', e.target.value)} />
                    </div>
                  </Field>
                  <F {...fp} label="First hire date" k="firstHireDate" type="date" help="For someone rejoining: their first stint, for gratuity and tenure." />
                  <F {...fp} label="Referred by" k="referredBy" />
                  <F {...fp} label="Biometric ID" k="biometricId" help="Matches attendance swipes to this person." />
                  <div className="f full">
                    <PackageField wide label="Monthly package" value={form.currentMonthlyPackage ?? ''} onChange={v => set('currentMonthlyPackage', v)}
                      context={{ personId: person?.id, isEsiEligible: form.isEsiEligible, isPfApplicable: form.isPfApplicable, designation: form.designation, department: form.department }}
                      hint={person ? 'Each run snapshots this value. Changing it here is a salary revision from this month.' : 'Each run snapshots this value. Change it at increment time.'} />
                  </div>
                </FieldGrid>
                {person?.isEmployee && (
                  <p className="help">
                    Designation, department, grade or work location changed here corrects the employee's current position record.
                    For a promotion or transfer from a date, use Change Position on the employee's page — earlier payslips then keep the old position.
                  </p>
                )}
                <FieldGrid>
                  <CheckCard title="Active" checked={isActive}
                    help={isActive ? 'Included in new payroll runs.' : 'Left out of new payroll runs. Fill in the Exit section.'}
                    onChange={on => set('employmentStatus', on ? 'ACTIVE' : 'RESIGNED')} />
                  <CheckCard title="PF applicable" checked={Boolean(form.isPfApplicable)} disabled={consultant}
                    help={consultant ? 'Not applied to a consultant\'s fee.' : 'Sticky. Not every employee is PF enrolled.'}
                    onChange={on => set('isPfApplicable', on)} />
                  <CheckCard title="ESI eligible" checked={Boolean(form.isEsiEligible)} disabled={consultant}
                    help={consultant ? 'Not applied to a consultant\'s fee.' : 'Sticky. Set once from the gross threshold.'}
                    onChange={on => set('isEsiEligible', on)} />
                  <CheckCard title="Agreement signed" checked={Boolean(form.agreementSigned)}
                    help="Reveals the date of signing." onChange={on => set('agreementSigned', on)} />
                  {form.agreementSigned && (
                    <F {...fp} label="Agreement signed on" k="agreementSignDate" type="date" />
                  )}
                  {!consultant && (
                    <CheckCard title="Existing EPS member" checked={Boolean(form.epsMember)}
                      help="Was a pension-scheme member before 1 Sep 2014." onChange={on => set('epsMember', on)} />
                  )}
                </FieldGrid>
              </SectionCard>

              {/* 3 — Personal */}
              <SectionCard id="sec-personal" title="Personal" description="Optional. Used on letters, returns and the employee profile.">
                <FieldGrid>
                  <F {...fp} label="Date of birth" k="dateOfBirth" type="date" />
                  <F {...fp} label="Blood group" k="bloodGroup" list="BLOOD_GROUP" />
                  <F {...fp} label="Marital status" k="maritalStatus" list="MARITAL_STATUS" />
                  {form.maritalStatus === 'Married' && <F {...fp} label="Marriage date" k="marriageDate" type="date" />}
                  <F {...fp} label="Father's name" k="fatherName" />
                  <F {...fp} label="Spouse's name" k="spouseName" />
                  <F {...fp} label="Aadhaar number" k="aadharNo" placeholder="XXXX XXXX XXXX" inputMode="numeric"
                    help="Stored masked. Only the last four digits show in lists." />
                  <F {...fp} label="Nationality" k="nationality" placeholder="Indian" />
                  <F {...fp} label="Place of birth" k="placeOfBirth" />
                  <F {...fp} label="Residential status" k="residentialStatus" options={RESIDENTIAL_STATUSES} help="For income tax." />
                  <F {...fp} label="Religion" k="religion" />
                </FieldGrid>
                <FieldGrid>
                  <CheckCard title="Director of the company" checked={Boolean(form.isDirector)}
                    help="Reported separately on tax returns." onChange={on => set('isDirector', on)} />
                  <CheckCard title="Physically challenged" checked={Boolean(form.physicallyChallenged)}
                    help="Reveals the nature of disability." onChange={on => set('physicallyChallenged', on)} />
                  {form.physicallyChallenged && (
                    <F {...fp} label="Nature of disability" k="disabilityType" full />
                  )}
                </FieldGrid>
              </SectionCard>
            </>
          ) : (
            /* 2 — Internship */
            <SectionCard id="sec-internship" title="Internship" description="The college, course and the period of the internship.">
              <FieldGrid>
                <F {...fp} label="Internship role" k="internshipRole" placeholder="e.g. Web Development Intern" />
                <F {...fp} label="Roll number" k="rollNumber" />
                <F {...fp} label="Course" k="course" placeholder="e.g. B.E. CSE" />
                <F {...fp} label="College name" k="collegeName" />
                <F {...fp} label="Start date" k="startDate" type="date" />
                <F {...fp} label="End date" k="endDate" type="date" />
                <F {...fp} label="College address" k="collegeAddress" type="textarea" full />
              </FieldGrid>
            </SectionCard>
          )}

          {/* Contact */}
          <SectionCard id="sec-contact" title="Contact" description={isIntern ? undefined : 'Payslips and letters go to the official email where there is one.'}>
            <FieldGrid>
              <F {...fp} label="Personal email" k="email" type="email" placeholder="name@email.com" />
              {!isIntern && <F {...fp} label="Official email" k="officialEmail" type="email" placeholder="name@company.com" />}
              <F {...fp} label="Contact number" k="phone" type="tel" placeholder="+91…" />
              {!isIntern && <F {...fp} label="Official number" k="officialNo" type="tel" />}
              {!isIntern && <F {...fp} label="Emergency contact" k="emergencyName" placeholder="Name" />}
              {!isIntern && <F {...fp} label="Emergency relationship" k="emergencyRelation" placeholder="e.g. Spouse" />}
              {!isIntern && <F {...fp} label="Emergency number" k="emergencyNo" type="tel" />}
              <F {...fp} label={isIntern ? 'Address' : 'Present address'} k="address" type="textarea" full />
              {!isIntern && (
                <Field label="Permanent address" htmlFor="pf-permanentAddress" full
                  right={(
                    <label className="checkbox-field" style={{ fontSize: 12.5, fontWeight: 400 }}>
                      <input type="checkbox" checked={Boolean(form.permanentAddress) && form.permanentAddress === form.address}
                        onChange={e => set('permanentAddress', e.target.checked ? form.address : '')} />
                      Same as present
                    </label>
                  )}>
                  <textarea id="pf-permanentAddress" className="input" rows={2} value={form.permanentAddress}
                    onChange={e => set('permanentAddress', e.target.value)} />
                </Field>
              )}
            </FieldGrid>
          </SectionCard>

          {!isIntern && (
            <>
              {/* 5 — Bank & statutory */}
              <SectionCard id="sec-statutory" title="Bank & statutory" description="Needed for bank transfer files and PF, ESI and tax returns.">
                <FieldGrid>
                  <F {...fp} label="Bank name" k="bankName" list="BANK" />
                  <F {...fp} label="Name as per bank" k="bankAccountName" />
                  <F {...fp} label="Account number" k="bankAccountNumber" inputMode="numeric" />
                  <F {...fp} label="Account type" k="bankAccountType" options={ACCOUNT_TYPES} />
                  <F {...fp} label="Branch" k="bankBranch" />
                  <F {...fp} label="IFSC code" k="ifscCode" placeholder="HDFC0001234" help="11 characters: 4 letters, 0, then 6 characters." />
                  <F {...fp} label="PAN" k="panNumber" placeholder="ABCDE1234F" help="Tax is deducted at the higher rate without one." />
                  <F {...fp} label="PF number" k="pfNumber" />
                  <F {...fp} label="UAN" k="pfUan" inputMode="numeric" />
                  <F {...fp} label="PF join date" k="pfJoinDate" type="date" />
                  <F {...fp} label="ESI number" k="esiNumber" inputMode="numeric" />
                  <F {...fp} label="LWF coverage" k="lwfCovered" options={LWF_COVERAGE} />
                  <F {...fp} label="Paid as" k="taxTreatment" options={meta.taxTreatments || []} />
                  {consultant ? (
                    <>
                      <Field label="Tax deducted under" htmlFor="pf-consultantSection">
                        <select id="pf-consultantSection" className="select" value={form.consultantSection || '194J'}
                          onChange={e => {
                            const section = (meta.consultantSections || []).find((s: any) => s.value === e.target.value);
                            setForm((f: any) => ({ ...f, consultantSection: e.target.value, consultantTdsPercent: section?.defaultPercent ?? f.consultantTdsPercent }));
                          }}>
                          {(meta.consultantSections || []).map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </Field>
                      <F {...fp} label="Tax rate on the fee" k="consultantTdsPercent" unit="%" />
                    </>
                  ) : (
                    <>
                      <F {...fp} label="Employer NPS, % of Basic + DA" k="npsEmployerPercent" unit="%" />
                      <F {...fp} label="NPS number (PRAN)" k="npsPran" placeholder="12 digits" inputMode="numeric" />
                    </>
                  )}
                </FieldGrid>
                {consultant && (
                  <p className="help">
                    A consultant's package is paid as one fee, with tax at this rate on the whole of it (20% without a PAN) and no
                    PF, ESI, Professional Tax or Labour Welfare Fund. The fee is reported for the return on payments other than salary, not on Form 16.
                  </p>
                )}
              </SectionCard>

              {/* 6 — Exit */}
              <SectionCard id="sec-exit" title="Exit"
                description={isExit
                  ? 'The last day and the reason. Payroll stops after the relieving date.'
                  : 'Leave blank while employed. Set the status to Notice period, Resigned or Terminated (or untick Active) when someone leaves.'}>
                <FieldGrid>
                  <F {...fp} label="Relieving date" k="leavingDate" type="date"
                    help={isExit ? 'Stops future payroll runs from this date.' : 'Only used once the status is Notice period, Resigned or Terminated.'} />
                  <F {...fp} label="Reason for leaving" k="reasonForLeaving" list="LEAVING_REASON" />
                  <F {...fp} label="Notes" k="notes" type="textarea" full placeholder="Internal notes. Never printed." />
                </FieldGrid>
              </SectionCard>
            </>
          )}

          {isIntern && (
            <SectionCard id="sec-notes" title="Notes" description="Internal notes. Never printed.">
              <F {...fp} label="Notes" k="notes" type="textarea" full placeholder="Anything worth remembering" />
            </SectionCard>
          )}

          <FormFootBar blocking={blocking} missing={missing}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saveLabel}</button>
          </FormFootBar>
        </SectionedForm>
      </form>
    </Modal>
  );
}
