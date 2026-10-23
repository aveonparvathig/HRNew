import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { peopleAPI } from '../../api/people';
import {
  PageHeader, EmptyState, LoadingBlock, ErrorAlert,
} from '../../components/ui';
import {
  KpiGrid, KpiTile, SortChip, ChipRow, Segmented, TableCard, SortableTh, GroupRow, YesNoPill, KitIcon,
} from '../../components/report';
import PersonFormModal from '../../components/PersonFormModal';
import apiClient from '../../api/client';
import { formatDate, formatINR } from '../../utils/format';
import { useRole } from '../../store/authStore';
import { confirmDialog } from '../../components/feedback';
import {
  EMPLOYEE_SORTS, type EmployeeSort, type EmployeeStatusFilter,
  filterByStatus, orderEmployees, groupByDesignation, tenureLabel, employeeKpis, initialsOf, isActiveEmployee,
} from '../../utils/employeeOrder';

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

// Records with something missing, as the dashboard counts them
const MISSING: Record<string, { label: string; test: (p: any) => boolean }> = {
  pan: { label: 'no PAN', test: p => !String(p.panNumber || '').trim() },
  bank: { label: 'no bank account', test: p => !String(p.bankAccountNumber || '').trim() },
  location: { label: 'no work location', test: p => !p.workLocationId },
  joinDate: { label: 'no joining date', test: p => !p.joinDate },
};

export const stageLabel = (stages: any[], value: string) =>
  stages.find(s => s.value === value)?.label || value;

const SORT_VALUES = new Set(EMPLOYEE_SORTS.map(s => s.value));
const STATUS_VALUES = new Set(['active', 'inactive', 'all']);
const REVEAL_MS = 10_000;

