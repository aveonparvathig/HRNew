import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { expensesAPI } from '../../api/expenses';
import {
  PageHeader, StatCard, EmptyState, LoadingBlock, ErrorAlert, Modal, BackButton, SuccessAlert,
} from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
import { preprocessImage, ocrImage, parseReceipt } from '../../utils/ocr';
import { formatINR, formatDate } from '../../utils/format';
import { EXPENSE_STATUS_TONES } from './ExpensesList';
import { confirmDialog } from '../../components/feedback';

const EMPTY_LINE = {
  date: '', category: 'TRAVEL', description: '', merchant: '', amount: '',
  receiptData: '', receiptFilename: '', ocrText: '',
};

const ACTION_LABELS: Record<string, { label: string; icon?: string; danger?: boolean; confirm?: string }> = {
  submit: { label: 'Submit', icon: 'send' },
  approve: { label: 'Approve', icon: 'checkCircle' },
  reject: { label: 'Reject', danger: true, confirm: 'Reject this report? The employee can edit and resubmit.' },
  reimburse: { label: 'Mark reimbursed', icon: 'banknote', confirm: 'Mark this report as reimbursed?' },
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
    if (!await confirmDialog(`Remove this ${formatINR(line.amount)} line?`)) return;
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
    if (cfg.confirm && !await confirmDialog(cfg.confirm)) return;
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
    if (!await confirmDialog(`Delete ${report.reportNumber}?`)) return;
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
      action={<ButtonLink to="/expenses">Back to expenses</ButtonLink>} />;
  }

  const catOf = (v: string) => meta.categories.find((c: any) => c.value === v);
  // One accent per view: the first forward action (submit / approve / reimburse).
  const accentAction = report.actions.find((a: string) => a !== 'reject');
  const pickFiles = () => fileRef.current?.click();

  return (
    <>
      <div className="breadcrumb"><BackButton />
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
            <ButtonLink to={`/expenses/${report.id}/print`} icon="printer">Print report</ButtonLink>
            {report.status === 'DRAFT' && (
              <Button variant="danger" onClick={handleDeleteReport}>Delete</Button>
            )}
            {report.actions.map((a: string) => {
              const cfg = ACTION_LABELS[a];
              return (
                <Button key={a} icon={cfg.icon}
                  variant={cfg.danger ? 'danger' : a === accentAction ? 'accent' : 'secondary'}
                  onClick={() => doAction(a)}>
                  {cfg.label}
                </Button>
              );
            })}
          </>
        }
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <div className="stat-grid">
        <StatCard label="Total claimed" value={formatINR(report.total)} icon="banknote" tone="primary" />
        <StatCard label="Expense lines" value={report.lines.length}
          sub={`${report.lines.filter((l: any) => l.hasReceipt).length} with receipts`} icon="receipt" tone="info" />
        <StatCard label="Business purpose" value={report.businessPurpose || '—'} icon="briefcase" tone="warning" />
      </div>

      {report.approvals?.length > 0 && (
        <div className="card card-pad mb-24">
          <div className="cluster between re-chain-head">
            <h3 className="re-card-title re-flush">Approval chain</h3>
            {report.canApproveNow && <span className="badge badge-warning">Awaiting your approval</span>}
          </div>
          <div className="approval-chain">
            {report.approvals.map((s: any) => {
              const state = s.decision === 'APPROVED' ? 'done' : s.decision === 'REJECTED' ? 'rejected'
                : (s.level === report.approvalLevel && report.status === 'SUBMITTED') ? 'current' : 'pending';
              return (
                <div key={s.level} className={`approval-step ${state}`}>
                  <span className="step-mark">{state === 'done' ? '✓' : state === 'rejected' ? '✗' : s.level}</span>
                  <div className="re-min0">
                    <div className="step-name">{s.approverName}</div>
                    <div className="step-sub">
                      {s.decision === 'APPROVED' ? `Approved${s.decidedAt ? ' · ' + formatDate(s.decidedAt) : ''}`
                        : s.decision === 'REJECTED' ? 'Rejected' : state === 'current' ? 'Awaiting' : 'Waiting'}
                      {s.note ? ` — ${s.note}` : ''}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* OCR drop zone */}
      {report.editable && (
        <div
          className={`card card-pad mb-24 re-dropzone${dragOver ? ' is-over' : ''}`}
          role="button"
          tabIndex={0}
          aria-label="Add receipt photos"
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={pickFiles}
          onKeyDown={e => {
            if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickFiles(); }
          }}
        >
          <Icon name="receipt" size={28} className="re-dropzone-icon" />
          <div className="re-strong">Drop receipt photos here, or click to choose</div>
          <div className="text-sm-muted re-dropzone-hint">
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
              <div className="re-job">
                <span className="re-job-name">{j.name}</span>
                <span className={`re-job-status${j.status === 'done' ? ' is-done' : j.status === 'error' ? ' is-error' : ''}`}>
                  {j.status === 'preprocessing' && 'enhancing image…'}
                  {j.status === 'recognizing' && <>reading text… <span className="num">{j.progress}%</span></>}
                  {j.status === 'done' && <><Icon name="checkCircle" size={14} className="re-inline-icon" />{j.message}</>}
                  {j.status === 'error' && <><Icon name="alert" size={14} className="re-inline-icon" />{j.message}</>}
                </span>
                {j.status === 'recognizing' && (
                  <div className="bar-track re-job-bar">
                    {/* width is the live OCR progress */}
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
            <Button size="sm" icon="plus" onClick={() => openLine(null)}>Add line</Button>
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
                  <th>Merchant</th><th>Receipt</th><th className="num">Amount</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {report.lines.map((l: any) => (
                  <tr key={l.id}>
                    <td className="re-date">{l.date ? formatDate(l.date) : '—'}</td>
                    <td>
                      <span className="badge badge-neutral">
                        {catOf(l.category)?.icon} {catOf(l.category)?.label || l.category}
                      </span>
                    </td>
                    <td className="text-muted">{l.description || '—'}</td>
                    <td>{l.merchant || '—'}</td>
                    <td>
                      {l.hasReceipt ? (
                        <Button variant="ghost" size="sm" icon="receipt" onClick={() => viewReceipt(l)}>View</Button>
                      ) : <span className="text-muted">—</span>}
                    </td>
                    <td className="num re-strong">{formatINR(l.amount)}</td>
                    <td>
                      {report.editable && (
                        <div className="row-actions">
                          <Button size="sm" onClick={() => openLine(l)}>Edit</Button>
                          <Button variant="danger" size="sm" aria-label="Remove line" onClick={() => handleDeleteLine(l)}>✕</Button>
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
      <Modal title={lineModal.line ? 'Edit expense line' : 'Add expense line'}
        open={lineModal.open} onClose={() => setLineModal({ open: false, line: null })}>
        <form onSubmit={handleSaveLine}>
          <div className="form-grid mb-14">
            <div className="field">
              <label htmlFor="re-line-date">Date</label>
              <input id="re-line-date" className="input" type="date" value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="re-line-category">Category</label>
              <select id="re-line-category" className="select" value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}>
                {meta.categories.map((c: any) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="re-line-amount">Amount *</label>
              <div className="input-unit"><span className="unit">₹</span>
                <input id="re-line-amount" className="input num" type="number" min={0.01} step="0.01" required autoFocus
                  value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
          </div>
          <div className="form-grid mb-14">
            <div className="field">
              <label htmlFor="re-line-merchant">Merchant</label>
              <input id="re-line-merchant" className="input" placeholder="e.g. Hotel Saravana Bhavan"
                value={form.merchant} onChange={e => setForm({ ...form, merchant: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="re-line-desc">Description</label>
              <input id="re-line-desc" className="input" placeholder="e.g. Lunch with client"
                value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          {lineModal.line?.hasReceipt && (
            <p className="text-sm-muted re-receipt-note">
              <Icon name="receipt" size={14} className="re-inline-icon" />
              Receipt attached ({lineModal.line.receiptFilename || 'image'}) — kept as-is.
            </p>
          )}
          <div className="form-actions">
            <Button variant="ghost" onClick={() => setLineModal({ open: false, line: null })}>Cancel</Button>
            <Button type="submit" variant="accent" loading={saving}>
              {saving ? 'Saving…' : lineModal.line ? 'Save changes' : 'Add line'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
