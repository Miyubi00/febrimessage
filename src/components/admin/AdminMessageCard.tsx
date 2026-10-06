import {
  CheckCircle2,
  CornerDownRight,
  Eye,
  EyeOff,
  MoreHorizontal,
  Reply,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { PrivateLinkBadge, StatusBadge, VisibilityBadge, type PrivateLinkState } from '@/components/admin/StatusBadge';
import { AttachmentGrid } from '@/components/messages/AttachmentGrid';
import { cn, formatDateTime, formatShortDate } from '@/lib/utils';
import { fetchPrivateLinkStatus } from '@/services/adminService';
import type { MessageRow } from '@/types/database';
import type { MessageWithMeta } from '@/types/message';

interface AdminMessageCardProps {
  item: MessageWithMeta;
  selected?: boolean;
  onOpenDetail: (item: MessageWithMeta) => void;
}

/** One row of the admin inbox — tap to open the detail popup with all actions. */
export function AdminMessageCard({
  item,
  selected = false,
  onOpenDetail,
}: AdminMessageCardProps): JSX.Element {
  const { message, attachments, replies, senderIp } = item;
  const lastReply = replies.length > 0 ? replies[replies.length - 1] : null;
  const senderLabel = message.is_anonymous ? 'Anonymous' : (message.sender_name ?? 'Anonymous');

  // The link badge only appears when a live token exists — no badge when the
  // thread has no link or the link was revoked.
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
      onClick={() => onOpenDetail(item)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenDetail(item);
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Buka detail pesan dari ${senderLabel}`}
      className={cn(
        'surface-soft animate-fade-up cursor-pointer p-4 transition-all duration-300 hover:border-pastel-400',
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
          {senderIp ? (
            <p
              className="mt-1 inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-tight text-slate-500"
              title={`IP pengirim: ${senderIp}`}
            >
              <span className="truncate">{senderIp}</span>
            </p>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {message.status === 'deleted' ? (
            <StatusBadge status={message.status} />
          ) : null}
          <VisibilityBadge visibility={message.visibility} />
          {linkState === 'active' ? <PrivateLinkBadge state="active" /> : null}
        </div>
      </header>

      <div className="mt-3 rounded-2xl px-1">
        <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
          {message.content}
        </p>
      </div>

      <AttachmentGrid attachments={attachments} size="sm" className="mt-3" />

      {lastReply ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-pastel-800">
          <CornerDownRight className="h-3 w-3" aria-hidden="true" />
          {replies.length} balasan
        </p>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-ink-muted">
          {formatDateTime(message.created_at)}
          {lastReply ? ` • dibalas ${formatShortDate(lastReply.reply.created_at)}` : ''}
        </p>
        {message.status === 'read' ? (
          <p className="flex shrink-0 items-center gap-1 text-[11px] font-semibold text-pastel-700">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            sudah dibaca
          </p>
        ) : null}
      </div>
    </article>
  );
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

interface AdminMessageActionsProps {
  message: MessageRow;
  busy: boolean;
  replying: boolean;
  onToggleReply: () => void;
  onDelete: () => void;
  onTogglePublic: () => void;
  /** Optional extra action (eg. the Story sticker button). */
  storyButton?: ReactNode;
  /** Extra content appended inside the ⋯ menu (eg. private-link status). */
  moreItems?: ReactNode;
  /** When true, Delete lives inside the ⋯ menu instead of the main row. */
  deleteInMenu?: boolean;
}

/** One row inside the ⋯ overflow menu. */
function MenuItem({
  label,
  icon,
  onClick,
  disabled,
  tone = 'default',
}: {
  label: string;
  icon: JSX.Element;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-xs font-semibold transition disabled:opacity-50',
        tone === 'danger'
          ? 'text-rose-500 hover:bg-rose-50'
          : 'text-ink-soft hover:bg-pastel-50 hover:text-ink',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Moderation action row for the detail popup (Reply / Story / Publish). */
export function AdminMessageActions({
  message,
  busy,
  replying,
  onToggleReply,
  onDelete,
  onTogglePublic,
  storyButton,
  moreItems,
  deleteInMenu = false,
}: AdminMessageActionsProps): JSX.Element {
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
      {!deleteInMenu ? (
        <ActionButton
          label="Delete"
          icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
          onClick={onDelete}
          disabled={busy}
          tone="danger"
        />
      ) : null}

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
                {deleteInMenu ? (
                  <MenuItem
                    label="Delete"
                    icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
                    onClick={() => {
                      closeMenu();
                      onDelete();
                    }}
                    disabled={busy}
                    tone="danger"
                  />
                ) : null}
              </div>
              {moreItems}
            </div>
          </>
        ) : null}
      </div>
    </footer>
  );
}