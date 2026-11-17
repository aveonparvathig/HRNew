import { useState, useEffect, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal, BackButton, SuccessAlert,
} from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
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
          <ButtonLink to={`/payroll/runs/${run.id}/reports/payment-register`}>Payment register</ButtonLink>
          <ButtonLink to={`/payroll/runs/${run.id}/reports/cash-cheque`}>Cash and cheque</ButtonLink>
          <ButtonLink to={`/payroll/runs/${run.id}/reports/payout-reconciliation`}>Reconciliation</ButtonLink>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />
      {!finalized && (
        <div className="alert alert-warning">
          <Icon name="clock" size={16} className="pr-alert-icon" />
          <span>This run is still a draft. Finalize it before creating payment batches; the amounts below may still change.</span>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="To pay" value={formatINR(totals.payable.amount)} icon="banknote" tone="primary"
          sub={`${totals.payable.count} salaries, net pay plus claims`} />
        <StatCard label="Paid" value={formatINR(totals.paid.amount)} icon="checkCircle" tone="success"
          sub={`${totals.paid.count} salaries`} />
        <StatCard label="Not yet paid" value={formatINR(totals.unpaid.amount + totals.inBatch.amount)} icon="clock" tone="warning"
          sub={`${totals.unpaid.count} not in a batch, ${totals.inBatch.count} in a batch`} />
        <StatCard label="On hold" value={formatINR(totals.held.amount)} icon="shield" tone="info"
          sub={totals.held.count ? `${totals.held.count} ${totals.held.count === 1 ? 'salary' : 'salaries'} held back` : 'None'} />
      </div>

      {finalized && data.unpaidByMode.length > 0 && (
        <div className="card card-pad mb-24">
          <h3 className="pr-card-title">Ready to pay</h3>
          <p className="text-sm-muted mb-14">
            A batch takes every unpaid salary of one payment mode. An employee's mode is set on their profile.
          </p>
          <div className="report-grid">
            {data.unpaidByMode.map((m: any) => (
              <button key={m.mode} className="report-tile" disabled={m.count === 0}
                onClick={() => setBatchForm({
                  mode: m.mode, label: m.label, count: m.count, amount: m.amount, payDate: data.today, reference: '', notes: '',
                  bankAccountId: m.mode === 'BANK' ? data.bankAccounts[0]?.id || '' : '',
                })}>
                <strong>{m.label} — <span className="num">{formatINR(m.amount)}</span></strong>
                <span>
                  {m.count} {m.count === 1 ? 'salary' : 'salaries'} ready. Create a batch.
                  {m.missingBank > 0 && ` ${m.missingBank} left out: account number or IFSC missing.`}
                </span>
              </button>
            ))}
          </div>
          {outside.payable.count > 0 && (
            <p className="text-sm-muted pr-mt-14">
              Already paid some other way, or before payments were recorded here?{' '}
              <button className="link-button" onClick={() => setOutsideForm({ payDate: outside.suggestedDate, reference: '', earlier: false })}>
                Mark this month as paid outside the system
              </button>
            </p>
          )}
        </div>
      )}

      {outside.paid.count > 0 && (
        <div className="alert alert-info">
          <Icon name="info" size={16} className="pr-alert-icon" />
          <span className="pr-grow">
            {outside.paid.count} {outside.paid.count === 1 ? 'salary' : 'salaries'} ({formatINR(outside.paid.amount)}) marked as paid outside the system, with no payment batch.
          </span>
          <Button size="sm" disabled={saving}
            onClick={async () => await confirmDialog({
              title: 'Undo the payment marking?',
              message: `${outside.paid.count} ${outside.paid.count === 1 ? 'salary' : 'salaries'} of ${monthLabel(run.period)} will show as unpaid again.`,
              confirmLabel: 'Undo',
            }) && act(() => payrollAPI.undoPaidOutside(run.id))}>
            Undo
          </Button>
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
                    <td><span className="pr-strong num">{b.batchRef || `#${b.batchNo}`}</span><div className="pr-sub">{b.createdBy}</div></td>
                    <td>
                      {b.modeLabel}
                      {b.bankAccount && <div className="pr-sub">from {b.bankAccount}</div>}
                    </td>
                    <td>{formatDate(b.payDate)}</td>
                    <td>{b.reference || <span className="text-muted">—</span>}</td>
                    <td className="num">{b.count}</td>
                    <td className="num pr-strong">{formatINR(b.total)}</td>
                    <td><span className={`badge ${b.status === 'PAID' ? 'badge-success' : 'badge-info'}`}>{b.status === 'PAID' ? 'Paid' : 'Prepared'}</span></td>
                    <td>
                      <div className="row-actions">
                        {b.mode === 'BANK' && (
                          <>
                            <Button size="sm" onClick={() => downloadBankFile(b)}>Bank file</Button>
                            <ButtonLink to={`/payroll/reports/bank-advice?batchId=${b.id}`} size="sm">Bank advice</ButtonLink>
                          </>
                        )}
                        {b.status !== 'PAID' && (
                          <Button variant="primary" size="sm" onClick={() => openPaid(b)}>Mark paid</Button>
                        )}
                        <Button variant="danger" size="sm" disabled={saving}
                          onClick={async () => await confirmDialog(b.status === 'PAID'
                            ? `Delete batch #${b.batchNo}? Its ${b.count} salaries will show as unpaid again.`
                            : `Delete batch #${b.batchNo}?`)
                            && act(() => payrollAPI.deletePayoutBatch(b.id))}>
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data.batches.some((b: any) => b.mode === 'BANK') && !hasAccount && (
          <p className="text-sm-muted pr-card-note">
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
                      <span className="pr-strong">{r.person.name}</span>
                      <div className="pr-sub num">{r.person.employeeNo}</div>
                    </td>
                    <td>
                      {r.modeLabel}
                      {r.mode === 'BANK' && !r.hasBankDetails && r.amount > 0 && (
                        <div className="pr-sub pr-sub-danger">
                          <Link to={`/people/${r.person.id}`}>Bank details missing</Link>
                        </div>
                      )}
                    </td>
                    <td className="num">{formatINR(r.netPayable)}</td>
                    <td className="num text-muted">{r.reimbursement ? formatINR(r.reimbursement) : '—'}</td>
                    <td className="num pr-strong">{formatINR(r.amount)}</td>
                    <td>
                      <span className={`badge ${STATE_BADGES[r.state][0]}`}>{STATE_BADGES[r.state][1]}</span>
                      {r.state === 'IN_BATCH' && <span className="pr-sub num"> #{r.batchNo}</span>}
                      {r.state === 'HELD' && r.holdReason && <div className="pr-sub">{r.holdReason}</div>}
                    </td>
                    <td>{r.paidOn ? formatDate(r.paidOn) : <span className="text-muted">—</span>}</td>
                    <td>{r.paymentRef || <span className="text-muted">—</span>}</td>
                    <td>
                      <div className="row-actions">
                        {r.state === 'HELD' && (
                          <Button size="sm" disabled={saving}
                            onClick={() => act(() => payrollAPI.releaseSalary(r.id), `${r.person.name}'s salary is released for payment.`)}>
                            Release
                          </Button>
                        )}
                        {r.state === 'IN_BATCH' && (
                          <Button variant="ghost" size="sm" disabled={saving}
                            onClick={() => act(() => payrollAPI.removeFromBatch(r.id))}>
                            Take out
                          </Button>
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
      <Modal title={batchForm ? `${batchForm.label} batch` : ''} open={Boolean(batchForm)} onClose={() => setBatchForm(null)}>
        {batchForm && (
          <form onSubmit={handleCreateBatch}>
            <p className="pr-modal-summary">
              <strong>{batchForm.count}</strong> {batchForm.count === 1 ? 'salary' : 'salaries'}, <strong>{formatINR(batchForm.amount)}</strong> in all.
            </p>
            <div className="form-grid mb-14">
              <div className="field">
                <label htmlFor="batch-date">Payment date *</label>
                <input id="batch-date" className="input" type="date" required value={batchForm.payDate}
                  onChange={e => setBatchForm({ ...batchForm, payDate: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="batch-ref">Reference</label>
                <input id="batch-ref" className="input" value={batchForm.reference}
                  placeholder={batchForm.mode === 'BANK' ? 'Bank reference, if known' : ''}
                  onChange={e => setBatchForm({ ...batchForm, reference: e.target.value })} />
              </div>
              {batchForm.mode === 'BANK' && data.bankAccounts.length > 0 && (
                <div className="field pr-span-all">
                  <label htmlFor="batch-account">Paid from</label>
                  <select id="batch-account" className="select" value={batchForm.bankAccountId}
                    onChange={e => setBatchForm({ ...batchForm, bankAccountId: e.target.value })}>
                    {data.bankAccounts.map((a: any) => (
                      <option key={a.id} value={a.id}>{a.name}{a.isDefault ? ' (default)' : ''}</option>
                    ))}
                  </select>
                  <span className="hint">The company account the bank transfer advice asks the bank to debit.</span>
                </div>
              )}
              <div className="field pr-span-all">
                <label htmlFor="batch-notes">Notes</label>
                <input id="batch-notes" className="input" value={batchForm.notes}
                  onChange={e => setBatchForm({ ...batchForm, notes: e.target.value })} />
              </div>
            </div>
            <p className="text-sm-muted mb-14">
              Creating the batch does not mark anything paid. {batchForm.mode === 'BANK' ? 'Download the bank file, make the transfer, then mark the batch paid.' : 'Mark it paid once the money has been handed over.'}
            </p>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setBatchForm(null)}>Cancel</Button>
              <Button type="submit" variant="primary" loading={saving}>{saving ? 'Creating…' : 'Create batch'}</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Paid outside the system */}
      <Modal title="Mark as paid outside the system" open={Boolean(outsideForm)} onClose={() => setOutsideForm(null)}>
        {outsideForm && (
          <form onSubmit={handlePaidOutside}>
            <p className="pr-modal-summary">
              <strong>{outside.payable.count}</strong> unpaid {outside.payable.count === 1 ? 'salary' : 'salaries'} of {monthLabel(run.period)},{' '}
              <strong>{formatINR(outside.payable.amount)}</strong> in all, will be marked as paid. No payment batch or bank file is made.
              Salaries on hold or already in a batch are left as they are.
            </p>
            <div className="form-grid mb-14">
              <div className="field">
                <label htmlFor="outside-date">Paid on *</label>
                <input id="outside-date" className="input" type="date" required value={outsideForm.payDate}
                  onChange={e => setOutsideForm({ ...outsideForm, payDate: e.target.value })} />
                <span className="hint">Printed as the payment date in the payment and wage registers.</span>
              </div>
              <div className="field">
                <label htmlFor="outside-ref">Reference</label>
                <input id="outside-ref" className="input" value={outsideForm.reference} placeholder="Paid outside the system"
                  onChange={e => setOutsideForm({ ...outsideForm, reference: e.target.value })} />
              </div>
            </div>
            {earlierCount > 0 && (
              <label className="checkbox-field pr-check-top mb-14">
                <input type="checkbox" checked={outsideForm.earlier}
                  onChange={e => setOutsideForm({ ...outsideForm, earlier: e.target.checked })} />
                <span>
                  Do the same for the {earlierCount} earlier {earlierCount === 1 ? 'month' : 'months'} with no payment recorded
                  ({monthLabel(outside.earlierMonths[0].period)}{earlierCount > 1 && <> to {monthLabel(outside.earlierMonths[earlierCount - 1].period)}</>}).
                  <span className="pr-sub pr-block">
                    Each is marked paid on the last day of its own month. Correct a month's date by undoing it there and marking it again.
                  </span>
                </span>
              </label>
            )}
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setOutsideForm(null)}>Cancel</Button>
              <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Mark as paid'}</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Mark a batch paid */}
      <Modal size="lg" title={paidForm ? `Mark batch #${paidForm.batch.batchNo} paid` : ''} open={Boolean(paidForm)} onClose={() => setPaidForm(null)}>
        {paidForm && (
          <form onSubmit={handleMarkPaid}>
            <div className="form-grid mb-14">
              <div className="field">
                <label htmlFor="paid-date">Paid on *</label>
                <input id="paid-date" className="input" type="date" required value={paidForm.payDate}
                  onChange={e => setPaidForm({ ...paidForm, payDate: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="paid-ref">{paidForm.batch.mode === 'BANK' ? 'Bank reference (UTR)' : 'Reference'}</label>
                <input id="paid-ref" className="input" value={paidForm.reference}
                  onChange={e => setPaidForm({ ...paidForm, reference: e.target.value })} />
                <span className="hint">Used for every salary that has no reference of its own.</span>
              </div>
            </div>
            {paidForm.batch.mode !== 'BANK' && (
              <div className="table-wrap pr-scroll-280 mb-14">
                <table className="table">
                  <thead><tr><th>Employee</th><th className="num">Amount</th><th>{paidForm.batch.mode === 'CHEQUE' ? 'Cheque number' : 'Reference'}</th></tr></thead>
                  <tbody>
                    {paidForm.batch.entries.map((x: any) => (
                      <tr key={x.id}>
                        <td className="pr-strong">{x.person.name}</td>
                        <td className="num">{formatINR(x.amount)}</td>
                        <td>
                          <input className="input pr-input-200" aria-label={`Reference for ${x.person.name}`} value={paidForm.refs[x.id] || ''}
                            onChange={e => setPaidForm({ ...paidForm, refs: { ...paidForm.refs, [x.id]: e.target.value } })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="pr-modal-summary">
              {paidForm.batch.count} {paidForm.batch.count === 1 ? 'salary' : 'salaries'}, <strong>{formatINR(paidForm.batch.total)}</strong>, will be marked paid.
            </p>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setPaidForm(null)}>Cancel</Button>
              <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Mark paid'}</Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
