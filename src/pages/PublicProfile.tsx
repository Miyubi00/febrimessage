import { MessageCircle } from 'lucide-react';

import { MessageForm } from '@/components/forms/MessageForm';
import { MessageList } from '@/components/messages/MessageList';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { Seo } from '@/components/Seo';
import { Card } from '@/components/ui/Card';
import { ErrorState, EmptyState } from '@/components/ui/EmptyState';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { usePublicMessages } from '@/hooks/useMessages';
import { useProfile } from '@/hooks/useProfile';
import { PublicLayout } from '@/layouts/PublicLayout';

/**
 * Public page: profile header + message composer on the left, published message
 * feed on the right (single column on mobile). Single-user app — this page
 * always lives at `/`, there are no per-username links.
 */
export function PublicProfile(): JSX.Element {
  const { profile, loading, error, notFound, refresh } = useProfile();

  const { threads, loading: messagesLoading, error: messagesError, refresh: refreshMessages } =
    usePublicMessages(profile?.id ?? null);

  if (loading) {
    return (
      <PublicLayout>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-6">
          <ProfileSkeleton />
          <Card padding="md" className="min-h-[220px]">
            <div className="space-y-3">
              <div className="skeleton h-5 w-28" />
              <div className="skeleton h-20 w-full rounded-3xl" />
              <div className="skeleton h-20 w-full rounded-3xl" />
            </div>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  if (error) {
    return (
      <PublicLayout>
        <ErrorState message={error} onRetry={refresh} />
      </PublicLayout>
    );
  }

  if (notFound || !profile) {
    return (
      <PublicLayout>
        <Seo title="Profil belum siap" description="Halaman ini belum tersedia." path="/" />
        <EmptyState
          className="mx-auto max-w-md"
          title="Profil belum siap"
          description="Pemilik halaman ini belum menyelesaikan pengaturannya. Coba lagi nanti ya."
          icon={<MessageCircle className="h-7 w-7" aria-hidden="true" />}
          action={
            <button
              type="button"
              onClick={refresh}
              className="inline-flex items-center gap-2 rounded-2xl bg-pastel-400 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-pastel-500"
            >
              Muat ulang
            </button>
          }
        />
      </PublicLayout>
    );
  }

  return (
    <PublicLayout theme={profile.theme}>
      <Seo
        title={`${profile.display_name} — Anonymous Messages`}
        description={profile.description}
        imageUrl={profile.background_url ?? profile.avatar_url}
        path="/"
      />

      <div className="grid flex-1 animate-fade-up items-stretch gap-4 sm:gap-5 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-5">
        <div className="no-scrollbar min-w-0 space-y-4 lg:flex lg:h-full lg:min-h-0 lg:flex-col lg:overflow-y-auto lg:pb-1">
          <Card padding="none" className="shrink-0 overflow-hidden">
            <ProfileHeader profile={profile} />
          </Card>

          {/* MessageForm already renders its own surface card — no extra Card.
              Let it size to its content so the column scrolls instead of the
              form stretching (mobile overlap) or collapsing (short screens). */}
          <MessageForm profile={profile} onSent={refreshMessages} className="shrink-0" />
        </div>

        <Card padding="md" className="flex min-h-0 flex-col lg:h-full">
          <header className="mb-4 flex shrink-0 items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
              <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-pastel-100 text-pastel-700">
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
              </span>
              Messages
            </h2>
            <span className="chip">{threads.length} ditampilkan</span>
          </header>

          <div className="scrollbar-soft max-h-[70vh] min-h-0 flex-1 overflow-y-auto pr-1 lg:max-h-none">
            <MessageList
              className="space-y-3"
              threads={threads}
              ownerName={profile.display_name}
              loading={messagesLoading}
              error={messagesError}
              onRetry={refreshMessages}
            />
          </div>
        </Card>
      </div>
    </PublicLayout>
  );
}