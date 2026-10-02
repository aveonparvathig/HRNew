import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { selfAPI } from '../../api/self';
import { openDataFile } from '../../api/files';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState } from '../../components/ui';
import { formatDate } from '../../utils/format';
import DownloadButton from '../../components/DownloadButton';
import { sizeLabel } from '../../components/EmployeeFilesCard';

// The letters and files HR has shared with the signed-in employee.
export default function MyDocuments() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    selfAPI.getDocuments()
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Failed to load your documents'));
  }, []);

  const open = async (file: any) => {
    try {
      openDataFile((await selfAPI.getDocumentFile(file.id)).data.fileData);
    } catch {
      setError('Could not open the file');
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading your documents…" />;
  const { letters, files } = data;

  return (
    <>
      <PageHeader title="My Documents" subtitle="Letters and files HR has shared with you. Payslips and Form 16 are under My Payslips." />
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {letters.length === 0 && files.length === 0 ? (
        <div className="card"><EmptyState icon="▤" title="Nothing here yet" message="Letters and documents appear here once HR shares them with you." /></div>
      ) : (
        <>
          {letters.length > 0 && (
            <div className="card mb-24">
              <div className="card-header"><h3>Letters ({letters.length})</h3></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Letter</th><th>Issued</th><th /></tr></thead>
                  <tbody>
                    {letters.map((l: any) => (
                      <tr key={l.id}>
                        <td><Link to={`/my/documents/${l.id}`} style={{ fontWeight: 600 }}>{l.title}</Link></td>
                        <td className="text-muted">{formatDate(l.createdAt)}</td>
                        <td>
                          <div className="row-actions">
                            <Link to={`/my/documents/${l.id}`} className="btn btn-secondary btn-sm">View</Link>
                            <DownloadButton path={`/self/documents/letters/${l.id}/pdf`} className="btn btn-secondary btn-sm" busyLabel="Making the PDF…">⤓ PDF</DownloadButton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {files.length > 0 && (
            <div className="card">
              <div className="card-header"><h3>Files ({files.length})</h3></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Document</th><th>Category</th><th>Dated</th><th /></tr></thead>
                  <tbody>
                    {files.map((f: any) => (
                      <tr key={f.id}>
                        <td>
                          <button type="button" className="link-button" style={{ fontWeight: 600 }} onClick={() => open(f)}>{f.title}</button>
                          <div className="text-muted" style={{ fontSize: 11.5 }}>{f.fileName} · {sizeLabel(f.sizeBytes)}</div>
                        </td>
                        <td><span className="badge badge-neutral">{f.category}</span></td>
                        <td className="text-muted">{f.documentDate ? formatDate(f.documentDate) : '—'}</td>
                        <td><div className="row-actions"><button className="btn btn-secondary btn-sm" onClick={() => open(f)}>Open</button></div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
