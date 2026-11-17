import { useState } from 'react';
import { PageHeader, StatCard, StatusBadge, EmptyState } from '../components/ui';
import { Button } from '../components/Button';
import { Tabs } from '../components/Tabs';
import { Cluster, AutoGrid } from '../components/layout';
import { DataTable, type Column } from '../components/DataTable';
import { useTheme } from '../store/theme';

// Dev-only living reference for the Swiss Slate design system (/__ui).
// Every redesign PR is reviewed against this page in both themes.
const SWATCHES = [
  '--bg', '--surface', '--surface-2', '--border', '--text', '--text-2', '--text-3',
  '--primary', '--accent', '--accent-dot', '--success', '--warning', '--danger', '--info',
  '--m-indigo', '--m-blue', '--m-green', '--m-amber', '--m-rose', '--m-violet', '--m-teal', '--m-cyan',
];

interface Row { id: string; name: string; dept: string; gross: number; net: number; status: string }
const ROWS: Row[] = [
  { id: '1', name: 'Asha Menon', dept: 'Engineering', gross: 142000, net: 118450, status: 'finalized' },
  { id: '2', name: 'Vikram Rao', dept: 'Sales', gross: 96000, net: 81200, status: 'pending' },
  { id: '3', name: 'Neha Iyer', dept: 'Finance', gross: 110500, net: 93870, status: 'draft' },
];
const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const COLS: Column<Row>[] = [
  { key: 'name', header: 'Employee', render: r => r.name },
  { key: 'dept', header: 'Department', render: r => r.dept },
  { key: 'gross', header: 'Gross', align: 'right', render: r => inr(r.gross) },
  { key: 'net', header: 'Net pay', align: 'right', render: r => <strong className="num-pos">{inr(r.net)}</strong> },
  { key: 'status', header: 'Status', render: r => <StatusBadge status={r.status} /> },
];

export default function UiReference() {
  const [tab, setTab] = useState<'one' | 'two' | 'three'>('one');
  const toggle = useTheme(s => s.toggle);
  const setDensity = useTheme(s => s.setDensity);
  const density = useTheme(s => s.density);

  return (
    <div className="ui-ref page-pad">
      <PageHeader title="UI reference" subtitle="Swiss Slate tokens and primitives. Dev builds only."
        actions={<>
          <Button icon="sun" onClick={toggle}>Toggle theme</Button>
          <Button onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}>
            Density: {density}
          </Button>
        </>} />

      <section>
        <h2>Colour tokens</h2>
        <AutoGrid min={110} gap={12}>
          {SWATCHES.map(v => (
            <div key={v}>
              <div className="ui-swatch" style={{ background: `var(${v})` }} />
              <div className="ui-swatch-label">{v}</div>
            </div>
          ))}
        </AutoGrid>
      </section>

      <section>
        <h2>Buttons</h2>
        <Cluster>
          <Button variant="accent" icon="plus">Create run</Button>
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="accent" loading>Saving…</Button>
          <Button size="sm">Small</Button>
        </Cluster>
      </section>

      <section>
        <h2>Badges</h2>
        <Cluster>
          {['finalized', 'active', 'pending', 'signed', 'failed', 'draft', 'inactive'].map(s => <StatusBadge key={s} status={s} />)}
        </Cluster>
      </section>

      <section>
        <h2>Stat cards</h2>
        <div className="stat-grid">
          <StatCard label="Net payout" value="₹48,72,300" sub="Gross ₹57,40,100" icon="banknote" tone="green"
            spark={[40, 42, 41, 45, 47, 48]} />
          <StatCard label="Employees" value={142} sub="4 joined this month" icon="users" tone="indigo" />
          <StatCard label="TDS due" value="₹6,10,450" sub="Due 7 Dec" icon="calendar" tone="amber" />
          <StatCard label="Open requests" value={7} sub="Leave and expenses" icon="clock" tone="blue" />
        </div>
      </section>

      <section>
        <h2>Tabs</h2>
        <Tabs label="Example" value={tab} onChange={setTab}
          items={[{ key: 'one', label: 'Pay components', count: 12 }, { key: 'two', label: 'Statutory' }, { key: 'three', label: 'Income tax' }]} />
        <p className="text-sm-muted">Active tab: {tab}</p>
      </section>

      <section>
        <h2>Data table</h2>
        <DataTable title="Payslips" columns={COLS} rows={ROWS} rowKey={r => r.id} searchable
          searchText={r => r.name + r.dept} onRowClick={() => undefined} />
      </section>

      <section>
        <h2>Form controls</h2>
        <div className="card">
          <div className="form-grid">
            <div className="field"><label htmlFor="ui-a">Employee name</label><input id="ui-a" className="input" placeholder="Asha Menon" /></div>
            <div className="field"><label htmlFor="ui-b">Department</label>
              <select id="ui-b" className="select"><option>Engineering</option><option>Sales</option></select></div>
          </div>
        </div>
      </section>

      <section>
        <h2>Empty state</h2>
        <div className="card"><EmptyState icon="▦" title="Start your first payroll run" message="Every active employee is pulled in automatically." /></div>
      </section>
    </div>
  );
}
