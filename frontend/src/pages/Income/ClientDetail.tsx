import { useParams, useNavigate, Link } from 'react-router-dom';
import { Fragment, useState, useEffect, useCallback } from 'react';
import { incomeAPI } from '../../api/income';
import {
  PageHeader, StatCard, StatusBadge, EmptyState, LoadingBlock, ErrorAlert, Modal, BackButton,
} from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
import BillingFormModal from '../../components/BillingFormModal';
import ProformaFormModal from '../../components/ProformaFormModal';
import { ClientAddressFields } from '../../components/ClientAddressFields';
import { EMPTY_ADDRESS, addressOf } from '../../utils/clientAddress';
import { formatINR, formatDate } from '../../utils/format';
import { downloadHtmlAsPdf } from '../../utils/htmlToPdf';
import { useRole } from '../../store/authStore';
import { confirmDialog } from '../../components/feedback';

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
  const [exportModal, setExportModal] = useState(false);
  const [exportYears, setExportYears] = useState<string[]>([]); // [] = all periods
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [billingModal, setBillingModal] = useState<{ open: boolean; billing: any | null }>({ open: false, billing: null });
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', agreementStatus: '', notes: '', isActive: true, ...EMPTY_ADDRESS });
  const [paymentModal, setPaymentModal] = useState<any>(null); // billing row
  const [proformaModal, setProformaModal] = useState<any>(null); // billing row
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
        ...addressOf(clientRes.data.onboarding),
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
    if (!await confirmDialog(`Delete the ${billing.periodLabel || billing.academicYear} billing period?`)) return;
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
    if (!await confirmDialog(`Delete this ${formatINR(payment.amount)} payment entry?`)) return;
    try {
      await incomeAPI.deletePayment(payment.id);
      fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete payment');
    }
  };

  const toggleExportYear = (year: string) =>
    setExportYears(ys => ys.includes(year) ? ys.filter(y => y !== year) : [...ys, year]);

  const yearsParam = () => exportYears.length ? exportYears.join(',') : undefined;
  const yearsSuffix = () =>
    exportYears.length === 1 ? `_${exportYears[0]}`
      : exportYears.length ? `_${exportYears.length}-periods` : '';

  const handleExportXlsx = async () => {
    setExporting('xlsx');
    try {
      const res = await incomeAPI.exportClientXlsx(client.id, yearsParam());
      const url = URL.createObjectURL(new Blob([res.data],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${client.name.replace(/[^\w]+/g, '_')}_statement${yearsSuffix()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      setExportModal(false);
    } catch {
      setError('Failed to export the statement');
    } finally {
      setExporting(null);
    }
  };

  const handleExportPdf = async () => {
    setExporting('pdf');
    try {
      const res = await incomeAPI.getClientStatement(client.id, yearsParam());
      await downloadHtmlAsPdf(res.data.html, res.data.filename);
      setExportModal(false);
    } catch {
      setError('Failed to export the PDF statement');
    } finally {
      setExporting(null);
    }
  };

  if (loading) return <LoadingBlock label="Loading client…" />;
  if (!client) {
    return (
      <EmptyState icon="◉" title="Client not found" message="This client may have been deleted."
        action={<Button onClick={() => navigate('/income/clients')}>Back to clients</Button>} />
    );
  }

  const totals = client.totals;
  const ob = client.onboarding;
  const openAddYear = () => setBillingModal({ open: true, billing: null });

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
            <Button icon="download" onClick={() => setExportModal(true)}>Export</Button>
            <ButtonLink to={`/income/clients/${client.id}/implementation`} icon="layers">
              Implementation
            </ButtonLink>
            <Button icon="pen" onClick={() => setEditModal(true)}>Edit</Button>
            <Button variant="accent" icon="plus" onClick={openAddYear}>
              Add year
            </Button>
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {ob && (ob.agreement.expired || ob.agreement.expiring) && (
        <div className="alert alert-error">
          <Icon name="alert" size={16} className="ic-alert-icon" />
          <span>Agreement: {ob.agreement.label}. <Link to={`/income/clients/${client.id}/implementation`}>Review implementation →</Link></span>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Total billed" value={formatINR(totals.billed)} icon="receipt" tone="primary" />
        <StatCard label="Received" value={formatINR(totals.received)} icon="checkCircle" tone="success" />
        <StatCard label="Balance" value={formatINR(totals.balance)} icon="clock"
          tone={totals.balance > 0 ? 'warning' : 'success'} />
        <StatCard label="Collection" value={`${totals.collectionPct}%`} icon="chart" tone="info"
          sub={ob ? `Stage: ${ob.stage?.toLowerCase() || '—'}` : undefined} />
      </div>

      {client.notes && (
        <div className="card card-pad mb-24">
          <h3 className="ic-notes-title">Notes</h3>
          <p className="text-muted ic-notes">{client.notes}</p>
        </div>
      )}

      {/* Billing sheet */}
      <div className="card">
        <div className="card-header">
          <h3>Billing by academic year</h3>
          <span className="text-sm-muted">Click a row to see payments</span>
        </div>
        {client.billings.length === 0 ? (
          <EmptyState icon="▤" title="No billing years yet"
            message="Add the client's first academic year to start tracking."
            action={<Button icon="plus" onClick={openAddYear}>Add year</Button>} />
        ) : (
          <div className="table-wrap">
            <table className="table table-sticky-actions">
              <thead>
                <tr>
                  <th>Period</th><th>Engineer</th><th className="num">Students</th>
                  <th className="num">Rate</th><th className="num">Net</th>
                  <th className="num">Prev pending</th><th className="num">Total due</th>
                  <th className="num">Received</th><th className="num">Balance</th>
                  <th>Invoice</th><th>Follow-up</th><th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {client.billings.map((b: any) => (
                  <Fragment key={b.id}>
                    <tr className="clickable" onClick={() => setExpanded(expanded === b.id ? null : b.id)}
                      aria-expanded={expanded === b.id}>
                      <td className="ic-strong ic-nowrap">
                        <Icon name="chevron" size={14} className={`ic-caret${expanded === b.id ? ' is-open' : ''}`} />
                        {b.periodLabel || b.academicYear}
                      </td>
                      <td className="text-muted">{b.engineer || '—'}</td>
                      <td className="num">{b.studentCount ?? '—'}</td>
                      <td className="num">{b.rate != null ? formatINR(b.rate) : (b.overrideAmounts ? 'fixed' : '—')}</td>
                      <td className="num">{formatINR(b.netAmount)}</td>
                      <td className="num">
                        {formatINR(b.previousPending)}
                        {b.mismatch && (
                          <span className="mismatch-flag ic-flag-gap"
                            title={`Prior year closed at ${formatINR(b.priorBalance)} — carry-forward doesn't match`}>
                            ≠ {formatINR(b.priorBalance)}
                          </span>
                        )}
                      </td>
                      <td className="num ic-strong">{formatINR(b.totalDue)}</td>
                      <td className="num text-success">{formatINR(b.received)}</td>
                      <td className={`num ic-strong ${b.balance > 0 ? 'text-warning' : 'text-success'}`}>
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
                          <Button size="sm" icon="banknote"
                            onClick={() => { setPaymentForm(EMPTY_PAYMENT); setPaymentModal(b); }}>
                            Payment
                          </Button>
                          <Button size="sm" icon="receipt" onClick={() => setProformaModal(b)}>
                            Proforma
                          </Button>
                          <Button size="sm" onClick={() => setBillingModal({ open: true, billing: b })}>
                            Edit
                          </Button>
                          {isSA && <Button variant="danger" size="sm" onClick={() => handleDeleteBilling(b)}>Delete</Button>}
                        </div>
                      </td>
                    </tr>
                    {expanded === b.id && (
                      <tr>
                        <td colSpan={12} className="ic-expand-cell">
                          {b.remarks && (
                            <p className="text-muted ic-remarks">
                              <strong>Remarks:</strong> {b.remarks}
                            </p>
                          )}
                          {b.payments.length === 0 ? (
                            <p className="text-muted ic-empty-note">No payments recorded for {b.periodLabel || b.academicYear}.</p>
                          ) : (
                            <table className="table ic-subtable">
                              <thead>
                                <tr>
                                  <th>Date</th><th className="num">Amount</th>
                                  <th>Mode</th><th>Note</th><th><span className="sr-only">Actions</span></th>
                                </tr>
                              </thead>
                              <tbody>
                                {b.payments.map((p: any) => (
                                  <tr key={p.id}>
                                    <td>{p.receivedOn ? formatDate(p.receivedOn) : <span className="text-muted">opening figure</span>}</td>
                                    <td className="num num-pos ic-strong">+{formatINR(p.amount)}</td>
                                    <td className="text-muted">{p.mode || '—'}</td>
                                    <td className="text-muted">{p.note || '—'}</td>
                                    <td>
                                      <div className="row-actions">
                                        {isSA && <Button variant="danger" size="sm" onClick={() => handleDeletePayment(p)}>Delete</Button>}
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
                  </Fragment>
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

      {/* Proforma invoice */}
      <ProformaFormModal
        open={Boolean(proformaModal)}
        client={client}
        preselect={proformaModal ? [proformaModal.id] : []}
        onClose={() => setProformaModal(null)}
        onSaved={fetchAll}
      />

      {/* Edit client */}
      <Modal title="Edit client" open={editModal} onClose={() => setEditModal(false)}>
        <form onSubmit={handleUpdateClient}>
          <div className="field mb-16">
            <label htmlFor="edit-client-name">Client name *</label>
            <input id="edit-client-name" className="input" value={editForm.name} required
              onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <ClientAddressFields value={editForm} states={meta?.states}
            onChange={addr => setEditForm({ ...editForm, ...addr })} />
          <div className="form-grid mb-16">
            <div className="field">
              <label htmlFor="edit-client-agreement">Agreement status</label>
              <input id="edit-client-agreement" className="input" value={editForm.agreementStatus}
                onChange={e => setEditForm({ ...editForm, agreementStatus: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="edit-client-state">State</label>
              <select id="edit-client-state" className="select" value={editForm.isActive ? 'active' : 'inactive'}
                onChange={e => setEditForm({ ...editForm, isActive: e.target.value === 'active' })}>
                <option value="active">Active</option>
                <option value="inactive">Discontinued</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="edit-client-notes">Notes</label>
            <textarea id="edit-client-notes" className="input" rows={3} value={editForm.notes}
              onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
          </div>
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setEditModal(false)}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add payment */}
      <Modal title={paymentModal ? `Record payment — ${paymentModal.periodLabel || paymentModal.academicYear}` : ''}
        open={Boolean(paymentModal)} onClose={() => setPaymentModal(null)}>
        {paymentModal && (
          <form onSubmit={handleAddPayment}>
            <div className="calc-card mb-16">
              <div className="calc-row">
                <span>Total due {paymentModal.periodLabel || paymentModal.academicYear}</span>
                <span className="amount num">{formatINR(paymentModal.totalDue)}</span>
              </div>
              <div className="calc-row">
                <span>Already received</span>
                <span className="amount num text-success">{formatINR(paymentModal.received)}</span>
              </div>
              <div className="calc-row total grand">
                <span>Balance</span>
                <span className="amount num">{formatINR(paymentModal.balance)}</span>
              </div>
            </div>
            <div className="form-grid mb-16">
              <div className="field">
                <label htmlFor="payment-amount">Amount *</label>
                <div className="input-unit">
                  <span className="unit">₹</span>
                  <input id="payment-amount" className="input" type="number" min={0.01} step="0.01" autoFocus required
                    placeholder="0"
                    value={paymentForm.amount}
                    onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
                </div>
                {paymentModal.balance > 0 && (
                  <div className="chip-row ic-mt-8">
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
                <label htmlFor="payment-received-on">Received on</label>
                <input id="payment-received-on" className="input" type="date" value={paymentForm.receivedOn}
                  onChange={e => setPaymentForm({ ...paymentForm, receivedOn: e.target.value })} />
              </div>
            </div>
            <div className="field mb-16">
              <label htmlFor="payment-mode">Payment mode</label>
              <div className="chip-row ic-mb-8">
                {['NEFT', 'UPI', 'Cheque', 'Cash'].map(m => (
                  <button key={m} type="button"
                    className={`chip ${paymentForm.mode === m ? 'active' : ''}`}
                    onClick={() => setPaymentForm({ ...paymentForm, mode: paymentForm.mode === m ? '' : m })}>
                    {m}
                  </button>
                ))}
              </div>
              <input id="payment-mode" className="input" placeholder="Or type another mode…" value={paymentForm.mode}
                onChange={e => setPaymentForm({ ...paymentForm, mode: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="payment-note">Note</label>
              <input id="payment-note" className="input" placeholder="e.g. UTR number, instalment 2 of 3" value={paymentForm.note}
                onChange={e => setPaymentForm({ ...paymentForm, note: e.target.value })} />
            </div>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setPaymentModal(null)}>Cancel</Button>
              <Button type="submit" variant="accent" loading={saving}>
                {saving ? 'Recording…' : `Record ${paymentForm.amount ? formatINR(Number(paymentForm.amount)) : 'payment'}`}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Statement export: pick the period + format */}
      <Modal title={`Export statement — ${client.name}`} open={exportModal}
        onClose={() => setExportModal(false)}>
        <div className="field mb-16">
          <label>Periods — pick one or more</label>
          <div className="ic-period-list">
            <label className="checkbox-field ic-strong">
              <input type="checkbox" checked={exportYears.length === 0}
                onChange={() => setExportYears([])} />
              All periods ({client.billings.length})
            </label>
            {client.billings.map((b: any) => (
              <label key={b.id} className="checkbox-field">
                <input type="checkbox" checked={exportYears.includes(b.academicYear)}
                  onChange={() => toggleExportYear(b.academicYear)} />
                {b.periodLabel || b.academicYear}
                <span className="ic-sub num ic-push-right">
                  {formatINR(b.totalDue)}
                </span>
              </label>
            ))}
          </div>
          <span className="hint">
            {exportYears.length
              ? `${exportYears.length} period${exportYears.length > 1 ? 's' : ''} selected — billing rows and payments for the selection.`
              : 'Everything: all billing rows and every payment.'}
          </span>
        </div>
        <div className="form-actions ic-actions-start">
          <Button variant="accent" icon="download" loading={exporting === 'pdf'} disabled={exporting !== null}
            onClick={handleExportPdf}>
            {exporting === 'pdf' ? 'Exporting…' : 'Download PDF'}
          </Button>
          <Button icon="download" loading={exporting === 'xlsx'} disabled={exporting !== null}
            onClick={handleExportXlsx}>
            {exporting === 'xlsx' ? 'Exporting…' : 'Download Excel'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
