import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { payrollAPI } from '../../api/payroll';
import { PageHeader, LoadingBlock, ErrorAlert, BackButton } from '../../components/ui';
import DeclarationEditor, { type DeclarationActions } from '../../components/DeclarationEditor';

// HR's view of one employee's declaration: declared amounts, proofs and approvals.
export default function DeclarationDetail() {
  const { personId } = useParams<{ personId: string }>();
  const [params, setParams] = useSearchParams();
  const fy = params.get('fy') || '';
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await payrollAPI.getDeclaration(personId!, fy);
      setData(res.data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the declaration');
    }
  }, [personId, fy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading declaration…" />;

  const actions: DeclarationActions = {
    save: body => payrollAPI.saveDeclaration(personId!, body),
    approve: body => payrollAPI.saveDeclarationApproval(personId!, body),
    submit: body => payrollAPI.submitDeclaration(personId!, body),
    review: body => payrollAPI.reviewDeclaration(personId!, body),
    decideReopen: (requestId, body) => payrollAPI.decideReopenRequest(requestId, body),
    addProof: body => payrollAPI.addDeclarationProof(personId!, body),
    getProof: proofId => payrollAPI.getDeclarationProof(proofId).then(r => r.data),
    deleteProof: proofId => payrollAPI.deleteDeclarationProof(proofId),
  };
  const reportQuery = `fy=${data.fyStart}&personId=${data.person.id}`;

  return (
    <>
      <div className="breadcrumb"><BackButton />
        <Link to="/payroll">Payroll</Link>
        <span>/</span>
        <Link to={`/payroll/declarations?fy=${data.fyStart}`}>Tax Declarations</Link>
        <span>/</span>
        <span>{data.person.name}</span>
      </div>

      <PageHeader
        title={`Declaration — ${data.person.name}`}
        subtitle={`FY ${data.financialYear}${data.person.employeeNo ? ` · ${data.person.employeeNo}` : ''}${data.person.hasValidPan ? '' : ' · no valid PAN on record'}`}
        actions={<>
          <select className="select" style={{ width: 'auto' }} value={data.fyStart}
            onChange={e => setParams({ fy: e.target.value }, { replace: true })}>
            {data.financialYears.map((y: any) => <option key={y.startYear} value={y.startYear}>FY {y.label}</option>)}
          </select>
          <Link to={`/payroll/reports/form-12bb?${reportQuery}`} className="btn btn-secondary">Form 12BB</Link>
          <Link to={`/payroll/reports/tax-statement?${reportQuery}`} className="btn btn-secondary">Tax Statement</Link>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />
      <DeclarationEditor data={data} mode="hr" actions={actions} onChanged={fetchData} />
    </>
  );
}
