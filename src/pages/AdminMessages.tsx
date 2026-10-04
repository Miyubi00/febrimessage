import { ChevronLeft, ChevronRight, Inbox, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { AdminMessageCard } from '@/components/admin/AdminMessageCard';
import { MessageDetailPanel } from '@/components/admin/MessageDetailPanel';
import { MessageFilters } from '@/components/admin/MessageFilters';
import { Seo } from '@/components/Seo';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { ConfirmDialog } from '@/components/ui/Modal';
import { AdminListSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { toFriendlyMessage } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { useAdminOutlet } from '@/pages/AdminDashboard';
import {
  deleteMessage,
  fetchAdminMessages,
  setThreadVisibility,
  updateMessageStatus,
} from '@/services/adminService';
import type { MessageRow, MessageStatus, MessageVisibility } from '@/types/database';
import type {
  AdminMessageQuery,
  MessageFilterStatus,
  MessageSort,
  MessageWithMeta,
} from '@/types/message';

const PAGE_SIZE = 20;

/** Admin inbox: search, filter, sort, paginate and moderate messages. */
export function AdminMessages(): JSX.Element {
  const { profile, newMessageToken, loadingProfile } = useAdminOutlet();
  const { push } = useToast();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MessageFilterStatus>('all');
  const [sort, setSort] = useState<MessageSort>('newest');
  const [anonymousOnly, setAnonymousOnly] = useState(false);
  const [withImageOnly, setWithImageOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<MessageWithMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [detail, setDetail] = useState<MessageWithMeta | null>(null);
  const [pendingDelete, setPendingDelete] = useState<MessageWithMeta | null>(null);
  const [deleting, setDeleting] = useState(false);
  /** Visibility change awaiting confirmation (spec 52). */
  const [pendingVisibility, setPendingVisibility] = useState<{
    item: MessageWithMeta;
    next: MessageVisibility;
  } | null>(null);

  // Debounce the search box so we do not hit the API on every keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [status, sort, anonymousOnly, withImageOnly]);

  const query = useMemo<AdminMessageQuery | null>(() => {
    if (!profile) return null;
    return {
      profileId: profile.id,
      search,
      status,
      anonymousOnly,
      withImageOnly,
      sort,
      page,
      pageSize: PAGE_SIZE,
    };
  }, [profile, search, status, anonymousOnly, withImageOnly, sort, page]);

  const reload = useCallback(() => setReloadToken((token) => token + 1), []);

  useEffect(() => {
    if (!query) {
      setItems([]);
      setTotal(0);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchAdminMessages(query)
      .then((result) => {
        if (cancelled) return;
        setItems(result.items);
        setTotal(result.total);
      })
      .catch((caught) => {
        if (cancelled) return;
        setError(toFriendlyMessage(caught, 'Gagal memuat pesan.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [query, reloadToken, newMessageToken]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const runAction = async (
    item: MessageWithMeta,
    action: () => Promise<void>,
    successTitle: string,
  ): Promise<void> => {
    setBusyId(item.message.id);
    try {
      await action();
      push({ title: successTitle, variant: 'success', duration: 2600 });
      reload();
    } catch (caught) {
      push({
        title: 'Aksi gagal',
        description: toFriendlyMessage(caught, 'Coba lagi sebentar lagi.'),
        variant: 'error',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleToggleRead = (item: MessageWithMeta): void => {
    const next: MessageStatus = item.message.status === 'unread' ? 'read' : 'unread';
    void runAction(
      item,
      () => updateMessageStatus(item.message.id, next),
      next === 'read' ? 'Ditandai sudah dibaca' : 'Ditandai belum dibaca',
    );
  };

  const handleMarkSpam = (item: MessageWithMeta): void => {
    const next: MessageStatus = item.message.status === 'spam' ? 'read' : 'spam';
    void runAction(
      item,
      () => updateMessageStatus(item.message.id, next),
      next === 'spam' ? 'Ditandai sebagai spam' : 'Spam dibatalkan',
    );
  };

  const handleTogglePublic = (item: MessageWithMeta): void => {
    // Ask first: changing visibility moves the WHOLE thread (spec 52).
    const next: MessageVisibility = item.message.visibility === 'public' ? 'private' : 'public';
    setPendingVisibility({ item, next });
  };

  const confirmVisibility = (): void => {
    if (!pendingVisibility) return;
    const { item, next } = pendingVisibility;
    setPendingVisibility(null);
    void runAction(
      item,
      () => setThreadVisibility(item.message.id, next),
      next === 'public' ? 'Thread dipublikasikan' : 'Thread dijadikan private',
    );
  };

  const handleReplied = (_item: MessageWithMeta, _reply: MessageRow): void => {
    push({ title: 'Balasan terkirim', variant: 'success', duration: 2400 });
    reload();
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteMessage(pendingDelete.message.id);
      push({ title: 'Pesan dihapus', description: 'Lampiran ikut dibersihkan.', variant: 'success' });
      setPendingDelete(null);
      setDetail(null);
      reload();
    } catch (caught) {
      push({
        title: 'Gagal menghapus pesan',
        description: toFriendlyMessage(caught, 'Coba lagi sebentar lagi.'),
        variant: 'error',
      });
    } finally {
      setDeleting(false);
    }
  };

  if (!loadingProfile && !profile) {
    return (
      <ErrorState
        message="Profil belum tersedia. Jalankan migration lalu lengkapi profil di menu Profile."
        onRetry={reload}
      />
    );
  }

  return (
    <>
      <Seo title="Messages" description="Inbox pesan anonim." path="/admin/messages" />

      <div className="space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">Messages</h1>
            <p className="text-sm text-ink-muted">
              Semua pesan masuk untuk @{profile?.username ?? '—'} — hanya admin yang bisa membacanya.
            </p>
          </div>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-2 rounded-2xl border border-pastel-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-soft shadow-soft transition hover:border-pastel-400 hover:text-pastel-800"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            Refresh
          </button>
        </header>

        <MessageFilters
          search={searchInput}
          onSearchChange={setSearchInput}
          status={status}
          onStatusChange={setStatus}
          sort={sort}
          onSortChange={setSort}
          anonymousOnly={anonymousOnly}
          onAnonymousOnlyChange={setAnonymousOnly}
          withImageOnly={withImageOnly}
          onWithImageOnlyChange={setWithImageOnly}
          total={total}
        />

        {loading ? <AdminListSkeleton rows={5} /> : null}

        {!loading && error ? <ErrorState message={error} onRetry={reload} /> : null}

        {!loading && !error && items.length === 0 ? (
          <EmptyState
            title="Belum ada pesan"
            description="Pesan anonim yang masuk akan muncul di sini secara realtime."
            icon={<Inbox className="h-7 w-7" aria-hidden="true" />}
          />
        ) : null}

        {!loading && !error && items.length > 0 ? (
          <div className="space-y-3">
            {items.map((item) => (
              <AdminMessageCard
                key={item.message.id}
                item={item}
                ownerName={profile?.display_name ?? 'Owner'}
                profile={profile}
                selected={detail?.message.id === item.message.id}
                busy={busyId === item.message.id}
                onOpenDetail={(selected) => {
                  setDetail(selected);
                  if (selected.message.status === 'unread') {
                    void updateMessageStatus(selected.message.id, 'read').then(reload).catch(() => undefined);
                  }
                }}
                onDelete={setPendingDelete}
                onToggleRead={handleToggleRead}
                onMarkSpam={handleMarkSpam}
                onTogglePublic={handleTogglePublic}
                onReplied={handleReplied}
              />
            ))}
          </div>
        ) : null}

        {totalPages > 1 ? (
          <nav className="flex items-center justify-between gap-3 pt-2" aria-label="Navigasi halaman">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-pastel-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-soft transition hover:border-pastel-400 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Sebelumnya
            </button>
            <span className="text-xs font-semibold text-ink-muted">
              Halaman {page} dari {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-pastel-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-soft transition hover:border-pastel-400 disabled:opacity-50"
            >
              Selanjutnya
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </div>

      <MessageDetailPanel
        open={Boolean(detail)}
        item={detail}
        ownerName={profile?.display_name ?? 'Owner'}
        profile={profile}
        busy={detail ? busyId === detail.message.id : false}
        onClose={() => setDetail(null)}
        onDelete={setPendingDelete}
        onToggleRead={handleToggleRead}
        onMarkSpam={handleMarkSpam}
        onTogglePublic={handleTogglePublic}
        onReplied={handleReplied}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Yakin ingin menghapus pesan ini?"
        description="Pesan, balasan, dan lampirannya akan dihapus permanen dari database dan storage."
        confirmLabel="Hapus pesan"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={Boolean(pendingVisibility)}
        title={
          pendingVisibility?.next === 'public' ? 'Ubah pesan menjadi publik?' : 'Ubah pesan menjadi private?'
        }
        description={
          pendingVisibility?.next === 'public'
            ? 'Pesan dan balasannya dapat dilihat oleh pengunjung profile.'
            : 'Pesan ini hanya dapat dilihat oleh pengirim menggunakan private message link.'
        }
        confirmLabel={pendingVisibility?.next === 'public' ? 'Jadikan publik' : 'Jadikan private'}
        onConfirm={confirmVisibility}
        onCancel={() => setPendingVisibility(null)}
      />
    </>
  );
}