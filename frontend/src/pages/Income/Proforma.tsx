import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { incomeAPI } from '../../api/income';
import { PageHeader, ErrorAlert, LoadingBlock, EmptyState, Modal } from '../../components/ui';
import ProformaFormModal from '../../components/ProformaFormModal';
import { formatINR, formatDate } from '../../utils/format';
import { downloadHtmlAsPdf } from '../../utils/htmlToPdf';
import { useRole } from '../../store/authStore';
import { confirmDialog } from '../../components/feedback';

export default function Proforma() {
  const { isSA } = useRole();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // New-proforma picker: client -> billing row -> form modal
  const [picker, setPicker] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [clientId, setClientId] = useState('');
  const [client, setClient] = useState<any>(null);
  const [loadingClient, setLoadingClient] = useState(false);
  const [billing, setBilling] = useState<any>(null);

  const fetchRecords = useCallback(async () => {
    try {
      const res = await incomeAPI.listProformas();
      setRecords(res.data.records);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load proforma invoices');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  const openPicker = async () => {
    setPicker(true);
    setClientId('');
    setClient(null);
    if (clients.length) return;
    try {
      const res = await incomeAPI.getClients({ sort: 'name' });
      setClients([...res.data.activeRows, ...res.data.inactiveRows]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load clients');
    }
  };

  const pickClient = async (id: string) => {
    setClientId(id);
    setClient(null);
    if (!id) return;
    setLoadingClient(true);
    try {
      const res = await incomeAPI.getClientDetail(id);
      setClient(res.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the client');
    } finally {
      setLoadingClient(false);
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
        subtitle="Numbered proforma invoices raised against client billing periods"
        actions={<button className="btn btn-primary" onClick={openPicker}>+ New Proforma</button>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

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
                  <th>Number</th><th>Client</th><th>Period</th><th>Date</th>
                  <th className="num">Taxable</th><th className="num">GST</th><th className="num">Total</th><th />
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.number}</td>
                    <td><Link to={`/income/clients/${r.clientId}`}>{r.clientName}</Link></td>
                    <td className="text-muted">{r.periodLabel || r.academicYear}</td>
                    <td>{formatDate(r.invoiceDate)}</td>
                    <td className="num">{formatINR(r.taxableValue)}</td>
                    <td className="num">{formatINR(r.gstAmount)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(r.totalAmount)}</td>
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

      {/* Picker: client, then billing period */}
      <Modal title="New Proforma Invoice" open={picker} onClose={() => setPicker(false)}>
        <div className="field" style={{ marginBottom: 16 }}>
          <label>Client</label>
          <select className="select" value={clientId} onChange={e => pickClient(e.target.value)}>
            <option value="">Pick a client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        {loadingClient && <p className="text-muted">Loading billing periods…</p>}
        {client && (
          client.billings.length === 0 ? (
            <p className="text-muted">This client has no billing periods yet.</p>
          ) : (
            <div className="field">
              <label>Billing period</label>
              <div style={{ display: 'grid', gap: 6 }}>
                {client.billings.map((b: any) => (
                  <button key={b.id} type="button" className="btn btn-secondary"
                    style={{ justifyContent: 'space-between', display: 'flex' }}
                    onClick={() => { setBilling(b); setPicker(false); }}>
                    <span>{b.periodLabel || b.academicYear}</span>
                    <span className="text-muted">Balance {formatINR(b.balance)}</span>
                  </button>
                ))}
              </div>
            </div>
          )
        )}
      </Modal>

      <ProformaFormModal
        open={Boolean(billing)}
        billing={billing}
        clientName={client?.name || ''}
        onClose={() => setBilling(null)}
        onSaved={fetchRecords}
      />
    </>
  );
}
