import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal, BackButton, SuccessAlert,
} from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';

const monthLabel = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const STATE_BADGES: Record<string, [string, string]> = {
  PAID: ['badge-success', 'Paid'],
  IN_BATCH: ['badge-info', 'In a batch'],
  HELD: ['badge-warning', 'On hold'],
  UNPAID: ['badge-danger', 'Unpaid'],
  NOTHING: ['badge-neutral', 'Nothing to pay'],
};

const download = (filename: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob(['﻿' + content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Paying a finalized run: batches by payment mode, the bank file, and marking paid.
export default function Payout() {
  const { runId } = useParams<{ runId: string }>();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [batchForm, setBatchForm] = useState<any>(null);  // new batch being created
  const [paidForm, setPaidForm] = useState<any>(null);    // batch being marked paid, with its entries
  const [outsideForm, setOutsideForm] = useState<any>(null); // marking the month paid outside the system
  const [filter, setFilter] = useState('ALL');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getPayout(runId!);
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the payout');
    }
  }, [runId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const act = async (fn: () => Promise<any>, okMsg?: string) => {
    setSaving(true);
    try {
      const res = await fn();
      setSuccess(okMsg || res?.data?.message || '');
      setError('');
      await fetchData();
      return true;
    } catch (err: any) {
      setSuccess('');
      setError(err.response?.data?.error || 'Action failed');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await act(() => payrollAPI.createPayoutBatch(runId!, batchForm), 'Payment batch created.');
    if (ok) setBatchForm(null);
  };

  const openPaid = async (batch: any) => {
    try {
      const res = await payrollAPI.getPayoutBatch(batch.id);
      setPaidForm({
        batch: res.data, payDate: res.data.payDate, reference: res.data.reference,
        refs: Object.fromEntries(res.data.entries.map((x: any) => [x.id, x.paymentRef || ''])),
      });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not open the batch');
    }
  };

  const handleMarkPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await act(() => payrollAPI.markPayoutBatchPaid(paidForm.batch.id, {
      payDate: paidForm.payDate, reference: paidForm.reference, refs: paidForm.refs,
    }));
    if (ok) setPaidForm(null);
  };

  const handlePaidOutside = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await act(() => payrollAPI.markPaidOutside(runId!, outsideForm));
    if (ok) setOutsideForm(null);
  };

  const downloadBankFile = async (batch: any) => {
    try {
      const { data: file } = await payrollAPI.getBankFile(batch.id);
      download(file.filename, file.content, 'text/csv');
      setError('');
      setSuccess(`${file.filename} downloaded: ${file.members} transfers, ${formatINR(file.total)}.`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not prepare the bank file');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading payout…" />;

  const { run, totals, outside } = data;
  const earlierCount = outside.earlierMonths.length;
  const finalized = run.status === 'FINALIZED';
  const rows = data.entries.filter((r: any) => filter === 'ALL' || r.state === filter);
  const hasAccount = data.bankAccounts.length > 0;

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <Link to={`/payroll/runs/${run.id}`}>{monthLabel(run.period)}</Link>
        <span>/</span>
        <span>Payout</span>
      </div>

      <PageHeader
        title={`Payout — ${monthLabel(run.period)}`}
        subtitle={`${data.stage.label} · ${data.stage.paidCount} of ${data.stage.payable} salaries paid`}
        actions={<>
          <Link to={`/payroll/runs/${run.id}/reports/payment-register`} className="btn btn-secondary">Payment Register</Link>
          <Link to={`/payroll/runs/${run.id}/reports/cash-cheque`} className="btn btn-secondary">Cash & Cheque</Link>
          <Link to={`/payroll/runs/${run.id}/reports/payout-reconciliation`} className="btn btn-secondary">Reconciliation</Link>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />
      {!finalized && (
        <div className="alert alert-warning">
          <span>◷</span>
          <span>This run is still a draft. Finalize it before creating payment batches; the amounts below may still change.</span>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="To pay" value={formatINR(totals.payable.amount)} icon="₹" tone="primary"
          sub={`${totals.payable.count} salaries, net pay plus claims`} />
        <StatCard label="Paid" value={formatINR(totals.paid.amount)} icon="✓" tone="success"
          sub={`${totals.paid.count} salaries`} />
        <StatCard label="Not yet paid" value={formatINR(totals.unpaid.amount + totals.inBatch.amount)} icon="◷" tone="warning"
          sub={`${totals.unpaid.count} not in a batch, ${totals.inBatch.count} in a batch`} />
        <StatCard label="On hold" value={formatINR(totals.held.amount)} icon="⏸" tone="info"
          sub={totals.held.count ? `${totals.held.count} ${totals.held.count === 1 ? 'salary' : 'salaries'} held back` : 'None'} />
      </div>

      {finalized && data.unpaidByMode.length > 0 && (
        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Ready to pay</h3>
          <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
            A batch takes every unpaid salary of one payment mode. An employee's mode is set on their profile.
          </p>
          <div className="report-grid">
            {data.unpaidByMode.map((m: any) => (
              <button key={m.mode} className="report-tile" disabled={m.count === 0}
                onClick={() => setBatchForm({
                  mode: m.mode, label: m.label, count: m.count, amount: m.amount, payDate: data.today, reference: '', notes: '',
                  bankAccountId: m.mode === 'BANK' ? data.bankAccounts[0]?.id || '' : '',
                })}>
                <strong>{m.label} — {formatINR(m.amount)}</strong>
                <span>
                  {m.count} {m.count === 1 ? 'salary' : 'salaries'} ready. Create a batch.
                  {m.missingBank > 0 && ` ${m.missingBank} left out: account number or IFSC missing.`}
                </span>
              </button>
            ))}
          </div>
          {outside.payable.count > 0 && (
            <p className="text-muted" style={{ fontSize: 12.5, marginTop: 14 }}>
              Already paid some other way, or before payments were recorded here?{' '}
              <button className="link-button" onClick={() => setOutsideForm({ payDate: outside.suggestedDate, reference: '', earlier: false })}>
                Mark this month as paid outside the system
              </button>
            </p>
          )}
        </div>
      )}

      {outside.paid.count > 0 && (
        <div className="alert alert-warning" style={{ background: 'var(--info-soft)', color: 'var(--info)', borderColor: '#CFE2FB' }}>
          <span>ℹ</span>
          <span style={{ flex: 1 }}>
            {outside.paid.count} {outside.paid.count === 1 ? 'salary' : 'salaries'} ({formatINR(outside.paid.amount)}) marked as paid outside the system, with no payment batch.
          </span>
          <button className="btn btn-secondary btn-sm" disabled={saving}
            onClick={async () => await confirmDialog({
              title: 'Undo the payment marking?',
              message: `${outside.paid.count} ${outside.paid.count === 1 ? 'salary' : 'salaries'} of ${monthLabel(run.period)} will show as unpaid again.`,
              confirmLabel: 'Undo',
            }) && act(() => payrollAPI.undoPaidOutside(run.id))}>
            Undo
          </button>
        </div>
      )}

      <div className="card mb-24">
        <div className="card-header"><h3>Payment batches</h3></div>
        {data.batches.length === 0 ? (
          <EmptyState icon="₹" title="No payment batches yet"
            message={finalized ? 'Create a batch above to start paying this run.' : 'Batches can be created once the run is finalized.'} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Batch</th><th>Mode</th><th>Date</th><th>Reference</th><th className="num">Salaries</th><th className="num">Amount</th><th>Status</th><th /></tr>
              </thead>
              <tbody>
                {data.batches.map((b: any) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 600 }}>#{b.batchNo}<div className="text-muted" style={{ fontSize: 11.5, fontWeight: 400 }}>{b.createdBy}</div></td>
                    <td>
                      {b.modeLabel}
                      {b.bankAccount && <div className="text-muted" style={{ fontSize: 11.5 }}>from {b.bankAccount}</div>}
                    </td>
                    <td>{formatDate(b.payDate)}</td>
                    <td>{b.reference || <span className="text-muted">—</span>}</td>
                    <td className="num">{b.count}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(b.total)}</td>
                    <td><span className={`badge ${b.status === 'PAID' ? 'badge-success' : 'badge-info'}`}>{b.status === 'PAID' ? 'Paid' : 'Prepared'}</span></td>
                    <td>
                      <div className="row-actions">
                        {b.mode === 'BANK' && (
                          <>
                            <button className="btn btn-secondary btn-sm" onClick={() => downloadBankFile(b)}>⤓ Bank File</button>
                            <Link to={`/payroll/reports/bank-advice?batchId=${b.id}`} className="btn btn-secondary btn-sm">Bank Advice</Link>
                          </>
                        )}
                        {b.status !== 'PAID' && (
                          <button className="btn btn-primary btn-sm" onClick={() => openPaid(b)}>Mark Paid</button>
                        )}
                        <button className="btn btn-danger btn-sm" disabled={saving}
                          onClick={async () => await confirmDialog(b.status === 'PAID'
                            ? `Delete batch #${b.batchNo}? Its ${b.count} salaries will show as unpaid again.`
                            : `Delete batch #${b.batchNo}?`)
                            && act(() => payrollAPI.deletePayoutBatch(b.id))}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.batches.some((b: any) => b.mode === 'BANK') && !hasAccount && (
          <p className="text-muted" style={{ fontSize: 12.5, padding: '12px 22px' }}>
            The bank advice needs the account salaries are paid from. Add it in{' '}
            <Link to="/organization?tab=bank">Company Settings → Bank accounts</Link>.
          </p>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Salaries</h3>
          <div className="segmented">
            {[['ALL', 'All'], ['UNPAID', 'Unpaid'], ['IN_BATCH', 'In a batch'], ['PAID', 'Paid'], ['HELD', 'On hold']].map(([value, label]) => (
              <button key={value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>{label}</button>
            ))}
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState icon="▤" title="Nothing here" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th><th>Mode</th><th className="num">Net salary</th><th className="num">Claims</th>
                  <th className="num">To pay</th><th>Status</th><th>Paid on</th><th>Reference</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{r.person.name}</span>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>{r.person.employeeNo}</div>
                    </td>
                    <td>
                      {r.modeLabel}
                      {r.mode === 'BANK' && !r.hasBankDetails && r.amount > 0 && (
                        <div style={{ fontSize: 11.5, color: 'var(--danger)' }}>
                          <Link to={`/people/${r.person.id}`} style={{ color: 'inherit' }}>Bank details missing</Link>
                        </div>
                      )}
                    </td>
                    <td className="num">{formatINR(r.netPayable)}</td>
                    <td className="num text-muted">{r.reimbursement ? formatINR(r.reimbursement) : '—'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(r.amount)}</td>
                    <td>
                      <span className={`badge ${STATE_BADGES[r.state][0]}`}>{STATE_BADGES[r.state][1]}</span>
                      {r.state === 'IN_BATCH' && <span className="text-muted" style={{ fontSize: 11.5 }}> #{r.batchNo}</span>}
                      {r.state === 'HELD' && r.holdReason && <div className="text-muted" style={{ fontSize: 11.5 }}>{r.holdReason}</div>}
                    </td>
                    <td>{r.paidOn ? formatDate(r.paidOn) : <span className="text-muted">—</span>}</td>
                    <td>{r.paymentRef || <span className="text-muted">—</span>}</td>
                    <td>
                      <div className="row-actions">
                        {r.state === 'HELD' && (
                          <button className="btn btn-secondary btn-sm" disabled={saving}
                            onClick={() => act(() => payrollAPI.releaseSalary(r.id), `${r.person.name}'s salary is released for payment.`)}>
                            Release
                          </button>
                        )}
                        {r.state === 'IN_BATCH' && (
                          <button className="btn btn-ghost btn-sm" disabled={saving}
                            onClick={() => act(() => payrollAPI.removeFromBatch(r.id))}>
                            Take Out
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* New batch */}
      <Modal title={batchForm ? `${batchForm.label} Batch` : ''} open={Boolean(batchForm)} onClose={() => setBatchForm(null)}>
        {batchForm && (
          <form onSubmit={handleCreateBatch}>
            <p style={{ fontSize: 13.5, marginBottom: 14 }}>
              <strong>{batchForm.count}</strong> {batchForm.count === 1 ? 'salary' : 'salaries'}, <strong>{formatINR(batchForm.amount)}</strong> in all.
            </p>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Payment date *</label>
                <input className="input" type="date" required value={batchForm.payDate}
                  onChange={e => setBatchForm({ ...batchForm, payDate: e.target.value })} />
              </div>
              <div className="field">
                <label>Reference</label>
                <input className="input" value={batchForm.reference}
                  placeholder={batchForm.mode === 'BANK' ? 'Bank reference, if known' : ''}
                  onChange={e => setBatchForm({ ...batchForm, reference: e.target.value })} />
              </div>
              {batchForm.mode === 'BANK' && data.bankAccounts.length > 0 && (
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Paid from</label>
                  <select className="select" value={batchForm.bankAccountId}
                    onChange={e => setBatchForm({ ...batchForm, bankAccountId: e.target.value })}>
                    {data.bankAccounts.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.name}{a.isDefault ? ' (default)' : ''}</option>
                    ))}
                  </select>
                  <span className="hint">The company account the bank transfer advice asks the bank to debit.</span>
                </div>
              )}
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Notes</label>
                <input className="input" value={batchForm.notes}
                  onChange={e => setBatchForm({ ...batchForm, notes: e.target.value })} />
              </div>
            </div>
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
              Creating the batch does not mark anything paid. {batchForm.mode === 'BANK' ? 'Download the bank file, make the transfer, then mark the batch paid.' : 'Mark it paid once the money has been handed over.'}
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setBatchForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Batch'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Paid outside the system */}
      <Modal title="Mark as paid outside the system" open={Boolean(outsideForm)} onClose={() => setOutsideForm(null)}>
        {outsideForm && (
          <form onSubmit={handlePaidOutside}>
            <p style={{ fontSize: 13.5, marginBottom: 14 }}>
              <strong>{outside.payable.count}</strong> unpaid {outside.payable.count === 1 ? 'salary' : 'salaries'} of {monthLabel(run.period)},{' '}
              <strong>{formatINR(outside.payable.amount)}</strong> in all, will be marked as paid. No payment batch or bank file is made.
              Salaries on hold or already in a batch are left as they are.
            </p>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Paid on *</label>
                <input className="input" type="date" required value={outsideForm.payDate}
                  onChange={e => setOutsideForm({ ...outsideForm, payDate: e.target.value })} />
                <span className="hint">Printed as the payment date in the payment and wage registers.</span>
              </div>
              <div className="field">
                <label>Reference</label>
                <input className="input" value={outsideForm.reference} placeholder="Paid outside the system"
                  onChange={e => setOutsideForm({ ...outsideForm, reference: e.target.value })} />
              </div>
            </div>
            {earlierCount > 0 && (
              <label className="checkbox-field" style={{ alignItems: 'flex-start', marginBottom: 14 }}>
                <input type="checkbox" style={{ marginTop: 2 }} checked={outsideForm.earlier}
                  onChange={e => setOutsideForm({ ...outsideForm, earlier: e.target.checked })} />
                <span>
                  Do the same for the {earlierCount} earlier {earlierCount === 1 ? 'month' : 'months'} with no payment recorded
                  ({monthLabel(outside.earlierMonths[0].period)}{earlierCount > 1 && <> to {monthLabel(outside.earlierMonths[earlierCount - 1].period)}</>}).
                  <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>
                    Each is marked paid on the last day of its own month. Correct a month's date by undoing it there and marking it again.
                  </span>
                </span>
              </label>
            )}
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setOutsideForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Mark as Paid'}</button>
            </div>
          </form>
        )}
      </Modal>

      {/* Mark a batch paid */}
      <Modal size="lg" title={paidForm ? `Mark Batch #${paidForm.batch.batchNo} Paid` : ''} open={Boolean(paidForm)} onClose={() => setPaidForm(null)}>
        {paidForm && (
          <form onSubmit={handleMarkPaid}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>Paid on *</label>
                <input className="input" type="date" required value={paidForm.payDate}
                  onChange={e => setPaidForm({ ...paidForm, payDate: e.target.value })} />
              </div>
              <div className="field">
                <label>{paidForm.batch.mode === 'BANK' ? 'Bank reference (UTR)' : 'Reference'}</label>
                <input className="input" value={paidForm.reference}
                  onChange={e => setPaidForm({ ...paidForm, reference: e.target.value })} />
                <span className="hint">Used for every salary that has no reference of its own.</span>
              </div>
            </div>
            {paidForm.batch.mode !== 'BANK' && (
              <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto', marginBottom: 14 }}>
                <table className="table">
                  <thead><tr><th>Employee</th><th className="num">Amount</th><th>{paidForm.batch.mode === 'CHEQUE' ? 'Cheque number' : 'Reference'}</th></tr></thead>
                  <tbody>
                    {paidForm.batch.entries.map((x: any) => (
                      <tr key={x.id}>
                        <td style={{ fontWeight: 600 }}>{x.person.name}</td>
                        <td className="num">{formatINR(x.amount)}</td>
                        <td>
                          <input className="input" style={{ maxWidth: 200 }} value={paidForm.refs[x.id] || ''}
                            onChange={e => setPaidForm({ ...paidForm, refs: { ...paidForm.refs, [x.id]: e.target.value } })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p style={{ fontSize: 13.5, marginBottom: 14 }}>
              {paidForm.batch.count} {paidForm.batch.count === 1 ? 'salary' : 'salaries'}, <strong>{formatINR(paidForm.batch.total)}</strong>, will be marked paid.
            </p>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPaidForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Mark Paid'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
