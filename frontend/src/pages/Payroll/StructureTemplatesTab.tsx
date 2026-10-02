import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert, SuccessAlert, Modal, StatusBadge, EmptyState } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';

const FIELDS: [string, string][] = [
  ['basicPercentOfPackage', 'Basic — % of package'], ['daPercentOfBasic', 'DA — % of basic'], ['hraPercentOfBasic', 'HRA — % of basic'],
  ['transportPercentOfBasic', 'Transport — % of basic'], ['foodPercentOfBasic', 'Food — % of basic'],
];
const SHORT: [string, string][] = [
  ['basicPercentOfPackage', 'Basic'], ['daPercentOfBasic', 'DA'], ['hraPercentOfBasic', 'HRA'],
  ['transportPercentOfBasic', 'Transport'], ['foodPercentOfBasic', 'Food'],
];
const SCOPES: [string, string][] = [['DESIGNATION', 'Designation'], ['DEPARTMENT', 'Department'], ['EMPLOYEE', 'Employee']];
const SCOPE_NOTE: Record<string, string> = { EMPLOYEE: 'own', DESIGNATION: 'designation', DEPARTMENT: 'department' };
const grossOf = (f: any) => Math.round(Number(f.basicPercentOfPackage || 0) * (100 + ['daPercentOfBasic', 'hraPercentOfBasic', 'transportPercentOfBasic', 'foodPercentOfBasic']
  .reduce((s, k) => s + Number(f[k] || 0), 0))) / 100;
const drafts = (n: number) => (n ? ` ${n} draft payslip${n === 1 ? '' : 's'} recalculated.` : '');

