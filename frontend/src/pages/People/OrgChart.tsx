import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { peopleAPI } from '../../api/people';
import { useAuthStore } from '../../store/authStore';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, Modal } from '../../components/ui';
import { toast } from '../../components/feedback';

type Node = { person: any; reports: Node[]; directCount: number; teamCount: number };

const flatten = (nodes: Node[]): Node[] => nodes.flatMap(n => [n, ...flatten(n.reports)]);
const teamIds = (node: Node): string[] => node.reports.flatMap(r => [r.person.id, ...teamIds(r)]);

// Who reports to whom, as a tree. HR can move one person or a whole team.
export default function OrgChart() {
  const role = useAuthStore(state => state.user?.role) || '';
  const canManage = role === 'SUPER_ADMIN' || role === 'HR';
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  // { node, mode: 'manager' | 'team', target }
  const [move, setMove] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setData((await peopleAPI.getOrgChart()).data);
      setError('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load the organization chart');
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const all = useMemo(() => (data ? flatten(data.tree) : []), [data]);
  const nameOf = useMemo(() => new Map<string, string>((data?.people || []).map((p: any) => [p.id, p.name])), [data]);

  const toggle = (id: string) => setClosed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = move.mode === 'team'
        ? await peopleAPI.transferReports({ fromManagerId: move.node.person.id, toManagerId: move.target })
        : await peopleAPI.setManager(move.node.person.id, move.target);
      toast.success(res.data.message);
      setMove(null);
      setError('');
      fetchData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not save the change');
      setMove(null);
    } finally {
      setSaving(false);
    }
  };

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading the organization chart…" />;

  const q = search.trim().toLowerCase();
  const matches = q ? all.filter(n => `${n.person.name} ${n.person.employeeNo} ${n.person.designation} ${n.person.department}`.toLowerCase().includes(q)) : [];

  const card = (node: Node) => (
    <div className="org-node">
      {node.reports.length > 0 ? (
        <button type="button" className="org-toggle" aria-expanded={!closed.has(node.person.id)}
          aria-label={`${closed.has(node.person.id) ? 'Show' : 'Hide'} the team of ${node.person.name}`}
          onClick={() => toggle(node.person.id)}>{closed.has(node.person.id) ? '▸' : '▾'}</button>
      ) : <span className="org-toggle" aria-hidden="true" />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Link to={`/people/${node.person.id}`} style={{ fontWeight: 600 }}>{node.person.name}</Link>
        <span className="text-muted" style={{ fontSize: 12.5 }}>
          {' '}{[node.person.designation, node.person.department].filter(Boolean).join(' · ')}
          {node.person.employeeNo ? ` · ${node.person.employeeNo}` : ''}
        </span>
      </div>
      {node.directCount > 0 && (
        <span className="badge badge-neutral" title={`${node.directCount} report directly; ${node.teamCount} in the whole team`}>
          {node.directCount} direct{node.teamCount > node.directCount ? ` · ${node.teamCount} in all` : ''}
        </span>
      )}
      {canManage && (
        <span className="row-actions no-print">
          <button type="button" className="btn btn-secondary btn-sm"
            onClick={() => setMove({ node, mode: 'manager', target: node.person.managerId && nameOf.has(node.person.managerId) ? node.person.managerId : '' })}>
            Change Manager
          </button>
          {node.directCount > 0 && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMove({ node, mode: 'team', target: '' })}>Move Team</button>
          )}
        </span>
      )}
    </div>
  );

  const branch = (nodes: Node[]) => (
    <ul className="org-tree">
      {nodes.map(node => (
        <li key={node.person.id}>
          {card(node)}
          {node.reports.length > 0 && !closed.has(node.person.id) && branch(node.reports)}
        </li>
      ))}
    </ul>
  );

  // Someone cannot report to themselves or to anyone below them
  const blocked = move ? new Set([move.node.person.id, ...(move.mode === 'manager' ? teamIds(move.node) : [])]) : new Set<string>();
  const options = (data.people as any[]).filter(p => !blocked.has(p.id));

  return (
    <>
      <PageHeader
        title="Organization Chart"
        subtitle={`${data.people.length} employee${data.people.length === 1 ? '' : 's'}${data.withoutManager ? ` · ${data.withoutManager} with no manager, shown at the top` : ''}`}
        actions={<>
          <input className="input" style={{ width: 220 }} placeholder="Search name, code or designation…" aria-label="Search the chart"
            value={search} onChange={e => setSearch(e.target.value)} />
          <button className="btn btn-secondary" onClick={() => setClosed(new Set(closed.size ? [] : all.filter(n => n.reports.length).map(n => n.person.id)))}>
            {closed.size ? 'Expand All' : 'Collapse All'}
          </button>
          <button className="btn btn-secondary" onClick={() => window.print()}>🖨 Print</button>
        </>}
      />

      <ErrorAlert message={error} onDismiss={() => setError('')} />

      {data.people.length === 0 ? (
        <EmptyState icon="▤" title="No employees yet" />
      ) : q ? (
        <div className="card card-pad">
          {matches.length === 0 ? <p className="text-muted">Nobody matches “{search}”.</p> : (
            <ul className="org-tree" style={{ paddingLeft: 0, borderLeft: 0 }}>
              {matches.map(node => (
                <li key={node.person.id}>
                  {card(node)}
                  <div className="text-muted" style={{ fontSize: 12, margin: '-2px 0 8px 30px' }}>
                    {node.person.managerId && nameOf.has(node.person.managerId) ? `Reports to ${nameOf.get(node.person.managerId)}` : 'No manager'}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="card card-pad print-area">{branch(data.tree)}</div>
      )}

      <Modal title={move ? (move.mode === 'team' ? `Move the Team of ${move.node.person.name}` : `Manager of ${move.node.person.name}`) : ''}
        open={Boolean(move)} onClose={() => setMove(null)}>
        {move && (
          <form onSubmit={save}>
            <div className="field" style={{ marginBottom: 14 }}>
              <label>{move.mode === 'team' ? 'New manager for the team' : 'Reports to'}</label>
              <select className="select" value={move.target} onChange={e => setMove({ ...move, target: e.target.value })}>
                <option value="">No manager (top of the chart)</option>
                {options.map((p: any) => <option key={p.id} value={p.id}>{p.name}{p.designation ? ` — ${p.designation}` : ''}</option>)}
              </select>
              <span className="hint">
                {move.mode === 'team'
                  ? `The ${move.node.directCount} ${move.node.directCount === 1 ? 'person' : 'people'} reporting directly to ${move.node.person.name} move under this manager. ${move.node.person.name} stays where they are.`
                  : 'Their own team moves with them. People who report to them cannot be picked.'}
              </span>
            </div>
            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setMove(null)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
