import { ChevronLeft, ChevronRight, Inbox, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

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
  fetchAdminThread,
  setThreadVisibility,
  updateMessageStatus,
} from '@/services/adminService';
import type { MessageRow, MessageVisibility } from '@/types/database';
import type {
  AdminMessageQuery,
  MessageFilterStatus,
  MessageSort,
  MessageVisibilityFilter,
  MessageWithMeta,
} from '@/types/message';

const PAGE_SIZE = 20;

interface LiveFilters {
  search: string;
  status: MessageFilterStatus;
  visibility: MessageVisibilityFilter;
  anonymousOnly: boolean;
  withImageOnly: boolean;
  sort: MessageSort;
  page: number;
}

/** Client-side mirror of the server query so realtime events can be merged. */
function threadMatchesFilters(item: MessageWithMeta, filters: LiveFilters): boolean {
  const { message, attachments } = item;
  if (filters.status !== 'all' && message.status !== filters.status) return false;
  if (filters.visibility !== 'all' && message.visibility !== filters.visibility) return false;
  if (filters.anonymousOnly && !message.is_anonymous) return false;
  if (filters.withImageOnly && attachments.length === 0) return false;
  const term = filters.search.trim().toLowerCase();
  if (term) {
    const haystack = `${message.content} ${message.sender_name ?? ''}`.toLowerCase();
    if (!haystack.includes(term)) return false;
  }
  return true;
}

