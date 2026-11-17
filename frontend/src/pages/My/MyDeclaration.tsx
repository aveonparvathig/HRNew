import { useState, useEffect, useCallback } from 'react';
import { selfAPI } from '../../api/self';
import { PageHeader, LoadingBlock, ErrorAlert } from '../../components/ui';
import { ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Layout/nav';
import DeclarationEditor, { type DeclarationActions } from '../../components/DeclarationEditor';

const actions: DeclarationActions = {
  save: body => selfAPI.saveDeclaration(body),
  submit: body => selfAPI.submitDeclaration(body),
  requestReopen: body => selfAPI.requestReopen(body),
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
        title="My tax declaration"
        subtitle={`FY ${data.financialYear} · what you declare here decides the tax deducted from your salary`}
        actions={<>
          <select className="select mp-select-auto" aria-label="Financial year" value={data.fyStart} onChange={e => setFy(e.target.value)}>
            {data.financialYears.map((y: any) => <option key={y.startYear} value={y.startYear}>FY {y.label}</option>)}
          </select>
          <ButtonLink to={`/my/reports/form-12bb?fy=${data.fyStart}`}>Form 12BB</ButtonLink>
          <ButtonLink to={`/my/reports/tax-statement?fy=${data.fyStart}`}>Tax statement</ButtonLink>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      {!data.person.hasValidPan && (
        <div className="alert alert-warning">
          <Icon name="alert" size={16} className="mp-alert-icon" />
          <span>Your PAN is not on record. Without it tax is deducted at a higher rate; give it to HR.</span>
        </div>
      )}
      <DeclarationEditor data={data} mode="self" actions={actions} onChanged={fetchData} />
    </>
  );
}
