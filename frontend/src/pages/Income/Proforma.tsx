import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { incomeAPI } from '../../api/income';
import { PageHeader, ErrorAlert, SuccessAlert, LoadingBlock, EmptyState, Modal } from '../../components/ui';
import ProformaFormModal from '../../components/ProformaFormModal';
import { fiscalYearOf } from '../../utils/fiscalYear';
import { formatINR, formatDate } from '../../utils/format';
import { downloadHtmlAsPdf } from '../../utils/htmlToPdf';
import { useRole } from '../../store/authStore';
import { confirmDialog } from '../../components/feedback';

export default function Proforma() {
  const { isSA } = useRole();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // New proforma: pick a client, then the form picks the periods
  const [picker, setPicker] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [clientId, setClientId] = useState('');
  const [loadingClient, setLoadingClient] = useState(false);
  const [client, setClient] = useState<any>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Numbering (admin): continue an existing sequence
  const [fy] = useState(() => fiscalYearOf(new Date().toLocaleDateString('en-CA')));
  const [numbering, setNumbering] = useState<any>(null);
  const [lastNumber, setLastNumber] = useState('');
  const [savingNumbering, setSavingNumbering] = useState(false);

  const fetchRecords = useCallback(async () => {
    try {
      const [res, settings] = await Promise.all([
        incomeAPI.listProformas(),
        incomeAPI.getProformaSettings(fy),
      ]);
      setRecords(res.data.records);
      setNumbering(settings.data);
      setLastNumber(String(settings.data.lastNumberFloor || 0));
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load proforma invoices');
    } finally {
      setLoading(false);
    }
  }, [fy]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const openPicker = async () => {
    setPicker(true);
    setClientId('');
    if (clients.length) return;
    try {
      const res = await incomeAPI.getClients({ sort: 'name' });
      setClients([...res.data.activeRows, ...res.data.inactiveRows]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load clients');
    }
  };

  const startFor = async () => {
    if (!clientId) return;
    setLoadingClient(true);
    try {
      const res = await incomeAPI.getClientDetail(clientId);
      setClient(res.data);
      setPicker(false);
      setFormOpen(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the client');
    } finally {
      setLoadingClient(false);
    }
  };

  const saveNumbering = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingNumbering(true);
    try {
      const res = await incomeAPI.updateProformaSettings({ fiscalYear: fy, lastNumber: Number(lastNumber) || 0 });
      setNumbering((n: any) => ({ ...n, ...res.data }));
      setSuccess(`Numbering saved — the next proforma will be ${res.data.nextNumber}.`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save the numbering');
    } finally {
      setSavingNumbering(false);
    }
  };

  const handleDownload = async (r: any) => {
    setBusy(r.id);
    try {
      const res = await incomeAPI.getProforma(r.id);
      await downloadHtmlAsPdf(res.data.html, res.data.filename);
    } catch {
      setError(`Failed to download ${r.number}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async (r: any) => {
    if (!await confirmDialog(`Delete proforma ${r.number}? Its number will not be reused.`)) return;
    try {
      await incomeAPI.deleteProforma(r.id);
      fetchRecords();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete the proforma');
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? records.filter(r =>
      r.number.toLowerCase().includes(s) || r.clientName.toLowerCase().includes(s)) : records;
  }, [records, q]);

  if (loading) return <LoadingBlock label="Loading proforma invoices…" />;

  return (
    <>
      <PageHeader
        title="Proforma Invoices"
        subtitle={numbering ? `FY ${numbering.fiscalYear} · next number ${numbering.nextNumber}` : 'Numbered proforma invoices for client billing'}
        actions={<button className="btn btn-primary" onClick={openPicker}>+ New Proforma</button>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      {isSA && numbering && (
        <div className="card card-pad mb-24">
          <form onSubmit={saveNumbering} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div className="field" style={{ maxWidth: 260 }}>
              <label>Last number already used in FY {fy}</label>
              <input className="input" type="number" min={0} step={1} value={lastNumber}
                onChange={e => setLastNumber(e.target.value)} />
              <span className="hint">Continue an existing sequence: 22 makes the next one PRO/{fy}/023.</span>
            </div>
            <button type="submit" className="btn btn-secondary" disabled={savingNumbering}>
              {savingNumbering ? 'Saving…' : 'Save numbering'}
            </button>
            {!numbering.supplier?.gstin && (
              <span className="text-muted" style={{ fontSize: 12.5 }}>
                ⚠ Company GSTIN not set — add it in <Link to="/organization">Organization</Link>.
              </span>
            )}
          </form>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3>Issued ({records.length})</h3>
          <input className="input" style={{ maxWidth: 260 }} placeholder="Search number or client…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon="▤" title={records.length ? 'No matches' : 'No proforma invoices yet'}
            message={records.length ? 'Try a different search.' : 'Generate one from a client billing row or with + New Proforma.'} />
        ) : (
          <div className="table-wrap">
            <table className="table table-sticky-actions">
              <thead>
                <tr>
                  <th>Number</th><th>Client</th><th>Periods</th><th>Date</th>
                  <th className="num">Taxable</th><th className="num">GST</th><th className="num">Total</th>
                  <th className="num">Advance</th><th className="num">Balance due</th><th />
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.number}</td>
                    <td><Link to={`/income/clients/${r.clientId}`}>{r.clientName}</Link></td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>
                      {r.periods.length ? r.periods.join(', ') : '—'}
                    </td>
                    <td>{formatDate(r.invoiceDate)}</td>
                    <td className="num">{formatINR(r.subtotal)}</td>
                    <td className="num">
                      {formatINR(r.gstAmount)}
                      <div className="text-muted" style={{ fontSize: 11 }}>{r.taxType === 'IGST' ? 'IGST' : 'CGST+SGST'}</div>
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(r.totalAmount)}</td>
                    <td className="num text-success">{r.advanceReceived > 0 ? formatINR(r.advanceReceived) : '—'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(r.balanceDue)}</td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-secondary btn-sm" disabled={busy === r.id}
                          onClick={() => handleDownload(r)}>
                          {busy === r.id ? '…' : '⤓ PDF'}
                        </button>
                        {isSA && <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>Del</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal title="New Proforma Invoice" open={picker} onClose={() => setPicker(false)}>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>Client</label>
          <select className="select" value={clientId} onChange={e => setClientId(e.target.value)}>
            <option value="">Pick a client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <span className="hint">Next you'll tick one or more billing periods for this client.</span>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-ghost" onClick={() => setPicker(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!clientId || loadingClient} onClick={startFor}>
            {loadingClient ? 'Loading…' : 'Continue'}
          </button>
        </div>
      </Modal>

      <ProformaFormModal
        open={formOpen}
        client={client}
        onClose={() => setFormOpen(false)}
        onSaved={fetchRecords}
      />
    </>
  );
}
