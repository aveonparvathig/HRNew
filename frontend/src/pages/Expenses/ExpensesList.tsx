import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { expensesAPI } from '../../api/expenses';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal,
} from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';

export const EXPENSE_STATUS_TONES: Record<string, string> = {
  DRAFT: 'badge-neutral', SUBMITTED: 'badge-info', APPROVED: 'badge-warning',
  REJECTED: 'badge-danger', REIMBURSED: 'badge-success',
};

const EMPTY = {
  personId: '', title: '', businessPurpose: '', reportTo: '',
  periodStart: '', periodEnd: '',
};

export default function ExpensesList() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [meta, setMeta] = useState<any>({ categories: [], statuses: [], employees: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [listRes, metaRes] = await Promise.all([
        expensesAPI.getReports({ q, status }),
        expensesAPI.getMeta(),
      ]);
      setData(listRes.data);
      setMeta(metaRes.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load expense reports');
    } finally {
      setLoading(false);
    }
  }, [q, status]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await expensesAPI.createReport(form);
      navigate(`/expenses/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create report');
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading && !data) return <LoadingBlock label="Loading expenses…" />;

  return (
    <>
      <PageHeader
        title="Travel & Expenses"
        subtitle="Expense reports per employee — scan receipts, get reimbursed."
        actions={
          <button className="btn btn-primary"
            onClick={() => { setForm(EMPTY); setShowModal(true); }}>
            + New Report
          </button>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {data && (
        <div className="stat-grid">
          <StatCard label="Reports" value={data.reports.length} icon="⌯" tone="primary" />
          <StatCard label="Awaiting Reimbursement" value={formatINR(data.pendingTotal)}
            sub="Submitted + approved" icon="◷" tone="warning" />
          <StatCard label="Reimbursed" value={formatINR(data.reimbursedTotal)} icon="✓" tone="success" />
        </div>
      )}

      <div className="toolbar">
        <div className="search-input">
          <input className="input" placeholder="Search by title, number or employee…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {meta.statuses.map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="card">
        {(data?.reports || []).length === 0 ? (
          <EmptyState icon="⌯" title={q || status ? 'No matching reports' : 'No expense reports yet'}
            message="Create a report, then drop receipt photos on it — OCR fills the lines."
            action={!(q || status) && (
              <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Report</button>
            )} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Report</th><th>Employee</th><th>Period</th>
                  <th className="num">Lines</th><th className="num">Total</th>
                  <th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {data.reports.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/expenses/${r.id}`} style={{ fontWeight: 600 }}>{r.title}</Link>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>{r.reportNumber}</div>
                    </td>
                    <td className="text-muted">{r.person.name}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>
                      {r.periodStart ? `${formatDate(r.periodStart)} – ${r.periodEnd ? formatDate(r.periodEnd) : '…'}` : '—'}
                    </td>
                    <td className="num">{r.lineCount}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(r.total)}</td>
                    <td>
                      <span className={`badge ${EXPENSE_STATUS_TONES[r.status]}`}>
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
        )}
      </div>

      <Modal title="New Expense Report" open={showModal} onClose={() => setShowModal(false)}>
        <form onSubmit={handleCreate}>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Employee *</label>
            <select className="select" required value={form.personId}
              onChange={e => setForm({ ...form, personId: e.target.value })}>
              <option value="">Select employee…</option>
              {meta.employees.map((e2: any) => (
                <option key={e2.id} value={e2.id}>
                  {e2.name}{e2.employeeNo ? ` (${e2.employeeNo})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label>Report title *</label>
            <input className="input" required autoFocus placeholder="e.g. Chennai client visit — Feb 2026"
              value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Period start</label>
              <input className="input" type="date" value={form.periodStart}
                onChange={e => setForm({ ...form, periodStart: e.target.value })} />
            </div>
            <div className="field">
              <label>Period end</label>
              <input className="input" type="date" value={form.periodEnd}
                onChange={e => setForm({ ...form, periodEnd: e.target.value })} />
            </div>
            <div className="field">
              <label>Report to</label>
              <input className="input" placeholder="e.g. Accounts / Director"
                value={form.reportTo} onChange={e => setForm({ ...form, reportTo: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Business purpose</label>
            <textarea className="input" rows={2} value={form.businessPurpose}
              onChange={e => setForm({ ...form, businessPurpose: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create Report'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
