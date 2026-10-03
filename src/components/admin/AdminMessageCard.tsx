import {
  CheckCircle2,
  CornerDownRight,
  Eye,
  EyeOff,
  Globe,
  MailOpen,
  Reply,
  ShieldAlert,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';

import { ReplyForm } from '@/components/admin/ReplyForm';
import { StatusBadge, VisibilityBadge } from '@/components/admin/StatusBadge';
import { AttachmentGrid } from '@/components/messages/AttachmentGrid';
import { cn, formatDateTime, formatShortDate } from '@/lib/utils';
import type { MessageRow } from '@/types/database';
import type { MessageWithMeta } from '@/types/message';

interface AdminMessageCardProps {
  item: MessageWithMeta;
  ownerName: string;
  selected?: boolean;
  busy?: boolean;
  onOpenDetail: (item: MessageWithMeta) => void;
  onDelete: (item: MessageWithMeta) => void;
  onToggleRead: (item: MessageWithMeta) => void;
  onMarkSpam: (item: MessageWithMeta) => void;
  onTogglePublic: (item: MessageWithMeta) => void;
  onReplied: (item: MessageWithMeta, reply: MessageRow) => void;
}

interface ActionButtonProps {
  label: string;
  icon: JSX.Element;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

function ActionButton({
  label,
  icon,
  onClick,
  disabled,
  tone = 'default',
}: ActionButtonProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-2xl border px-2.5 py-1.5 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'danger'
          ? 'border-rose-200 bg-white text-rose-500 hover:bg-rose-50'
          : 'border-pastel-200 bg-white text-ink-soft hover:border-pastel-400 hover:text-pastel-800',
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

/** One row of the admin inbox with moderation actions + inline reply. */
export function AdminMessageCard({
  item,
  ownerName,
  selected = false,
  busy = false,
  onOpenDetail,
  onDelete,
  onToggleRead,
  onMarkSpam,
  onTogglePublic,
  onReplied,
}: AdminMessageCardProps): JSX.Element {
  const [replying, setReplying] = useState(false);
  const { message, attachments, reply, replyAttachments, senderIp } = item;
  const senderLabel = message.is_anonymous ? 'Anonymous' : (message.sender_name ?? 'Anonymous');

  return (
    <article
      className={cn(
        'surface-soft animate-fade-up p-4 transition-all duration-300',
        selected && 'border-pastel-400 shadow-float',
        message.status === 'unread' && 'border-pastel-300',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
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
          <p className="text-[11px] text-ink-muted">
            {formatDateTime(message.created_at)}
            {reply ? ` • dibalas ${formatShortDate(reply.created_at)}` : ''}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <StatusBadge status={message.status} />
          <VisibilityBadge isPublic={message.is_public} />
        </div>
      </header>

      <button
        type="button"
        onClick={() => onOpenDetail(item)}
        className="mt-3 block w-full rounded-2xl px-1 text-left transition hover:bg-pastel-50/70"
        aria-label={`Buka detail pesan dari ${senderLabel}`}
      >
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
          {message.content}
        </p>
      </button>

      {senderIp ? (
        <p className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-full bg-ink/85 px-2.5 py-1 font-mono text-[10px] font-semibold tracking-tight text-white">
          <Globe className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />
          <span className="truncate" title={`IP pengirim: ${senderIp}`}>
            {senderIp}
          </span>
        </p>
      ) : null}

      <AttachmentGrid attachments={attachments} size="sm" className="mt-3" />

      {reply ? (
        <div className="mt-3 border-l-2 border-pastel-300 pl-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-pastel-800">
            <CornerDownRight className="h-3 w-3" aria-hidden="true" />
            Reply from {ownerName}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-soft">{reply.content}</p>
          <AttachmentGrid attachments={replyAttachments} size="sm" className="mt-2" />
        </div>
      ) : null}

      <AdminMessageActions
        message={message}
        busy={busy}
        replying={replying}
        onToggleReply={() => setReplying((value) => !value)}
        onDelete={() => onDelete(item)}
        onToggleRead={() => onToggleRead(item)}
        onMarkSpam={() => onMarkSpam(item)}
        onTogglePublic={() => onTogglePublic(item)}
      />

      {replying ? (
        <ReplyForm
          className="mt-3 rounded-3xl bg-pastel-50/80 p-3"
          messageId={message.id}
          autoFocus
          onCancel={() => setReplying(false)}
          onReplied={(newReply) => {
            setReplying(false);
            onReplied(item, newReply);
          }}
        />
      ) : null}
    </article>
  );
}

interface AdminMessageActionsProps {
  message: MessageRow;
  busy: boolean;
  replying: boolean;
  onToggleReply: () => void;
  onDelete: () => void;
  onToggleRead: () => void;
  onMarkSpam: () => void;
  onTogglePublic: () => void;
}

/** Shared moderation action row (used by the card and the detail drawer). */
export function AdminMessageActions({
  message,
  busy,
  replying,
  onToggleReply,
  onDelete,
  onToggleRead,
  onMarkSpam,
  onTogglePublic,
}: AdminMessageActionsProps): JSX.Element {
  const isUnread = message.status === 'unread';

  return (
    <footer className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-pastel-100 pt-3">
      <ActionButton
        label={replying ? 'Tutup balasan' : 'Reply'}
        icon={<Reply className="h-3.5 w-3.5" aria-hidden="true" />}
        onClick={onToggleReply}
        disabled={busy}
      />
      <ActionButton
        label={isUnread ? 'Mark as read' : 'Mark unread'}
        icon={<MailOpen className="h-3.5 w-3.5" aria-hidden="true" />}
        onClick={onToggleRead}
        disabled={busy}
      />
      <ActionButton
        label="Report"
        icon={<ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
        onClick={onMarkSpam}
        disabled={busy}
      />
      <ActionButton
        label={message.is_public ? 'Hide' : 'Publish'}
        icon={
          message.is_public ? (
            <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          )
        }
        onClick={onTogglePublic}
        disabled={busy}
      />
      <ActionButton
        label="Delete"
        icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
        onClick={onDelete}
        disabled={busy}
        tone="danger"
      />

      {message.status === 'read' ? (
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-pastel-700">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          sudah dibaca
        </span>
      ) : null}
    </footer>
  );
}