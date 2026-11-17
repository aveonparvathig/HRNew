import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { peopleAPI } from '../api/people';
import { StatCard } from './ui';
import { Icon } from './Layout/nav';

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
    <div className="list-row pd-list-row">
      <span className="pd-min0">
        <Link to={`/people/${p.id}`} className="pd-strong">{p.name}</Link>
        {(p.designation || p.department) && (
          <span className="pd-meta"> · {[p.designation, p.department].filter(Boolean).join(', ')}</span>
        )}
      </span>
      <span className="text-sm-muted pd-nowrap">{right}</span>
    </div>
  );
}

function Block({ title, count, empty, children }: { title: string; count: number; empty: string; children: ReactNode }) {
  return (
    <div className="card card-pad">
      <h3 className="pd-block-title">{title}{count > 0 && <span className="pd-block-count"> (<span className="num">{count}</span>)</span>}</h3>
      {count > 0 ? children : <p className="pd-block-empty">{empty}</p>}
    </div>
  );
}

// What HR looks at first: headcount over the year, who joined and left,
// birthdays and anniversaries this week, confirmations due, records to complete.
export default function HrPanel() {
  const [data, setData] = useState<any>(null);
  const [months, setMonths] = useState(12);

  useEffect(() => {
    peopleAPI.getHrDashboard().then(res => setData(res.data)).catch(() => setData(null));
  }, []);

  if (!data) return null;
  const trend: any[] = data.headcount.trend;
  const shown = trend.slice(-months);
  const top = Math.max(1, ...shown.map((t: any) => t.headcount));
  const thisMonth = trend[trend.length - 1];
  const yearAgo = trend[0];
  const change = thisMonth.headcount - yearAgo.headcount;
  const gaps: any[] = data.gaps.filter((g: any) => g.count > 0);
  const occasions = data.birthdays.length + data.anniversaries.length;

  return (
    <>
      <h2 className="section-title flush">People</h2>
      <div className="stat-grid">
        <StatCard label="Employees" value={data.headcount.current} icon="users" tone="indigo"
          trend={change !== 0 && (
            <span className={`trend-chip ${change > 0 ? 'trend-good' : 'trend-bad'}`}>
              <Icon name={change > 0 ? 'trendingUp' : 'trendingDown'} size={12} className="pd-trend-icon" /> <span className="num">{Math.abs(change)}</span>
            </span>
          )}
          sub={`vs ${monthLong(yearAgo.period)}`}
          spark={trend.map((t: any) => t.headcount)} sparkColor="var(--m-indigo)" />
        <StatCard label={`Joined in ${data.days.joiners} days`} value={data.joiners.length} icon="trendingUp" tone="green"
          sub={`${thisMonth.joined} this month`}
          spark={trend.map((t: any) => t.joined)} sparkColor="var(--m-green)" />
        <StatCard label={`Left in ${data.days.joiners} days`} value={data.leavers.length} icon="trendingDown" tone="amber"
          sub={data.leavingSoon.length ? `${data.leavingSoon.length} serving notice` : `${thisMonth.left} this month`}
          spark={trend.map((t: any) => t.left)} sparkColor="var(--m-amber)" />
        <StatCard label="Confirmations due" value={data.confirmations.due.length} icon="clock"
          tone={data.confirmations.overdue ? 'rose' : 'cyan'}
          sub={data.confirmations.overdue ? `${data.confirmations.overdue} overdue` : `Next ${data.days.confirmations} days`} />
      </div>

      <div className="card card-pad mb-24">
        <div className="card-head-row">
          <div>
            <h3 className="pd-chart-title">Headcount</h3>
            <span className="text-sm-muted">
              Employees on the rolls at each month end.
            </span>
          </div>
          <div className="segmented" role="group" aria-label="Months shown">
            <button type="button" className={months === 6 ? 'active' : ''} aria-pressed={months === 6} onClick={() => setMonths(6)}>6M</button>
            <button type="button" className={months === 12 ? 'active' : ''} aria-pressed={months === 12} onClick={() => setMonths(12)}>12M</button>
          </div>
        </div>
        <div className="chart-box" role="img"
          aria-label={`Headcount by month: ${shown.map((t: any) => `${monthLong(t.period)} ${t.headcount}`).join(', ')}`}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={shown} margin={{ top: 16, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--chart-grid)" />
              <XAxis dataKey="period" tickFormatter={monthShort} tickLine={false} axisLine={false} dy={6}
                tick={{ fill: 'var(--chart-axis)', fontSize: 11.5 }} />
              <YAxis width={44} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, Math.ceil(top * 1.15)]}
                tick={{ fill: 'var(--chart-axis)', fontSize: 11.5, fontFamily: 'var(--font-num)' }} />
              <Tooltip
                labelFormatter={(p) => monthLong(String(p))}
                formatter={(v: number) => [plural(Number(v), 'employee'), 'Headcount']} />
              <Area type="monotone" dataKey="headcount" stroke="var(--m-indigo)" strokeWidth={2}
                fill="var(--m-indigo)" fillOpacity={0.12} dot={false} activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
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
            <div key={g.key} className="list-row pd-list-row">
              <span>{g.label}</span>
              <Link to={`/people?missing=${g.key}`} className="pd-strong">{plural(g.count, 'employee')} →</Link>
            </div>
          ))}
        </Block>
      </div>
    </>
  );
}
