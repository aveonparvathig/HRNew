import type { ReactNode, RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from './feedback';

export function BackButton({ fallback = '/dashboard' }: { fallback?: string }) {
  const navigate = useNavigate();
  return (
    <button className="btn-back" title="Go back" aria-label="Go back"
      onClick={() => (window.history.length > 1 ? navigate(-1) : navigate(fallback))}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 12H5m6-6-6 6 6 6" />
      </svg>
    </button>
  );
}

export function PageHeader({ title, subtitle, actions }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  // The browser tab and history entries carry the page's name
  useEffect(() => {
    document.title = `${title} · Aveon HR`;
    return () => { document.title = 'Aveon HR'; };
  }, [title]);

  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, sub, icon, tone = 'primary', trend }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  trend?: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className={`stat-icon tone-${tone}`}>{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      {trend && <div className="stat-trend">{trend}</div>}
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

const STATUS_TONES: Record<string, string> = {
  pending: 'warning',
  signed: 'info',
  completed: 'success',
  active: 'success',
  inactive: 'neutral',
  failed: 'danger',
  draft: 'neutral',
  finalized: 'success',
};

export function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status?.toLowerCase()] || 'neutral';
  return (
    <span className={`badge badge-${tone}`}>
      <span className="dot" />
      {status}
    </span>
  );
}

export function EmptyState({ icon, title, message, action }: {
  icon: string;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h4>{title}</h4>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="loading-block">
      <div className="spinner" />
      <span>{label}</span>
    </div>
  );
}

// A message that appears where the user cannot see it (scrolled away, or
// behind an open dialog) is repeated as a toast, so the result of an action
// is never missed and the page does not jump.
function useAnnounce(textRef: RefObject<HTMLElement | null>, tone: 'success' | 'error') {
  const last = useRef('');
  useEffect(() => {
    const el = textRef.current;
    const text = el?.textContent?.trim() || '';
    if (el && text && text !== last.current) {
      const box = el.getBoundingClientRect();
      const onScreen = box.bottom > 0 && box.top < window.innerHeight;
      const dialog = document.querySelector('.modal-overlay');
      const covered = Boolean(dialog && !dialog.contains(el));
      if (!onScreen || covered) toast[tone](text);
    }
    last.current = text;
  });
}

export function ErrorAlert({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  const textRef = useRef<HTMLSpanElement>(null);
  useAnnounce(textRef, 'error');
  if (!message) return null;
  return (
    <div className="alert alert-error" role="alert">
      <span>⚠</span>
      <span style={{ flex: 1 }} ref={textRef}>{message}</span>
      {onDismiss && (
        <button className="modal-close" onClick={onDismiss} aria-label="Dismiss">✕</button>
      )}
    </div>
  );
}

// The result of an action. Pass the text as `message`, or richer content
// (a link to what was created) as children.
export function SuccessAlert({ message, children, onDismiss }: {
  message?: string;
  children?: ReactNode;
  onDismiss?: () => void;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  useAnnounce(textRef, 'success');
  if (!message && !children) return null;
  return (
    <div className="alert alert-success" role="status">
      <span>✓</span>
      <span style={{ flex: 1 }} ref={textRef}>{children ?? message}</span>
      {onDismiss && (
        <button className="modal-close" onClick={onDismiss} aria-label="Dismiss">✕</button>
      )}
    </div>
  );
}

export function Modal({ title, open, onClose, children, size }: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: 'lg';
}) {
  // Close on backdrop click only when the press STARTED on the backdrop too —
  // otherwise selecting text in an input and releasing outside the dialog
  // registers as a backdrop click and throws away the user's work.
  const pressedBackdrop = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; });

  // While open: Escape closes, Tab stays inside the dialog, the page behind
  // does not scroll, and focus returns to where it was on close.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeRef.current(); return; }
      if (e.key !== 'Tab' || !dialog) return;
      const stops = Array.from(dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(el => el.offsetParent !== null);
      if (stops.length === 0) return;
      const first = stops[0];
      const lastStop = stops[stops.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        e.preventDefault(); lastStop.focus();
      } else if (!e.shiftKey && document.activeElement === lastStop) {
        e.preventDefault(); first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      if (!document.querySelector('.modal-overlay')) document.body.classList.remove('modal-open');
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-overlay"
      onMouseDown={e => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={e => {
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
        pressedBackdrop.current = false;
      }}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} onClick={e => e.stopPropagation()}
        ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

// A button that opens a short list of links or actions. Children are
// elements with the class "menu-item"; "menu-heading" titles a group.
export function Menu({ label, children, wide }: { label: ReactNode; children: ReactNode; wide?: boolean }) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // The panel opens under the button's left edge unless that would run off
  // the right of the window
  const toggle = () => {
    const left = ref.current?.getBoundingClientRect().left ?? 0;
    setAlignRight(left + (wide ? 400 : 240) > window.innerWidth - 12);
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu" ref={ref}>
      <button className="btn btn-secondary" aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        {label}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div className={`menu-panel${wide ? ' menu-wide' : ''}${alignRight ? ' menu-right' : ''}`} role="menu" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPageChange, loading }: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const from = page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);
  return (
    <div className="pagination">
      <span>Showing {from}–{to} of {total}</span>
      <div className="pagination-controls">
        <button
          className="btn btn-secondary btn-sm"
          disabled={page === 0 || loading}
          onClick={() => onPageChange(page - 1)}
        >
          ← Prev
        </button>
        <button
          className="btn btn-secondary btn-sm"
          disabled={page >= totalPages - 1 || loading}
          onClick={() => onPageChange(page + 1)}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
