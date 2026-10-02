import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { peopleAPI } from '../../api/people';
import { useRole } from '../../store/authStore';
import {
  PageHeader, EmptyState, LoadingBlock, ErrorAlert, Modal, BackButton,
} from '../../components/ui';
import PersonFormModal from '../../components/PersonFormModal';
import DocumentModal from '../../components/DocumentModal';
import { formatINR, formatDate } from '../../utils/format';
import { PEOPLE_STAGE_TONES, stageLabel } from './PeopleList';
import { expensesAPI } from '../../api/expenses';
import { payrollAPI } from '../../api/payroll';
import SalaryRevisionsCard from '../../components/SalaryRevisionsCard';
import PersonStructureCard from '../../components/PersonStructureCard';
import PositionHistoryCard from '../../components/PositionHistoryCard';
import EmployeeFilesCard from '../../components/EmployeeFilesCard';
import PersonLoansCard from '../../components/PersonLoansCard';
import PersonTaxCard from '../../components/PersonTaxCard';
import PersonPayCard from '../../components/PersonPayCard';
import { EXPENSE_STATUS_TONES } from '../Expenses/ExpensesList';
import { confirmDialog } from '../../components/feedback';

const DOC_BADGES: Record<string, string> = {
  EMPLOYMENT_OFFER: 'badge-info',
  APPOINTMENT: 'badge-warning',
  INTERNSHIP_OFFER: 'badge-info',
  EXPERIENCE_EMPLOYEE: 'badge-success',
  EXPERIENCE_INTERNSHIP: 'badge-success',
};

const EMPTY_INTERVIEW = {
  roundName: '', scheduledAt: '', interviewer: '', feedback: '',
  rating: null as number | null, result: 'PENDING',
};

const stars = (n: number | null) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '');

const periodLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

