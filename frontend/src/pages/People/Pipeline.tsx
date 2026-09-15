import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { peopleAPI } from '../../api/people';
import {
  PageHeader, EmptyState, LoadingBlock, ErrorAlert,
} from '../../components/ui';
import { formatINR, formatDate } from '../../utils/format';

export default function Pipeline() {
  const [data, setData] = useState<any>(null);
  const [meta, setMeta] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [stage, setStage] = useState('');
  const [source, setSource] = useState('');
  const [job, setJob] = useState('');
  const [q, setQ] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [pipelineRes, metaRes] = await Promise.all([
        peopleAPI.getPipeline({ stage, source, job, q }),
        peopleAPI.getMeta(),
      ]);
      setData(pipelineRes.data);
      setMeta(metaRes.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load pipeline');
    } finally {
      setLoading(false);
    }
  }, [stage, source, job, q]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStageMove = async (person: any, newStage: string) => {
    try {
      const res = await peopleAPI.updatePersonStage(person.id, newStage);
      setSuccess(res.data.becameEmployee ? res.data.message : '');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to move candidate');
    }
  };

  if (loading && !data) return <LoadingBlock label="Loading pipeline…" />;

  return (
    <>
      <PageHeader
        title="Candidate Pipeline"
        subtitle={`${data?.totalPipeline || 0} candidate${data?.totalPipeline !== 1 ? 's' : ''} in the hiring pipeline.`}
        actions={<Link to="/people" className="btn btn-secondary">All People</Link>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {success && (
        <div className="alert alert-success">
          <span>✓</span>
          <span style={{ flex: 1 }}>{success} They now appear under People → Employees.</span>
          <button className="modal-close" onClick={() => setSuccess('')}>✕</button>
        </div>
      )}

      {/* Stage summary chips */}
      <div className="chip-row mb-16">
        <button className={`chip ${stage === '' ? 'active' : ''}`} onClick={() => setStage('')}>
          All ({data?.totalPipeline || 0})
        </button>
        {(data?.stageCards || []).map((s: any) => (
          <button key={s.value}
            className={`chip ${stage === s.value ? 'active' : ''}`}
            onClick={() => setStage(stage === s.value ? '' : s.value)}>
            {s.label} ({s.count})
          </button>
        ))}
      </div>

      <div className="toolbar">
        <div className="search-input">
          <input className="input" placeholder="Search candidates…" value={q}
            onChange={e => setQ(e.target.value)} />
        </div>
        <select className="select" value={source} onChange={e => setSource(e.target.value)}>
          <option value="">All sources</option>
          {(meta?.sources || []).map((s: any) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <select className="select" value={job} onChange={e => setJob(e.target.value)}>
          <option value="">All openings</option>
          {(data?.jobs || []).map((j: any) => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {(data?.candidates || []).length === 0 ? (
          <EmptyState icon="◔"
            title="No candidates match"
            message="Adjust the filters, or add a candidate with a pipeline stage from the People page."
            action={<Link to="/people" className="btn btn-primary">Go to People</Link>} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Candidate</th><th>Applied for</th><th>Source</th>
                  <th className="num">Expected CTC</th><th>Stage updated</th><th>Stage</th>
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((p: any) => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/people/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link>
                      {p.isEmployee && (
                        <span className="badge badge-success" style={{ marginLeft: 6 }}>
                          <span className="dot" />Employee
                        </span>
                      )}
                      {p.designation && <div className="text-muted" style={{ fontSize: 11.5 }}>{p.designation}</div>}
                    </td>
                    <td className="text-muted">{p.appliedForTitle || '—'}</td>
                    <td className="text-muted">
                      {(meta?.sources || []).find((s: any) => s.value === p.source)?.label || '—'}
                    </td>
                    <td className="num">{p.expectedCtc ? formatINR(p.expectedCtc) : '—'}</td>
                    <td className="text-muted" style={{ fontSize: 12.5 }}>
                      {p.stageUpdatedAt ? formatDate(p.stageUpdatedAt) : '—'}
                    </td>
                    <td>
                      <select
                        className={`select`}
                        style={{ width: 140, padding: '5px 8px', fontSize: 12.5 }}
                        value={p.stage}
                        onChange={e => handleStageMove(p, e.target.value)}>
                        {(meta?.stages || []).map((s: any) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
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
