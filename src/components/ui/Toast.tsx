import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  /** Auto-dismiss delay in ms. */
  duration: number;
}

interface ToastContextValue {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, { container: string; icon: ReactNode }> = {
  success: {
    container: 'border-pastel-300 bg-white/95 text-ink',
    icon: <CheckCircle2 className="h-5 w-5 shrink-0 text-pastel-600" aria-hidden="true" />,
  },
  error: {
    container: 'border-rose-200 bg-white/95 text-ink',
    icon: <AlertTriangle className="h-5 w-5 shrink-0 text-rose-400" aria-hidden="true" />,
  },
  info: {
    container: 'border-lavender bg-white/95 text-ink',
    icon: <Info className="h-5 w-5 shrink-0 text-lavender-deep" aria-hidden="true" />,
  },
  warning: {
    container: 'border-amber-200 bg-white/95 text-ink',
    icon: <TriangleAlert className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />,
  },
};

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback<ToastContextValue['push']>(
    ({ title, description, variant, duration = 4500 }) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      setToasts((current) => [...current.slice(-3), { id, title, description, variant, duration }]);

      if (duration > 0) {
        window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, duration);
      }
      return id;
    },
    [],
  );

  const value = useMemo<ToastContextValue>(() => ({ toasts, push, dismiss }), [toasts, push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
        role="region"
        aria-live="polite"
        aria-label="Notifikasi"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-3xl border p-4 shadow-card backdrop-blur-xl animate-fade-up',
              VARIANT_STYLES[toast.variant].container,
            )}
          >
            {VARIANT_STYLES[toast.variant].icon}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded-full p-1 text-ink-muted transition hover:bg-pastel-100 hover:text-ink"
              aria-label="Tutup notifikasi"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}