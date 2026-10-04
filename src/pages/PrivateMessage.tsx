import { AlertTriangle, BellRing, Lock, Send, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Seo } from '@/components/Seo';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { MessageSkeleton } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { toFriendlyMessage } from '@/lib/errors';
import { formatDateTime } from '@/lib/utils';
import { REPLY_MAX, countChars, validateEmail, validateMessageContent } from '@/lib/validation';
import { PublicLayout } from '@/layouts/PublicLayout';
import {
  fetchPrivateThread,
  privateThreadUrl,
  sendSenderReply,
  subscribeThread,
} from '@/services/messageService';
import type { PrivateAttachmentView, PrivateThread } from '@/types/message';

function usePrivateThreadState(token: string | undefined) {
  const [thread, setThread] = useState<PrivateThread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError('Pesan tidak ditemukan atau link sudah tidak valid.');
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchPrivateThread(token)
      .then((result) => {
        if (!cancelled) setThread(result);
      })
      .catch((caught) => {
        if (!cancelled) setError(toFriendlyMessage(caught, 'Pesan tidak ditemukan atau link sudah tidak valid.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, reloadToken]);

  return { thread, loading, error, reload: () => setReloadToken((value) => value + 1) };
}

function PrivateAttachments({ items }: { items: PrivateAttachmentView[] }): JSX.Element | null {
  const [open, setOpen] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {items.map((attachment) => (
          <button
            key={attachment.url}
            type="button"
            onClick={() => setOpen(attachment.url)}
            className="overflow-hidden rounded-2xl border border-pastel-100 transition hover:border-pastel-400"
            aria-label={`Buka gambar ${attachment.fileName}`}
          >
            <img src={attachment.url} alt={attachment.fileName} className="aspect-square h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {open ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-ink/70 p-4"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-label="Pratinjau gambar"
        >
          <img src={open} alt="" className="max-h-[85dvh] max-w-full rounded-3xl object-contain" />
        </div>
      ) : null}
    </>
  );
}

/** One node of the thread timeline (dot on the line + message card). */
function ThreadItem({
  node,
  name,
  dateTime,
  children,
}: {
  node: React.ReactNode;
  name: string;
  dateTime?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <li className="relative">
      <span
        aria-hidden="true"
        className="absolute -left-[27px] top-5 h-3 w-3 rounded-full bg-pastel-400 ring-4 ring-white/80"
      />
      <article className="surface-soft p-4">
        <header className="flex items-center gap-2">
          {node}
          <p className="min-w-0 flex-1 truncate text-sm font-bold text-ink">{name}</p>
          {dateTime ? (
            <time dateTime={dateTime} className="shrink-0 text-[11px] font-medium tabular-nums text-ink-muted">
              {formatDateTime(dateTime)}
            </time>
          ) : null}
        </header>
        <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
          {children}
        </div>
      </article>
    </li>
  );
}

/**
 * Private thread viewer (spec 46/58): opened with a capability link
 * (`/message/:token`), no account needed. Anything the token cannot unlock
 * shows the same generic "not found" state.
 *
 * Conversation: sender -> admin -> sender -> admin ... The reply box only
 * appears while the newest message is the admin's (strict turn-taking).
 */
export function PrivateMessage(): JSX.Element {
  const { token } = useParams<{ token: string }>();
  const { push } = useToast();
  const { thread, loading, error, reload } = usePrivateThreadState(token);

  const [answer, setAnswer] = useState('');
  const [answerError, setAnswerError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [notifySaving, setNotifySaving] = useState(false);

  const handleCopy = (): void => {
    if (!token) return;
    void navigator.clipboard
      .writeText(privateThreadUrl(token))
      .then(() => push({ title: 'Link disalin', variant: 'success', duration: 2400 }))
      .catch(() =>
        push({ title: 'Gagal menyalin', description: 'Salin link dari address bar.', variant: 'error' }),
      );
  };

  const handleSendReply = async (): Promise<void> => {
    if (!token || sending) return;
    const validationError = validateMessageContent(answer, REPLY_MAX);
    setAnswerError(validationError);
    if (validationError) return;

    setSending(true);
    try {
      await sendSenderReply(token, answer);
      setAnswer('');
      setAnswerError(null);
      push({ title: 'Balasan terkirim', variant: 'success' });
      reload();
    } catch (caught) {
      push({
        title: 'Gagal mengirim balasan',
        description: toFriendlyMessage(caught, 'Coba lagi sebentar lagi.'),
        variant: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  const handleSubscribe = async (): Promise<void> => {
    if (!token || notifySaving) return;
    const validationError = validateEmail(notifyEmail);
    setNotifyError(validationError);
    if (validationError) return;

    setNotifySaving(true);
    try {
      await subscribeThread(token, notifyEmail);
      setNotifyOpen(false);
      setNotifyEmail('');
      setNotifyError(null);
      push({ title: 'Notifikasi aktif', description: 'Kamu dapat email setiap ada balasan.', variant: 'success' });
      reload();
    } catch (caught) {
      push({
        title: 'Gagal mengaktifkan',
        description: toFriendlyMessage(caught, 'Coba lagi sebentar lagi.'),
        variant: 'error',
      });
    } finally {
      setNotifySaving(false);
    }
  };

  if (loading) {
    return (
      <PublicLayout>
        <div className="mx-auto w-full max-w-xl">
          <MessageSkeleton rows={3} />
        </div>
      </PublicLayout>
    );
  }

  if (error || !thread) {
    return (
      <PublicLayout>
        <Seo title="Pesan tidak ditemukan" description="Link private message tidak valid." path="/message" />
        <EmptyState
          className="mx-auto max-w-md"
          title="Message not found"
          description="Link mungkin salah, kedaluwarsa, atau sudah tidak tersedia."
          icon={<Lock className="h-7 w-7" aria-hidden="true" />}
          action={
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-2xl bg-pastel-400 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-pastel-500"
            >
              Kembali ke profile
            </Link>
          }
        />
      </PublicLayout>
    );
  }

  const lastReply = thread.replies.length > 0 ? thread.replies[thread.replies.length - 1] : null;
  const canReply = lastReply !== null && lastReply.author === 'admin';

  return (
    <PublicLayout theme={thread.profile.theme}>
      <Seo
        title="Private Message"
        description="Thread private — hanya pemilik link ini yang bisa membukanya."
        path="/message"
      />

      <div className="mx-auto w-full max-w-xl space-y-4">
        <section className="flex items-center gap-3" aria-label="Pemilik profile">
          <Avatar src={thread.profile.avatarUrl} name={thread.profile.displayName} size="md" ring />
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-extrabold text-ink">
              {thread.profile.displayName}
            </p>
            <p className="flex items-center gap-1.5 text-xs text-ink-muted">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Private Message
            </p>
          </div>
        </section>

        <ol className="relative ml-2 space-y-3 border-l-2 border-pastel-200 py-1 pl-5" aria-live="polite">
          <ThreadItem
            name={thread.message.senderName}
            node={
              <span
                aria-hidden="true"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pastel-100 text-pastel-700"
              >
                <UserRound className="h-3.5 w-3.5" />
              </span>
            }
          >
            {thread.message.content}
            <PrivateAttachments items={thread.attachments} />
          </ThreadItem>

          {thread.replies.map((reply, index) => {
            const fromAdmin = reply.author === 'admin';
            return (
              <ThreadItem
                key={`${reply.createdAt}-${index}`}
                name={fromAdmin ? thread.profile.displayName : thread.message.senderName}
                dateTime={reply.createdAt}
                node={
                  fromAdmin ? (
                    <span aria-hidden="true" className="block h-7 w-7 shrink-0 overflow-hidden rounded-full bg-white ring-2 ring-white">
                      {thread.profile.avatarUrl ? (
                        <img
                          src={thread.profile.avatarUrl}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-xs font-bold text-pastel-700">
                          {thread.profile.displayName.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </span>
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-pastel-100 text-pastel-700"
                    >
                      <UserRound className="h-3.5 w-3.5" />
                    </span>
                  )
                }
              >
                {reply.content}
                <PrivateAttachments items={reply.attachments} />
              </ThreadItem>
            );
          })}
        </ol>

        {thread.visibility === 'public' ? (
          <p className="rounded-2xl bg-pastel-50 px-3 py-2 text-[11px] text-ink-muted">
            Thread ini juga tampil di halaman publik.
          </p>
        ) : null}

        {canReply ? (
          <Card padding="md">
            <Textarea
              label="Balas pemilik"
              name="sender-reply"
              placeholder="Tulis balasan…"
              maxLength={REPLY_MAX}
              value={answer}
              onChange={(event) => {
                setAnswer(event.target.value);
                if (answerError) setAnswerError(null);
              }}
              counter={{ current: countChars(answer), max: REPLY_MAX }}
              error={answerError}
            />
            <Button
              type="button"
              size="lg"
              fullWidth
              className="mt-3"
              loading={sending}
              loadingText="Mengirim…"
              onClick={() => void handleSendReply()}
              leftIcon={<Send className="h-4 w-4" aria-hidden="true" />}
            >
              Balas
            </Button>
          </Card>
        ) : (
          <p className="rounded-3xl border border-dashed border-pastel-300 bg-white/70 px-4 py-3 text-center text-xs text-ink-muted">
            {thread.replies.length === 0
              ? 'Menunggu balasan pemilik — kamu bisa membalas setelah ada balasan.'
              : 'Menunggu balasan pemilik…'}
          </p>
        )}

        <Card padding="md">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={handleCopy}>
              Salin link
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setNotifyError(null);
                setNotifyOpen(true);
              }}
              leftIcon={<BellRing className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {thread.subscribedEmail ? 'Notifikasi aktif' : 'Beritahu aku saat dibalas'}
            </Button>
            <Link
              to="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-2xl border border-pastel-200 bg-white px-3.5 text-xs font-semibold text-ink-soft shadow-soft transition hover:border-pastel-400"
            >
              Kembali ke profile
            </Link>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-muted">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pastel-600" aria-hidden="true" />
            Simpan link ini — siapa pun yang memegangnya bisa membuka thread ini. Jangan bagikan kalau
            pesanmu bersifat private.
          </p>
        </Card>
      </div>

      <Modal
        open={notifyOpen}
        onClose={() => setNotifyOpen(false)}
        title="Notifikasi balasan"
        description={
          thread.subscribedEmail
            ? 'Email untuk thread ini sudah terdaftar dan tidak bisa diubah.'
            : 'Isi email — kamu dapat email setiap pemilik membalas thread ini.'
        }
        footer={
          thread.subscribedEmail ? (
            <Button type="button" variant="secondary" onClick={() => setNotifyOpen(false)}>
              Tutup
            </Button>
          ) : (
            <>
              <Button type="button" variant="secondary" onClick={() => setNotifyOpen(false)}>
                Batal
              </Button>
              <Button
                type="button"
                onClick={() => void handleSubscribe()}
                loading={notifySaving}
                loadingText="Menyimpan…"
                leftIcon={<BellRing className="h-4 w-4" aria-hidden="true" />}
              >
                Aktifkan
              </Button>
            </>
          )
        }
      >
        {thread.subscribedEmail ? (
          <div>
            <p className="rounded-2xl bg-pastel-50 px-4 py-3 text-sm font-semibold text-ink">
              {thread.subscribedEmail}
            </p>
            <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-ink-muted">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pastel-600" aria-hidden="true" />
              Kalau email tidak masuk Inbox, periksa folder Spam/Promosi dan tandai sebagai Bukan
              spam agar email berikutnya masuk Inbox.
            </p>
          </div>
        ) : (
          <Input
            label="Email"
            name="notifyEmail"
            type="email"
            autoComplete="email"
            placeholder="kamu@contoh.com"
            value={notifyEmail}
            onChange={(event) => {
              setNotifyEmail(event.target.value);
              if (notifyError) setNotifyError(null);
            }}
            error={notifyError}
            leftIcon={<BellRing className="h-4 w-4" aria-hidden="true" />}
          />
        )}
      </Modal>
    </PublicLayout>
  );
}
