import { useState, useEffect, useRef } from 'react';
import { peopleAPI } from '../api/people';
import { Modal, ErrorAlert } from './ui';

interface Props {
  open: boolean;
  onClose: () => void;
  person?: any | null; // null = create
  defaultKind?: string;
  meta: any;
  onSaved: (person: any) => void;
}

const EMPTY = {
  kind: 'CANDIDATE', name: '', title: '', gender: '', email: '', phone: '',
  address: '', notes: '',
  // employment
  employeeNo: '', designation: '', department: '', joinDate: '', leavingDate: '',
  employmentStatus: 'ACTIVE', biometricId: '', agreementSigned: false,
  agreementSignDate: '', currentMonthlyPackage: '', reasonForLeaving: '',
  // personal
  photoData: '', dateOfBirth: '', bloodGroup: '', maritalStatus: '',
  parentSpouseName: '', aadharNo: '',
  // contact
  officialEmail: '', officialNo: '', emergencyNo: '',
  // bank & statutory
  bankName: '', bankAccountNumber: '', ifscCode: '', panNumber: '',
  pfNumber: '', pfUan: '', esiNumber: '', isEsiEligible: false, isPfApplicable: false,
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

// Hoisted so the component type is stable across renders (inputs keep focus)
function F({ form, set, label, k, type = 'text', placeholder = '', options = null, unit = '', span2 = false }: any) {
  return (
    <div className="field" style={span2 ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}</label>
      {options ? (
        <select className="select" value={form[k] || ''} onChange={e => set(k, e.target.value)}>
          <option value="">—</option>
          {options.map((o: any) => typeof o === 'string'
            ? <option key={o} value={o}>{o}</option>
            : <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ) : unit ? (
        <div className="input-unit"><span className="unit">{unit}</span>
          <input className="input" type="number" min={0} step="0.01" placeholder={placeholder || '0'}
            value={form[k] || ''} onChange={e => set(k, e.target.value)} />
        </div>
      ) : (
        <input className="input" type={type} placeholder={placeholder}
          value={form[k] || ''} onChange={e => set(k, e.target.value)} />
      )}
    </div>
  );
}

export default function PersonFormModal({ open, onClose, person, defaultKind, meta, onSaved }: Props) {
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
  const isExit = ['RESIGNED', 'TERMINATED', 'NOTICE_PERIOD'].includes(form.employmentStatus);

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

  return (
    <Modal size="lg" title={isEdit ? `Edit — ${person?.name}` : isIntern ? 'Add Intern' : 'Add Employee'}
      open={open} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <ErrorAlert message={error} />

        <div className="segmented" style={{ marginBottom: 20 }}>
          {meta.kinds.map((k: any) => (
            <button key={k.value} type="button"
              className={form.kind === k.value ? 'active' : ''}
              onClick={() => set('kind', k.value)}>
              {k.value === 'INTERN' ? 'Intern' : 'Employee'}
            </button>
          ))}
        </div>

        {/* 1 — Identity */}
        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">1</span> Identity</div>
          {!isIntern && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', overflow: 'hidden',
                background: 'var(--primary-soft)', display: 'grid', placeItems: 'center',
                fontSize: 24, color: 'var(--primary)', flexShrink: 0,
              }}>
                {form.photoData
                  ? <img src={form.photoData} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : (form.name?.[0]?.toUpperCase() || '☺')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
                  {form.photoData ? 'Change photo' : 'Upload photo'}
                </button>
                {form.photoData && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => set('photoData', '')}>
                    Remove
                  </button>
                )}
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
              </div>
            </div>
          )}
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field" style={{ maxWidth: 110 }}>
              <label>Title</label>
              <select className="select" value={form.title} onChange={e => set('title', e.target.value)}>
                <option value="">—</option>
                <option>Mr.</option><option>Ms.</option><option>Mrs.</option><option>Dr.</option>
              </select>
            </div>
            <div className="field" style={{ gridColumn: 'span 2' }}>
              <label>Full name *</label>
              <input className="input" required autoFocus={!isEdit}
                value={form.name} onChange={e => set('name', e.target.value)} />
            </div>
          </div>
          <div className="form-grid">
            <F {...fp} label="Gender" k="gender" options={['Male', 'Female', 'Other']} />
            {!isIntern && <F {...fp} label="Date of birth" k="dateOfBirth" type="date" />}
            {!isIntern && <F {...fp} label="Blood group" k="bloodGroup" options={meta.bloodGroups || []} />}
            {!isIntern && <F {...fp} label="Marital status" k="maritalStatus" options={meta.maritalStatuses || []} />}
            {!isIntern && <F {...fp} label="Father / spouse name" k="parentSpouseName" />}
            {!isIntern && <F {...fp} label="Aadhaar no." k="aadharNo" placeholder="XXXX XXXX XXXX" />}
          </div>
        </div>

        {/* 2 — Contact */}
        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">2</span> Contact</div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <F {...fp} label="Personal email" k="email" type="email" placeholder="name@email.com" />
            {!isIntern && <F {...fp} label="Official email" k="officialEmail" type="email" placeholder="name@company.com" />}
            <F {...fp} label="Contact no." k="phone" placeholder="+91…" />
            {!isIntern && <F {...fp} label="Official no." k="officialNo" />}
            {!isIntern && <F {...fp} label="Emergency no." k="emergencyNo" />}
          </div>
          <div className="field">
            <label>Address</label>
            <textarea className="input" rows={2} value={form.address}
              onChange={e => set('address', e.target.value)} />
          </div>
        </div>

        {!isIntern ? (
          <>
            {/* 3 — Employment */}
            <div className="form-section">
              <div className="form-section-title"><span className="step-dot">3</span> Employment</div>
              <div className="form-grid" style={{ marginBottom: 14 }}>
                <F {...fp} label="Employee code" k="employeeNo" placeholder="EMP-0001" />
                <F {...fp} label="Designation" k="designation" placeholder="e.g. Software Engineer" />
                <F {...fp} label="Department" k="department" placeholder="e.g. Delivery" />
                <F {...fp} label="Date of joining" k="joinDate" type="date" />
                <F {...fp} label="Employment status" k="employmentStatus" options={meta.employmentStatuses || []} />
                <F {...fp} label="Monthly package" k="currentMonthlyPackage" unit="₹" />
                <F {...fp} label="Biometric ID" k="biometricId" />
                {isExit && <F {...fp} label="Relieving date" k="leavingDate" type="date" />}
              </div>
              {isExit && (
                <div className="field" style={{ marginBottom: 14 }}>
                  <label>Reason for leaving</label>
                  <textarea className="input" rows={2} value={form.reasonForLeaving}
                    onChange={e => set('reasonForLeaving', e.target.value)} />
                </div>
              )}
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center' }}>
                <label className="checkbox-field">
                  <input type="checkbox" checked={form.agreementSigned}
                    onChange={e => set('agreementSigned', e.target.checked)} />
                  Agreement signed
                </label>
                {form.agreementSigned && (
                  <div className="field" style={{ minWidth: 170 }}>
                    <input className="input" type="date" value={form.agreementSignDate || ''}
                      onChange={e => set('agreementSignDate', e.target.value)} />
                  </div>
                )}
              </div>
            </div>

            {/* 4 — Bank & statutory */}
            <div className="form-section">
              <div className="form-section-title"><span className="step-dot">4</span> Bank &amp; statutory</div>
              <div className="form-grid" style={{ marginBottom: 14 }}>
                <F {...fp} label="Bank name" k="bankName" />
                <F {...fp} label="Account number" k="bankAccountNumber" />
                <F {...fp} label="IFSC code" k="ifscCode" />
                <F {...fp} label="PAN number" k="panNumber" />
                <F {...fp} label="PF number" k="pfNumber" />
                <F {...fp} label="PF UAN" k="pfUan" />
                <F {...fp} label="ESI number" k="esiNumber" />
              </div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                <label className="checkbox-field">
                  <input type="checkbox" checked={form.isPfApplicable}
                    onChange={e => set('isPfApplicable', e.target.checked)} />
                  PF applicable
                </label>
                <label className="checkbox-field">
                  <input type="checkbox" checked={form.isEsiEligible}
                    onChange={e => set('isEsiEligible', e.target.checked)} />
                  ESI eligible
                </label>
              </div>
            </div>

            {/* 5 — Pipeline */}
            <div className="form-section">
              <div className="form-section-title"><span className="step-dot">5</span> Recruitment pipeline <span style={{ textTransform: 'none', fontWeight: 500 }}>(optional)</span></div>
              <p className="hint" style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
                Pick a stage to track this person as a hiring candidate instead — they become an
                employee automatically once the stage reaches <strong>Selected</strong>.
              </p>
              <div className="form-grid">
                <div className="field">
                  <label>Stage</label>
                  <select className="select" value={form.stage} onChange={e => set('stage', e.target.value)}>
                    <option value="">Not in pipeline</option>
                    {meta.stages.map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <F {...fp} label="Source" k="source" options={meta.sources} />
                <div className="field">
                  <label>Applied for</label>
                  <select className="select" value={form.appliedForId || ''}
                    onChange={e => set('appliedForId', e.target.value)}>
                    <option value="">—</option>
                    {meta.openOpenings.map((o: any) => (
                      <option key={o.id} value={o.id}>{o.title}</option>
                    ))}
                  </select>
                </div>
                <F {...fp} label="Expected CTC" k="expectedCtc" unit="₹" />
              </div>
            </div>
          </>
        ) : (
          <div className="form-section">
            <div className="form-section-title"><span className="step-dot">3</span> Internship</div>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <F {...fp} label="Roll number" k="rollNumber" />
              <F {...fp} label="Course" k="course" placeholder="e.g. B.E. CSE" />
              <F {...fp} label="Internship role" k="internshipRole" placeholder="e.g. Web Development Intern" />
              <F {...fp} label="College name" k="collegeName" />
              <F {...fp} label="Start date" k="startDate" type="date" />
              <F {...fp} label="End date" k="endDate" type="date" />
            </div>
            <div className="field">
              <label>College address</label>
              <textarea className="input" rows={2} value={form.collegeAddress}
                onChange={e => set('collegeAddress', e.target.value)} />
            </div>
          </div>
        )}

        <div className="form-section">
          <div className="form-section-title"><span className="step-dot">{isIntern ? 4 : 6}</span> Notes <span style={{ textTransform: 'none', fontWeight: 500 }}>(optional)</span></div>
          <div className="field">
            <textarea className="input" rows={2} value={form.notes}
              placeholder="Anything worth remembering"
              onChange={e => set('notes', e.target.value)} />
          </div>
        </div>

        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : isIntern ? 'Add Intern' : 'Add Employee'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

