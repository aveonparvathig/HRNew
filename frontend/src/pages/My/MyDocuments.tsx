import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { selfAPI } from '../../api/self';
import { openDataFile } from '../../api/files';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState } from '../../components/ui';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
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
      <PageHeader title="My documents" subtitle="Letters and files HR has shared with you. Payslips and Form 16 are under My payslips." />
      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {letters.length === 0 && files.length === 0 ? (
        <div className="card"><EmptyState icon="▤" title="Nothing here yet" message="Letters and documents appear here once HR shares them with you." /></div>
      ) : (
        <>
          {letters.length > 0 && (
            <div className="card mb-24">
              <div className="card-header"><h3>Letters <span className="num">({letters.length})</span></h3></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Letter</th><th>Issued</th><th /></tr></thead>
                  <tbody>
                    {letters.map((l: any) => (
                      <tr key={l.id}>
                        <td><Link to={`/my/documents/${l.id}`} className="mp-strong">{l.title}</Link></td>
                        <td className="text-muted">{formatDate(l.createdAt)}</td>
                        <td>
                          <div className="row-actions">
                            <ButtonLink size="sm" to={`/my/documents/${l.id}`}>View</ButtonLink>
                            <DownloadButton path={`/self/documents/letters/${l.id}/pdf`} className="btn btn-secondary btn-sm" busyLabel="Making the PDF…">
                              <Icon name="download" size={16} className="btn-icon" />PDF
                            </DownloadButton>
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
              <div className="card-header"><h3>Files <span className="num">({files.length})</span></h3></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Document</th><th>Category</th><th>Dated</th><th /></tr></thead>
                  <tbody>
                    {files.map((f: any) => (
                      <tr key={f.id}>
                        <td>
                          <button type="button" className="link-button mp-strong" onClick={() => open(f)}>{f.title}</button>
                          <div className="mp-cell-sub">{f.fileName} · {sizeLabel(f.sizeBytes)}</div>
                        </td>
                        <td><span className="badge badge-neutral">{f.category}</span></td>
                        <td className="text-muted">{f.documentDate ? formatDate(f.documentDate) : '—'}</td>
                        <td><div className="row-actions"><Button size="sm" onClick={() => open(f)}>Open</Button></div></td>
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
