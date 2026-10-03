import { AlertTriangle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** Friendly empty / error placeholder with a small illustration. */
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps): JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-4xl border border-dashed border-pastel-300 bg-white/60 px-6 py-12 text-center',
        className,
      )}
    >
      <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-pastel-100 text-pastel-600">
        <span className="absolute inset-0 rounded-full bg-pastel-200/60 blur-md" aria-hidden="true" />
        <span className="relative">{icon ?? <Inbox className="h-7 w-7" aria-hidden="true" />}</span>
      </span>
      <div>
        <p className="font-display text-base font-bold text-ink">{title}</p>
        {description ? (
          <p className="mt-1 max-w-xs text-sm leading-relaxed text-ink-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}): JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 rounded-4xl border border-rose-200 bg-white/80 px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-50 text-rose-400">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </span>
      <p className="text-sm font-semibold text-ink">{message}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-2xl border border-pastel-200 bg-white px-4 py-2 text-xs font-semibold text-ink-soft transition hover:bg-pastel-50"
        >
          Coba lagi
        </button>
      ) : null}
    </div>
  );
}