function InfoRow({ label, value }: { label: string; value: any }) {
  return (
    <div className="list-row" style={{ padding: '8px 0' }}>
      <span className="text-muted" style={{ fontSize: 12.5 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right' }}>{value || '—'}</span>
    </div>
  );
}

export default function PersonDetail() {
  const { canManagePeople, personId: ownPersonId } = useRole();
  const { personId } = useParams<{ personId: string }>();
  const navigate = useNavigate();
  const [person, setPerson] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editModal, setEditModal] = useState(false);
  const [confirming, setConfirming] = useState(''); // the confirmation date being entered, or ''
  const [docModal, setDocModal] = useState<{ open: boolean; docType: string; docLabel: string }>({ open: false, docType: '', docLabel: '' });
  const [interviewModal, setInterviewModal] = useState(false);
  const [interviewForm, setInterviewForm] = useState<any>(EMPTY_INTERVIEW);
  const [saving, setSaving] = useState(false);
  const [expenseReports, setExpenseReports] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);

  // HR opens a letter on its own page; an employee opens their own under My Documents
  const letterPath = (d: any) => (canManagePeople ? `/people/documents/${d.id}` : `/my/documents/${d.id}`);

  const fetchData = useCallback(async () => {
    try {
      const [personRes, metaRes, expRes, slipRes] = await Promise.all([
        peopleAPI.getPersonDetail(personId!),
        peopleAPI.getMeta(),
        expensesAPI.getReports({ personId: personId! }).catch(() => null),
        payrollAPI.getPersonEntries(personId!).catch(() => null),
      ]);
      setPerson(personRes.data);
      setMeta(metaRes.data);
      setExpenseReports(expRes?.data?.reports || []);
      setPayslips(slipRes?.data?.entries || []);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load person');
    } finally {
      setLoading(false);
    }
  }, [personId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStageChange = async (stage: string) => {
    if (!stage) return;
    try {
      await peopleAPI.updatePersonStage(person.id, stage);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update stage');
    }
  };

  const handleDelete = async () => {
    if (!await confirmDialog(`Delete ${person.name} and their interview records?`)) return;
    try {
      await peopleAPI.deletePerson(person.id);
      navigate('/people');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleAddInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await peopleAPI.addInterview(person.id, interviewForm);
      setInterviewModal(false);
      setInterviewForm(EMPTY_INTERVIEW);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add interview round');
    } finally {
      setSaving(false);
    }
  };

  const handleInterviewResult = async (interview: any, result: string) => {
    try {
      await peopleAPI.updateInterview(interview.id, { result });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update result');
    }
  };

  const handleDeleteInterview = async (interview: any) => {
    if (!await confirmDialog(`Remove "${interview.roundName}"?`)) return;
    try {
      await peopleAPI.deleteInterview(interview.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove round');
    }
  };

  if (loading) return <LoadingBlock label="Loading person…" />;
  if (!person) {
    return <EmptyState icon="☰" title="Person not found"
      action={<Link to="/people" className="btn btn-secondary">Back to People</Link>} />;
  }

  const isIntern = person.kind === 'INTERN';

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/people">People</Link>
        <span>/</span>
        <span>{person.name}</span>
      </div>

      <PageHeader
        title={`${person.title ? person.title + ' ' : ''}${person.name}`}
        subtitle={isIntern
          ? [person.internshipRole, person.collegeName].filter(Boolean).join(' · ') || 'Internship student'
          : [person.designation, person.appliedFor?.title && `Applied: ${person.appliedFor.title}`]
              .filter(Boolean).join(' · ') || (person.isEmployee ? 'Employee' : 'Candidate')}
        actions={
          <>
            <span className={`badge ${isIntern ? 'badge-info' : person.isEmployee ? 'badge-success' : 'badge-neutral'}`}>
              {isIntern ? 'Intern' : person.isEmployee ? <><span className="dot" />Employee</> : 'Candidate'}
            </span>
            {!isIntern && canManagePeople && (
              <select className="select" style={{ width: 150 }}
                value={person.stage || ''}
                onChange={e => handleStageChange(e.target.value)}>
                <option value="">No stage</option>
                {(meta?.stages || []).map((s: any) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            )}
            {canManagePeople && (<>
            <button className="btn btn-secondary" onClick={() => setEditModal(true)}>Edit</button>
            <button className="btn btn-danger" onClick={handleDelete}>Delete</button>
            </>)}
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="grid-2 mb-24">
        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>
            {isIntern ? 'Contact' : 'Personal'}
          </h3>
          {!isIntern && person.photoData && (
            <img src={person.photoData} alt={person.name}
              style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', marginBottom: 10 }} />
          )}
          <InfoRow label="Personal email" value={person.email} />
          {!isIntern && <InfoRow label="Official email" value={person.officialEmail} />}
          <InfoRow label="Contact no." value={person.phone} />
          {!isIntern && <InfoRow label="Official no." value={person.officialNo} />}
          {!isIntern && <InfoRow label="Emergency no." value={person.emergencyNo} />}
          <InfoRow label="Gender" value={person.gender} />
          {!isIntern && <InfoRow label="Date of birth" value={person.dateOfBirth && formatDate(person.dateOfBirth)} />}
          {!isIntern && <InfoRow label="Blood group" value={person.bloodGroup} />}
          {!isIntern && <InfoRow label="Marital status" value={person.maritalStatus} />}
          {!isIntern && <InfoRow label="Father / spouse" value={person.parentSpouseName} />}
          {!isIntern && <InfoRow label="Aadhaar" value={person.aadharNo} />}
          <InfoRow label="Address" value={person.address} />
          {person.notes && <InfoRow label="Notes" value={person.notes} />}
        </div>

        {isIntern ? (
          <div className="card card-pad">
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Internship</h3>
            <InfoRow label="College" value={person.collegeName} />
            <InfoRow label="Course" value={person.course} />
            <InfoRow label="Roll number" value={person.rollNumber} />
            <InfoRow label="Role" value={person.internshipRole} />
            <InfoRow label="Period" value={
              person.startDate
                ? `${formatDate(person.startDate)}${person.endDate ? ' → ' + formatDate(person.endDate) : ''}`
                : ''
            } />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card card-pad">
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Employment</h3>
              <InfoRow label="Employee code" value={person.employeeNo} />
              <InfoRow label="Designation" value={person.designation} />
              <InfoRow label="Department" value={person.department} />
              {person.grade && <InfoRow label="Grade" value={person.grade} />}
              {person.workLocation && (
                <InfoRow label="Work location" value={person.workLocation.name} />
              )}
              <InfoRow label="Date of joining" value={person.joinDate && formatDate(person.joinDate)} />
              <InfoRow label="Status" value={person.employmentStatus && (
                <span className="badge badge-neutral">{person.employmentStatus.replace('_', ' ').toLowerCase()}</span>
              )} />
              <InfoRow label="Monthly package" value={person.currentMonthlyPackage ? formatINR(person.currentMonthlyPackage) : ''} />
              {person.taxTreatment === 'CONSULTANT' && (
                <InfoRow label="Paid as" value={`Consultant — tax at ${person.consultantTdsPercent}% under section ${person.consultantSection}`} />
              )}
              {person.taxTreatment !== 'CONSULTANT' && person.npsEmployerPercent > 0 && (
                <InfoRow label="Employer NPS" value={`${person.npsEmployerPercent}% of Basic + DA${person.npsPran ? ` · PRAN ${person.npsPran}` : ''}`} />
              )}
              <InfoRow label="Employment type" value={person.employmentType} />
              <InfoRow label="Reports to" value={person.manager && (
                <Link to={`/people/${person.manager.id}`}>{person.manager.name}{person.manager.designation ? ` — ${person.manager.designation}` : ''}</Link>
              )} />
              {person.reports?.length > 0 && (
                <InfoRow label={`Team (${person.reports.length})`} value={
                  <span>{person.reports.map((r: any, i: number) => (
                    <span key={r.id}>{i > 0 && ', '}<Link to={`/people/${r.id}`}>{r.name}</Link></span>
                  ))}</span>
                } />
              )}
              {person.probationMonths > 0 && <InfoRow label="Probation" value={`${person.probationMonths} month${person.probationMonths === 1 ? '' : 's'}`} />}
              {(person.confirmationDate || person.confirmation) && (
                <InfoRow label="Confirmation" value={person.confirmationDate ? formatDate(person.confirmationDate) : (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`badge ${person.confirmation.overdue ? 'badge-danger' : 'badge-warning'}`}>
                      {person.confirmation.overdue ? 'Overdue since' : 'Due'} {formatDate(person.confirmation.dueOn)}
                    </span>
                    {canManagePeople && (
                      <button className="btn btn-primary btn-sm" onClick={() => setConfirming(new Date().toISOString().slice(0, 10))}>Confirm</button>
                    )}
                  </span>
                )} />
              )}
              {canManagePeople && person.isEmployee && (
                <InfoRow label="Notice period" value={person.noticePeriodDays != null
                  ? `${person.noticePeriodDays} days` : `${person.companyNoticeDays ?? 30} days (company's usual)`} />
              )}
              {person.firstHireDate && <InfoRow label="First hire date" value={formatDate(person.firstHireDate)} />}
              <InfoRow label="Referred by" value={person.referredBy} />
              <InfoRow label="Biometric ID" value={person.biometricId} />
              <InfoRow label="Agreement" value={person.agreementSigned
                ? `Signed${person.agreementSignDate ? ' · ' + formatDate(person.agreementSignDate) : ''}`
                : ''} />
              {person.leavingDate && <InfoRow label="Relieving date" value={formatDate(person.leavingDate)} />}
              {person.reasonForLeaving && <InfoRow label="Reason for leaving" value={person.reasonForLeaving} />}
            </div>
            <div className="card card-pad">
              <h3 style={{ fontSize: 15, marginBottom: 8 }}>Bank &amp; statutory</h3>
              <InfoRow label="Bank" value={person.bankName} />
              <InfoRow label="Account no." value={person.bankAccountNumber} />
              <InfoRow label="IFSC" value={person.ifscCode} />
              <InfoRow label="PAN" value={person.panNumber} />
              <InfoRow label="PF no." value={person.pfNumber} />
              <InfoRow label="PF UAN" value={person.pfUan} />
              <InfoRow label="ESI no." value={person.esiNumber} />
              <InfoRow label="PF applicable" value={person.isPfApplicable ? 'Yes' : 'No'} />
              <InfoRow label="ESI eligible" value={person.isEsiEligible ? 'Yes' : 'No'} />
            </div>
            {person.stage && (
              <div className="card card-pad">
                <h3 style={{ fontSize: 15, marginBottom: 8 }}>Pipeline</h3>
                <InfoRow label="Stage" value={
                  <span className={`badge ${PEOPLE_STAGE_TONES[person.stage]}`}>
                    {stageLabel(meta?.stages || [], person.stage)}
                  </span>
                } />
                <InfoRow label="Source" value={
                  (meta?.sources || []).find((s: any) => s.value === person.source)?.label
                } />
                <InfoRow label="Applied for" value={person.appliedFor?.title} />
                <InfoRow label="Expected CTC" value={person.expectedCtc && formatINR(person.expectedCtc)} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Letters written from the templates */}
      <div className="card mb-24">
        <div className="card-header">
          <h3>Letters ({(person.documents || []).length})</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canManagePeople && (meta?.docTypes || [])
              .filter((t: any) => t.kinds.includes(person.kind))
              .map((t: any) => (
                <button key={t.value} className="btn btn-secondary btn-sm"
                  onClick={() => setDocModal({ open: true, docType: t.value, docLabel: t.label })}>
                  ✎ {t.label}
                </button>
              ))}
          </div>
        </div>
        {(person.documents || []).length === 0 ? (
          <EmptyState icon="▤" title="No letters issued yet"
            message={canManagePeople ? 'Generate an offer letter, appointment order or experience certificate — it stays on the record.' : 'Letters HR shares with you appear here.'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Letter</th><th>Type</th><th>Issued</th>{canManagePeople && <th>Employee sees it</th>}<th /></tr>
              </thead>
              <tbody>
                {person.documents.map((d: any) => (
                  <tr key={d.id}>
                    <td>
                      <Link to={letterPath(d)} style={{ fontWeight: 600 }}>{d.title}</Link>
                    </td>
                    <td>
                      <span className={`badge ${DOC_BADGES[d.docType] || 'badge-neutral'}`}>
                        {(meta?.docTypes || []).find((t: any) => t.value === d.docType)?.label || d.title.split(' — ')[0]}
                      </span>
                    </td>
                    <td className="text-muted">{formatDate(d.createdAt)}</td>
                    {canManagePeople && (
                      <td>
                        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                          <input type="checkbox" checked={Boolean(d.visibleToEmployee)} aria-label={`Show ${d.title} to the employee`}
                            onChange={async () => {
                              try {
                                await peopleAPI.updateDocument(d.id, { visibleToEmployee: !d.visibleToEmployee });
                                fetchData();
                              } catch (err: any) {
                                setError(err.response?.data?.error || 'Could not change it');
                              }
                            }} />
                          {d.visibleToEmployee ? 'Yes' : 'No'}
                        </label>
                      </td>
                    )}
                    <td>
                      <div className="row-actions">
                        <Link to={letterPath(d)} className="btn btn-secondary btn-sm">View</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {canManagePeople && <EmployeeFilesCard person={person} />}

      {/* Expense reports */}
      {expenseReports.length > 0 && (
        <div className="card mb-24">
          <div className="card-header">
            <h3>Expense reports ({expenseReports.length})</h3>
            <Link to="/expenses" className="btn btn-secondary btn-sm">All expenses →</Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Report</th><th>Period</th><th className="num">Lines</th><th className="num">Total</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {expenseReports.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/expenses/${r.id}`} style={{ fontWeight: 600 }}>{r.title}</Link>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>{r.reportNumber}</div>
                    </td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>
                      {r.periodStart ? `${formatDate(r.periodStart)} – ${r.periodEnd ? formatDate(r.periodEnd) : '…'}` : '—'}
                    </td>
                    <td className="num">{r.lineCount}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(r.total)}</td>
                    <td>
                      <span className={`badge ${EXPENSE_STATUS_TONES[r.status] || 'badge-neutral'}`}>
                        {r.status.toLowerCase()}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/expenses/${r.id}`} className="btn btn-secondary btn-sm">Open</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!isIntern && person.isEmployee && (canManagePeople || ownPersonId === person.id) && (
        <PositionHistoryCard person={person} meta={meta} canManage={canManagePeople} onChanged={fetchData} />
      )}
      {!isIntern && canManagePeople && person.isEmployee && (
        <SalaryRevisionsCard person={person} onChanged={fetchData} />
      )}
      {!isIntern && canManagePeople && person.isEmployee && <PersonStructureCard person={person} onChanged={fetchData} />}
      {!isIntern && canManagePeople && person.isEmployee && <PersonTaxCard person={person} />}
      {!isIntern && canManagePeople && person.isEmployee && <PersonLoansCard person={person} />}
      {!isIntern && canManagePeople && person.isEmployee && <PersonPayCard person={person} />}

      {/* Payslip history */}
      {payslips.length > 0 && (
        <div className="card mb-24">
          <div className="card-header">
            <h3>Payslip history ({payslips.length})</h3>
            <Link to="/payroll" className="btn btn-secondary btn-sm">Payroll →</Link>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th><th className="num">Pay Days</th><th className="num">Gross</th>
                  <th className="num">Deductions</th><th className="num">Net Pay</th><th>Run</th><th />
                </tr>
              </thead>
              <tbody>
                {payslips.map((p: any) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{periodLabel(p.period)}</td>
                    <td className="num">{p.payDays}/{p.totalWorkingDays}</td>
                    <td className="num">{formatINR(p.grossSalary)}</td>
                    <td className="num text-muted">{formatINR(p.totalDeductions)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(p.netPayable)}</td>
                    <td>
                      <span className={`badge ${p.runStatus === 'FINALIZED' ? 'badge-success' : 'badge-neutral'}`}>
                        {p.runStatus === 'FINALIZED' ? 'finalized' : 'draft'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/payroll/payslips/${p.id}`} className="btn btn-secondary btn-sm">Payslip</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Interview rounds */}
      <div className="card">
        <div className="card-header">
          <h3>Interview rounds ({person.interviews.length})</h3>
          {canManagePeople && (<button className="btn btn-primary btn-sm" onClick={() => { setInterviewForm(EMPTY_INTERVIEW); setInterviewModal(true); }}>+ Add Round</button>)}
        </div>
        {person.interviews.length === 0 ? (
          <EmptyState icon="◔" title="No interview rounds yet"
            message="Track each round's interviewer, rating and result here." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Round</th><th>Scheduled</th><th>Interviewer</th>
                  <th>Rating</th><th>Feedback</th><th>Result</th><th />
                </tr>
              </thead>
              <tbody>
                {person.interviews.map((iv: any) => (
                  <tr key={iv.id}>
                    <td style={{ fontWeight: 600 }}>{iv.roundName}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>
                      {iv.scheduledAt ? iv.scheduledAt.replace('T', ' ') : '—'}
                    </td>
                    <td className="text-muted">{iv.interviewer || '—'}</td>
                    <td><span className="stars" style={{ color: '#f59e0b', fontSize: 12 }}>{stars(iv.rating) || '—'}</span></td>
                    <td className="text-muted" style={{ fontSize: 12.5, maxWidth: 220 }}>{iv.feedback || '—'}</td>
                    <td>
                      <select className="select" style={{ width: 110, padding: '4px 8px', fontSize: 12 }}
                        value={iv.result}
                        onChange={e => handleInterviewResult(iv, e.target.value)}>
                        {(meta?.interviewResults || []).map((r: any) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-danger btn-sm" onClick={() => handleDeleteInterview(iv)}>✕</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title={`Confirm ${person.name}`} open={Boolean(confirming)} onClose={() => setConfirming('')}>
        <form onSubmit={async e => {
          e.preventDefault();
          try {
            await peopleAPI.confirmEmployee(person.id, confirming);
            setConfirming('');
            setError('');
            fetchData();
          } catch (err: any) {
            setError(err.response?.data?.error || 'Could not confirm the employee');
            setConfirming('');
          }
        }}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Confirmed from *</label>
            <input className="input" type="date" required value={confirming} min={person.joinDate || undefined}
              onChange={e => setConfirming(e.target.value)} />
            <span className="hint">
              Probation ends{person.confirmation ? ` on ${formatDate(person.confirmation.dueOn)}` : ''}. Confirming records the date
              {person.employmentStatus === 'PROBATION' ? ' and moves the status from Probation to Active.' : '.'}
            </span>
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setConfirming('')}>Cancel</button>
            <button type="submit" className="btn btn-primary">Confirm</button>
          </div>
        </form>
      </Modal>

      {meta && (
        <PersonFormModal
          open={editModal}
          onClose={() => setEditModal(false)}
          person={person}
          meta={meta}
          onSaved={() => fetchData()}
        />
      )}

      <DocumentModal
        open={docModal.open}
        onClose={() => { setDocModal({ ...docModal, open: false }); fetchData(); }}
        personId={person.id}
        personName={person.name}
        docType={docModal.docType}
        docLabel={docModal.docLabel}
      />

      {/* Add interview round */}
      <Modal title={`Add Interview Round — ${person.name}`} open={interviewModal}
        onClose={() => setInterviewModal(false)}>
        <form onSubmit={handleAddInterview}>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Round name *</label>
              <input className="input" required autoFocus placeholder="e.g. Technical Round 1"
                value={interviewForm.roundName}
                onChange={e => setInterviewForm({ ...interviewForm, roundName: e.target.value })} />
            </div>
            <div className="field">
              <label>Scheduled at</label>
              <input className="input" type="datetime-local" value={interviewForm.scheduledAt}
                onChange={e => setInterviewForm({ ...interviewForm, scheduledAt: e.target.value })} />
            </div>
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Interviewer</label>
              <input className="input" value={interviewForm.interviewer}
                onChange={e => setInterviewForm({ ...interviewForm, interviewer: e.target.value })} />
            </div>
            <div className="field">
              <label>Result</label>
              <select className="select" value={interviewForm.result}
                onChange={e => setInterviewForm({ ...interviewForm, result: e.target.value })}>
                {(meta?.interviewResults || []).map((r: any) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Rating</label>
            <div className="star-input">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button"
                  className={interviewForm.rating && n <= interviewForm.rating ? 'lit' : ''}
                  onClick={() => setInterviewForm({
                    ...interviewForm,
                    rating: interviewForm.rating === n ? null : n,
                  })}>
                  ★
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>Feedback</label>
            <textarea className="input" rows={3} placeholder="Interview notes and outcome"
              value={interviewForm.feedback}
              onChange={e => setInterviewForm({ ...interviewForm, feedback: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setInterviewModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Adding…' : 'Add Round'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
