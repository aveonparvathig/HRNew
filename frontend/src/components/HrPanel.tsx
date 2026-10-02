import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { peopleAPI } from '../api/people';
import { StatCard } from './ui';

const dayLabel = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const fullDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const monthShort = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
};
const monthLong = (period: string) => {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};
const when = (daysAway: number, on: string) => (daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : dayLabel(on));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function PersonRow({ p, right }: { p: any; right: ReactNode }) {
  return (
    <div className="list-row" style={{ padding: '8px 0' }}>
      <span style={{ minWidth: 0 }}>
        <Link to={`/people/${p.id}`} style={{ fontWeight: 600 }}>{p.name}</Link>
        {(p.designation || p.department) && (
          <span className="text-muted" style={{ fontSize: 12 }}> · {[p.designation, p.department].filter(Boolean).join(', ')}</span>
        )}
      </span>
      <span className="text-muted" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>{right}</span>
    </div>
  );
}

function Block({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <div className="card card-pad">
      <h3 style={{ fontSize: 15, marginBottom: 6 }}>{title}{count > 0 && <span className="text-muted" style={{ fontWeight: 500 }}> ({count})</span>}</h3>
      {count > 0 ? children : <p className="text-muted" style={{ fontSize: 13, margin: '6px 0 0' }}>{empty}</p>}
    </div>
  );
}

// What HR looks at first: headcount over the year, who joined and left,
// birthdays and anniversaries this week, confirmations due, records to complete.
export default function HrPanel() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    peopleAPI.getHrDashboard().then(res => setData(res.data)).catch(() => setData(null));
  }, []);

  if (!data) return null;
  const trend: any[] = data.headcount.trend;
  const top = Math.max(1, ...trend.map(t => t.headcount));
  const thisMonth = trend[trend.length - 1];
  const yearAgo = trend[0];
  const change = thisMonth.headcount - yearAgo.headcount;
  const gaps: any[] = data.gaps.filter((g: any) => g.count > 0);
  const occasions = data.birthdays.length + data.anniversaries.length;

  return (
    <>
      <h2 className="section-title" style={{ marginTop: 0 }}>People</h2>
      <div className="stat-grid">
        <StatCard label="Employees" value={data.headcount.current} icon="☰" tone="primary"
          sub={`${change === 0 ? 'Same as' : `${change > 0 ? '+' : '−'}${Math.abs(change)} since`} ${monthLong(yearAgo.period)}`} />
        <StatCard label={`Joined in ${data.days.joiners} days`} value={data.joiners.length} icon="↗" tone="success"
          sub={`${thisMonth.joined} this month`} />
        <StatCard label={`Left in ${data.days.joiners} days`} value={data.leavers.length} icon="↘" tone="warning"
          sub={data.leavingSoon.length ? `${data.leavingSoon.length} serving notice` : `${thisMonth.left} this month`} />
        <StatCard label="Confirmations due" value={data.confirmations.due.length} icon="◷"
          tone={data.confirmations.overdue ? 'danger' : 'info'}
          sub={data.confirmations.overdue ? `${data.confirmations.overdue} overdue` : `Next ${data.days.confirmations} days`} />
      </div>

      <div className="card card-pad mb-24">
        <h3 style={{ fontSize: 15, marginBottom: 2 }}>Headcount, last 12 months</h3>
        <span className="text-muted" style={{ fontSize: 12.5 }}>
          Employees on the rolls at each month end, from joining and relieving dates.
        </span>
        <div className="trend-bars" role="img"
          aria-label={`Headcount by month: ${trend.map(t => `${monthLong(t.period)} ${t.headcount}`).join(', ')}`}>
          {trend.map(t => (
            <div key={t.period} className="trend-col"
              title={`${monthLong(t.period)}: ${plural(t.headcount, 'employee')}, ${t.joined} joined, ${t.left} left`}>
              <span className="trend-value">{t.headcount}</span>
              <div className="trend-bar" style={{ height: `${Math.max(3, Math.round((t.headcount / top) * 100))}%` }} />
              <span className="trend-label">{monthShort(t.period)}</span>
              <span className="trend-moves">
                {t.joined > 0 && <span className="text-success">+{t.joined}</span>}
                {t.joined > 0 && t.left > 0 && ' '}
                {t.left > 0 && <span className="text-warning">−{t.left}</span>}
                {t.joined === 0 && t.left === 0 && ' '}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid-2 mb-24">
        <Block title="Joined and left" count={data.joiners.length + data.leavers.length + data.leavingSoon.length}
          empty={`Nobody joined or left in the last ${data.days.joiners} days.`}>
          {data.joiners.map((p: any) => <PersonRow key={`j${p.id}`} p={p} right={<><span className="badge badge-success">Joined</span> {fullDate(p.joinDate)}</>} />)}
          {data.leavingSoon.map((p: any) => (
            <PersonRow key={`n${p.id}`} p={p}
              right={<><span className="badge badge-warning">On notice</span> {p.leavingDate ? `last day ${fullDate(p.leavingDate)}` : 'last day not set'}</>} />
          ))}
          {data.leavers.map((p: any) => <PersonRow key={`l${p.id}`} p={p} right={<><span className="badge badge-neutral">Left</span> {fullDate(p.leavingDate)}</>} />)}
        </Block>

        <Block title="Birthdays and anniversaries" count={occasions} empty={`None in the next ${data.days.occasions} days.`}>
          {data.birthdays.map((p: any) => <PersonRow key={`b${p.id}`} p={p} right={<>Birthday · {when(p.daysAway, p.on)}</>} />)}
          {data.anniversaries.map((p: any) => (
            <PersonRow key={`a${p.id}`} p={p} right={<>{plural(p.years, 'year')} with us · {when(p.daysAway, p.on)}</>} />
          ))}
        </Block>

        <Block title="Confirmations due" count={data.confirmations.due.length}
          empty={`No probation ends in the next ${data.days.confirmations} days.`}>
          {data.confirmations.due.map((p: any) => (
            <PersonRow key={p.id} p={p} right={
              <><span className={`badge ${p.overdue ? 'badge-danger' : 'badge-warning'}`}>{p.overdue ? 'Overdue' : 'Due'}</span> {fullDate(p.dueOn)}</>
            } />
          ))}
        </Block>

        <Block title="Records to complete" count={gaps.length} empty="Every employee has a PAN, a bank account, a work location and a joining date.">
          {gaps.map(g => (
            <div key={g.key} className="list-row" style={{ padding: '8px 0' }}>
              <span>{g.label}</span>
              <Link to={`/people?missing=${g.key}`} style={{ fontWeight: 600 }}>{plural(g.count, 'employee')} →</Link>
            </div>
          ))}
        </Block>
      </div>
    </>
  );
}
