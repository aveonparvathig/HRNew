import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, Modal, BackButton, SuccessAlert } from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Tabs } from '../../components/Tabs';
import { Icon } from '../../components/Layout/nav';
import { formatINR, formatDate } from '../../utils/format';
import { confirmDialog } from '../../components/feedback';
import DownloadButton from '../../components/DownloadButton';
import PerquisitesModal from '../../components/PerquisitesModal';

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
        <span>TDS returns</span>
      </div>
      <Tabs label="TDS returns" value={tab}
        items={[{ key: 'returns', label: 'Deposits and quarterly return' }, { key: 'form16', label: 'Form 16' }]}
        onChange={key => setParams({ ...(key === 'form16' ? { tab: key } : {}), ...(fy ? { fy } : {}) }, { replace: true })} />
      {tab === 'returns' ? <ReturnsTab fy={fy} setFy={setFy} /> : <Form16Tab fy={fy} setFy={setFy} />}
    </>
  );
}

function YearSelect({ data, setFy }: { data: any; setFy: (v: string) => void }) {
  return (
    <select className="select pt-year-select" aria-label="Financial year" value={data.fyStart} onChange={e => setFy(e.target.value)}>
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
  const [filings, setFilings] = useState<Record<number, { receiptNo: string; filedOn: string }>>({});

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getTds(fy);
      setData(res.data);
      setFilings(Object.fromEntries(res.data.quarters.map((q: any) => [q.quarter, { receiptNo: q.receiptNo, filedOn: q.filedOn }])));
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

  const saveFiling = async (q: any) => {
    try {
      await payrollAPI.saveTdsFiling({ fyStart: data.fyStart, quarter: q.quarter, ...filings[q.quarter] });
      setError('');
      setSuccess(filings[q.quarter].receiptNo ? `Receipt number of the ${q.label} return saved.` : `Receipt number of the ${q.label} return cleared.`);
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not save the receipt number');
    }
  };

  const setOption = async (key: string, value: boolean) => {
    try {
      await payrollAPI.updateTaxSettings({ [key]: value });
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not change the setting');
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
      <label htmlFor={`pt-challan-${key}`}>{label}</label>
      <div className="input-unit"><span className="unit">₹</span>
        <input id={`pt-challan-${key}`} className="input" type="number" min={0} step="0.01" value={form[key]}
          onChange={e => setForm({ ...form, [key]: e.target.value })} />
      </div>
      {hint && <span className="hint">{hint}</span>}
    </div>
  );

  return (
    <>
      <PageHeader
        title="TDS deposits and returns"
        subtitle={`FY ${data.financialYear} · tax deducted from salaries, its deposit, and the quarterly ${data.formName}`}
        actions={<>
          <YearSelect data={data} setFy={setFy} />
          <ButtonLink to={`/payroll/reports/tds-challans?fy=${data.fyStart}`}>Challan report</ButtonLink>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />

      <div className="card mb-24">
        <div className="card-header">
          <div>
            <h3>Month by month</h3>
            <span className="text-sm-muted">
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
                    <td className="pt-strong">
                      {m.label}
                      {m.status === 'DRAFT' && <span className="badge badge-warning pt-inline-badge">Draft run</span>}
                    </td>
                    <td className="num">{m.employees || '—'}</td>
                    <td className="num">{m.deducted ? formatINR(m.deducted) : '—'}</td>
                    <td className="num">{m.deposited ? formatINR(m.deposited) : '—'}</td>
                    <td className={`num pt-strong${m.balance > 0.5 ? ' num-neg' : ''}`}>
                      {m.balance > 0.5 ? formatINR(m.balance) : m.deducted ? 'Nil' : '—'}
                    </td>
                    <td>{m.deducted ? formatDate(m.dueDate) : <span className="text-muted">—</span>}</td>
                    <td>
                      <div className="row-actions">
                        {m.status === 'FINALIZED' && m.deducted > 0 && (
                          <Button size="sm"
                            onClick={() => setForm({ ...EMPTY_CHALLAN, period: m.period, label: m.label, tds: m.balance > 0 ? String(m.balance) : '' })}>
                            Record challan
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

      <div className="card mb-24">
        <div className="card-header"><h3>Challans</h3></div>
        {data.challans.length === 0 ? (
          <EmptyState icon="▤" title="No challans recorded"
            message="Record each deposit of tax with the bank's BSR code and challan serial number. The quarterly return cannot be filed without them." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Salary month</th><th>Deposited on</th><th>BSR code</th><th className="num">Serial no.</th><th className="num">Tax</th><th className="num">Interest, fee, others</th><th className="num">Total</th><th>Employees</th><th /></tr>
              </thead>
              <tbody>
                {data.challans.map((c: any) => (
                  <tr key={c.id}>
                    <td className="pt-strong">{data.months.find((m: any) => m.period === c.period)?.label || c.period}</td>
                    <td>
                      {formatDate(c.depositedOn)}
                      {c.late && <div className="pt-note pt-note-danger">after the due date</div>}
                    </td>
                    <td className="mono">{c.bsrCode}</td>
                    <td className="num">{c.challanSerial}</td>
                    <td className="num">{formatINR(c.tax)}</td>
                    <td className="num text-muted">{c.total - c.tax > 0 ? formatINR(c.total - c.tax) : '—'}</td>
                    <td className="num pt-strong">{formatINR(c.total)}</td>
                    <td>
                      <button className="link-button" onClick={() => setOpen(open === c.id ? '' : c.id)}>
                        {c.employees} matched
                      </button>
                      {c.unallocated > 0.5 && <div className="pt-note pt-note-warning">{formatINR(c.unallocated)} unmatched</div>}
                      {open === c.id && (
                        <div className="text-muted pt-allocations">
                          {c.allocations.map((a: any) => <div key={a.name}>{a.name}: {formatINR(a.amount)}</div>)}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        <Button variant="danger" size="sm" onClick={() => handleDelete(c)}>Delete</Button>
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
        <h3 className="pt-section-title">Quarterly return — {data.formName}</h3>
        <p className="text-sm-muted pt-lede">
          The workbook holds the deductor, challan and employee rows (and the annual salary details in the last quarter),
          laid out for keying into the tax department's return preparation utility, which produces the file you upload.
          {' '}{data.form27aName} is the signed control sheet that goes with it.
        </p>
        <div className="pt-options">
          <label className="checkbox-field pt-check">
            <input type="checkbox" checked={data.options.tdsAnnexure1IncludeZero}
              onChange={e => setOption('tdsAnnexure1IncludeZero', e.target.checked)} />
            <span>List employees paid with no tax deducted in Annexure I
              <span className="pt-check-hint">Off: only employees with tax deducted in the quarter are listed.</span></span>
          </label>
          <label className="checkbox-field pt-check">
            <input type="checkbox" checked={data.options.tdsAnnexure2SkipZero}
              onChange={e => setOption('tdsAnnexure2SkipZero', e.target.checked)} />
            <span>Leave employees with no tax for the year out of Annexure II
              <span className="pt-check-hint">Off: the last quarter's annual salary details list everyone paid in the year.</span></span>
          </label>
        </div>
        <div className="pt-quarters">
          {data.quarters.map((q: any) => {
            const errors = q.issues.filter((i: any) => i.level === 'ERROR');
            const warnings = q.issues.filter((i: any) => i.level !== 'ERROR');
            return (
              <div key={q.quarter} className="quarter-box">
                <div className="quarter-head">
                  <div>
                    <strong>{q.label}</strong> <span className="text-muted">{q.months}</span>
                    <div className="text-sm-muted">
                      {q.hasRuns
                        ? `${formatINR(q.deducted)} deducted, ${formatINR(q.deposited)} deposited`
                        : 'No payroll in this quarter'}
                    </div>
                  </div>
                  {q.hasRuns && (
                    <div className="cluster">
                      <span className={`badge ${errors.length ? 'badge-danger' : warnings.length ? 'badge-warning' : 'badge-success'}`}>
                        {errors.length ? `${errors.length} to fix` : warnings.length ? `${warnings.length} to check` : 'Ready'}
                      </span>
                      <ButtonLink size="sm" to={`/payroll/reports/tds-return?fy=${data.fyStart}&quarter=${q.quarter}`}>Summary</ButtonLink>
                      <ButtonLink size="sm" to={`/payroll/reports/form-27a?fy=${data.fyStart}&quarter=${q.quarter}`}>{data.form27aName}</ButtonLink>
                      <Button size="sm" onClick={() => downloadWorkbook(q.quarter)}>Workbook</Button>
                    </div>
                  )}
                </div>
                {q.hasRuns && filings[q.quarter] && (
                  <div className="cluster pt-filing">
                    <span className="text-muted">Once filed, its receipt number:</span>
                    <input className="input input-sm pt-input-receipt" inputMode="numeric" maxLength={15} placeholder="up to 15 digits"
                      aria-label={`${q.label} receipt number`} value={filings[q.quarter].receiptNo}
                      onChange={e => setFilings({ ...filings, [q.quarter]: { ...filings[q.quarter], receiptNo: e.target.value.replace(/\D/g, '') } })} />
                    <input className="input input-sm pt-input-date" type="date" aria-label={`${q.label} date filed`} value={filings[q.quarter].filedOn}
                      onChange={e => setFilings({ ...filings, [q.quarter]: { ...filings[q.quarter], filedOn: e.target.value } })} />
                    <Button size="sm"
                      disabled={filings[q.quarter].receiptNo === q.receiptNo && filings[q.quarter].filedOn === q.filedOn}
                      onClick={() => saveFiling(q)}>Save</Button>
                    <span className="text-muted">
                      {q.previousReceiptNo ? `Previous return: ${q.previousReceiptNo}` : 'The previous return’s receipt number is not recorded.'}
                    </span>
                  </div>
                )}
                {q.consultants?.count > 0 && (
                  <div className="pt-consultants">
                    <span className="text-muted">
                      Not in this return: {formatINR(q.consultants.fee)} of fees to {q.consultants.count} consultant{q.consultants.count === 1 ? '' : 's'},
                      {' '}{formatINR(q.consultants.tds)} tax deducted.{' '}
                    </span>
                    <Link to={`/payroll/reports/consultant-tds?fy=${data.fyStart}&quarter=${q.quarter}`}>Consultant statement</Link>
                  </div>
                )}
                {q.issues.length > 0 && (
                  <ul className="quarter-issues">
                    {q.issues.map((i: any, n: number) => (
                      <li key={n} className={i.level === 'ERROR' ? 'pt-issue-error' : 'pt-issue-warning'}>{i.message}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Modal size="lg" title={form ? `TDS challan — ${form.label}` : ''} open={Boolean(form)} onClose={() => setForm(null)}>
        {form && (
          <form onSubmit={handleSave}>
            <div className="form-grid mb-14">
              <div className="field">
                <label htmlFor="pt-bsr">BSR code *</label>
                <input id="pt-bsr" className="input" required inputMode="numeric" maxLength={7} placeholder="7 digits" value={form.bsrCode}
                  onChange={e => setForm({ ...form, bsrCode: e.target.value.replace(/\D/g, '') })} />
                <span className="hint">The bank branch's code, printed on the challan receipt.</span>
              </div>
              <div className="field">
                <label htmlFor="pt-serial">Challan serial number *</label>
                <input id="pt-serial" className="input" required inputMode="numeric" maxLength={5} placeholder="up to 5 digits" value={form.challanSerial}
                  onChange={e => setForm({ ...form, challanSerial: e.target.value.replace(/\D/g, '') })} />
              </div>
              <div className="field">
                <label htmlFor="pt-deposited">Date of deposit *</label>
                <input id="pt-deposited" className="input" type="date" required value={form.depositedOn}
                  onChange={e => setForm({ ...form, depositedOn: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="pt-minor-head">Minor head</label>
                <select id="pt-minor-head" className="select" value={form.minorHead} onChange={e => setForm({ ...form, minorHead: e.target.value })}>
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
              <div className="field pt-span-all">
                <label htmlFor="pt-remarks">Remarks</label>
                <input id="pt-remarks" className="input" value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
              <Button type="submit" variant="accent" loading={saving}>{saving ? 'Saving…' : 'Record challan'}</Button>
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
  const [perquisitesOf, setPerquisitesOf] = useState(''); // employee whose perquisites are open

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
          <ButtonLink to={`/payroll/reports/form-16-all?fy=${data.fyStart}`}
            className={data.rows.length ? undefined : 'disabled'}>All Part B</ButtonLink>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <SuccessAlert message={success} onDismiss={() => setSuccess('')} />
      {(data.monthsRun < 12 || data.draftMonths.length > 0) && data.rows.length > 0 && (
        <div className="alert alert-warning">
          <Icon name="clock" size={16} className="pt-alert-icon" />
          <span>
            The year is not complete: {data.monthsRun} of 12 months are finalized
            {data.draftMonths.length > 0 && ` (${data.draftMonths.join(', ')} still in draft and left out)`}.
            Issue {name} once March is finalized, unless the employee has left.
          </span>
        </div>
      )}
      {data.signatoryMissing && data.rows.length > 0 && (
        <div className="alert alert-warning">
          <Icon name="pen" size={16} className="pt-alert-icon" />
          <span>The signatory is not set. Add the name, designation and place in <Link to="/organization?tab=signatories">Company settings → Signatories</Link>.</span>
        </div>
      )}

      <div className="card card-pad mb-24">
        <label className="checkbox-field pt-check">
          <input type="checkbox" checked={data.released}
            onChange={e => act(() => payrollAPI.setForm16Released(data.fyStart, e.target.checked),
              e.target.checked ? `${name} for FY ${data.financialYear} is now visible to employees in My Pay.` : `${name} withdrawn from employees.`)} />
          <span>
            Employees can see their {name} for FY {data.financialYear}
            <span className="pt-check-hint">
              They get one PDF: Part A where you have uploaded it, Part B, and the perquisites statement if they have any.
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
                      <span className="pt-strong">{r.person.name}</span>
                      <div className="pt-sub">
                        {r.person.employeeNo} · {r.months} month{r.months === 1 ? '' : 's'}{!r.hasValidPan && ' · no valid PAN'}
                      </div>
                    </td>
                    <td>{regimeName(r.regime)}</td>
                    <td className="num">{formatINR(r.salary)}</td>
                    <td className="num">{formatINR(r.taxableIncome)}</td>
                    <td className="num pt-strong">{formatINR(r.tax)}</td>
                    <td className="num">{formatINR(r.deducted)}</td>
                    <td className={`num${r.balance > 0.5 ? ' num-neg' : ''}`}>
                      {Math.abs(r.balance) < 0.5 ? 'Nil' : r.balance > 0 ? `${formatINR(r.balance)} short` : `${formatINR(-r.balance)} excess`}
                    </td>
                    <td className="pt-part-a">
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
                        <ButtonLink size="sm" to={`/payroll/reports/form-16?${query(r)}`}>Part B</ButtonLink>
                        <ButtonLink size="sm" to={`/payroll/reports/form-12ba?${query(r)}`}>{data.formNames.form12ba}</ButtonLink>
                        <Button size="sm" onClick={() => setPerquisitesOf(r.person.id)}>Perquisites</Button>
                        <DownloadButton className="btn btn-secondary btn-sm" path={`/payroll/form16/${r.person.id}/file`} params={{ fy: String(data.fyStart) }}>
                          {r.partA ? 'Part A + B' : 'PDF'}
                        </DownloadButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <PerquisitesModal personId={perquisitesOf} fy={data.fyStart} open={Boolean(perquisitesOf)}
        onClose={() => setPerquisitesOf('')} onSaved={fetchData} />
    </>
  );
}
