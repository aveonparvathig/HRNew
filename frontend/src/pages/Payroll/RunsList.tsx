import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal, StatusBadge,
} from '../../components/ui';
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

  const latest = data?.runs?.[0];
  const prevRun = data?.runs?.[1];
  const netTrend = (() => {
    if (!latest || !prevRun || !prevRun.totals.net) return null;
    const d = latest.totals.net - prevRun.totals.net;
    if (Math.abs(d) < 1) return <span className="trend-chip trend-flat">— same as {monthShort(prevRun.period)}</span>;
    const pct = Math.abs((d / prevRun.totals.net) * 100);
    return (
      <span className={`trend-chip ${d > 0 ? 'trend-good' : 'trend-bad'}`}
        title={`${d > 0 ? '+' : '−'}${formatINR(Math.abs(d))} vs ${monthShort(prevRun.period)}`}>
        {d > 0 ? '▲' : '▼'} {pct >= 10 ? Math.round(pct) : pct.toFixed(1)}% vs {monthShort(prevRun.period)}
      </span>
    );
  })();
  // Chronological view of recent runs for the trend chart
  const chartRuns = (data?.runs || []).slice(0, 12).reverse();
  const maxNet = Math.max(1, ...chartRuns.map((r: any) => r.totals.net));

  return (
    <>
      <PageHeader
        title="Payroll Runs"
        subtitle="One run per month — draft, adjust attendance, finalize, issue payslips."
        actions={
          <>
            <Link to="/payroll/settings" className="btn btn-secondary">Settings</Link>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Run</button>
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="stat-grid">
        <StatCard label="Active Employees" value={data?.activeEmployeeCount ?? 0}
          sub="Will be included in a new run" icon="☰" tone="primary" />
        <StatCard label="Latest Run" value={latest ? monthLabel(latest.period) : '—'}
          sub={latest ? `${latest.totals.employees} employees · ${latest.status.toLowerCase()}` : 'No runs yet'}
          icon="▦" tone="info" />
        <StatCard label="Latest Net Payout" value={latest ? formatINR(latest.totals.net) : '—'}
          trend={netTrend}
          sub={latest ? `Gross ${formatINR(latest.totals.gross)}` : ''} icon="₹" tone="success" />
        <StatCard label="Latest CTC" value={latest && latest.totals.ctc > 0 ? formatINR(latest.totals.ctc) : '—'}
          sub={latest && latest.totals.ctc > 0 ? 'Including employer contributions' : 'Not tracked for the latest run'}
          icon="◔" tone="warning" />
      </div>

      {chartRuns.length > 1 && (
        <div className="card payout-card">
          <div className="payout-head">
            <h3>Net payout trend</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              last {chartRuns.length} runs · avg {formatINRCompact(
                chartRuns.reduce((s: number, r: any) => s + r.totals.net, 0) / chartRuns.length
              )}/mo{chartRuns.some((r: any) => r.status !== 'FINALIZED') ? ' · amber = draft' : ''}
            </span>
          </div>
          <div className="col-chart">
            {chartRuns.map((r: any) => (
              <Link key={r.id} to={`/payroll/runs/${r.id}`} className="col-item"
                title={`${monthLabel(r.period)} — net ${formatINR(r.totals.net)} · ${r.totals.employees} employees`}>
                <span className="col-val">{formatINRCompact(r.totals.net)}</span>
                <div className="col-bar"
                  style={{ height: Math.max((r.totals.net / maxNet) * 130, 4),
                    ...(r.status !== 'FINALIZED' ? { background: 'linear-gradient(180deg, #fbbf24, #DE8F0D)' } : {}) }} />
                <span className="col-label">{monthShort(r.period)} {r.period.slice(2, 4)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        {(data?.runs || []).length === 0 ? (
          <EmptyState icon="▦" title="No payroll runs yet"
            message="Create the first monthly run — every active employee is pulled in automatically."
            action={<button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New Run</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Period</th><th>Status</th><th className="num">Employees</th>
                  <th className="num">Gross</th><th className="num">Deductions</th>
                  <th className="num">Net Payable</th><th className="num">CTC</th><th />
                </tr>
              </thead>
              <tbody>
                {data.runs.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/payroll/runs/${r.id}`} style={{ fontWeight: 600 }}>
                        {monthLabel(r.period)}
                      </Link>
                    </td>
                    <td><StatusBadge status={r.status === 'FINALIZED' ? 'finalized' : 'draft'} /></td>
                    <td className="num">{r.totals.employees}</td>
                    <td className="num">{formatINR(r.totals.gross)}</td>
                    <td className="num text-warning">{formatINR(r.totals.deductions)}</td>
                    <td className="num text-success" style={{ fontWeight: 600 }}>{formatINR(r.totals.net)}</td>
                    <td className="num text-muted">{formatINR(r.totals.ctc)}</td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/payroll/runs/${r.id}`} className="btn btn-secondary btn-sm">Open</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title="New Payroll Run" open={showModal} onClose={() => setShowModal(false)}>
        <form onSubmit={handleCreate}>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
            All {data?.activeEmployeeCount ?? 0} active employees are added with their current
            package and PF/ESI flags snapshotted — later raises never change this month.
          </p>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Month *</label>
              <input className="input" type="month" required value={form.period}
                onChange={e => setForm({ ...form, period: e.target.value })} />
            </div>
            <div className="field">
              <label>Total working days *</label>
              <input className="input" type="number" min={1} max={31} required
                value={form.totalWorkingDays}
                onChange={e => setForm({ ...form, totalWorkingDays: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <input className="input" value={form.notes} placeholder="Optional"
              onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Creating…' : 'Create Run'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
