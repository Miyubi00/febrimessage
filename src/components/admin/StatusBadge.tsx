import { Eye, EyeOff, Flag, Link2, MailOpen, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { MessageStatus, MessageVisibility } from '@/types/database';

const STATUS_STYLES: Record<MessageStatus, { label: string; className: string }> = {
  unread: { label: 'Unread', className: 'border-pastel-400 bg-pastel-100 text-pastel-800' },
  read: { label: 'Read', className: 'border-pastel-200 bg-white text-ink-muted' },
  deleted: { label: 'Deleted', className: 'border-rose-200 bg-rose-50 text-rose-500' },
};

export function StatusBadge({ status }: { status: MessageStatus }): JSX.Element {
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.read;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        style.className,
      )}
    >
      {style.label}
    </span>
  );
}

/** Small pill showing the thread visibility (public page vs private link). */
export function VisibilityBadge({ visibility }: { visibility: MessageVisibility }): JSX.Element {
  const isPublic = visibility === 'public';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-bold',
        isPublic
          ? 'border-pastel-300 bg-pastel-50 text-pastel-800'
          : 'border-slate-200 bg-slate-50 text-slate-500',
      )}
    >
      {isPublic ? (
        <>
          <Eye className="h-3 w-3" aria-hidden="true" /> Public
        </>
      ) : (
        <>
          <EyeOff className="h-3 w-3" aria-hidden="true" /> Private
        </>
      )}
    </span>
  );
}

export const STATUS_ICONS = { MailOpen, Sparkles, Flag } as const;

export type PrivateLinkState = 'active' | 'revoked' | 'none';

/** Tiny always-visible private-link indicator (full management lives in the ⋯ menu). */
export function PrivateLinkBadge({ state }: { state: PrivateLinkState }): JSX.Element {
  const label =
    state === 'active'
      ? 'Private link aktif'
      : state === 'revoked'
        ? 'Private link dicabut'
        : 'Belum ada private link';

  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5',
        state === 'active' && 'border-pastel-300 bg-pastel-100 text-pastel-700',
        state === 'revoked' && 'border-amber-200 bg-amber-50 text-amber-600',
        state === 'none' && 'border-dashed border-pastel-200 text-ink-muted',
      )}
    >
      <Link2 className="h-3 w-3" aria-hidden="true" />
    </span>
  );
}