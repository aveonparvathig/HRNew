import { useParams, useNavigate, Link } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { incomeAPI } from '../../api/income';
import {
  PageHeader, StatCard, StatusBadge, EmptyState, LoadingBlock, ErrorAlert, Modal, BackButton,
} from '../../components/ui';
import BillingFormModal from '../../components/BillingFormModal';
import { formatINR, formatDate } from '../../utils/format';
import { useRole } from '../../store/authStore';

const INVOICE_LABELS: Record<string, string> = {
  PROFORMA: 'Proforma generated',
  ALREADY_SENT: 'Proforma sent',
  TAX_SENT: 'Tax invoice sent',
  NOT_NEEDED: 'Not needed',
  WAITING: 'Waiting',
};

const EMPTY_PAYMENT = {
  amount: '', receivedOn: new Date().toISOString().split('T')[0], mode: '', note: '',
};

export default function ClientDetail() {
  const { isSA } = useRole();
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<any>(null);
  const [meta, setMeta] = useState<any>({ academicYears: [], engineers: [], invoiceStatuses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const [billingModal, setBillingModal] = useState<{ open: boolean; billing: any | null }>({ open: false, billing: null });
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', agreementStatus: '', notes: '', isActive: true });
  const [paymentModal, setPaymentModal] = useState<any>(null); // billing row
  const [paymentForm, setPaymentForm] = useState(EMPTY_PAYMENT);
  const [saving, setSaving] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [clientRes, metaRes] = await Promise.all([
        incomeAPI.getClientDetail(clientId!),
        incomeAPI.getMeta(),
      ]);
      setClient(clientRes.data);
      setMeta(metaRes.data);
      setEditForm({
        name: clientRes.data.name,
        agreementStatus: clientRes.data.agreementStatus || '',
        notes: clientRes.data.notes || '',
        isActive: clientRes.data.isActive,
      });
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch client');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleUpdateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await incomeAPI.updateClient(clientId!, editForm);
      setEditModal(false);
      fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update client');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBilling = async (billing: any) => {
    if (!window.confirm(`Delete the ${billing.periodLabel || billing.academicYear} billing period?`)) return;
    try {
      await incomeAPI.deleteBilling(billing.id);
      fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete billing');
    }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModal) return;
    setSaving(true);
    try {
      await incomeAPI.addPayment(paymentModal.id, {
        amount: parseFloat(paymentForm.amount),
        receivedOn: paymentForm.receivedOn || undefined,
        mode: paymentForm.mode,
        note: paymentForm.note,
      });
      setPaymentModal(null);
      setPaymentForm(EMPTY_PAYMENT);
      setExpanded(paymentModal.id);
      fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to record payment');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePayment = async (payment: any) => {
    if (!window.confirm(`Delete this ${formatINR(payment.amount)} payment entry?`)) return;
    try {
      await incomeAPI.deletePayment(payment.id);
      fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete payment');
    }
  };

  if (loading) return <LoadingBlock label="Loading client…" />;
  if (!client) {
    return (
      <EmptyState icon="◉" title="Client not found" message="This client may have been deleted."
        action={<button className="btn btn-secondary" onClick={() => navigate('/income/clients')}>Back to Clients</button>} />
    );
  }

  const totals = client.totals;
  const ob = client.onboarding;

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/income/clients">Clients</Link>
        <span>/</span>
        <span>{client.name}</span>
      </div>

      <PageHeader
        title={client.name}
        subtitle={[
          client.agreementStatus,
          `Added ${formatDate(client.createdAt)}`,
        ].filter(Boolean).join(' · ')}
        actions={
          <>
            <StatusBadge status={client.isActive ? 'active' : 'inactive'} />
            <Link to={`/income/clients/${client.id}/implementation`} className="btn btn-secondary">
              Implementation
            </Link>
            <button className="btn btn-secondary" onClick={() => setEditModal(true)}>Edit</button>
            <button className="btn btn-primary" onClick={() => setBillingModal({ open: true, billing: null })}>
              + Add Year
            </button>
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {ob && (ob.agreement.expired || ob.agreement.expiring) && (
        <div className="alert alert-error">
          <span>⚠</span>
          <span>Agreement: {ob.agreement.label}. <Link to={`/income/clients/${client.id}/implementation`}>Review implementation →</Link></span>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Total Billed" value={formatINR(totals.billed)} icon="▤" tone="primary" />
        <StatCard label="Received" value={formatINR(totals.received)} icon="✓" tone="success" />
        <StatCard label="Balance" value={formatINR(totals.balance)} icon="◷"
          tone={totals.balance > 0 ? 'warning' : 'success'} />
        <StatCard label="Collection" value={`${totals.collectionPct}%`} icon="◔" tone="info"
          sub={ob ? `Stage: ${ob.stage?.toLowerCase() || '—'}` : undefined} />
      </div>

      {client.notes && (
        <div className="card card-pad mb-24">
          <h3 style={{ fontSize: 14, marginBottom: 6 }}>Notes</h3>
          <p className="text-muted" style={{ whiteSpace: 'pre-wrap' }}>{client.notes}</p>
        </div>
      )}

      {/* Billing sheet */}
      <div className="card">
        <div className="card-header">
          <h3>Billing by academic year</h3>
          <span className="text-muted" style={{ fontSize: 12.5 }}>Click a row to see payments</span>
        </div>
        {client.billings.length === 0 ? (
          <EmptyState icon="▤" title="No billing years yet"
            message="Add the client's first academic year to start tracking."
            action={<button className="btn btn-primary" onClick={() => setBillingModal({ open: true, billing: null })}>+ Add Year</button>} />
        ) : (
          <div className="table-wrap">
            <table className="table table-sticky-actions">
              <thead>
                <tr>
                  <th>Period</th><th>Engineer</th><th className="num">Students</th>
                  <th className="num">Rate</th><th className="num">Net</th>
                  <th className="num">Prev Pending</th><th className="num">Total Due</th>
                  <th className="num">Received</th><th className="num">Balance</th>
                  <th>Invoice</th><th>Follow-up</th><th />
                </tr>
              </thead>
              <tbody>
                {client.billings.map((b: any) => (
                  <>
                    <tr key={b.id} onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                      style={{ cursor: 'pointer' }}>
                      <td style={{ fontWeight: 600 }}>
                        {expanded === b.id ? '▾ ' : '▸ '}{b.periodLabel || b.academicYear}
                      </td>
                      <td className="text-muted">{b.engineer || '—'}</td>
                      <td className="num">{b.studentCount ?? '—'}</td>
                      <td className="num">{b.rate != null ? formatINR(b.rate) : (b.overrideAmounts ? 'fixed' : '—')}</td>
                      <td className="num">{formatINR(b.netAmount)}</td>
                      <td className="num">
                        {formatINR(b.previousPending)}
                        {b.mismatch && (
                          <span className="mismatch-flag" style={{ marginLeft: 6 }}
                            title={`Prior year closed at ${formatINR(b.priorBalance)} — carry-forward doesn't match`}>
                            ≠ {formatINR(b.priorBalance)}
                          </span>
                        )}
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>{formatINR(b.totalDue)}</td>
                      <td className="num text-success">{formatINR(b.received)}</td>
                      <td className={`num ${b.balance > 0 ? 'text-warning' : 'text-success'}`} style={{ fontWeight: 600 }}>
                        {formatINR(b.balance)}
                      </td>
                      <td>
                        {b.invoiceStatus
                          ? <span className={`badge ${b.invoiceStatus === 'WAITING' ? 'badge-warning' : b.invoiceStatus === 'TAX_SENT' ? 'badge-success' : 'badge-info'}`}>
                              {INVOICE_LABELS[b.invoiceStatus] || b.invoiceStatus}
                            </span>
                          : <span className="text-muted">—</span>}
                      </td>
                      <td>
                        {b.nextFollowupDate ? (
                          <span className={`badge ${b.followupOverdue ? 'badge-danger' : 'badge-neutral'}`}
                            title={b.followupNote}>
                            {b.followupOverdue && <span className="dot" />}
                            {formatDate(b.nextFollowupDate)}
                          </span>
                        ) : <span className="text-muted">—</span>}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="row-actions">
                          <button className="btn btn-primary btn-sm"
                            onClick={() => { setPaymentForm(EMPTY_PAYMENT); setPaymentModal(b); }}>
                            + Payment
                          </button>
                          <button className="btn btn-secondary btn-sm"
                            onClick={() => setBillingModal({ open: true, billing: b })}>
                            Edit
                          </button>
                          {isSA && (<button className='btn btn-danger btn-sm' onClick={() => handleDeleteBilling(b)}>Del</button>)}
                        </div>
                      </td>
                    </tr>
                    {expanded === b.id && (
                      <tr key={`${b.id}-payments`}>
                        <td colSpan={12} style={{ background: 'var(--surface-2)', padding: '14px 24px' }}>
                          {b.remarks && (
                            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 10 }}>
                              <strong>Remarks:</strong> {b.remarks}
                            </p>
                          )}
                          {b.payments.length === 0 ? (
                            <p className="text-muted" style={{ fontSize: 13 }}>No payments recorded for {b.periodLabel || b.academicYear}.</p>
                          ) : (
                            <table className="table" style={{ background: 'var(--surface)' }}>
                              <thead>
                                <tr>
                                  <th>Date</th><th className="num">Amount</th>
                                  <th>Mode</th><th>Note</th><th />
                                </tr>
                              </thead>
                              <tbody>
                                {b.payments.map((p: any) => (
                                  <tr key={p.id}>
                                    <td>{p.receivedOn ? formatDate(p.receivedOn) : <span className="text-muted">opening figure</span>}</td>
                                    <td className="num text-success" style={{ fontWeight: 600 }}>+{formatINR(p.amount)}</td>
                                    <td className="text-muted">{p.mode || '—'}</td>
                                    <td className="text-muted">{p.note || '—'}</td>
                                    <td>
                                      <div className="row-actions">
                                        {isSA && (<button className='btn btn-danger btn-sm' onClick={() => handleDeletePayment(p)}>Delete</button>)}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                <tr className="totals-row">
                  <td colSpan={6}>Totals</td>
                  <td className="num">{formatINR(totals.billed)}</td>
                  <td className="num">{formatINR(totals.received)}</td>
                  <td className="num">{formatINR(totals.balance)}</td>
                  <td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Billing create/edit */}
      <BillingFormModal
        open={billingModal.open}
        billing={billingModal.billing}
        clientId={client.id}
        meta={meta}
        onClose={() => setBillingModal({ open: false, billing: null })}
        onSaved={fetchAll}
      />

      {/* Edit client */}
      <Modal title="Edit Client" open={editModal} onClose={() => setEditModal(false)}>
        <form onSubmit={handleUpdateClient}>
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Client name *</label>
            <input className="input" value={editForm.name} required
              onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>Agreement status</label>
              <input className="input" value={editForm.agreementStatus}
                onChange={e => setEditForm({ ...editForm, agreementStatus: e.target.value })} />
            </div>
            <div className="field">
              <label>State</label>
              <select className="select" value={editForm.isActive ? 'active' : 'inactive'}
                onChange={e => setEditForm({ ...editForm, isActive: e.target.value === 'active' })}>
                <option value="active">Active</option>
                <option value="inactive">Discontinued</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>Notes</label>
            <textarea className="input" rows={3} value={editForm.notes}
              onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setEditModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add payment */}
      <Modal title={paymentModal ? `Record Payment — ${paymentModal.periodLabel || paymentModal.academicYear}` : ''}
        open={Boolean(paymentModal)} onClose={() => setPaymentModal(null)}>
        {paymentModal && (
          <form onSubmit={handleAddPayment}>
            <div className="calc-card" style={{ marginBottom: 16 }}>
              <div className="calc-row">
                <span>Total due {paymentModal.periodLabel || paymentModal.academicYear}</span>
                <span className="amount">{formatINR(paymentModal.totalDue)}</span>
              </div>
              <div className="calc-row">
                <span>Already received</span>
                <span className="amount text-success">{formatINR(paymentModal.received)}</span>
              </div>
              <div className="calc-row total grand">
                <span>Balance</span>
                <span className="amount">{formatINR(paymentModal.balance)}</span>
              </div>
            </div>
            <div className="form-grid" style={{ marginBottom: 16 }}>
              <div className="field">
                <label>Amount *</label>
                <div className="input-unit">
                  <span className="unit">₹</span>
                  <input className="input" type="number" min={0.01} step="0.01" autoFocus required
                    placeholder="0"
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                </div>
                {paymentModal.balance > 0 && (
                  <div className="chip-row" style={{ marginTop: 8 }}>
                    <button type="button" className="chip"
                      onClick={() => setPaymentForm({ ...paymentForm, amount: String(paymentModal.balance) })}>
                      Full balance — {formatINR(paymentModal.balance)}
                    </button>
                    <button type="button" className="chip"
                      onClick={() => setPaymentForm({ ...paymentForm, amount: String(Math.round(paymentModal.balance / 2 * 100) / 100) })}>
                      Half
                    </button>
                  </div>
                )}
              </div>
              <div className="field">
                <label>Received on</label>
                <input className="input" type="date" value={paymentForm.receivedOn}
                  onChange={e => setPaymentForm({ ...paymentForm, receivedOn: e.target.value })} />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Payment mode</label>
              <div className="chip-row" style={{ marginBottom: 8 }}>
                {['NEFT', 'UPI', 'Cheque', 'Cash'].map(m => (
                  <button key={m} type="button"
                    className={`chip ${paymentForm.mode === m ? 'active' : ''}`}
                    onClick={() => setPaymentForm({ ...paymentForm, mode: paymentForm.mode === m ? '' : m })}>
                    {m}
                  </button>
                ))}
              </div>
              <input className="input" placeholder="Or type another mode…" value={paymentForm.mode}
                onChange={e => setPaymentForm({ ...paymentForm, mode: e.target.value })} />
            </div>
            <div className="field">
              <label>Note</label>
              <input className="input" placeholder="e.g. UTR number, instalment 2 of 3" value={paymentForm.note}
                onChange={e => setPaymentForm({ ...paymentForm, note: e.target.value })} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setPaymentModal(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Recording…' : `Record ${paymentForm.amount ? formatINR(Number(paymentForm.amount)) : 'Payment'}`}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
