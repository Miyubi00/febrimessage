import { CornerDownRight, UserRound } from 'lucide-react';

import { AttachmentGrid } from '@/components/messages/AttachmentGrid';
import { cn, formatShortDate } from '@/lib/utils';
import type { PublicThread } from '@/types/message';

interface MessageThreadProps {
  thread: PublicThread;
  ownerName: string;
  className?: string;
  index?: number;
}

/** One public thread: the anonymous message plus the owner's reply (if any). */
export function MessageThread({
  thread,
  ownerName,
  className,
  index = 0,
}: MessageThreadProps): JSX.Element {
  const delay = `${Math.min(index * 45, 320)}ms`;

  return (
    <article
      className={cn('surface-soft hover:shadow-float animate-fade-up p-4 transition-shadow', className)}
      style={{ animationDelay: delay }}
    >
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
              thread.isAnonymous ? 'bg-pastel-100 text-pastel-700' : 'bg-lavender-light text-lavender-deep',
            )}
            aria-hidden="true"
          >
            <UserRound className="h-3.5 w-3.5" />
          </span>
          <p className="truncate text-sm font-semibold text-ink" title={thread.senderLabel}>
            {thread.senderLabel}
          </p>
          {thread.isAnonymous ? (
            <span className="chip hidden shrink-0 sm:inline-flex">Anonim</span>
          ) : null}
        </div>
        <time
          dateTime={thread.createdAt}
          className="shrink-0 text-[11px] font-medium tabular-nums text-ink-muted"
        >
          {formatShortDate(thread.createdAt)}
        </time>
      </header>

      <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
        {thread.content}
      </p>

      <AttachmentGrid attachments={thread.attachments} size="sm" className="mt-3" />

      {thread.reply ? (
        <div className="mt-3 border-l-2 border-pastel-300 pl-3 sm:pl-4">
          <div className="rounded-3xl bg-pastel-50/90 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-bold text-pastel-800">
              <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
              Reply from {ownerName}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
              {thread.reply.content}
            </p>
            <AttachmentGrid attachments={thread.reply.attachments} size="sm" className="mt-2" />
            <time
              dateTime={thread.reply.createdAt}
              className="mt-2 block text-[10px] font-medium text-ink-muted"
            >
              {formatShortDate(thread.reply.createdAt)}
            </time>
          </div>
        </div>
      ) : null}
    </article>
  );
}