/** Admin inbox: search, filter, sort, paginate and moderate messages. */
export function AdminMessages(): JSX.Element {
  const { profile, loadingProfile, liveEvent, refreshUnread } = useAdminOutlet();
  const { push } = useToast();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<MessageFilterStatus>('all');
  const [visibility, setVisibility] = useState<MessageVisibilityFilter>('all');
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

  const [detailId, setDetailId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  /** Synchronous mirror of `items` for realtime presence checks. */
  const itemsRef = useRef<MessageWithMeta[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);  const [deleting, setDeleting] = useState(false);
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
  }, [status, visibility, sort, anonymousOnly, withImageOnly]);

  const query = useMemo<AdminMessageQuery | null>(() => {
    if (!profile) return null;
    return {
      profileId: profile.id,
      search,
      status,
      visibility,
      anonymousOnly,
      withImageOnly,
      sort,
      page,
      pageSize: PAGE_SIZE,
    };
  }, [profile, search, status, visibility, anonymousOnly, withImageOnly, sort, page]);

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
  }, [query, reloadToken]);

  const detail = useMemo(
    () => items.find((item) => item.message.id === detailId) ?? null,
    [items, detailId],
  );

  // -- Targeted realtime patches (no full-page refetch) --------------------
  const applyLiveEvent = useCallback(
    async (payload: RealtimePostgresChangesPayload<MessageRow>): Promise<void> => {
      if (!profile) return;
      const filters: LiveFilters = { search, status, visibility, anonymousOnly, withImageOnly, sort, page };

      if (payload.eventType === 'INSERT') {
        const row = payload.new;
        if (!row || row.profile_id !== profile.id) return;

        if (!row.parent_id) {
          // New root thread: fetch it once, then prepend only when it belongs
          // on this exact page (newest-first, first page, matching filters).
          const thread = await fetchAdminThread(profile.id, row.id).catch(() => null);
          if (!thread) return;
          if (!threadMatchesFilters(thread, filters)) return;
          if (itemsRef.current.some((item) => item.message.id === thread.message.id)) return;
          setTotal((value) => value + 1);
          if (filters.sort === 'newest' && filters.page === 1) {
            setItems((current) => [thread, ...current].slice(0, PAGE_SIZE));
          }
          return;
        }

        // New reply: refresh its parent thread in place.
        const thread = await fetchAdminThread(profile.id, row.parent_id).catch(() => null);
        if (!thread) return;
        setItems((current) =>
          current.map((item) => (item.message.id === thread.message.id ? thread : item)),
        );
        return;
      }

      if (payload.eventType === 'UPDATE') {
        const row = payload.new;
        if (!row || row.profile_id !== profile.id) return;
        const rootId = row.parent_id ?? row.id;
        const thread = await fetchAdminThread(profile.id, rootId).catch(() => null);
        const present = itemsRef.current.some((item) => item.message.id === rootId);
        if (thread && threadMatchesFilters(thread, filters)) {
          if (present) {
            setItems((current) =>
              current.map((item) => (item.message.id === rootId ? thread : item)),
            );
          } else {
            // It just became visible under the active filter (eg. marked read
            // while filtering "read").
            setTotal((value) => value + 1);
            if (filters.sort === 'newest' && filters.page === 1) {
              setItems((current) => [thread, ...current].slice(0, PAGE_SIZE));
            }
          }
          return;
        }
        if (present) {
          // It just left the active filter (or was hidden/deleted).
          setTotal((value) => Math.max(0, value - 1));
          if (detailId === rootId) setDetailId(null);
          setItems((current) => current.filter((item) => item.message.id !== rootId));
        }
        return;
      }

      if (payload.eventType === 'DELETE') {
        const old = payload.old as Partial<MessageRow> | undefined;
        const deletedId = old?.id;
        if (!deletedId) return;
        if (!old?.parent_id) {
          if (!itemsRef.current.some((item) => item.message.id === deletedId)) return;
          setTotal((value) => Math.max(0, value - 1));
          if (detailId === deletedId) setDetailId(null);
          setItems((current) => current.filter((item) => item.message.id !== deletedId));
          return;
        }
        // A reply was deleted: refresh the parent thread in place.
        const thread = await fetchAdminThread(profile.id, old.parent_id).catch(() => null);
        if (!thread) return;
        setItems((current) =>
          current.map((item) => (item.message.id === thread.message.id ? thread : item)),
        );
      }
    },
    [profile, search, status, visibility, anonymousOnly, withImageOnly, sort, page, detailId],
  );

  const lastLiveSeq = useMemo(() => liveEvent?.seq ?? 0, [liveEvent]);
  useEffect(() => {
    if (!liveEvent || liveEvent.seq === 0) return;
    void applyLiveEvent(liveEvent.payload);
  }, [lastLiveSeq]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Patch one thread in the list (and the open detail) without refetching. */
  const patchItem = useCallback((id: string, patch: (item: MessageWithMeta) => MessageWithMeta) => {
    setItems((current) => current.map((item) => (item.message.id === id ? patch(item) : item)));
  }, []);

  const runAction = async (
    item: MessageWithMeta,
    action: () => Promise<void>,
    successTitle: string,
    apply: (item: MessageWithMeta) => MessageWithMeta,
  ): Promise<void> => {
    const id = item.message.id;
    const before = item;
    patchItem(id, apply);
    setBusyId(id);
    try {
      await action();
      push({ title: successTitle, variant: 'success', duration: 2600 });
      refreshUnread();
    } catch (caught) {
      patchItem(id, () => before);
      push({
        title: 'Aksi gagal',
        description: toFriendlyMessage(caught, 'Coba lagi sebentar lagi.'),
        variant: 'error',
      });
    } finally {
      setBusyId(null);
    }
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
      (current) => ({
        ...current,
        message: { ...current.message, visibility: next, is_public: next === 'public' },
      }),
    );
  };

  const handleReplied = (item: MessageWithMeta, reply: MessageRow): void => {
    // The server row goes straight into the thread — no refetch, no reload.
    patchItem(item.message.id, (current) => ({
      ...current,
      message: { ...current.message, visibility: reply.visibility ?? current.message.visibility },
      replies: [...current.replies, { reply, attachments: [] }],
    }));
    push({ title: 'Balasan terkirim', variant: 'success', duration: 2400 });
  };

  const confirmDelete = async (): Promise<void> => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setDeleting(true);
    try {
      await deleteMessage(id);
      push({ title: 'Pesan dihapus', description: 'Lampiran ikut dibersihkan.', variant: 'success' });
      setPendingDeleteId(null);
      if (detailId === id) setDetailId(null);
      if (itemsRef.current.some((item) => item.message.id === id)) {
        setTotal((value) => Math.max(0, value - 1));
        setItems((current) => current.filter((item) => item.message.id !== id));
      }
    } catch (caught) {
      // The row stays exactly where it was — a failed delete never hides data.
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
          visibility={visibility}
          onVisibilityChange={setVisibility}
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
                selected={detail?.message.id === item.message.id}
                onOpenDetail={(selected) => {
                  setDetailId(selected.message.id);
                  if (selected.message.status === 'unread') {
                    patchItem(selected.message.id, (current) => ({
                      ...current,
                      message: { ...current.message, status: 'read' },
                    }));
                    void updateMessageStatus(selected.message.id, 'read')
                      .then(() => refreshUnread())
                      .catch(() => undefined);
                  }
                }}
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
        onClose={() => setDetailId(null)}
        onDelete={(target) => setPendingDeleteId(target.message.id)}
        onTogglePublic={handleTogglePublic}
        onReplied={handleReplied}
      />

      <ConfirmDialog
        open={Boolean(pendingDeleteId)}
        title="Yakin ingin menghapus pesan ini?"
        description="Pesan, balasan, dan lampirannya akan dihapus permanen dari database dan storage."
        confirmLabel="Hapus pesan"
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
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
