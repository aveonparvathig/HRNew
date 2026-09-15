import { useState } from 'react';
import { incomeAPI } from '../../api/income';
import { PageHeader, ErrorAlert } from '../../components/ui';

export default function ImportExport() {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [fileContent, setFileContent] = useState('');
  const [fileKind, setFileKind] = useState<'csv' | 'xlsx' | ''>('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const download = (data: any, type: string, name: string) => {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setBusy(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      if (format === 'xlsx') {
        const res = await incomeAPI.exportXlsx();
        download(res.data, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          `aveon-income-${today}.xlsx`);
      } else {
        const res = await incomeAPI.exportCsv();
        download(res.data, 'text/csv', `aveon-income-${today}.csv`);
      }
      setError('');
    } catch {
      setError('Export failed');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setSuccess('');
    const isXlsx = /\.xlsx$/i.test(file.name);
    setFileKind(isXlsx ? 'xlsx' : 'csv');
    const reader = new FileReader();
    reader.onload = () => setFileContent(String(reader.result || ''));
    if (isXlsx) reader.readAsDataURL(file);
    else reader.readAsText(file);
  };

  const runImport = async (dryRun: boolean) => {
    if (!fileContent) {
      setError('Choose a file first');
      return;
    }
    if (!dryRun && !window.confirm('Import this file into the billing sheet now? Existing client + year rows are skipped, never overwritten.')) {
      return;
    }
    setBusy(true);
    setSuccess('');
    try {
      const res = fileKind === 'xlsx'
        ? await incomeAPI.importXlsx(fileContent, dryRun)
        : await incomeAPI.importCsv(fileContent, dryRun);
      setResult(res.data);
      setError('');
      if (!res.data.dryRun) {
        const s = res.data.summary;
        setSuccess(`Import complete: ${s.clientsCreated} clients created, ${s.billingsCreated} billing rows created, ${s.skipped} skipped.`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Import failed');
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Import / Export"
        subtitle="Move the full billing sheet in and out as Excel (.xlsx) or CSV."
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {success && <div className="alert alert-success"><span>✓</span>{success}</div>}

      <div className="grid-2 mb-24">
        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Export</h3>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Downloads every billing row — client, year, engineer, amounts, received,
            balance, invoice status and follow-ups.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => handleExport('xlsx')} disabled={busy}>
              ⤓ Excel (.xlsx)
            </button>
            <button className="btn btn-secondary" onClick={() => handleExport('csv')} disabled={busy}>
              ⤓ CSV
            </button>
          </div>
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 15, marginBottom: 8 }}>Import</h3>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
            Needs at least <strong>Client</strong> and <strong>Academic Year</strong> columns.
            Optional: Students, Rate, Engineer, Previous Pending, Received (creates an opening
            payment). Existing client + year rows are skipped, never overwritten.
          </p>
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              {fileName || 'Choose .xlsx or .csv file…'}
              <input type="file"
                accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                onChange={handleFile} hidden />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <button type="button" className="btn btn-secondary" disabled={busy || !fileContent}
              onClick={() => runImport(true)}>
              {busy ? 'Working…' : '👁 Preview'}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || !fileContent}
              onClick={() => runImport(false)}>
              {busy ? 'Working…' : '⤒ Import Now'}
            </button>
          </div>
          <p className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
            Preview only shows what will happen — nothing is saved. Import Now writes to the billing sheet after a confirmation.
          </p>
        </div>
      </div>

      {result && (
        <div className="card">
          <div className="card-header">
            <h3>{result.dryRun ? 'Preview' : 'Import result'}</h3>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              {result.summary.clientsCreated} clients · {result.summary.billingsCreated} billings
              · {result.summary.skipped} skipped · {result.summary.errors} errors
            </span>
          </div>
          <div className="table-wrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Row</th><th>Client</th><th>Year</th><th>Action</th></tr>
              </thead>
              <tbody>
                {result.preview.map((r: any) => (
                  <tr key={r.row}>
                    <td className="text-muted">{r.row}</td>
                    <td style={{ fontWeight: 600 }}>{r.client}</td>
                    <td>{r.year}</td>
                    <td>
                      <span className={`badge ${r.action.startsWith('error') ? 'badge-danger' : r.action.startsWith('skip') ? 'badge-neutral' : 'badge-success'}`}>
                        {r.action}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
