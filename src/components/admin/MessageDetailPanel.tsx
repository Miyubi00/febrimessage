import { CornerDownRight, Globe, UserRound } from 'lucide-react';
import { useState } from 'react';

import { AdminMessageActions } from '@/components/admin/AdminMessageCard';
import { ReplyForm } from '@/components/admin/ReplyForm';
import { ReplyStoryButton } from '@/components/admin/ReplyStoryButton';
import { StatusBadge, VisibilityBadge } from '@/components/admin/StatusBadge';
import { AttachmentGrid } from '@/components/messages/AttachmentGrid';
import { Modal } from '@/components/ui/Modal';
import { cn, formatDateTime } from '@/lib/utils';
import type { MessageRow } from '@/types/database';
import type { MessageWithMeta } from '@/types/message';
import type { Profile } from '@/types/profile';

interface MessageDetailPanelProps {
  open: boolean;
  item: MessageWithMeta | null;
  ownerName: string;
  /** Needed for the reply-story artwork (avatar, theme, link). */
  profile: Profile | null;
  busy?: boolean;
  onClose: () => void;
  onDelete: (item: MessageWithMeta) => void;
  onToggleRead: (item: MessageWithMeta) => void;
  onMarkSpam: (item: MessageWithMeta) => void;
  onTogglePublic: (item: MessageWithMeta) => void;
  onReplied: (item: MessageWithMeta, reply: MessageRow) => void;
  onReopenList?: () => void;
}

/** Full message + reply thread with moderation actions and a reply composer. */
export function MessageDetailPanel({
  open,
  item,
  ownerName,
  profile,
  busy = false,
  onClose,
  onDelete,
  onToggleRead,
  onMarkSpam,
  onTogglePublic,
  onReplied,
}: MessageDetailPanelProps): JSX.Element | null {
  const [replying, setReplying] = useState(false);

  if (!item) return null;

  const { message, attachments, reply, replyAttachments, senderIp } = item;
  const senderLabel = message.is_anonymous ? 'Anonymous' : (message.sender_name ?? 'Anonymous');

  return (
    <Modal
      open={open}
      onClose={() => {
        setReplying(false);
        onClose();
      }}
      title="Message"
      size="lg"
    >
      <div className="scrollbar-soft max-h-[70dvh] space-y-5 overflow-y-auto pr-1">
        <section aria-label="Pesan masuk">
          <header className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full',
                message.is_anonymous
                  ? 'bg-pastel-100 text-pastel-700'
                  : 'bg-lavender-light text-lavender-deep',
              )}
              aria-hidden="true"
            >
              <UserRound className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{senderLabel}</p>
              <p className="text-[11px] text-ink-muted">{formatDateTime(message.created_at)}</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              <StatusBadge status={message.status} />
              <VisibilityBadge isPublic={message.is_public} />
            </div>
          </header>

          <p className="mt-3 whitespace-pre-wrap break-words rounded-3xl bg-white/80 p-4 text-sm leading-relaxed text-ink-soft">
            {message.content}
          </p>

          {senderIp ? (
            <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-ink/85 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-tight text-white">
              <Globe className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
              <span className="truncate" title={`IP pengirim: ${senderIp}`}>
                IP: {senderIp}
              </span>
            </p>
          ) : null}

          <AttachmentGrid attachments={attachments} className="mt-3" />
        </section>

        <section aria-label="Balasan" className="border-t border-pastel-100 pt-5">
          <h3 className="section-title text-sm">Reply</h3>

          {reply ? (
            <div className="mt-3 border-l-2 border-pastel-300 pl-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-pastel-800">
                <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                {ownerName}
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words rounded-3xl bg-pastel-50/90 p-4 text-sm leading-relaxed text-ink-soft">
                {reply.content}
              </p>
              <AttachmentGrid attachments={replyAttachments} size="sm" className="mt-2" />
              <time dateTime={reply.created_at} className="mt-2 block text-[10px] text-ink-muted">
                {formatDateTime(reply.created_at)}
              </time>
            </div>
          ) : (
            <p className="mt-2 rounded-3xl border border-dashed border-pastel-300 bg-white/70 px-4 py-3 text-sm text-ink-muted">
              Belum ada balasan untuk pesan ini.
            </p>
          )}

          {replying ? (
            <ReplyForm
              className="mt-4 rounded-3xl bg-pastel-50/80 p-3"
              messageId={message.id}
              autoFocus
              onCancel={() => setReplying(false)}
              onReplied={(newReply) => {
                setReplying(false);
                onReplied(item, newReply);
              }}
            />
          ) : null}
        </section>
      </div>

      <div className="mt-4 border-t border-pastel-100 pt-1">
        <AdminMessageActions
          message={message}
          busy={busy}
          replying={replying}
          onToggleReply={() => setReplying((value) => !value)}
          onDelete={() => onDelete(item)}
          onToggleRead={() => onToggleRead(item)}
          onMarkSpam={() => onMarkSpam(item)}
          onTogglePublic={() => onTogglePublic(item)}
          storyButton={
            profile ? <ReplyStoryButton message={message.content} profile={profile} /> : null
          }
        />
      </div>
    </Modal>
  );
}