// Salary splits of their own for some employees: the templates, and who each applies to.
export default function StructureTemplatesTab() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<any>(null);     // template being added or edited
  const [assign, setAssign] = useState<any>(null); // { template, scope, target }
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getStructureTemplates();
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load structure templates');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const act = async (call: () => Promise<any>, message: (d: any) => string, close: () => void) => {
    setSaving(true);
    setSuccess('');
    try {
      const res = await call();
      setError('');
      setSuccess(message(res.data));
      close();
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not save');
      close();
    } finally {
      setSaving(false);
    }
  };

  const saveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    act(
      () => (form.id ? payrollAPI.updateStructureTemplate(form.id, form) : payrollAPI.createStructureTemplate(form)),
      d => (form.id ? `Template saved.${drafts(d.draftPayslipsChanged)}` : 'Template added. Assign it to a designation, a department or an employee for it to take effect.'),
      () => setForm(null),
    );
  };

  const remove = async (t: any) => {
    if (!await confirmDialog({
      title: `Delete ${t.name}?`,
      message: t.employees
        ? `${t.employees} employee${t.employees === 1 ? '' : 's'} go back to the company's split from the next payslip, and draft payslips are recalculated now. Payslips already finalized keep the split they were paid with.`
        : 'Nobody is on this template.',
      confirmLabel: 'Delete', danger: true,
    })) return;
    act(() => payrollAPI.deleteStructureTemplate(t.id), d => `${d.message}.${drafts(d.draftPayslipsChanged)}`, () => {});
  };

  const saveAssignment = (e: React.FormEvent) => {
    e.preventDefault();
    act(
      () => payrollAPI.assignStructure({ scope: assign.scope, target: assign.target, templateId: assign.template.id }),
      d => `${d.message}.${drafts(d.draftPayslipsChanged)}`,
      () => setAssign(null),
    );
  };

  const unassign = async (t: any, a: any) => {
    if (!await confirmDialog(`Take ${t.name} off ${a.label}? Draft payslips are recalculated now.`)) return;
    act(() => payrollAPI.assignStructure({ scope: a.scope, target: a.target, templateId: '' }), d => `${d.message}.${drafts(d.draftPayslipsChanged)}`, () => {});
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading structure templates…" />;

  const targets = assign?.scope === 'DESIGNATION' ? data.designations : assign?.scope === 'DEPARTMENT' ? data.departments : [];
  const gross = form ? grossOf(form) : 100;

  return (
    <>
      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>The company's split</h3>
        <p style={{ fontSize: 13, marginBottom: 6 }}>
          {SHORT.map(([key, label]) => `${label} ${data.company[key]}%`).join(' · ')}
          <span className="text-muted"> · {data.onCompanySplit} employee{data.onCompanySplit === 1 ? '' : 's'}</span>
        </p>
        <p className="text-muted" style={{ fontSize: 12.5 }}>
          Everyone is paid on this split unless a template below applies to them. Change it under{' '}
          <Link to="/payroll/settings">Salary &amp; statutory rates</Link>. An employee's own template comes first, then their
          designation's, then their department's.
        </p>
      </div>

      <div className="card mb-24">
        <div className="card-header">
          <div>
            <h3>Structure templates</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              A template is a split of its own. Changing one, or who it applies to, recalculates draft runs
              {data.draftRuns ? ` (${data.draftRuns} open now)` : ''}; finalized payslips keep the split they were paid with.
            </span>
          </div>
          <button className="btn btn-primary" onClick={() => setForm({ name: '', ...Object.fromEntries(FIELDS.map(([k]) => [k, data.company[k]])) })}>+ Add Template</button>
        </div>
        {data.templates.length === 0 ? (
          <EmptyState icon="▤" title="No templates" message="Add one when some employees are paid on a different split from the rest." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Template</th><th>Split</th><th className="num">Gross, % of package</th><th>Applies to</th><th className="num">Employees</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {data.templates.map((t: any) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td style={{ fontSize: 12.5 }}>{SHORT.map(([key, label]) => `${label} ${t[key]}%`).join(' · ')}</td>
                    <td className="num" style={{ color: t.grossPercent < 99.995 ? 'var(--warning)' : undefined }}>{t.grossPercent}%</td>
                    <td style={{ fontSize: 12.5 }}>
                      {t.assignments.length === 0 && <span className="text-muted">Nobody yet</span>}
                      <div className="proof-list">
                        {t.assignments.map((a: any) => (
                          <span key={a.id} className="proof-chip">
                            <span className="proof-open" style={{ cursor: 'default' }}>{a.label} <span className="text-muted">({SCOPE_NOTE[a.scope]})</span></span>
                            <button type="button" className="proof-remove" aria-label={`Take ${t.name} off ${a.label}`} onClick={() => unassign(t, a)}>✕</button>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="num">{t.employees || '—'}</td>
                    <td><StatusBadge status={t.isActive ? 'active' : 'inactive'} /></td>
                    <td>
                      <div className="row-actions">
                        {t.isActive && <button className="btn btn-primary btn-sm" onClick={() => setAssign({ template: t, scope: 'DESIGNATION', target: '' })}>Assign</button>}
                        <button className="btn btn-secondary btn-sm" onClick={() => setForm({ ...t })}>Edit</button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(t)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data.templates.length > 0 && (
        <div className="card">
          <div className="card-header"><h3>Who is on what</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Employee</th><th>Designation</th><th>Department</th><th>Structure</th></tr></thead>
              <tbody>
                {data.people.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/people/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>{p.employeeNo}</div>
                    </td>
                    <td>{p.designation || <span className="text-muted">—</span>}</td>
                    <td>{p.department || <span className="text-muted">—</span>}</td>
                    <td>
                      {p.structure
                        ? <>{p.structure.name} <span className="text-muted" style={{ fontSize: 12 }}>({SCOPE_NOTE[p.structure.scope]})</span></>
                        : <span className="text-muted">Company split</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal title={form?.id ? 'Edit Structure Template' : 'Add Structure Template'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={saveTemplate}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Name *</label>
                <input className="input" required maxLength={80} placeholder="e.g. Managers" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              {FIELDS.map(([key, label]) => (
                <div key={key} className="field">
                  <label>{label} *</label>
                  <div className="input-unit"><span className="unit">%</span>
                    <input className="input" type="number" min={0} step="0.01" required value={form[key]}
                      onChange={e => setForm({ ...form, [key]: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
            <div className={`alert ${Math.abs(gross - 100) < 0.005 ? 'alert-success' : 'alert-warning'}`}>
              <span>{Math.abs(gross - 100) < 0.005 ? '✓' : '⚠'}</span>
              <span>
                {Math.abs(gross - 100) < 0.005
                  ? 'The components add up to the whole package.'
                  : gross > 100
                    ? `The components add up to ${gross}% of the package. Bring them to 100% or less.`
                    : `The components add up to ${gross}% of the package: employees on this template are paid that share as gross. Use a recurring component for anything paid on top.`}
              </span>
            </div>
            {form.id && (
              <label className="checkbox-field" style={{ marginBottom: 14 }}>
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
                Active (switched off, it applies to nobody)
              </label>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving || gross > 100.005}>{saving ? 'Saving…' : 'Save Template'}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal title={assign ? `Assign — ${assign.template.name}` : ''} open={Boolean(assign)} onClose={() => setAssign(null)}>
        {assign && (
          <form onSubmit={saveAssignment}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Applies to</label>
                <select className="select" value={assign.scope} onChange={e => setAssign({ ...assign, scope: e.target.value, target: '' })}>
                  {SCOPES.map(([value, label]) => <option key={value} value={value}>{label === 'Employee' ? 'One employee' : `Everyone with a ${label.toLowerCase()}`}</option>)}
                </select>
              </div>
              <div className="field">
                <label>{SCOPES.find(([v]) => v === assign.scope)![1]} *</label>
                <select className="select" required value={assign.target} onChange={e => setAssign({ ...assign, target: e.target.value })}>
                  <option value="">Pick…</option>
                  {assign.scope === 'EMPLOYEE'
                    ? data.people.map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.employeeNo ? ` (${p.employeeNo})` : ''}</option>)
                    : targets.map((t: string) => <option key={t} value={t}>{t}</option>)}
                </select>
                {assign.scope !== 'EMPLOYEE' && targets.length === 0 && (
                  <span className="hint">No values yet. Add them in <Link to="/organization?tab=lists">Company Settings → Lists</Link>.</span>
                )}
              </div>
            </div>
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              Draft payslips of the employees this covers are recalculated now. An assignment already on the same
              {' '}{SCOPES.find(([v]) => v === assign.scope)![1].toLowerCase()} is replaced.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setAssign(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Assign'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
