import { CornerDownRight, Link2Off, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';

import { AdminMessageActions } from '@/components/admin/AdminMessageCard';
import { ReplyForm } from '@/components/admin/ReplyForm';
import { ReplyStoryButton } from '@/components/admin/ReplyStoryButton';
import { PrivateLinkBadge, StatusBadge, VisibilityBadge } from '@/components/admin/StatusBadge';
import { AttachmentGrid } from '@/components/messages/AttachmentGrid';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { toFriendlyMessage } from '@/lib/errors';
import { cn, formatDateTime } from '@/lib/utils';
import {
  fetchPrivateLinkStatus,
  managePrivateLink,
} from '@/services/adminService';
import type { MessageRow } from '@/types/database';
import type { MessageWithMeta, PrivateLinkStatus } from '@/types/message';
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
  onTogglePublic,
  onReplied,
}: MessageDetailPanelProps): JSX.Element | null {
  const [replying, setReplying] = useState(false);
  const { push } = useToast();

  const [linkStatus, setLinkStatus] = useState<PrivateLinkStatus | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  // Load the private-link state each time a different message opens.
  useEffect(() => {
    setLinkStatus(null);
    if (!open || !item) return;

    let cancelled = false;
    fetchPrivateLinkStatus(item.message.id)
      .then((status) => {
        if (!cancelled) setLinkStatus(status);
      })
      .catch(() => {
        if (!cancelled) setLinkStatus(null);
      });

    return () => {
      cancelled = true;
    };
  }, [open, item?.message.id]);

  if (!item) return null;

  const { message, attachments, replies, senderIp } = item;
  const senderLabel = message.is_anonymous ? 'Anonymous' : (message.sender_name ?? 'Anonymous');

  const rootId = message.parent_id ?? message.id;
  const linkActive = Boolean(linkStatus?.hasToken) && !linkStatus?.revokedAt;

  const handleRevoke = async (): Promise<void> => {
    setLinkBusy(true);
    try {
      await managePrivateLink(rootId, 'revoke');
      setLinkStatus((current) =>
        current ? { ...current, revokedAt: new Date().toISOString() } : current,
      );
      push({ title: 'Private link dicabut', description: 'URL lama tidak bisa dipakai lagi.', variant: 'success' });
    } catch (caught) {
      push({
        title: 'Gagal mencabut link',
        description: toFriendlyMessage(caught, 'Coba lagi sebentar lagi.'),
        variant: 'error',
      });
    } finally {
      setLinkBusy(false);
    }
  };

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
              {senderIp ? (
                <p
                  className="mt-1 inline-flex max-w-full items-center rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[11px] font-semibold tracking-tight text-slate-500"
                  title={`IP pengirim: ${senderIp}`}
                >
                  <span className="truncate">{senderIp}</span>
                </p>
              ) : null}
              <p className="mt-0.5 text-[11px] text-ink-muted">{formatDateTime(message.created_at)}</p>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {message.status === 'hidden' || message.status === 'deleted' ? (
                <StatusBadge status={message.status} />
              ) : null}
              <VisibilityBadge visibility={message.visibility} />
              {linkActive ? <PrivateLinkBadge state="active" /> : null}
            </div>
          </header>

          <p className="mt-3 whitespace-pre-wrap break-words rounded-3xl bg-white/80 p-4 text-sm leading-relaxed text-ink-soft">
            {message.content}
          </p>

          <AttachmentGrid attachments={attachments} className="mt-3" />
        </section>

        <section aria-label="Balasan" className="border-t border-pastel-100 pt-5">
          <h3 className="section-title text-sm">
            Reply{replies.length > 1 ? ` (${replies.length})` : ''}
          </h3>

          {replies.length > 0 ? (
            <div className="mt-3 space-y-3">
              {replies.map(({ reply: threadReply, attachments: threadAttachments }) => {
                const fromAdmin = threadReply.author === 'admin';
                return (
                  <div key={threadReply.id} className="border-l-2 border-pastel-300 pl-3">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-pastel-800">
                      {fromAdmin ? (
                        <CornerDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {fromAdmin ? ownerName : senderLabel}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words rounded-3xl bg-pastel-50/90 p-4 text-sm leading-relaxed text-ink-soft">
                      {threadReply.content}
                    </p>
                    <AttachmentGrid attachments={threadAttachments} size="sm" className="mt-2" />
                    <time dateTime={threadReply.created_at} className="mt-2 block text-[10px] text-ink-muted">
                      {formatDateTime(threadReply.created_at)}
                    </time>
                  </div>
                );
              })}
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
              defaultVisibility={message.visibility}
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
          onTogglePublic={() => onTogglePublic(item)}
          deleteInMenu
          storyButton={
            profile ? <ReplyStoryButton message={message.content} profile={profile} /> : null
          }
          moreItems={
            linkActive ? (
              <div className="border-t border-pastel-100 px-1.5 py-1.5">
                <button
                  type="button"
                  onClick={() => void handleRevoke()}
                  disabled={linkBusy}
                  className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left text-xs font-semibold text-rose-500 transition hover:bg-rose-50 disabled:opacity-50"
                >
                  <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
                  {linkBusy ? 'Mencabut…' : 'Cabut link'}
                </button>
              </div>
            ) : undefined
          }
        />
      </div>
    </Modal>
  );
}