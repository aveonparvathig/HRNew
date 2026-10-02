import { useEffect, useRef } from 'react';
import { create } from 'zustand';

// App-wide feedback: short messages that fade on their own (toasts) and a
// styled replacement for the browser's confirm box. Both are driven from
// plain functions so any handler can call them; <FeedbackHost /> draws them.

type ToastTone = 'success' | 'error' | 'info';
interface Toast { id: number; tone: ToastTone; message: string }

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PendingConfirm extends ConfirmOptions { resolve: (ok: boolean) => void }

interface FeedbackStore {
  toasts: Toast[];
  pending: PendingConfirm | null;
}

const useFeedback = create<FeedbackStore>(() => ({ toasts: [], pending: null }));

let nextId = 1;
const dismiss = (id: number) =>
  useFeedback.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) }));

function show(tone: ToastTone, message: string) {
  const text = message.trim();
  if (!text) return;
  // The same message twice in a row is one toast
  if (useFeedback.getState().toasts.some(t => t.message === text && t.tone === tone)) return;
  const id = nextId++;
  useFeedback.setState(s => ({ toasts: [...s.toasts.slice(-3), { id, tone, message: text }] }));
  window.setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4500);
}

export const toast = {
  success: (message: string) => show('success', message),
  error: (message: string) => show('error', message),
  info: (message: string) => show('info', message),
};

// The leading verb of the question becomes the button: "Delete X?" → [Delete]
const VERBS = ['Delete', 'Remove', 'Finalize', 'Import', 'Generate', 'Archive', 'Restore', 'Reopen'];

// Ask before something that cannot be undone. Resolves true when confirmed.
// A question followed by an explanation ("Finalize this run? Entries lock…")
// is shown as a title with the explanation beneath.
export function confirmDialog(input: string | ConfirmOptions): Promise<boolean> {
  const options: ConfirmOptions = typeof input === 'string' ? { message: input } : input;
  const verb = VERBS.find(v => options.message.startsWith(v));
  const split = options.title ? null : /^(.+?\?)\s+(.+)$/s.exec(options.message);
  return new Promise(resolve => {
    useFeedback.getState().pending?.resolve(false);
    useFeedback.setState({
      pending: {
        ...options,
        title: options.title ?? (split ? split[1] : options.message),
        message: options.title ? options.message : (split ? split[2] : ''),
        confirmLabel: options.confirmLabel ?? verb ?? 'Confirm',
        danger: options.danger ?? (verb === 'Delete' || verb === 'Remove'),
        resolve,
      },
    });
  });
}

const TOAST_ICONS: Record<ToastTone, string> = { success: '✓', error: '⚠', info: 'ℹ' };

export function FeedbackHost() {
  const toasts = useFeedback(s => s.toasts);
  const pending = useFeedback(s => s.pending);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const answer = (ok: boolean) => {
    pending?.resolve(ok);
    useFeedback.setState({ pending: null });
  };

  // Focus the safe choice for a destructive question, the action otherwise
  useEffect(() => {
    if (!pending) return;
    const previous = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); answer(false); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <>
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span className="toast-icon">{TOAST_ICONS[t.tone]}</span>
            <span className="toast-text">{t.message}</span>
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">✕</button>
          </div>
        ))}
      </div>

      {pending && (
        <div className="modal-overlay confirm-overlay" onMouseDown={e => { if (e.target === e.currentTarget) answer(false); }}>
          <div className="modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
            <div className="confirm-body">
              <span className={`confirm-icon ${pending.danger ? 'tone-danger' : 'tone-primary'}`}>{pending.danger ? '!' : '?'}</span>
              <div>
                <h3 id="confirm-title">{pending.title}</h3>
                {pending.message && <p>{pending.message}</p>}
              </div>
            </div>
            <div className="confirm-actions">
              <button className="btn btn-secondary" ref={pending.danger ? confirmRef : undefined} onClick={() => answer(false)}>
                {pending.cancelLabel || 'Cancel'}
              </button>
              <button className={`btn ${pending.danger ? 'btn-danger-solid' : 'btn-primary'}`}
                ref={pending.danger ? undefined : confirmRef} onClick={() => answer(true)}>
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
