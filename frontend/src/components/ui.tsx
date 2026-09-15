import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

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

export function StatCard({ label, value, sub, icon, tone = 'primary' }: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon: string;
  tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className={`stat-icon tone-${tone}`}>{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
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

export function ErrorAlert({ message, onDismiss }: { message: string; onDismiss?: () => void }) {
  if (!message) return null;
  return (
    <div className="alert alert-error">
      <span>⚠</span>
      <span style={{ flex: 1 }}>{message}</span>
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
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
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
