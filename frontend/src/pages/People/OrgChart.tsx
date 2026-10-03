import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { peopleAPI } from '../../api/people';
import { useAuthStore } from '../../store/authStore';
import { PageHeader, LoadingBlock, ErrorAlert, EmptyState, Modal } from '../../components/ui';
import { toast, confirmDialog } from '../../components/feedback';

type Node = { person: any; reports: Node[]; directCount: number; teamCount: number };

const flatten = (nodes: Node[]): Node[] => nodes.flatMap(n => [n, ...flatten(n.reports)]);
const teamIds = (node: Node): string[] => node.reports.flatMap(r => [r.person.id, ...teamIds(r)]);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '☺';

// Who reports to whom, as a top-down chart. HR can drag a person onto a new
// manager, or onto the top strip to clear their manager.
export default function OrgChart() {
  const role = useAuthStore(state => state.user?.role) || '';
  const canManage = role === 'SUPER_ADMIN' || role === 'HR';
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [move, setMove] = useState<any>(null); // Change-Manager / Move-Team modal (keyboard fallback)
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null); // the person being dragged
  const [dropId, setDropId] = useState<string | null>(null); // the card currently hovered as a target

  const fetchData = useCallback(async () => {
    try { setData((await peopleAPI.getOrgChart()).data); setError(''); }
    catch (err: any) { setError(err.response?.data?.error || 'Failed to load the organization chart'); }
  }, []);
  useEffect(() => { fetchData(); }, [fetchData]);

  const all = useMemo(() => (data ? flatten(data.tree) : []), [data]);
  const nodeById = useMemo(() => new Map(all.map(n => [n.person.id, n])), [all]);
  const nameOf = useMemo(() => new Map<string, string>((data?.people || []).map((p: any) => [p.id, p.name])), [data]);

  const toggle = (id: string) => setClosed(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      const res = move.mode === 'team'
        ? await peopleAPI.transferReports({ fromManagerId: move.node.person.id, toManagerId: move.target })
        : await peopleAPI.setManager(move.node.person.id, move.target);
      toast.success(res.data.message); setMove(null); setError(''); fetchData();
    } catch (err: any) { setError(err.response?.data?.error || 'Could not save the change'); setMove(null); }
    finally { setSaving(false); }
  };

  // ---- Drag and drop ----------------------------------------------------------------------------
  // Everyone the dragged person cannot move under: themselves and their own team.
  const blockedForDrag = useMemo(() => {
    if (!dragId) return new Set<string>();
    const n = nodeById.get(dragId);
    return new Set<string>(n ? [dragId, ...teamIds(n)] : [dragId]);
  }, [dragId, nodeById]);

  const canDropOn = (targetId: string | null) => {
    if (!dragId) return false;
    const dragged = nodeById.get(dragId)?.person;
    if (!dragged) return false;
    if (targetId && blockedForDrag.has(targetId)) return false; // self or a descendant
    const currentManager = dragged.managerId || null;
    return (targetId || null) !== currentManager; // not a no-op
  };

  const applyDrop = async (targetId: string | null) => {
    const id = dragId; setDragId(null); setDropId(null);
    if (!id || !canDropOn(targetId)) return;
    const dragName = nameOf.get(id) || 'this person';
    const ok = await confirmDialog({
      title: targetId ? `Make ${dragName} report to ${nameOf.get(targetId)}?` : `Move ${dragName} to the top?`,
      message: targetId
        ? `${dragName} (and their team) will report to ${nameOf.get(targetId)}.`
        : `${dragName} will have no manager and sit at the top of the chart.`,
      confirmLabel: 'Move',
    });
    if (!ok) return;
    try { const res = await peopleAPI.setManager(id, targetId || ''); toast.success(res.data.message); fetchData(); }
    catch (err: any) { setError(err.response?.data?.error || 'Could not move them'); }
  };

  const dragProps = (node: Node) => (canManage ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setDragId(node.person.id); e.dataTransfer.effectAllowed = 'move'; },
    onDragEnd: () => { setDragId(null); setDropId(null); },
  } : {});
  const dropProps = (targetId: string | null) => (canManage ? {
    onDragOver: (e: React.DragEvent) => { if (canDropOn(targetId)) { e.preventDefault(); setDropId(targetId ?? '__top__'); } },
    onDragLeave: () => setDropId(prev => (prev === (targetId ?? '__top__') ? null : prev)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); applyDrop(targetId); },
  } : {});

  if (!data) return error ? <ErrorAlert message={error} /> : <LoadingBlock label="Loading the organization chart…" />;

  const q = search.trim().toLowerCase();
  const matches = q ? all.filter(n => `${n.person.name} ${n.person.employeeNo} ${n.person.designation} ${n.person.department}`.toLowerCase().includes(q)) : [];

  // ---- One card ---------------------------------------------------------------------------------
  const card = (node: Node, depth: number) => {
    const p = node.person;
    const isDragging = dragId === p.id;
    const isTarget = dropId === p.id && canDropOn(p.id);
    const invalid = Boolean(dragId) && !isDragging && blockedForDrag.has(p.id);
    const tier = depth === 0 ? 'top' : node.directCount > 0 ? 'manager' : 'member';
    return (
      <div className={`org-card tier-${tier}${isDragging ? ' dragging' : ''}${isTarget ? ' drop-target' : ''}${invalid ? ' drop-blocked' : ''}`}
        {...dragProps(node)} {...dropProps(p.id)} title={canManage ? 'Drag onto another person to set their manager' : undefined}>
        <div className="org-card-head">
          <span className="org-avatar" aria-hidden="true">{p.photoData ? <img src={p.photoData} alt="" /> : initials(p.name)}</span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <Link to={`/people/${p.id}`} className="org-name">{p.name}</Link>
            <div className="org-meta">{[p.designation, p.department].filter(Boolean).join(' · ') || '—'}{p.employeeNo ? ` · ${p.employeeNo}` : ''}</div>
          </div>
          {node.directCount > 0 && (
            <button type="button" className="org-toggle" aria-expanded={!closed.has(p.id)}
              aria-label={`${closed.has(p.id) ? 'Show' : 'Hide'} the team of ${p.name}`} onClick={() => toggle(p.id)}>
              {closed.has(p.id) ? '▸' : '▾'}
            </button>
          )}
        </div>
        <div className="org-card-foot">
          {depth === 0 && <span className="badge badge-neutral">Top</span>}
          {node.directCount > 0 && (
            <span className="text-muted" style={{ fontSize: 11.5 }} title={`${node.teamCount} in the whole team`}>
              {node.directCount} direct{node.teamCount > node.directCount ? ` · ${node.teamCount} in all` : ''}
            </span>
          )}
          {canManage && (
            <button type="button" className="org-edit no-print"
              onClick={() => setMove({ node, mode: 'manager', target: p.managerId && nameOf.has(p.managerId) ? p.managerId : '' })}>Manager</button>
          )}
          {canManage && node.directCount > 0 && (
            <button type="button" className="org-edit no-print" onClick={() => setMove({ node, mode: 'team', target: '' })}>Move team</button>
          )}
        </div>
      </div>
    );
  };

  const branch = (nodes: Node[], depth: number) => (
    <ul>
      {nodes.map(node => (
        <li key={node.person.id}>
          {card(node, depth)}
          {node.reports.length > 0 && !closed.has(node.person.id) && branch(node.reports, depth + 1)}
        </li>
      ))}
    </ul>
  );

  const blocked = move ? new Set([move.node.person.id, ...(move.mode === 'manager' ? teamIds(move.node) : [])]) : new Set<string>();
  const options = (data.people as any[]).filter(p => !blocked.has(p.id));

  return (
    <>
      <PageHeader
        title="Organization Chart"
        subtitle={`${data.people.length} employee${data.people.length === 1 ? '' : 's'}${data.withoutManager ? ` · ${data.withoutManager} with no manager, shown at the top` : ''}${canManage ? ' · drag a card onto a manager to set reporting' : ''}`}
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
            <div className="org-search-list">
              {matches.map(node => (
                <div key={node.person.id}>
                  {card(node, node.person.managerId && nameOf.has(node.person.managerId) ? 1 : 0)}
                  <div className="text-muted" style={{ fontSize: 12, margin: '2px 0 10px 8px' }}>
                    {node.person.managerId && nameOf.has(node.person.managerId) ? `Reports to ${nameOf.get(node.person.managerId)}` : 'No manager'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {canManage && (
            <div className={`org-top-drop no-print${dropId === '__top__' && canDropOn(null) ? ' drop-target' : ''}${dragId ? ' active' : ''}`} {...dropProps(null)}>
              {dragId ? 'Drop here to move to the top (no manager)' : 'Top of the organization'}
            </div>
          )}
          <div className="card card-pad print-area org-scroll">
            <div className="orgchart">{branch(data.tree, 0)}</div>
          </div>
        </>
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
