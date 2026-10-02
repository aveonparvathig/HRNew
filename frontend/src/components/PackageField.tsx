import { useState, useEffect, useRef } from 'react';
import { payrollAPI } from '../api/payroll';
import { formatINR } from '../utils/format';

const MODES = [
  { value: 'MONTHLY', label: 'Monthly package' },
  { value: 'ANNUAL', label: 'Annual package' },
  { value: 'ANNUAL_CTC', label: 'Annual CTC' },
];

// A package typed as a monthly figure, a yearly one, or as annual cost to
// the company. Payroll keeps the monthly package; the other two are worked
// back to it, and what they come to is shown before anything is saved.
export default function PackageField({ label, value, onChange, context = {}, required = false, hint = '', wide = false }: {
  label: string;
  value: string | number;            // the monthly package
  onChange: (monthly: string) => void;
  // Whose package: an existing employee, or the flags and labels of one being added
  context?: { personId?: string; isEsiEligible?: boolean; isPfApplicable?: boolean; designation?: string; department?: string };
  required?: boolean;
  hint?: string;
  wide?: boolean; // take the whole row of a form grid
}) {
  const [mode, setMode] = useState('MONTHLY');
  const [amount, setAmount] = useState('');
  const [preview, setPreview] = useState<any>(null);
  const [problem, setProblem] = useState('');
  const latest = useRef(0);
  const { personId, isEsiEligible, isPfApplicable, designation, department } = context;

  // A yearly figure is worked back by the server, a moment after typing stops
  useEffect(() => {
    if (mode === 'MONTHLY') return;
    setPreview(null);
    setProblem('');
    if (!(Number(amount) > 0)) { onChange(''); return; }
    const ticket = ++latest.current;
    const timer = setTimeout(() => {
      payrollAPI.packagePreview({ mode, amount: Number(amount), personId, isEsiEligible, isPfApplicable, designation, department })
        .then(res => {
          if (ticket !== latest.current) return;
          setPreview(res.data);
          onChange(String(res.data.monthlyPackage));
        })
        .catch(err => {
          if (ticket !== latest.current) return;
          setProblem(err.response?.data?.error || 'Could not work out the package');
          onChange('');
        });
    }, 350);
    return () => clearTimeout(timer);
  }, [mode, amount, personId, isEsiEligible, isPfApplicable, designation, department]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (next: string) => {
    setMode(next);
    setAmount('');
    setPreview(null);
    setProblem('');
    if (next !== 'MONTHLY') onChange('');
  };

  return (
    <div className="field" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <label>{label}{required ? ' *' : ''}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <select className="select" style={{ width: 'auto', flex: '0 0 auto' }} aria-label={`${label}: entered as`} value={mode}
          onChange={e => pick(e.target.value)}>
          {MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
        <div className="input-unit" style={{ flex: 1 }}><span className="unit">₹</span>
          {mode === 'MONTHLY' ? (
            <input className="input" type="number" min={required ? 1 : 0} step="0.01" required={required}
              value={value} onChange={e => onChange(e.target.value)} />
          ) : (
            <input className="input" type="number" min={1} step="1" required={required} aria-label={`${label}: yearly amount`}
              value={amount} onChange={e => setAmount(e.target.value)} />
          )}
        </div>
      </div>
      {mode !== 'MONTHLY' && preview && (
        <span className="hint">
          Monthly package <strong>{formatINR(preview.monthlyPackage)}</strong> · gross {formatINR(preview.annual.grossSalary)} a year,
          cost to company {formatINR(preview.annualCtc)} a year{preview.structureName ? ` · split by “${preview.structureName}”` : ''}
        </span>
      )}
      {mode === 'ANNUAL_CTC' && !preview && !problem && (
        <span className="hint">The yearly cost with the employer's PF and ESI. The monthly package is worked back from it.</span>
      )}
      {problem && <span className="hint" style={{ color: 'var(--danger)' }}>{problem}</span>}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}
