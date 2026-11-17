import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { LoadingBlock, ErrorAlert, SuccessAlert, Modal, StatusBadge, EmptyState } from '../../components/ui';
import { confirmDialog } from '../../components/feedback';
import { Button } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';

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
        <h3 className="ps-group-title">The company's split</h3>
        <p className="ps-split-line">
          {SHORT.map(([key, label]) => `${label} ${data.company[key]}%`).join(' · ')}
          <span className="text-muted"> · {data.onCompanySplit} employee{data.onCompanySplit === 1 ? '' : 's'}</span>
        </p>
        <p className="text-sm-muted">
          Everyone is paid on this split unless a template below applies to them. Change it under{' '}
          <Link to="/payroll/settings">Salary &amp; statutory rates</Link>. An employee's own template comes first, then their
          designation's, then their department's.
        </p>
      </div>

      <div className="card mb-24">
        <div className="card-header">
          <div>
            <h3>Structure templates</h3>
            <span className="text-sm-muted">
              A template is a split of its own. Changing one, or who it applies to, recalculates draft runs
              {data.draftRuns ? ` (${data.draftRuns} open now)` : ''}; finalized payslips keep the split they were paid with.
            </span>
          </div>
          <Button variant="accent" icon="plus" onClick={() => setForm({ name: '', ...Object.fromEntries(FIELDS.map(([k]) => [k, data.company[k]])) })}>Add template</Button>
        </div>
        {data.templates.length === 0 ? (
          <EmptyState icon="▤" title="No templates" message="Add one when some employees are paid on a different split from the rest." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Template</th><th>Split</th><th className="num">Gross, % of package</th><th>Applies to</th><th className="num">Employees</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr>
              </thead>
              <tbody>
                {data.templates.map((t: any) => (
                  <tr key={t.id}>
                    <td className="ps-strong">{t.name}</td>
                    <td className="ps-small">{SHORT.map(([key, label]) => `${label} ${t[key]}%`).join(' · ')}</td>
                    <td className={`num${t.grossPercent < 99.995 ? ' ps-warn' : ''}`}>{t.grossPercent}%</td>
                    <td className="ps-small">
                      {t.assignments.length === 0 && <span className="text-muted">Nobody yet</span>}
                      <div className="proof-list">
                        {t.assignments.map((a: any) => (
                          <span key={a.id} className="proof-chip">
                            <span className="proof-open ps-cursor-default">{a.label} <span className="text-muted">({SCOPE_NOTE[a.scope]})</span></span>
                            <button type="button" className="proof-remove" aria-label={`Take ${t.name} off ${a.label}`} onClick={() => unassign(t, a)}>✕</button>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="num">{t.employees || '—'}</td>
                    <td><StatusBadge status={t.isActive ? 'active' : 'inactive'} /></td>
                    <td>
                      <div className="row-actions">
                        {t.isActive && <Button size="sm" onClick={() => setAssign({ template: t, scope: 'DESIGNATION', target: '' })}>Assign</Button>}
                        <Button size="sm" onClick={() => setForm({ ...t })}>Edit</Button>
                        <Button variant="danger" size="sm" onClick={() => remove(t)}>Delete</Button>
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
                      <Link to={`/people/${p.id}`} className="ps-strong">{p.name}</Link>
                      <div className="ps-sub num">{p.employeeNo}</div>
                    </td>
                    <td>{p.designation || <span className="text-muted">—</span>}</td>
                    <td>{p.department || <span className="text-muted">—</span>}</td>
                    <td>
                      {p.structure
                        ? <>{p.structure.name} <span className="ps-sub">({SCOPE_NOTE[p.structure.scope]})</span></>
                        : <span className="text-muted">Company split</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal title={form?.id ? 'Edit structure template' : 'Add structure template'} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={saveTemplate}>
            <div className="form-grid mb-14">
              <div className="field ps-span-all">
                <label htmlFor="ps-tpl-name">Name *</label>
                <input id="ps-tpl-name" className="input" required maxLength={80} placeholder="e.g. Managers" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              {FIELDS.map(([key, label]) => (
                <div key={key} className="field">
                  <label htmlFor={`ps-tpl-${key}`}>{label} *</label>
                  <div className="input-unit"><span className="unit">%</span>
                    <input id={`ps-tpl-${key}`} className="input num" type="number" min={0} step="0.01" required value={form[key]}
                      onChange={e => setForm({ ...form, [key]: e.target.value })} />
                  </div>
                </div>
              ))}
            </div>
            <div className={`alert ${Math.abs(gross - 100) < 0.005 ? 'alert-success' : 'alert-warning'}`}>
              {Math.abs(gross - 100) < 0.005 ? <Icon name="checkCircle" size={16} className="ps-alert-icon" /> : <span>⚠</span>}
              <span>
                {Math.abs(gross - 100) < 0.005
                  ? 'The components add up to the whole package.'
                  : gross > 100
                    ? `The components add up to ${gross}% of the package. Bring them to 100% or less.`
                    : `The components add up to ${gross}% of the package: employees on this template are paid that share as gross. Use a recurring component for anything paid on top.`}
              </span>
            </div>
            {form.id && (
              <label className="checkbox-field mb-14">
                <input type="checkbox" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} />
                Active (switched off, it applies to nobody)
              </label>
            )}
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" variant="accent" loading={saving} disabled={gross > 100.005}>{saving ? 'Saving…' : 'Save template'}</Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal title={assign ? `Assign — ${assign.template.name}` : ''} open={Boolean(assign)} onClose={() => setAssign(null)}>
        {assign && (
          <form onSubmit={saveAssignment}>
            <div className="form-grid mb-14">
              <div className="field">
                <label htmlFor="ps-assign-scope">Applies to</label>
                <select id="ps-assign-scope" className="select" value={assign.scope} onChange={e => setAssign({ ...assign, scope: e.target.value, target: '' })}>
                  {SCOPES.map(([value, label]) => <option key={value} value={value}>{label === 'Employee' ? 'One employee' : `Everyone with a ${label.toLowerCase()}`}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ps-assign-target">{SCOPES.find(([v]) => v === assign.scope)![1]} *</label>
                <select id="ps-assign-target" className="select" required value={assign.target} onChange={e => setAssign({ ...assign, target: e.target.value })}>
                  <option value="">Pick…</option>
                  {assign.scope === 'EMPLOYEE'
                    ? data.people.map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.employeeNo ? ` (${p.employeeNo})` : ''}</option>)
                    : targets.map((t: string) => <option key={t} value={t}>{t}</option>)}
                </select>
                {assign.scope !== 'EMPLOYEE' && targets.length === 0 && (
                  <span className="hint">No values yet. Add them in <Link to="/organization?tab=lists">Company settings → Lists</Link>.</span>
                )}
              </div>
            </div>
            <p className="text-sm-muted mb-14">
              Draft payslips of the employees this covers are recalculated now. An assignment already on the same
              {' '}{SCOPES.find(([v]) => v === assign.scope)![1].toLowerCase()} is replaced.
            </p>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setAssign(null)}>Cancel</Button>
              <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Assign'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
