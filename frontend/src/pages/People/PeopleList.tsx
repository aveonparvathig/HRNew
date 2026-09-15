import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { peopleAPI } from '../../api/people';
import {
  PageHeader, EmptyState, LoadingBlock, ErrorAlert, StatCard,
} from '../../components/ui';
import PersonFormModal from '../../components/PersonFormModal';
import apiClient from '../../api/client';
import { formatDate, formatINR } from '../../utils/format';
import { useRole } from '../../store/authStore';

// Ambient person state: dot + text, no pill (design system "status language")
const EMP_STATUS_INLINE: Record<string, string> = {
  ACTIVE: 'is-active', PROBATION: 'is-pipeline', NOTICE_PERIOD: 'is-notice',
  RESIGNED: 'is-inactive', TERMINATED: 'is-inactive',
};

export const PEOPLE_STAGE_TONES: Record<string, string> = {
  NEW: 'badge-neutral', SCREENING: 'badge-info', SHORTLISTED: 'badge-teal',
  INTERVIEW: 'badge-violet', SELECTED: 'badge-success', OFFERED: 'badge-warning',
  JOINED: 'badge-success', REJECTED: 'badge-danger', ON_HOLD: 'badge-neutral',
};

export const stageLabel = (stages: any[], value: string) =>
  stages.find(s => s.value === value)?.label || value;

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-2.2 3.1M6.6 6.6A16.7 16.7 0 0 0 2 12s3.5 7 10 7c1.5 0 2.9-.4 4.1-1" /><path d="m3 3 18 18" /></svg>
  );
}

