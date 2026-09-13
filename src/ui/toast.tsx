/**
 * Global toast notification system (UI03).
 *
 * Replaces alert()/prompt() feedback with stacked, auto-dismissing,
 * action-capable toasts (e.g. Undo after deletion, View after forecast).
 * Survives engine/UI refactors because it is context-based, not prop-based.
 */

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle, Info, AlertTriangle, XOctagon, X } from 'lucide-react';
import { createId } from '../core/id';

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastAction {
  label: string;
  onSelect: () => void;
}

export interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
  action?: ToastAction;
  durationMs: number;
  /** Coalesced repeat count (iteration 3, UI09). */
  count?: number;
}

/** Window inside which identical toasts coalesce instead of stacking. */
export const TOAST_DEDUPE_WINDOW_MS = 3000;

export function toastDedupeKey(title: string, detail?: string): string {
  return `${title}\u0000${detail ?? ''}`;
}

/** True when two pushes are close enough in time to coalesce. */
export function shouldCoalesceToast(prevAtMs: number, nextAtMs: number, windowMs = TOAST_DEDUPE_WINDOW_MS): boolean {
  const delta = nextAtMs - prevAtMs;
  return delta >= 0 && delta <= windowMs;
}

interface ToastContextValue {
  toasts: ToastItem[];
  push: (toast: Omit<ToastItem, 'id' | 'durationMs'> & { durationMs?: number }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}

/** Imperative escape hatch for non-React modules (engine callbacks, bus). */
let imperativePush: ToastContextValue['push'] | null = null;
export function pushToastGlobal(toast: Omit<ToastItem, 'id' | 'durationMs'> & { durationMs?: number }): void {
  imperativePush?.(toast);
}

const KIND_ICON: Record<ToastKind, React.ReactNode> = {
  info: <Info size={16} color="#49e7ff" />,
  success: <CheckCircle size={16} color="#34d399" />,
  warning: <AlertTriangle size={16} color="#fbbf24" />,
  error: <XOctagon size={16} color="#ff4d64" />,
};

const KIND_BORDER: Record<ToastKind, string> = {
  info: 'rgba(73, 231, 255, 0.45)',
  success: 'rgba(52, 211, 153, 0.45)',
  warning: 'rgba(251, 191, 36, 0.5)',
  error: 'rgba(255, 77, 100, 0.55)',
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastPush = useRef<{ key: string; id: string; atMs: number } | null>(null);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (toast: Omit<ToastItem, 'id' | 'durationMs'> & { durationMs?: number }) => {
      const key = toastDedupeKey(toast.title, toast.detail);
      const now = Date.now();
      const last = lastPush.current;
      if (last && last.key === key && shouldCoalesceToast(last.atMs, now)) {
        setToasts((prev) => prev.map((t) => (t.id === last.id ? { ...t, count: (t.count ?? 1) + 1 } : t)));
        const oldTimer = timers.current.get(last.id);
        if (oldTimer) clearTimeout(oldTimer);
        const timer = setTimeout(() => dismiss(last.id), toast.durationMs ?? 4200);
        timers.current.set(last.id, timer);
        lastPush.current = { key, id: last.id, atMs: now };
        return last.id;
      }
      const id = createId('toast');
      const item: ToastItem = { ...toast, id, durationMs: toast.durationMs ?? 4200 };
      setToasts((prev) => [...prev.slice(-4), item]);
      const timer = setTimeout(() => dismiss(id), item.durationMs);
      timers.current.set(id, timer);
      lastPush.current = { key, id, atMs: now };
      return id;
    },
    [dismiss]
  );

  imperativePush = push;

  const value = useMemo(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast-item" style={{ borderColor: KIND_BORDER[t.kind] }}>
            <div className="toast-icon">{KIND_ICON[t.kind]}</div>
            <div className="toast-body">
              <div className="toast-title">{t.title}{t.count && t.count > 1 ? <span className="toast-count">\u00d7{t.count}</span> : null}</div>
              {t.detail && <div className="toast-detail">{t.detail}</div>}
              {t.action && (
                <button
                  className="toast-action"
                  onClick={() => {
                    t.action?.onSelect();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            <button className="toast-dismiss" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};