export default function PeopleList() {
  const navigate = useNavigate();
  const { canManagePeople } = useRole();
  const [params, setParams] = useSearchParams();
  const missing = canManagePeople ? MISSING[params.get('missing') || ''] : undefined;
  const [data, setData] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<{ open: boolean; kind: string }>({ open: false, kind: 'CANDIDATE' });

  // The order, grouping and status filter live in the address, so a view
  // can be shared and survives a refresh
  const sortParam = params.get('sort') || '';
  const sort: EmployeeSort = SORT_VALUES.has(sortParam as EmployeeSort) ? (sortParam as EmployeeSort) : 'doj_desc';
  const grouped = params.get('group') === 'designation';
  const statusParam = params.get('status') || '';
  const status: EmployeeStatusFilter = missing ? 'active' : STATUS_VALUES.has(statusParam) ? (statusParam as EmployeeStatusFilter) : 'active';
  const setView = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => { if (v) next.set(k, v); else next.delete(k); });
    setParams(next, { replace: true });
  };

  // A package is shown for ten seconds after it is clicked, then masked again
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const timers = useRef<Record<string, number>>({});
  const toggleReveal = (id: string) => {
    window.clearTimeout(timers.current[id]);
    setRevealedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        timers.current[id] = window.setTimeout(() => setRevealedIds(p => { const n = new Set(p); n.delete(id); return n; }), REVEAL_MS);
      }
      return next;
    });
  };
  useEffect(() => () => { Object.values(timers.current).forEach(t => window.clearTimeout(t)); }, []);

  const fetchData = useCallback(async () => {
    try {
      const [peopleRes, metaRes] = await Promise.all([
        peopleAPI.getPeople(),
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
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Probations ending soon or already past, for HR
  const [confirmations, setConfirmations] = useState<any>(null);
  useEffect(() => {
    if (!canManagePeople) return;
    peopleAPI.getConfirmations().then(res => setConfirmations(res.data)).catch(() => { /* the list still works */ });
  }, [canManagePeople, data]);

  const handleDelete = async (person: any) => {
    if (!await confirmDialog(`Delete ${person.name} and their interview records?`)) return;
    try {
      await peopleAPI.deletePerson(person.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  // ---- What is shown: search, status, order, grouping (all on the client) ----
  const needle = q.trim().toLowerCase();
  const allEmployees: any[] = useMemo(() => data?.employees || [], [data]);
  const matches = (p: any, fields: string[]) =>
    !needle || fields.some(f => String(p[f] || '').toLowerCase().includes(needle));

  // Filtered to incomplete records, only current employees are listed
  const employees = useMemo(() => {
    const base = allEmployees.filter(p => !missing || (missing.test(p) && isActiveEmployee(p)));
    return filterByStatus(base, status).filter(p => matches(p, ['name', 'employeeNo', 'designation', 'department', 'email']));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allEmployees, missing, status, needle]);
  const ordered = useMemo(() => orderEmployees(employees, sort), [employees, sort]);
  const rows = useMemo(() => (grouped
    ? groupByDesignation(ordered, p => p.id)
    : ordered.map(p => ({ kind: 'row' as const, key: p.id, row: p }))), [ordered, grouped]);

  const candidates: any[] = missing ? [] : (data?.candidates || []).filter((p: any) => matches(p, ['name', 'email', 'designation']));
  const interns: any[] = missing ? [] : (data?.interns || []).filter((p: any) => matches(p, ['name', 'collegeName', 'course', 'internshipRole']));
  const kpis = useMemo(() => employeeKpis(allEmployees), [allEmployees]);
  const activeCount = allEmployees.filter(isActiveEmployee).length;
  const today = useMemo(() => new Date(), []);

  if (loading && !data) return <LoadingBlock label="Loading people…" />;

  const totalCount = employees.length + candidates.length + interns.length;
  const sortMeta = EMPLOYEE_SORTS.find(s => s.value === sort)!;
  const colCount = 8 + (canManagePeople ? 2 : 0);

  const openAdd = (kind: string) => setModal({ open: true, kind });

  return (
    <>
      <PageHeader
        title="People"
        badge={<span className="count-pill">{employees.length} shown</span>}
        subtitle="The payroll master. Every active employee is picked up by the next run; candidates and interns are listed below."
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
              {KitIcon.download} Export Excel
            </button>
            <button className="btn btn-secondary" onClick={() => openAdd('INTERN')}>
              {KitIcon.plus} Add Intern
            </button>
            <button className="btn btn-primary" onClick={() => openAdd('CANDIDATE')}>
              {KitIcon.plus} Add Employee
            </button>
          </>
        )}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {confirmations && confirmations.due.length > 0 && (
        <div className={`alert ${confirmations.overdue ? 'alert-warning' : 'alert-success'}`} style={{ alignItems: 'flex-start' }}>
          <span>◷</span>
          <span>
            <strong>
              {confirmations.due.length} confirmation{confirmations.due.length === 1 ? '' : 's'} due
              {confirmations.overdue ? ` (${confirmations.overdue} overdue)` : ` in the next ${confirmations.days} days`}:
            </strong>{' '}
            {confirmations.due.map((p: any, i: number) => (
              <span key={p.id}>
                {i > 0 && ', '}
                <Link to={`/people/${p.id}`}>{p.name}</Link> <span className="text-muted">({formatDate(p.dueOn)})</span>
              </span>
            ))}
          </span>
        </div>
      )}

      {missing && (
        <div className="alert alert-warning">
          <span>⚑</span>
          <span>
            <strong>{employees.length} employee{employees.length === 1 ? '' : 's'} with {missing.label}.</strong>{' '}
            Open each one to complete the record.{' '}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParams({})}>Show everyone</button>
          </span>
        </div>
      )}

      {allEmployees.length > 0 && !missing && (
        <KpiGrid columns={canManagePeople && data?.employeeStats?.monthlyCost != null ? 5 : 4}>
          <KpiTile label="Active employees" value={kpis.active} sub={`${kpis.inactive} inactive on file`} />
          <KpiTile label="Joined this financial year" value={kpis.joinedThisFY}
            sub={`Since 1 Apr ${today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1}`} />
          <KpiTile label="Designations" value={kpis.designations}
            sub={`Across ${kpis.departments} department${kpis.departments === 1 ? '' : 's'}`} />
          <KpiTile label="ESI · PF enrolled" value={`${kpis.esi} · ${kpis.pf}`} sub={`of ${kpis.active} active`} />
          {canManagePeople && data?.employeeStats?.monthlyCost != null && (
            <KpiTile label="Monthly payroll cost"
              value={<MaskedAmount amount={data.employeeStats.monthlyCost} revealed={revealedIds.has('__cost__')} onToggle={() => toggleReveal('__cost__')} />}
              sub="Sum of current packages" />
          )}
        </KpiGrid>
      )}

      {totalCount === 0 && !needle && !missing && allEmployees.length === 0 ? (
        <div className="card">
          <EmptyState icon="☰"
            title="No people yet"
            message="Add your first employee or intern."
            action={canManagePeople && (
              <button className="btn btn-primary" onClick={() => openAdd('CANDIDATE')}>
                {KitIcon.plus} Add Employee
              </button>
            )} />
        </div>
      ) : (
        <>
          <TableCard
            toolbar={
              <>
                <div className="report-search">
                  {KitIcon.search}
                  <input className="input" type="search" placeholder="Search name, code or designation" value={q}
                    onChange={e => setQ(e.target.value)} aria-label="Search people" />
                </div>
                {!missing && (
                  <Segmented label="Status" value={status}
                    options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'all', label: 'All' }]}
                    onChange={v => setView({ status: v === 'active' ? null : v })} />
                )}
                <span className="spacer" />
                <ChipRow label="Sort">
                  {EMPLOYEE_SORTS.filter(s => s.value !== 'name').map(s => (
                    <SortChip key={s.value} active={sort === s.value} onClick={() => setView({ sort: s.value === 'doj_desc' ? null : s.value })}>
                      {s.label}
                    </SortChip>
                  ))}
                  <SortChip active={grouped} icon={KitIcon.group} onClick={() => setView({ group: grouped ? null : 'designation' })}>
                    Group by designation
                  </SortChip>
                </ChipRow>
              </>
            }
            footer={
              <>
                <span>
                  Showing {employees.length} of {allEmployees.length} employee{allEmployees.length === 1 ? '' : 's'} · sorted by {sortMeta.description}
                  {grouped ? ', grouped by designation' : ''}
                </span>
                {canManagePeople && <span>Monthly package is masked. Click a value to reveal it for 10 seconds.</span>}
              </>
            }>
            <table className="table">
              <thead>
                <tr>
                  <SortableTh active={sort === 'name'} direction="asc" width="26%" onClick={() => setView({ sort: 'name' })}>Employee</SortableTh>
                  <SortableTh active={sort === 'desig'} direction="asc" onClick={() => setView({ sort: 'desig' })}>Designation</SortableTh>
                  <th>Department</th>
                  <SortableTh active={sort === 'doj_desc' || sort === 'doj_asc'} direction={sort === 'doj_asc' ? 'asc' : 'desc'}
                    onClick={() => setView({ sort: sort === 'doj_desc' ? 'doj_asc' : null })}>Date of joining</SortableTh>
                  <th>Tenure</th>
                  {canManagePeople && <th className="num">Monthly package</th>}
                  <th style={{ textAlign: 'center' }}>ESI</th>
                  <th style={{ textAlign: 'center' }}>PF</th>
                  <th>Status</th>
                  {canManagePeople && <th><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (r.kind === 'group'
                  ? <GroupRow key={r.key} label={r.label} count={r.count} colSpan={colCount} />
                  : (
                    <tr key={r.key}>
                      <td>
                        <div className="cell-person">
                          <span className="avatar-sm" aria-hidden="true">{initialsOf(r.row.name)}</span>
                          <span className="cell-main">
                            <Link to={`/people/${r.row.id}`} className="cell-name">{r.row.name}</Link>
                            <span className="cell-sub">{r.row.employeeNo || r.row.email || '—'}</span>
                          </span>
                        </div>
                      </td>
                      <td style={{ fontWeight: 500 }}>{r.row.designation || <span className="text-muted">—</span>}</td>
                      <td className="text-muted">{r.row.department || '—'}</td>
                      <td style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{r.row.joinDate ? formatDate(r.row.joinDate) : '—'}</td>
                      <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{tenureLabel(r.row.joinDate, today)}</td>
                      {canManagePeople && (
                        <td className="num">
                          {r.row.currentMonthlyPackage
                            ? <MaskedAmount amount={r.row.currentMonthlyPackage} revealed={revealedIds.has(r.row.id)} onToggle={() => toggleReveal(r.row.id)} />
                            : '—'}
                        </td>
                      )}
                      <td style={{ textAlign: 'center' }}><YesNoPill yes={Boolean(r.row.isEsiEligible)} /></td>
                      <td style={{ textAlign: 'center' }}><YesNoPill yes={Boolean(r.row.isPfApplicable)} /></td>
                      <td>
                        <span className={`status-inline ${EMP_STATUS_INLINE[r.row.employmentStatus] || 'is-active'}`}>
                          <span className="dot" />
                          {(r.row.employmentStatus || 'ACTIVE').replace('_', ' ').toLowerCase()}
                        </span>
                      </td>
                      {canManagePeople && (
                        <td>
                          <div className="row-actions">
                            <Link to={`/people/${r.row.id}`} className="btn btn-secondary btn-sm">Open</Link>
                            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.row)}>Delete</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={colCount}>
                      <EmptyState icon="☰"
                        title={missing ? `No employee with ${missing.label}` : needle ? 'No matching employees' : status === 'inactive' ? 'No inactive employees' : 'No employees yet'}
                        message={missing ? 'Every record has it.' : needle ? 'Try a different search.' : status === 'inactive' ? 'Nobody has left.' : activeCount === 0 && allEmployees.length > 0 ? 'Everyone on file has left. Switch to All to see them.' : 'Add your first employee.'} />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </TableCard>

          {candidates.length > 0 && (
            <TableCard title={<>Candidates in hiring <span className="count-pill">{candidates.length}</span></>}>
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
                          {canManagePeople && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
          )}

          {interns.length > 0 && (
            <TableCard title={<>Internship students <span className="count-pill">{interns.length}</span></>}>
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
                          {canManagePeople && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>Delete</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
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
          existingDesignations={Array.from(new Set(allEmployees.map((p: any) => p.designation).filter(Boolean)))}
          onSaved={p => navigate(`/people/${p.id}`)}
        />
      )}
    </>
  );
}

// A rupee figure shown as dots until clicked
function MaskedAmount({ amount, revealed, onToggle }: { amount: number; revealed: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="mask-btn" onClick={onToggle}
      title={revealed ? 'Hide amount' : 'Show amount for 10 seconds'} aria-label={revealed ? 'Hide amount' : 'Show amount'}>
      {revealed ? formatINR(amount) : <span className="masked">••••••</span>}
      {revealed ? KitIcon.eyeOff : KitIcon.eye}
    </button>
  );
}