export default function PeopleList() {
  const navigate = useNavigate();
  const { canManagePeople } = useRole();
  const [data, setData] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [showCost, setShowCost] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; kind: string }>({ open: false, kind: 'CANDIDATE' });

  const toggleReveal = (id: string) => setRevealedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const fetchData = useCallback(async () => {
    try {
      const [peopleRes, metaRes] = await Promise.all([
        peopleAPI.getPeople({ q }),
        peopleAPI.getMeta(),
      ]);
      setData(peopleRes.data);
      setMeta(metaRes.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load people');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (person: any) => {
    if (!window.confirm(`Delete ${person.name} and their interview records?`)) return;
    try {
      await peopleAPI.deletePerson(person.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (loading && !data) return <LoadingBlock label="Loading people…" />;

  const employees = data?.employees || [];
  const candidates = data?.candidates || [];
  const interns = data?.interns || [];
  const totalCount = employees.length + candidates.length + interns.length;

  const INACTIVE = new Set(['RESIGNED', 'TERMINATED']);
  const activeEmployees = employees.filter((p: any) => !INACTIVE.has(p.employmentStatus));
  const inactiveEmployees = employees.filter((p: any) => INACTIVE.has(p.employmentStatus));

  const payHeader = canManagePeople ? <th className="num">Package</th> : null;

  const employeeRow = (p: any) => (
    <tr key={p.id}>
      <td>
        <Link to={`/people/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link>
        {(p.department || p.email) && (
          <div className="text-muted" style={{ fontSize: 11.5 }}>
            {[p.department, p.email].filter(Boolean).join(' · ')}
          </div>
        )}
      </td>
      <td className="text-muted">{p.designation || '—'}</td>
      <td className="text-muted">{p.employeeNo || '—'}</td>
      <td className="text-muted">{p.joinDate ? formatDate(p.joinDate) : '—'}</td>
      {canManagePeople && (
        <td className="num">
          {p.currentMonthlyPackage ? (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {revealedIds.has(p.id) ? formatINR(p.currentMonthlyPackage) : '••••••'}
              <button className="eye-btn" title={revealedIds.has(p.id) ? 'Hide package' : 'Show package'}
                onClick={() => toggleReveal(p.id)}>
                <EyeIcon open={revealedIds.has(p.id)} />
              </button>
            </span>
          ) : '—'}
        </td>
      )}
      <td>
        <span className={`status-inline ${EMP_STATUS_INLINE[p.employmentStatus] || 'is-active'}`}>
          <span className="dot" />
          {(p.employmentStatus || 'ACTIVE').replace('_', ' ').toLowerCase()}
        </span>
      </td>
      <td>
        <div className="row-actions">
          <Link to={`/people/${p.id}`} className="btn btn-secondary btn-sm">Open</Link>
          {canManagePeople && (
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>Delete</button>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <>
      <PageHeader
        title="People"
        subtitle="Employees, hiring candidates and internship students."
        actions={canManagePeople && (
          <>
            <button className="btn btn-secondary" onClick={async () => {
              const res = await apiClient.get('/people/export/employees.xlsx', { responseType: 'blob' });
              const url = URL.createObjectURL(new Blob([res.data],
                { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = `employees-all-${new Date().toISOString().slice(0, 10)}.xlsx`;
              a.click();
              URL.revokeObjectURL(url);
            }}>
              ⤓ Export
            </button>
            <button className="btn btn-secondary" onClick={() => setModal({ open: true, kind: 'INTERN' })}>
              + Add Intern
            </button>
            <button className="btn btn-primary" onClick={() => setModal({ open: true, kind: 'CANDIDATE' })}>
              + Add Employee
            </button>
          </>
        )}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {data?.employeeStats && employees.length > 0 && (
        <div className="stat-grid">
          <StatCard label="Active Employees" value={data.employeeStats.active} icon="☰" tone="primary" />
          {canManagePeople && <StatCard label="Monthly Payroll Cost"
            value={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                {showCost ? formatINR(data.employeeStats.monthlyCost) : '••••••'}
                <button className="eye-btn" title={showCost ? 'Hide amount' : 'Show amount'}
                  onClick={() => setShowCost(v => !v)}>
                  <EyeIcon open={showCost} />
                </button>
              </span>
            }
            sub="Sum of current packages" icon="₹" tone="warning" />}
          <StatCard label="PF Enrolled" value={data.employeeStats.pfCount} icon="▤" tone="info" />
          <StatCard label="ESI Covered" value={data.employeeStats.esiCount} icon="✚" tone="success" />
        </div>
      )}

      <div className="toolbar">
        <div className="search-input">
          <input className="input" placeholder="Search by name…" value={q}
            onChange={e => setQ(e.target.value)} />
        </div>
        <span className="toolbar-count">
          {employees.length} employee{employees.length !== 1 ? 's' : ''} · {candidates.length} candidate{candidates.length !== 1 ? 's' : ''} · {interns.length} intern{interns.length !== 1 ? 's' : ''}
        </span>
      </div>

      {totalCount === 0 ? (
        <div className="card">
          <EmptyState icon="☰"
            title={q ? 'No matching people' : 'No people yet'}
            message={q ? 'Try a different search.' : 'Add your first employee or intern.'}
            action={!q && (
              <button className="btn btn-primary" onClick={() => setModal({ open: true, kind: 'CANDIDATE' })}>
                + Add Employee
              </button>
            )} />
        </div>
      ) : (
        <>
          {activeEmployees.length > 0 && (
            <>
              <div className="section-title">Employees ({activeEmployees.length} active)</div>
              <div className="card mb-24">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th><th>Designation</th><th>Code</th>
                        <th>Joined</th>{payHeader}<th>Status</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {activeEmployees.map(employeeRow)}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {inactiveEmployees.length > 0 && (
            <>
              <div className="section-title">Inactive employees ({inactiveEmployees.length})</div>
              <div className="card mb-24" style={{ opacity: 0.85 }}>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th><th>Designation</th><th>Code</th>
                        <th>Joined</th>{payHeader}<th>Status</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {inactiveEmployees.map(employeeRow)}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {candidates.length > 0 && (
            <>
              <div className="section-title">Candidates in hiring ({candidates.length})</div>
              <div className="card mb-24">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th><th>Designation</th><th>Stage</th>
                        <th>Applied for</th><th className="num">Interviews</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((p: any) => (
                        <tr key={p.id}>
                          <td>
                            <Link to={`/people/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link>
                            {p.email && <div className="text-muted" style={{ fontSize: 11.5 }}>{p.email}</div>}
                          </td>
                          <td className="text-muted">{p.designation || '—'}</td>
                          <td>
                            {p.stage
                              ? <span className={`badge ${PEOPLE_STAGE_TONES[p.stage]}`}>
                                  {stageLabel(meta?.stages || [], p.stage)}
                                </span>
                              : <span className="text-muted">—</span>}
                          </td>
                          <td className="text-muted">{p.appliedForTitle || '—'}</td>
                          <td className="num">{p.interviewCount || '—'}</td>
                          <td>
                            <div className="row-actions">
                              <Link to={`/people/${p.id}`} className="btn btn-secondary btn-sm">Open</Link>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {interns.length > 0 && (
            <>
              <div className="section-title">Internship students ({interns.length})</div>
              <div className="card">
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Name</th><th>College</th><th>Course</th>
                        <th>Role</th><th>Period</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {interns.map((p: any) => (
                        <tr key={p.id}>
                          <td><Link to={`/people/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link></td>
                          <td className="text-muted">{p.collegeName || '—'}</td>
                          <td className="text-muted">{p.course || '—'}</td>
                          <td className="text-muted">{p.internshipRole || '—'}</td>
                          <td className="text-muted" style={{ fontSize: 12.5 }}>
                            {p.startDate ? formatDate(p.startDate) : '—'}
                            {p.endDate && <> → {formatDate(p.endDate)}</>}
                          </td>
                          <td>
                            <div className="row-actions">
                              <Link to={`/people/${p.id}`} className="btn btn-secondary btn-sm">Open</Link>
                              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>Delete</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {meta && (
        <PersonFormModal
          open={modal.open}
          onClose={() => setModal({ ...modal, open: false })}
          person={null}
          defaultKind={modal.kind}
          meta={meta}
          onSaved={p => navigate(`/people/${p.id}`)}
        />
      )}
    </>
  );
}
