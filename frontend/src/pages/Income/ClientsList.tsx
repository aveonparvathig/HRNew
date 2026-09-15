import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { incomeAPI } from '../../api/income';
import {
  PageHeader, EmptyState, LoadingBlock, ErrorAlert, Modal,
} from '../../components/ui';
import { formatINR, collectionTone } from '../../utils/format';

const GST_RATE = 0.18;
const AGREEMENT_SUGGESTIONS = ['Agreement signed', 'MOU signed', 'Renewal due', 'Pending'];

function ClientTable({ rows, totals, engineers, onEngineerChange, onToggleActive }: any) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Client</th>
            <th>Engineer</th>
            <th className="num">Billed</th>
            <th className="num">Received</th>
            <th className="num">Balance</th>
            <th style={{ width: 150 }}>Collection</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id}>
              <td>
                <Link to={`/income/clients/${r.id}`} style={{ fontWeight: 600 }}>{r.name}</Link>
                {r.agreementStatus && (
                  <div className="text-muted" style={{ fontSize: 11.5 }}>{r.agreementStatus}</div>
                )}
              </td>
              <td>
                <select
                  className="select"
                  style={{ width: 150, padding: '5px 8px', fontSize: 12.5 }}
                  value={r.latestEngineer}
                  disabled={r.billingCount === 0}
                  onChange={e => onEngineerChange(r.id, e.target.value)}
                >
                  <option value="">— none —</option>
                  {engineers.map((e: string) => <option key={e} value={e}>{e}</option>)}
                </select>
              </td>
              <td className="num">{formatINR(r.billed)}</td>
              <td className="num text-success">{formatINR(r.received)}</td>
              <td className={`num ${r.balance > 0 ? 'text-warning' : 'text-success'}`} style={{ fontWeight: 600 }}>
                {formatINR(r.balance)}
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div className="bar-track" style={{ flex: 1 }}>
                    <div className={`bar-fill ${collectionTone(r.collectionPct)}`}
                      style={{ width: `${Math.max(r.collectionPct, 3)}%` }} />
                  </div>
                  <span className={`pct-label ${collectionTone(r.collectionPct)}`}>{r.collectionPct}%</span>
                </div>
              </td>
              <td>
                <div className="row-actions">
                  <Link to={`/income/clients/${r.id}`} className="btn btn-secondary btn-sm">Open</Link>
                  <button className="btn btn-ghost btn-sm" onClick={() => onToggleActive(r)}>
                    {r.isActive ? 'Discontinue' : 'Reactivate'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
          <tr className="totals-row">
            <td colSpan={2}>Totals ({rows.length})</td>
            <td className="num">{formatINR(totals.billed)}</td>
            <td className="num">{formatINR(totals.received)}</td>
            <td className="num">{formatINR(totals.balance)}</td>
            <td colSpan={2} />
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function ClientsList() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [engineer, setEngineer] = useState('');
  const [show, setShow] = useState('all');
  const [sort, setSort] = useState('balance');
  const [period, setPeriod] = useState('');
  const [collection, setCollection] = useState('');

  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ name: '', agreementStatus: '', notes: '' });
  const [billingForm, setBillingForm] = useState({ academicYear: '', engineer: '', studentCount: '', rate: '' });
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);

  const yearChips = useMemo(() => {
    const y = new Date().getFullYear();
    return [-1, 0, 1].map(i => `${y + i}-${y + i + 1}`);
  }, []);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    try {
      const res = await incomeAPI.getClients({ q, engineer, show, sort, period, collection });
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to fetch clients');
    } finally {
      setLoading(false);
    }
  }, [q, engineer, show, sort, period, collection]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  const openModal = () => {
    setForm({ name: '', agreementStatus: '', notes: '' });
    setBillingForm({ academicYear: yearChips[1], engineer: '', studentCount: '', rate: '' });
    setStep(1);
    setModalError('');
    setShowModal(true);
  };

  const goToStep2 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setModalError('');
    setStep(2);
  };

  const handleFinish = async (withBilling: boolean) => {
    setSaving(true);
    setModalError('');
    try {
      const clientRes = await incomeAPI.createClient(form);
      const clientId = clientRes.data.id;
      if (withBilling && billingForm.academicYear) {
        try {
          await incomeAPI.createBilling(clientId, {
            academicYear: billingForm.academicYear,
            engineer: billingForm.engineer,
            studentCount: billingForm.studentCount || null,
            rate: billingForm.rate || null,
          });
        } catch (err: any) {
          // Client exists either way — land on its page and surface the billing error there
          navigate(`/income/clients/${clientId}`);
          return;
        }
      }
      setShowModal(false);
      navigate(`/income/clients/${clientId}`);
    } catch (err: any) {
      setModalError(err.response?.data?.error || 'Failed to create client');
      setStep(1);
    } finally {
      setSaving(false);
    }
  };

  const handleEngineerChange = async (clientId: string, eng: string) => {
    try {
      await incomeAPI.updateClientEngineer(clientId, eng);
      fetchClients();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update engineer');
    }
  };

  const handleToggleActive = async (client: any) => {
    const verb = client.isActive ? 'mark inactive (discontinued)' : 'mark active';
    if (!window.confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)}: "${client.name}"?`)) return;
    try {
      await incomeAPI.toggleClientActive(client.id);
      fetchClients();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update client');
    }
  };

  const hasFilters = Boolean(q || engineer || show !== 'all' || period || collection);

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={data ? `${data.totalCount} clients in the ledger.` : 'Client billing ledger.'}
        actions={
          <button className="btn btn-primary" onClick={openModal}>+ Add Client</button>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="toolbar">
        <div className="search-input">
          <input className="input" placeholder="Search clients…" value={q}
            onChange={e => setQ(e.target.value)} />
        </div>
        <select className="select" value={engineer} onChange={e => setEngineer(e.target.value)}>
          <option value="">All engineers</option>
          {(data?.engineers || []).map((e: string) => <option key={e} value={e}>{e}</option>)}
        </select>
        <select className="select" value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="">All periods</option>
          {(data?.periods || []).map((y: string) => <option key={y} value={y}>{y}</option>)}
          {data?.hasCustomPeriods && <option value="CUSTOM">Custom periods</option>}
        </select>
        <select className="select" value={collection} onChange={e => setCollection(e.target.value)}>
          <option value="">All collection</option>
          <option value="full">Fully collected</option>
          <option value="partial">Partially collected</option>
          <option value="none">Nothing received</option>
        </select>
        <select className="select" value={show} onChange={e => setShow(e.target.value)}>
          <option value="all">All clients</option>
          <option value="balance">With balance only</option>
        </select>
        <select className="select" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="balance">Sort: balance</option>
          <option value="name">Sort: name</option>
        </select>
      </div>

      {loading ? (
        <LoadingBlock />
      ) : !data || data.totalCount === 0 ? (
        <div className="card">
          <EmptyState icon="◉"
            title={hasFilters ? 'No matching clients' : 'No clients yet'}
            message={hasFilters ? 'Try adjusting your filters.' : 'Add your first client to start the ledger.'}
            action={!hasFilters && (
              <button className="btn btn-primary" onClick={openModal}>+ Add Client</button>
            )}
          />
        </div>
      ) : (
        <>
          {data.activeRows.length > 0 && (
            <>
              <div className="section-title">Active clients ({data.activeRows.length})</div>
              <div className="card">
                <ClientTable rows={data.activeRows} totals={data.activeTotals}
                  engineers={data.engineers}
                  onEngineerChange={handleEngineerChange}
                  onToggleActive={handleToggleActive} />
              </div>
            </>
          )}
          {data.inactiveRows.length > 0 && (
            <>
              <div className="section-title text-muted">Discontinued ({data.inactiveRows.length})</div>
              <div className="card" style={{ opacity: 0.85 }}>
                <ClientTable rows={data.inactiveRows} totals={data.inactiveTotals}
                  engineers={data.engineers}
                  onEngineerChange={handleEngineerChange}
                  onToggleActive={handleToggleActive} />
              </div>
            </>
          )}
        </>
      )}

      <Modal size="lg" title="Add Client" open={showModal} onClose={() => setShowModal(false)}>
        <div className="wizard-steps">
          <div className={`wizard-step ${step === 1 ? 'active' : 'done'}`}>
            <span className="n">{step > 1 ? '✓' : '1'}</span> Client details
          </div>
          <div className="wizard-sep" />
          <div className={`wizard-step ${step === 2 ? 'active' : ''}`}>
            <span className="n">2</span> First billing year
          </div>
        </div>

        <ErrorAlert message={modalError} onDismiss={() => setModalError('')} />

        {step === 1 && (
          <form onSubmit={goToStep2}>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Client name *</label>
              <input className="input" value={form.name} autoFocus required
                placeholder="Institution / company name"
                onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Agreement status</label>
              <div className="chip-row" style={{ marginBottom: 8 }}>
                {AGREEMENT_SUGGESTIONS.map(s => (
                  <button key={s} type="button"
                    className={`chip ${form.agreementStatus === s ? 'active' : ''}`}
                    onClick={() => setForm({ ...form, agreementStatus: form.agreementStatus === s ? '' : s })}>
                    {s}
                  </button>
                ))}
              </div>
              <input className="input" value={form.agreementStatus}
                placeholder="Or type your own…"
                onChange={e => setForm({ ...form, agreementStatus: e.target.value })} />
            </div>
            <div className="field">
              <label>Notes <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(optional)</span></label>
              <textarea className="input" rows={2} value={form.notes}
                placeholder="Context anyone on the team should know"
                onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={!form.name.trim()}>
                Continue →
              </button>
            </div>
          </form>
        )}

        {step === 2 && (() => {
          const students = Number(billingForm.studentCount) || 0;
          const rate = Number(billingForm.rate) || 0;
          const net = students * rate * (1 + GST_RATE);
          return (
            <div>
              <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
                Set up <strong>{form.name}</strong>'s first billing year now, or skip and add it later
                from the client page.
              </p>
              <div className="field" style={{ marginBottom: 14 }}>
                <label>Academic year</label>
                <div className="chip-row">
                  {yearChips.map(y => (
                    <button key={y} type="button"
                      className={`chip ${billingForm.academicYear === y ? 'active' : ''}`}
                      onClick={() => setBillingForm({ ...billingForm, academicYear: y })}>
                      {y}
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-grid" style={{ marginBottom: 14 }}>
                <div className="field">
                  <label>Students</label>
                  <input className="input" type="number" min={0} placeholder="0"
                    value={billingForm.studentCount}
                    onChange={e => setBillingForm({ ...billingForm, studentCount: e.target.value })} />
                </div>
                <div className="field">
                  <label>Rate / student</label>
                  <div className="input-unit">
                    <span className="unit">₹</span>
                    <input className="input" type="number" min={0} step="0.01" placeholder="0"
                      value={billingForm.rate}
                      onChange={e => setBillingForm({ ...billingForm, rate: e.target.value })} />
                  </div>
                </div>
                <div className="field">
                  <label>Engineer</label>
                  <input className="input" list="wizard-engineers" placeholder="Optional"
                    value={billingForm.engineer}
                    onChange={e => setBillingForm({ ...billingForm, engineer: e.target.value })} />
                  <datalist id="wizard-engineers">
                    {(data?.engineers || []).map((e: string) => <option key={e} value={e} />)}
                  </datalist>
                </div>
              </div>
              {net > 0 && (
                <div className="calc-card" style={{ marginBottom: 6 }}>
                  <div className="calc-row total" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
                    <span>Net for {billingForm.academicYear} (incl. 18% GST)</span>
                    <span className="amount">{formatINR(net)}</span>
                  </div>
                </div>
              )}
              <div className="form-actions" style={{ justifyContent: 'space-between' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>← Back</button>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button type="button" className="btn btn-secondary" disabled={saving}
                    onClick={() => handleFinish(false)}>
                    Skip for now
                  </button>
                  <button type="button" className="btn btn-primary" disabled={saving || !(students && rate)}
                    onClick={() => handleFinish(true)}>
                    {saving ? 'Creating…' : 'Create Client & Billing'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </>
  );
}
