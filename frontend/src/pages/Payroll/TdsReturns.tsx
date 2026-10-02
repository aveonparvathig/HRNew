import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, Modal, BackButton, SuccessAlert } from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';

const regimeName = (regime: string) => (regime === 'OLD' ? 'Old regime' : 'New regime');
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const EMPTY_CHALLAN = {
  period: '', bsrCode: '', challanSerial: '', depositedOn: '', tds: '', surcharge: '', cess: '',
  interest: '', fee: '', others: '', minorHead: '200', remarks: '',
};

const readFile = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(new Error('Could not read the file'));
  reader.readAsDataURL(file);
});
const saveBase64 = (filename: string, base64: string, type: string) => {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(base64), c => c.charCodeAt(0))], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Tax deducted from salaries: deposits (challans), the quarterly return and Form 16.
export default function TdsReturns() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'form16' ? 'form16' : 'returns';
  const fy = params.get('fy') || '';
  const setFy = (value: string) => setParams({ ...(tab === 'form16' ? { tab } : {}), fy: value }, { replace: true });

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <span>TDS Returns</span>
      </div>
      <div className="tabs">
        {[['returns', 'Deposits and quarterly return'], ['form16', 'Form 16']].map(([key, label]) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`}
            onClick={() => setParams({ ...(key === 'form16' ? { tab: key } : {}), ...(fy ? { fy } : {}) }, { replace: true })}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'returns' ? <ReturnsTab fy={fy} setFy={setFy} /> : <Form16Tab fy={fy} setFy={setFy} />}
    </>
  );
}

function YearSelect({ data, setFy }: { data: any; setFy: (v: string) => void }) {
  return (
    <select className="select" style={{ width: 'auto' }} value={data.fyStart} onChange={e => setFy(e.target.value)}>
      {data.financialYears.map((y: any) => <option key={y.startYear} value={y.startYear}>FY {y.label}</option>)}
    </select>
  );
}

// ---------------------------------------------------------------------------
function ReturnsTab({ fy, setFy }: { fy: string; setFy: (v: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(''); // challan whose employees are shown

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getTds(fy);
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load TDS details');
    }
  }, [fy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await payrollAPI.createTdsChallan(form);
      setForm(null);
      setError('');
      setSuccess(res.data.unallocated > 0.5
        ? `Challan recorded. ${formatINR(res.data.unallocated)} of it is not matched to any employee's TDS.`
        : `Challan recorded and matched to ${res.data.employees} employee${res.data.employees === 1 ? '' : 's'}.`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to record the challan');
      setForm(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: any) => {
    if (!await confirmDialog(`Delete challan ${c.challanSerial} of ${formatDate(c.depositedOn)}?`)) return;
    try {
      await payrollAPI.deleteTdsChallan(c.id);
      setSuccess('Challan deleted.');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete the challan');
    }
  };

  const downloadWorkbook = async (quarter: number) => {
    try {
      const { data: file } = await payrollAPI.getTdsReturnWorkbook(String(data.fyStart), quarter);
      saveBase64(file.filename, file.base64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      setError('');
      setSuccess(`${file.filename} downloaded: ${file.challans} challans, ${file.deductees} deductee rows${file.salaryRecords ? `, ${file.salaryRecords} annual salary records` : ''}.`);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not prepare the workbook');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading TDS details…" />;

  const months = data.months.filter((m: any) => m.status || m.deposited > 0);
  const money = (key: string, label: string, hint = '') => (
    <div className="field">
      <label>{label}</label>
      <div className="input-unit"><span className="unit">₹</span>
        <input className="input" type="number" min={0} step="0.01" value={form[key]}
          onChange={e => setForm({ ...form, [key]: e.target.value })} />
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );

  return (
    <>
      <PageHeader
        title="TDS Deposits and Returns"
        subtitle={`FY ${data.financialYear} · tax deducted from salaries, its deposit, and the quarterly ${data.formName}`}
        actions={<>
          <YearSelect data={data} setFy={setFy} />
          <Link to={`/payroll/reports/tds-challans?fy=${data.fyStart}`} className="btn btn-secondary">Challan Report</Link>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <div className="card mb-24">
        <div className="card-header">
          <div>
            <h3>Month by month</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              Tax deducted in a month is due by the 7th of the next month; March is due by 30 April.
            </span>
          </div>
        </div>
        {months.length === 0 ? (
          <EmptyState icon="▤" title="No payroll in this year yet" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Salary month</th><th className="num">Employees</th><th className="num">Tax deducted</th><th className="num">Deposited</th><th className="num">Still to deposit</th><th>Due by</th><th /></tr>
              </thead>
              <tbody>
                {months.map((m: any) => (
                  <tr key={m.period}>
                    <td style={{ fontWeight: 600 }}>
                      {m.label}
                      {m.status === 'DRAFT' && <span className="badge badge-warning" style={{ marginLeft: 8 }}>Draft run</span>}
                    </td>
                    <td className="num">{m.employees || '—'}</td>
                    <td className="num">{m.deducted ? formatINR(m.deducted) : '—'}</td>
                    <td className="num">{m.deposited ? formatINR(m.deposited) : '—'}</td>
                    <td className="num" style={{ fontWeight: 600, color: m.balance > 0.5 ? 'var(--danger)' : undefined }}>
                      {m.balance > 0.5 ? formatINR(m.balance) : m.deducted ? 'Nil' : '—'}
                    </td>
                    <td>{m.deducted ? formatDate(m.dueDate) : <span className="text-muted">—</span>}</td>
                    <td>
                      <div className="row-actions">
                        {m.status === 'FINALIZED' && m.deducted > 0 && (
                          <button className="btn btn-secondary btn-sm"
                            onClick={() => setForm({ ...EMPTY_CHALLAN, period: m.period, label: m.label, tds: m.balance > 0 ? String(m.balance) : '' })}>
                            Record Challan
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

      <div className="card mb-24">
        <div className="card-header"><h3>Challans</h3></div>
        {data.challans.length === 0 ? (
          <EmptyState icon="▤" title="No challans recorded"
            message="Record each deposit of tax with the bank's BSR code and challan serial number. The quarterly return cannot be filed without them." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Salary month</th><th>Deposited on</th><th>BSR code</th><th>Serial no.</th><th className="num">Tax</th><th className="num">Interest, fee, others</th><th className="num">Total</th><th>Employees</th><th /></tr>
              </thead>
              <tbody>
                {data.challans.map((c: any) => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 600 }}>{data.months.find((m: any) => m.period === c.period)?.label || c.period}</td>
                    <td>
                      {formatDate(c.depositedOn)}
                      {c.late && <div style={{ fontSize: 11.5, color: 'var(--danger)' }}>after the due date</div>}
                    </td>
                    <td>{c.bsrCode}</td>
                    <td>{c.challanSerial}</td>
                    <td className="num">{formatINR(c.tax)}</td>
                    <td className="num text-muted">{c.total - c.tax > 0 ? formatINR(c.total - c.tax) : '—'}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(c.total)}</td>
                    <td>
                      <button className="link-button" onClick={() => setOpen(open === c.id ? '' : c.id)}>
                        {c.employees} matched
                      </button>
                      {c.unallocated > 0.5 && <div style={{ fontSize: 11.5, color: 'var(--warning)' }}>{formatINR(c.unallocated)} unmatched</div>}
                      {open === c.id && (
                        <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                          {c.allocations.map((a: any) => <div key={a.name}>{a.name}: {formatINR(a.amount)}</div>)}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(c)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 4 }}>Quarterly return — {data.formName}</h3>
        <p className="text-muted" style={{ fontSize: 12.5, marginBottom: 16 }}>
          The workbook holds the deductor, challan and employee rows (and the annual salary details in the last quarter),
          laid out for keying into the tax department's return preparation utility, which produces the file you upload.
        </p>
        <div style={{ display: 'grid', gap: 14 }}>
          {data.quarters.map((q: any) => {
            const errors = q.issues.filter((i: any) => i.level === 'ERROR');
            const warnings = q.issues.filter((i: any) => i.level !== 'ERROR');
            return (
              <div key={q.quarter} className="quarter-box">
                <div className="quarter-head">
                  <div>
                    <strong>{q.label}</strong> <span className="text-muted">{q.months}</span>
                    <div className="text-muted" style={{ fontSize: 12.5 }}>
                      {q.hasRuns
                        ? `${formatINR(q.deducted)} deducted, ${formatINR(q.deposited)} deposited`
                        : 'No payroll in this quarter'}
                    </div>
                  </div>
                  {q.hasRuns && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className={`badge ${errors.length ? 'badge-danger' : warnings.length ? 'badge-warning' : 'badge-success'}`}>
                        {errors.length ? `${errors.length} to fix` : warnings.length ? `${warnings.length} to check` : 'Ready'}
                      </span>
                      <Link to={`/payroll/reports/tds-return?fy=${data.fyStart}&quarter=${q.quarter}`} className="btn btn-secondary btn-sm">Summary</Link>
                      <button className="btn btn-primary btn-sm" onClick={() => downloadWorkbook(q.quarter)}>⤓ Workbook</button>
                    </div>
                  )}
                </div>
                {q.issues.length > 0 && (
                  <ul className="quarter-issues">
                    {q.issues.map((i: any, n: number) => (
                      <li key={n} style={{ color: i.level === 'ERROR' ? 'var(--danger)' : 'var(--warning)' }}>{i.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Modal size="lg" title={form ? `TDS Challan — ${form.label}` : ''} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={handleSave}>
            <div className="form-grid" style={{ marginBottom: 14 }}>
              <div className="field">
                <label>BSR code *</label>
                <input className="input" required inputMode="numeric" maxLength={7} placeholder="7 digits" value={form.bsrCode}
                  onChange={e => setForm({ ...form, bsrCode: e.target.value.replace(/\D/g, '') })} />
                <span className="hint">The bank branch's code, printed on the challan receipt.</span>
              </div>
              <div className="field">
                <label>Challan serial number *</label>
                <input className="input" required inputMode="numeric" maxLength={5} placeholder="up to 5 digits" value={form.challanSerial}
                  onChange={e => setForm({ ...form, challanSerial: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div className="field">
                <label>Date of deposit *</label>
                <input className="input" type="date" required value={form.depositedOn}
                  onChange={e => setForm({ ...form, depositedOn: e.target.value })} />
              </div>
              <div className="field">
                <label>Minor head</label>
                <select className="select" value={form.minorHead} onChange={e => setForm({ ...form, minorHead: e.target.value })}>
                  <option value="200">200 — TDS payable by the taxpayer</option>
                  <option value="400">400 — TDS on regular assessment</option>
                </select>
              </div>
              {money('tds', 'Income tax *', 'The employees’ tax. With surcharge and cess, it is matched to their TDS for the month.')}
              {money('surcharge', 'Surcharge')}
              {money('cess', 'Health and education cess')}
              {money('interest', 'Interest', 'For a late deposit.')}
              {money('fee', 'Fee', 'Late filing fee.')}
              {money('others', 'Others')}
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Remarks</label>
                <input className="input" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setForm(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Record Challan'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
function Form16Tab({ fy, setFy }: { fy: string; setFy: (v: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getForm16List(fy);
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load Form 16 details');
    }
  }, [fy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const act = async (call: () => Promise<any>, message: string) => {
    try {
      await call();
      setError('');
      setSuccess(message);
      fetchData();
    } catch (err: any) {
      setSuccess('');
      setError(err.response?.data?.error || err.message || 'Action failed');
    }
  };

  const uploadPartA = async (row: any, file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setError('The file is too large. Keep it under 4 MB.'); return; }
    await act(async () => payrollAPI.uploadForm16PartA(row.person.id, {
      fyStart: data.fyStart, fileName: file.name, fileData: await readFile(file),
    }), `Part A saved for ${row.person.name}.`);
  };

  const openPartA = async (row: any) => {
    try {
      const { data: doc } = await payrollAPI.getForm16PartA(row.person.id, String(data.fyStart));
      const bytes = Uint8Array.from(atob(doc.fileData.split(',')[1]), c => c.charCodeAt(0));
      window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not open Part A');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading Form 16 details…" />;

  const name = data.formNames.form16;
  const query = (row: any) => `fy=${data.fyStart}&personId=${row.person.id}`;

  return (
    <>
      <PageHeader
        title={name}
        subtitle={`FY ${data.financialYear} · Part B from ${data.monthsRun} finalized payroll month${data.monthsRun === 1 ? '' : 's'}`}
        actions={<>
          <YearSelect data={data} setFy={setFy} />
          <Link to={`/payroll/reports/form-16-all?fy=${data.fyStart}`}
            className={`btn btn-secondary${data.rows.length ? '' : ' disabled'}`}>🖨 All Part B</Link>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />
      {(data.monthsRun < 12 || data.draftMonths.length > 0) && data.rows.length > 0 && (
        <div className="alert alert-warning">
          <span>◷</span>
          <span>
            The year is not complete: {data.monthsRun} of 12 months are finalized
            {data.draftMonths.length > 0 && ` (${data.draftMonths.join(', ')} still in draft and left out)`}.
            Issue {name} once March is finalized, unless the employee has left.
          </span>
        </div>
      )}
      {data.signatoryMissing && data.rows.length > 0 && (
        <div className="alert alert-warning">
          <span>✎</span>
          <span>The signatory is not set. Add the name, designation and place in <Link to="/organization?tab=signatories">Company Settings → Signatories</Link>.</span>
        </div>
      )}

      <div className="card card-pad mb-24">
        <label className="checkbox-field" style={{ alignItems: 'flex-start' }}>
          <input type="checkbox" style={{ marginTop: 2 }} checked={data.released}
            onChange={e => act(() => payrollAPI.setForm16Released(data.fyStart, e.target.checked),
              e.target.checked ? `${name} for FY ${data.financialYear} is now visible to employees in My Pay.` : `${name} withdrawn from employees.`)} />
          <span>
            Employees can see their {name} for FY {data.financialYear}
            <span className="text-muted" style={{ display: 'block', fontSize: 12 }}>
              They get Part B, the perquisites statement, and Part A where you have uploaded it.
            </span>
          </span>
        </label>
      </div>

      <div className="card">
        {data.rows.length === 0 ? (
          <EmptyState icon="▤" title="No finalized salary in this year" />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th><th>Regime</th><th className="num">Gross salary</th><th className="num">Taxable income</th>
                  <th className="num">Tax for the year</th><th className="num">Deducted</th><th className="num">Balance</th><th>Part A</th><th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.person.id}>
                    <td>
                      <span style={{ fontWeight: 600 }}>{r.person.name}</span>
                      <div className="text-muted" style={{ fontSize: 11.5 }}>
                        {r.person.employeeNo} · {r.months} month{r.months === 1 ? '' : 's'}{!r.hasValidPan && ' · no valid PAN'}
                      </div>
                    </td>
                    <td>{regimeName(r.regime)}</td>
                    <td className="num">{formatINR(r.salary)}</td>
                    <td className="num">{formatINR(r.taxableIncome)}</td>
                    <td className="num" style={{ fontWeight: 600 }}>{formatINR(r.tax)}</td>
                    <td className="num">{formatINR(r.deducted)}</td>
                    <td className="num" style={{ color: r.balance > 0.5 ? 'var(--danger)' : undefined }}>
                      {Math.abs(r.balance) < 0.5 ? 'Nil' : r.balance > 0 ? `${formatINR(r.balance)} short` : `${formatINR(-r.balance)} excess`}
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {r.partA ? (
                        <span className="proof-chip">
                          <button type="button" className="proof-open" onClick={() => openPartA(r)}>{r.partA.fileName}</button>
                          <button type="button" className="proof-remove" aria-label="Remove Part A"
                            onClick={async () => await confirmDialog(`Remove Part A of ${r.person.name}?`)
                              && act(() => payrollAPI.deleteForm16PartA(r.person.id, String(data.fyStart)), 'Part A removed.')}>✕</button>
                        </span>
                      ) : (
                        <label className="proof-add">
                          + Upload
                          <input type="file" accept="application/pdf" hidden
                            onChange={e => { uploadPartA(r, e.target.files?.[0]); e.target.value = ''; }} />
                        </label>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/payroll/reports/form-16?${query(r)}`} className="btn btn-secondary btn-sm">Part B</Link>
                        <Link to={`/payroll/reports/form-12ba?${query(r)}`} className="btn btn-secondary btn-sm">{data.formNames.form12ba}</Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
