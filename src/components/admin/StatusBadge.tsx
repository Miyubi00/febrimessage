import { Eye, EyeOff, Flag, MailOpen, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { MessageStatus } from '@/types/database';

const STATUS_STYLES: Record<MessageStatus, { label: string; className: string }> = {
  unread: { label: 'Unread', className: 'border-pastel-400 bg-pastel-100 text-pastel-800' },
  read: { label: 'Read', className: 'border-pastel-200 bg-white text-ink-muted' },
  hidden: { label: 'Hidden', className: 'border-slate-200 bg-slate-50 text-slate-500' },
  spam: { label: 'Spam', className: 'border-amber-200 bg-amber-50 text-amber-600' },
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

/** Small pill showing whether a message is published to the public page. */
export function VisibilityBadge({ isPublic }: { isPublic: boolean }): JSX.Element {
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