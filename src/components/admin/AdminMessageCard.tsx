import {
  CheckCircle2,
  CornerDownRight,
  Eye,
  EyeOff,
  Globe,
  MailOpen,
  MoreHorizontal,
  Reply,
  ShieldAlert,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { ReplyForm } from '@/components/admin/ReplyForm';
import { ReplyStoryButton } from '@/components/admin/ReplyStoryButton';
import { PrivateLinkBadge, StatusBadge, VisibilityBadge, type PrivateLinkState } from '@/components/admin/StatusBadge';
import { AttachmentGrid } from '@/components/messages/AttachmentGrid';
import { cn, formatDateTime, formatShortDate } from '@/lib/utils';
import { fetchPrivateLinkStatus } from '@/services/adminService';
import type { MessageRow } from '@/types/database';
import type { MessageWithMeta } from '@/types/message';
import type { Profile } from '@/types/profile';

interface AdminMessageCardProps {
  item: MessageWithMeta;
  ownerName: string;
  /** Needed for the reply-story artwork. */
  profile: Profile | null;
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
  profile,
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
  const { message, attachments, replies, senderIp } = item;
  const lastReply = replies.length > 0 ? replies[replies.length - 1] : null;
  const senderLabel = message.is_anonymous ? 'Anonymous' : (message.sender_name ?? 'Anonymous');

  // Link status is shown directly (no need to open anything) — same rule as
  // the detail modal: active only with a live token.
  const [linkState, setLinkState] = useState<PrivateLinkState | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPrivateLinkStatus(message.id)
      .then((status) => {
        if (!cancelled) {
          setLinkState(status.revokedAt ? 'revoked' : status.hasToken ? 'active' : 'none');
        }
      })
      .catch(() => {
        if (!cancelled) setLinkState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [message.id]);

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
            {lastReply ? ` • dibalas ${formatShortDate(lastReply.reply.created_at)}` : ''}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <StatusBadge status={message.status} />
          <VisibilityBadge visibility={message.visibility} />
          {linkState ? <PrivateLinkBadge state={linkState} /> : null}
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

      {lastReply ? (
        <div className="mt-3 border-l-2 border-pastel-300 pl-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-pastel-800">
            <CornerDownRight className="h-3 w-3" aria-hidden="true" />
            Reply from {lastReply.reply.author === 'admin' ? ownerName : senderLabel}
            {replies.length > 1 ? ` • ${replies.length} balasan` : ''}
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-soft">{lastReply.reply.content}</p>
          <AttachmentGrid attachments={lastReply.attachments} size="sm" className="mt-2" />
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
        storyButton={
          profile ? <ReplyStoryButton message={message.content} profile={profile} /> : null
        }
      />

      {replying ? (
        <ReplyForm
          className="mt-3 rounded-3xl bg-pastel-50/80 p-3"
          messageId={message.id}
          defaultVisibility={message.visibility}
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
  /** Optional extra action (eg. the Story sticker button). */
  storyButton?: ReactNode;
  /** Extra content appended inside the ⋯ menu (eg. private-link status). */
  moreItems?: ReactNode;
}

/** One row inside the ⋯ overflow menu. */
function MenuItem({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: JSX.Element;
  onClick: () => void;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-ink-soft transition hover:bg-pastel-50 hover:text-ink disabled:opacity-50"
    >
      {icon}
      {label}
    </button>
  );
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
  storyButton,
  moreItems,
}: AdminMessageActionsProps): JSX.Element {
  const isUnread = message.status === 'unread';
  const isPublic = message.visibility === 'public';
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = (): void => setMenuOpen(false);

  return (
    <footer className="relative mt-3 flex flex-wrap items-center gap-1.5 border-t border-pastel-100 pt-3">
      <ActionButton
        label={replying ? 'Tutup balasan' : 'Reply'}
        icon={<Reply className="h-3.5 w-3.5" aria-hidden="true" />}
        onClick={onToggleReply}
        disabled={busy}
      />
      {storyButton}
      <ActionButton
        label={isPublic ? 'Hide' : 'Publish'}
        icon={
          isPublic ? (
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

      <div>
        <button
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          disabled={busy}
          aria-label="Pengaturan lainnya"
          aria-expanded={menuOpen}
          title="Pengaturan lainnya"
          className="inline-flex items-center justify-center rounded-2xl border border-pastel-200 bg-white px-2.5 py-1.5 text-ink-soft transition hover:border-pastel-400 disabled:opacity-50"
        >
          <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        {menuOpen ? (
          <>
            <button
              type="button"
              aria-hidden="true"
              tabIndex={-1}
              onClick={closeMenu}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div className="absolute inset-x-0 bottom-full z-20 mb-2 max-h-[70dvh] overflow-y-auto rounded-3xl border border-pastel-200 bg-white shadow-card sm:left-auto sm:w-64">
              <div className="p-1.5">
                <MenuItem
                  label={isUnread ? 'Mark as read' : 'Mark unread'}
                  icon={<MailOpen className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() => {
                    closeMenu();
                    onToggleRead();
                  }}
                  disabled={busy}
                />
                <MenuItem
                  label="Report"
                  icon={<ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                  onClick={() => {
                    closeMenu();
                    onMarkSpam();
                  }}
                  disabled={busy}
                />
              </div>
              {moreItems}
            </div>
          </>
        ) : null}
      </div>

      {message.status === 'read' ? (
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-pastel-700">
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          sudah dibaca
        </span>
      ) : null}
    </footer>
  );
}