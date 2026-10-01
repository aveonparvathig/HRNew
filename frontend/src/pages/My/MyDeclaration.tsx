import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { selfAPI } from '../../api/self';
import { PageHeader, LoadingBlock, ErrorAlert } from '../../components/ui';
import DeclarationEditor, { type DeclarationActions } from '../../components/DeclarationEditor';

const actions: DeclarationActions = {
  save: body => selfAPI.saveDeclaration(body),
  addProof: body => selfAPI.addProof(body),
  getProof: proofId => selfAPI.getProof(proofId).then(r => r.data),
  deleteProof: proofId => selfAPI.deleteProof(proofId),
};

// The signed-in employee's own income-tax declaration.
export default function MyDeclaration() {
  const [data, setData] = useState<any>(null);
  const [fy, setFy] = useState('');
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await selfAPI.getDeclaration(fy);
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load your declaration');
    }
  }, [fy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading your declaration…" />;

  return (
    <>
      <PageHeader
        title="My Tax Declaration"
        subtitle={`FY ${data.financialYear} · what you declare here decides the tax deducted from your salary`}
        actions={<>
          <select className="select" style={{ width: 'auto' }} value={data.fyStart} onChange={e => setFy(e.target.value)}>
            {data.financialYears.map((y: any) => <option key={y.startYear} value={y.startYear}>FY {y.label}</option>)}
          </select>
          <Link to={`/my/reports/form-12bb?fy=${data.fyStart}`} className="btn btn-secondary">Form 12BB</Link>
          <Link to={`/my/reports/tax-statement?fy=${data.fyStart}`} className="btn btn-secondary">Tax Statement</Link>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {!data.person.hasValidPan && (
        <div className="alert alert-warning">
          <span>⚠</span>
          <span>Your PAN is not on record. Without it tax is deducted at a higher rate; give it to HR.</span>
        </div>
      )}
      <DeclarationEditor data={data} mode="self" actions={actions} onChanged={fetchData} />
    </>
  );
}
