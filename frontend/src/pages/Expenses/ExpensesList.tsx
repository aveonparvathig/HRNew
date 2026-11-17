import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { expensesAPI } from '../../api/expenses';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal,
} from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Tabs } from '../../components/Tabs';
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
  const [awaiting, setAwaiting] = useState(false);
  const [awaitingCount, setAwaitingCount] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>(EMPTY);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [listRes, metaRes, awaitRes] = await Promise.all([
        expensesAPI.getReports(awaiting ? { awaiting: '1' } : { q, status }),
        expensesAPI.getMeta(),
        expensesAPI.getReports({ awaiting: '1' }),
      ]);
      setData(listRes.data);
      setMeta(metaRes.data);
      setAwaitingCount(awaitRes.data.reports.length);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load expense reports');
    } finally {
      setLoading(false);
    }
  }, [q, status, awaiting]);

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

  const openNew = () => { setForm(EMPTY); setShowModal(true); };

  return (
    <>
      <PageHeader
        title="Travel and expenses"
        subtitle="Expense reports per employee — scan receipts, get reimbursed."
        actions={<Button variant="accent" icon="plus" onClick={openNew}>New expense report</Button>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {data && (
        <div className="stat-grid">
          <StatCard label="Reports" value={data.reports.length} icon="receipt" tone="primary" />
          <StatCard label="Awaiting reimbursement" value={formatINR(data.pendingTotal)}
            sub="Submitted + approved" icon="clock" tone="warning" />
          <StatCard label="Reimbursed" value={formatINR(data.reimbursedTotal)} icon="checkCircle" tone="success" />
        </div>
      )}

      <Tabs label="Expense reports view" value={awaiting ? 'awaiting' : 'all'}
        onChange={k => setAwaiting(k === 'awaiting')}
        items={[
          { key: 'all', label: 'All reports' },
          { key: 'awaiting', label: 'Awaiting my approval', count: awaitingCount || undefined },
        ]} />

      {!awaiting && (
        <div className="toolbar">
          <div className="search-input">
            <input className="input" aria-label="Search reports" placeholder="Search by title, number or employee…"
              value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <select className="select" aria-label="Status" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {meta.statuses.map((s: any) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      )}

      <div className="card">
        {(data?.reports || []).length === 0 ? (
          <EmptyState icon="⌯" title={awaiting ? 'Nothing awaiting your approval' : q || status ? 'No matching reports' : 'No expense reports yet'}
            message={awaiting ? 'Reports waiting for your sign-off will appear here.' : 'Create a report, then drop receipt photos on it — OCR fills the lines.'}
            action={!awaiting && !(q || status) && (
              <Button icon="plus" onClick={openNew}>New expense report</Button>
            )} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Report</th><th>Employee</th><th>Period</th>
                  <th className="num">Lines</th><th className="num">Total</th>
                  <th>Status</th><th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {data.reports.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/expenses/${r.id}`} className="re-strong">{r.title}</Link>
                      <div className="re-sub re-mono">{r.reportNumber}</div>
                    </td>
                    <td className="text-muted">{r.person.name}</td>
                    <td className="re-date re-date-cell">
                      {r.periodStart ? `${formatDate(r.periodStart)} – ${r.periodEnd ? formatDate(r.periodEnd) : '…'}` : '—'}
                    </td>
                    <td className="num">{r.lineCount}</td>
                    <td className="num re-strong">{formatINR(r.total)}</td>
                    <td>
                      <span className={`badge ${EXPENSE_STATUS_TONES[r.status]}`}>
                        {r.status.toLowerCase()}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <ButtonLink to={`/expenses/${r.id}`} size="sm">Open</ButtonLink>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title="New expense report" open={showModal} onClose={() => setShowModal(false)}>
        <form onSubmit={handleCreate}>
          <div className="field mb-14">
            <label htmlFor="re-new-person">Employee *</label>
            <select id="re-new-person" className="select" required value={form.personId}
              onChange={e => setForm({ ...form, personId: e.target.value })}>
              <option value="">Select employee…</option>
              {meta.employees.map((e2: any) => (
                <option key={e2.id} value={e2.id}>
                  {e2.name}{e2.employeeNo ? ` (${e2.employeeNo})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field mb-14">
            <label htmlFor="re-new-title">Report title *</label>
            <input id="re-new-title" className="input" required autoFocus placeholder="e.g. Chennai client visit — Feb 2026"
              value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="form-grid mb-14">
            <div className="field">
              <label htmlFor="re-new-start">Period start</label>
              <input id="re-new-start" className="input" type="date" value={form.periodStart}
                onChange={e => setForm({ ...form, periodStart: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="re-new-end">Period end</label>
              <input id="re-new-end" className="input" type="date" value={form.periodEnd}
                onChange={e => setForm({ ...form, periodEnd: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="re-new-reportto">Report to</label>
              <input id="re-new-reportto" className="input" placeholder="e.g. Accounts / Director"
                value={form.reportTo} onChange={e => setForm({ ...form, reportTo: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="re-new-purpose">Business purpose</label>
            <textarea id="re-new-purpose" className="input" rows={2} value={form.businessPurpose}
              onChange={e => setForm({ ...form, businessPurpose: e.target.value })} />
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>
              {saving ? 'Creating…' : 'Create report'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
