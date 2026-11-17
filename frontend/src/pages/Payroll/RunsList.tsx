import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal, StatusBadge,
} from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { DataTable, type Column } from '../../components/DataTable';
import { formatINR, formatINRCompact } from '../../utils/format';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const monthShort = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
};

const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function RunsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ period: currentMonth(), totalWorkingDays: 26, notes: '' });
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getRuns();
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load payroll runs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await payrollAPI.createRun(form);
      navigate(`/payroll/runs/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create run');
      setShowModal(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock label="Loading payroll…" />;

  const runs: any[] = data?.runs || [];
  const latest = runs[0];
  const prevRun = runs[1];
  const netTrend = (() => {
    if (!latest || !prevRun || !prevRun.totals.net) return null;
    const d = latest.totals.net - prevRun.totals.net;
    if (Math.abs(d) < 1) return <span className="trend-chip trend-flat">Same as {monthShort(prevRun.period)}</span>;
    const pct = Math.abs((d / prevRun.totals.net) * 100);
    return (
      <span className={`trend-chip ${d > 0 ? 'trend-good' : 'trend-bad'}`}
        title={`${d > 0 ? '+' : '−'}${formatINR(Math.abs(d))} vs ${monthShort(prevRun.period)}`}>
        {d > 0 ? '+' : '−'}{pct >= 10 ? Math.round(pct) : pct.toFixed(1)}% vs {monthShort(prevRun.period)}
      </span>
    );
  })();
  // Chronological view of recent runs for the trend chart
  const chartRuns = runs.slice(0, 12).reverse();
  const maxNet = Math.max(1, ...chartRuns.map((r: any) => r.totals.net));

  const newRun = <Button variant="accent" icon="plus" onClick={() => setShowModal(true)}>New run</Button>;

  const columns: Column<any>[] = [
    {
      key: 'period', header: 'Period',
      render: r => <Link to={`/payroll/runs/${r.id}`} className="run-period">{monthLabel(r.period)}</Link>,
    },
    {
      key: 'status', header: 'Status',
      render: r => (
        <>
          <StatusBadge status={r.status === 'FINALIZED' ? 'finalized' : 'draft'} />
          {r.stage && r.stage.key !== 'INPUTS_OPEN' && r.stage.key !== 'FINALIZED' && (
            <div className="run-stage">{r.stage.label}</div>
          )}
        </>
      ),
    },
    { key: 'employees', header: 'Employees', align: 'right', render: r => r.totals.employees },
    { key: 'gross', header: 'Gross', align: 'right', render: r => formatINR(r.totals.gross) },
    { key: 'deductions', header: 'Deductions', align: 'right', render: r => <span className="num-neg">{formatINR(r.totals.deductions)}</span> },
    { key: 'net', header: 'Net payable', align: 'right', render: r => <strong className="num-pos">{formatINR(r.totals.net)}</strong> },
    { key: 'ctc', header: 'CTC', align: 'right', render: r => <span className="text-muted">{formatINR(r.totals.ctc)}</span> },
    {
      key: 'open', header: <span className="sr-only">Actions</span>,
      render: r => (
        <div className="row-actions">
          <ButtonLink to={`/payroll/runs/${r.id}`} size="sm" onClick={e => e.stopPropagation()}>Open</ButtonLink>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payroll runs"
        subtitle="One run per month: draft, adjust attendance, finalize, then issue payslips."
        actions={
          <>
            <ButtonLink to="/payroll/settings" icon="sliders">Settings</ButtonLink>
            {newRun}
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="stat-grid">
        <StatCard label="Active employees" value={data?.activeEmployeeCount ?? 0}
          sub="Included in a new run" icon="users" tone="indigo" />
        <StatCard label="Latest run" value={latest ? monthLabel(latest.period) : '—'}
          sub={latest ? `${latest.totals.employees} employees · ${latest.status.toLowerCase()}` : 'No runs yet'}
          icon="calendar" tone="blue" />
        <StatCard label="Latest net payout" value={latest ? formatINR(latest.totals.net) : '—'}
          trend={netTrend}
          sub={latest ? `Gross ${formatINR(latest.totals.gross)}` : ''} icon="banknote" tone="green" />
        <StatCard label="Latest CTC" value={latest && latest.totals.ctc > 0 ? formatINR(latest.totals.ctc) : '—'}
          sub={latest && latest.totals.ctc > 0 ? 'Including employer contributions' : 'Not tracked for the latest run'}
          icon="analytics" tone="amber" />
      </div>

      {chartRuns.length > 1 && (
        <div className="card payout-card">
          <div className="payout-head">
            <h3>Net payout trend</h3>
            <span className="text-sm-muted">
              Last {chartRuns.length} runs · avg <span className="num">{formatINRCompact(
                chartRuns.reduce((s: number, r: any) => s + r.totals.net, 0) / chartRuns.length
              )}</span>/mo{chartRuns.some((r: any) => r.status !== 'FINALIZED') ? ' · amber = draft' : ''}
            </span>
          </div>
          <div className="col-chart">
            {chartRuns.map((r: any) => (
              <Link key={r.id} to={`/payroll/runs/${r.id}`} className="col-item"
                title={`${monthLabel(r.period)}: net ${formatINR(r.totals.net)} · ${r.totals.employees} employees`}>
                <span className="col-val num">{formatINRCompact(r.totals.net)}</span>
                {/* Height is data-driven, so it stays inline. */}
                <div className={`col-bar${r.status !== 'FINALIZED' ? ' draft' : ''}`}
                  style={{ height: Math.max((r.totals.net / maxNet) * 130, 4) }} />
                <span className="col-label">{monthShort(r.period)} {r.period.slice(2, 4)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {runs.length === 0 ? (
        <div className="card">
          <EmptyState icon="▦" title="Start your first payroll run"
            message="Every active employee is pulled in automatically."
            action={newRun} />
        </div>
      ) : (
        <DataTable title="All runs" columns={columns} rows={runs} rowKey={r => r.id}
          onRowClick={r => navigate(`/payroll/runs/${r.id}`)} />
      )}

      <Modal title="New payroll run" open={showModal} onClose={() => setShowModal(false)}>
        <form onSubmit={handleCreate}>
          <p className="modal-lede">
            All {data?.activeEmployeeCount ?? 0} active employees are added with their current
            package and PF/ESI flags snapshotted. Later raises never change this month.
          </p>
          <div className="form-grid mb-14">
            <div className="field">
              <label htmlFor="run-period">Month *</label>
              <input id="run-period" className="input" type="month" required value={form.period}
                onChange={e => setForm({ ...form, period: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="run-days">Total working days *</label>
              <input id="run-days" className="input" type="number" min={1} max={31} required
                value={form.totalWorkingDays}
                onChange={e => setForm({ ...form, totalWorkingDays: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="run-notes">Notes</label>
            <input id="run-notes" className="input" value={form.notes} placeholder="Bonus month"
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>{saving ? 'Creating…' : 'Create run'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
