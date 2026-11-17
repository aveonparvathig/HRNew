import { useState, useEffect, useCallback } from 'react';
import { incomeAPI } from '../../api/income';
import { PageHeader, ErrorAlert, LoadingBlock, EmptyState, StatusBadge } from '../../components/ui';
import { Button } from '../../components/Button';

export default function AcademicYears() {
  const [years, setYears] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchYears = useCallback(async () => {
    try {
      const res = await incomeAPI.getAcademicYears();
      setYears(res.data.years);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load academic years');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchYears(); }, [fetchYears]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) return;
    setSaving(true);
    try {
      await incomeAPI.createAcademicYear(label.trim());
      setLabel('');
      setError('');
      fetchYears();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add year');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (year: any) => {
    try {
      await incomeAPI.toggleAcademicYear(year.id);
      fetchYears();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update year');
    }
  };

  return (
    <>
      <PageHeader
        title="Academic years"
        subtitle="Years available when adding billing rows. Inactive years stay on old rows but are hidden from new ones."
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      <div className="card card-pad mb-24">
        <form onSubmit={handleAdd} className="io-add-form">
          <div className="field">
            <label htmlFor="io-year-label">New academic year</label>
            <input id="io-year-label" className="input" placeholder="2026-2027" value={label}
              onChange={e => setLabel(e.target.value)} />
          </div>
          <Button type="submit" variant="accent" icon="plus" loading={saving}>
            {saving ? 'Adding…' : 'Add year'}
          </Button>
        </form>
      </div>

      <div className="card">
        {loading ? (
          <LoadingBlock />
        ) : years.length === 0 ? (
          <EmptyState icon="▤" title="No academic years yet"
            message="Add one above, or they'll be auto-imported from billing rows." />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Year</th><th>Status</th><th className="num">Billing rows</th><th /></tr>
              </thead>
              <tbody>
                {years.map(y => (
                  <tr key={y.id}>
                    <td className="io-strong">{y.label}</td>
                    <td><StatusBadge status={y.isActive ? 'active' : 'inactive'} /></td>
                    <td className="num text-muted">{y.usageCount}</td>
                    <td>
                      <div className="row-actions">
                        <Button size="sm" onClick={() => handleToggle(y)}>
                          {y.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
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
