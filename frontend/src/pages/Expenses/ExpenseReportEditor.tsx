import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { expensesAPI } from '../../api/expenses';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal,
} from '../../components/ui';
import { preprocessImage, ocrImage, parseReceipt } from '../../utils/ocr';
import { formatINR, formatDate } from '../../utils/format';
import { EXPENSE_STATUS_TONES } from './ExpensesList';

const EMPTY_LINE = {
  date: '', category: 'TRAVEL', description: '', merchant: '', amount: '',
  receiptData: '', receiptFilename: '', ocrText: '',
};

const ACTION_LABELS: Record<string, { label: string; cls: string; confirm?: string }> = {
  submit: { label: '⇧ Submit', cls: 'btn-primary' },
  approve: { label: '✓ Approve', cls: 'btn-primary' },
  reject: { label: '✗ Reject', cls: 'btn-danger', confirm: 'Reject this report? The employee can edit and resubmit.' },
  reimburse: { label: '₹ Mark Reimbursed', cls: 'btn-primary', confirm: 'Mark this report as reimbursed?' },
};

interface OcrJob {
  id: number;
  name: string;
  status: 'preprocessing' | 'recognizing' | 'done' | 'error';
  progress: number;
  message?: string;
}

export default function ExpenseReportEditor() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<any>(null);
  const [meta, setMeta] = useState<any>({ categories: [], statuses: [], employees: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [lineModal, setLineModal] = useState<{ open: boolean; line: any | null }>({ open: false, line: null });
  const [form, setForm] = useState<any>(EMPTY_LINE);
  const [saving, setSaving] = useState(false);
  const [jobs, setJobs] = useState<OcrJob[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const jobSeq = useRef(0);

  const fetchData = useCallback(async () => {
    try {
      const [detailRes, metaRes] = await Promise.all([
        expensesAPI.getReportDetail(reportId!),
        expensesAPI.getMeta(),
      ]);
      setReport(detailRes.data);
      setMeta(metaRes.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---- OCR ingestion -----------------------------------------------------
  const processFiles = async (files: File[]) => {
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        setError(`${file.name}: only images can be scanned — attach PDFs on a line manually.`);
        continue;
      }
      const jobId = ++jobSeq.current;
      const updateJob = (patch: Partial<OcrJob>) =>
        setJobs(js => js.map(j => (j.id === jobId ? { ...j, ...patch } : j)));
      setJobs(js => [...js, { id: jobId, name: file.name, status: 'preprocessing', progress: 0 }]);
      try {
        const { processed, original } = await preprocessImage(file);
        updateJob({ status: 'recognizing' });
        const { text } = await ocrImage(processed, pct => updateJob({ progress: pct }));
        const parsed = parseReceipt(text);
        await expensesAPI.addLine(reportId!, {
          date: parsed.date || new Date().toISOString().split('T')[0],
          category: 'TRAVEL',
          description: parsed.gstin ? `GSTIN ${parsed.gstin}` : '',
          merchant: parsed.merchant,
          amount: parsed.amount || 0.01,
          receiptData: original,
          receiptFilename: file.name,
          ocrText: text,
        });
        updateJob({
          status: 'done', progress: 100,
          message: `${parsed.merchant || 'receipt'} · ${parsed.amount ? formatINR(parsed.amount) : 'amount not found — edit the line'}`,
        });
        fetchData();
      } catch (err: any) {
        updateJob({ status: 'error', message: err.response?.data?.error || err.message || 'OCR failed' });
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (report?.editable) processFiles(Array.from(e.dataTransfer.files));
  };

  // ---- Line CRUD ---------------------------------------------------------
  const openLine = (line: any | null) => {
    setForm(line ? {
      date: line.date || '', category: line.category, description: line.description,
      merchant: line.merchant, amount: line.amount,
      receiptData: '', receiptFilename: line.receiptFilename, ocrText: '',
    } : EMPTY_LINE);
    setLineModal({ open: true, line });
  };

  const handleSaveLine = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (!payload.receiptData) delete payload.receiptData; // keep existing receipt
      if (lineModal.line) await expensesAPI.updateLine(lineModal.line.id, payload);
      else await expensesAPI.addLine(reportId!, payload);
      setLineModal({ open: false, line: null });
      setError('');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save line');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLine = async (line: any) => {
    if (!window.confirm(`Remove this ${formatINR(line.amount)} line?`)) return;
    try {
      await expensesAPI.deleteLine(line.id);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to remove line');
    }
  };

  const viewReceipt = async (line: any) => {
    try {
      const res = await expensesAPI.getReceipt(line.id);
      const win = window.open('', '_blank');
      if (win) {
        win.document.write(
          `<title>${line.receiptFilename || 'receipt'}</title>
           <body style="margin:0;background:#111;display:grid;place-items:center;min-height:100vh;">
           ${res.data.dataUri.startsWith('data:image/')
             ? `<img src="${res.data.dataUri}" style="max-width:100%;"/>`
             : `<iframe src="${res.data.dataUri}" style="width:100vw;height:100vh;border:none;"></iframe>`}
           </body>`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to open receipt');
    }
  };

  const doAction = async (action: string) => {
    const cfg = ACTION_LABELS[action];
    if (cfg.confirm && !window.confirm(cfg.confirm)) return;
    try {
      const res = await expensesAPI.changeStatus(report.id, action);
      setSuccess(res.data.message);
      setError('');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Action failed');
    }
  };

  const handleDeleteReport = async () => {
    if (!window.confirm(`Delete ${report.reportNumber}?`)) return;
    try {
      await expensesAPI.deleteReport(report.id);
      navigate('/expenses');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
    }
  };

  if (loading) return <LoadingBlock label="Loading report…" />;
  if (!report) {
    return <EmptyState icon="⌯" title="Report not found"
      action={<Link to="/expenses" className="btn btn-secondary">Back to Expenses</Link>} />;
  }

  const catOf = (v: string) => meta.categories.find((c: any) => c.value === v);

  return (
    <>
      <div className="breadcrumb">
        <Link to="/expenses">Expenses</Link>
        <span>/</span>
        <span>{report.reportNumber}</span>
      </div>

      <PageHeader
        title={report.title}
        subtitle={`${report.reportNumber} · ${report.person.name}${report.periodStart ? ` · ${formatDate(report.periodStart)} – ${report.periodEnd ? formatDate(report.periodEnd) : '…'}` : ''}`}
        actions={
          <>
            <span className={`badge ${EXPENSE_STATUS_TONES[report.status]}`}>{report.status.toLowerCase()}</span>
            <Link to={`/expenses/${report.id}/print`} className="btn btn-secondary">🖨 Report</Link>
            {report.status === 'DRAFT' && (
              <button className="btn btn-danger" onClick={handleDeleteReport}>Delete</button>
            )}
            {report.actions.map((a: string) => (
              <button key={a} className={`btn ${ACTION_LABELS[a].cls}`} onClick={() => doAction(a)}>
                {ACTION_LABELS[a].label}
              </button>
            ))}
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {success && (
        <div className="alert alert-success">
          <span>✓</span><span style={{ flex: 1 }}>{success}</span>
          <button className="modal-close" onClick={() => setSuccess('')}>✕</button>
        </div>
      )}

      <div className="stat-grid">
        <StatCard label="Total Claimed" value={formatINR(report.total)} icon="₹" tone="primary" />
        <StatCard label="Expense Lines" value={report.lines.length}
          sub={`${report.lines.filter((l: any) => l.hasReceipt).length} with receipts`} icon="⌯" tone="info" />
        <StatCard label="Business Purpose" value={report.businessPurpose || '—'} icon="✎" tone="warning" />
      </div>

      {/* OCR drop zone */}
      {report.editable && (
        <div
          className="card card-pad mb-24"
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border)'}`,
            background: dragOver ? 'var(--primary-soft)' : 'var(--surface)',
            textAlign: 'center', cursor: 'pointer', transition: 'all .15s',
          }}
          onClick={() => fileRef.current?.click()}
        >
          <div style={{ fontSize: 28, marginBottom: 6 }}>🧾</div>
          <div style={{ fontWeight: 600 }}>Drop receipt photos here — or click to choose</div>
          <div className="text-muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            OCR reads the amount, date and merchant, attaches the image, and adds an editable line.
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={e => { processFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
        </div>
      )}

      {jobs.length > 0 && (
        <div className="card card-pad mb-24">
          {jobs.map(j => (
            <div key={j.id} className="list-row">
              <div style={{ minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{j.name}</span>
                <span className="text-muted" style={{ fontSize: 12, marginLeft: 8 }}>
                  {j.status === 'preprocessing' && 'enhancing image…'}
                  {j.status === 'recognizing' && `reading text… ${j.progress}%`}
                  {j.status === 'done' && `✓ ${j.message}`}
                  {j.status === 'error' && `✗ ${j.message}`}
                </span>
                {j.status === 'recognizing' && (
                  <div className="bar-track" style={{ marginTop: 6 }}>
                    <div className="bar-fill" style={{ width: `${j.progress}%` }} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lines */}
      <div className="card">
        <div className="card-header">
          <h3>Expense lines</h3>
          {report.editable && (
            <button className="btn btn-primary btn-sm" onClick={() => openLine(null)}>+ Add Line</button>
          )}
        </div>
        {report.lines.length === 0 ? (
          <EmptyState icon="🧾" title="No expenses yet"
            message="Drop receipt photos above, or add a line manually." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th><th>Category</th><th>Description</th>
                  <th>Merchant</th><th>Receipt</th><th className="num">Amount</th><th />
                </tr>
              </thead>
              <tbody>
                {report.lines.map((l: any) => (
                  <tr key={l.id}>
                    <td>{l.date ? formatDate(l.date) : '—'}</td>
                    <td>
                      <span className="badge badge-neutral">
                        {catOf(l.category)?.icon} {catOf(l.category)?.label || l.category}
                      </span>
                    </td>
                    <td className="text-muted">{l.description || '—'}</td>
                    <td>{l.merchant || '—'}</td>
                    <td>
                      {l.hasReceipt ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => viewReceipt(l)}>📎 View</button>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(l.amount)}</td>
                    <td>
                      {report.editable && (
                        <div className="row-actions">
                          <button className="btn btn-secondary btn-sm" onClick={() => openLine(l)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteLine(l)}>✕</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="totals-row">
                  <td colSpan={5}>Total ({report.currency})</td>
                  <td className="num">{formatINR(report.total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Line modal */}
      <Modal title={lineModal.line ? 'Edit Expense Line' : 'Add Expense Line'}
        open={lineModal.open} onClose={() => setLineModal({ open: false, line: null })}>
        <form onSubmit={handleSaveLine}>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Date</label>
              <input className="input" type="date" value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field">
              <label>Category</label>
              <select className="select" value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}>
                {meta.categories.map((c: any) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Amount *</label>
              <div className="input-unit"><span className="unit">₹</span>
                <input className="input" type="number" min={0.01} step="0.01" required autoFocus
                  value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="form-grid" style={{ marginBottom: 14 }}>
            <div className="field">
              <label>Merchant</label>
              <input className="input" placeholder="e.g. Hotel Saravana Bhavan"
                value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })} />
            </div>
            <div className="field">
              <label>Description</label>
              <input className="input" placeholder="e.g. Lunch with client"
                value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          {lineModal.line?.hasReceipt && (
            <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 12 }}>
              📎 Receipt attached ({lineModal.line.receiptFilename || 'image'}) — kept as-is.
            </p>
          )}
          <div className="form-actions">
            <button type="button" className="btn btn-ghost"
              onClick={() => setLineModal({ open: false, line: null })}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : lineModal.line ? 'Save Changes' : 'Add Line'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
