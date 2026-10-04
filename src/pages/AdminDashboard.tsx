import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, Outlet, useOutletContext } from 'react-router-dom';

import { AdminBottomNav } from '@/components/admin/AdminBottomNav';
import { useToast } from '@/components/ui/Toast';
import { fetchUnreadCount } from '@/services/adminService';
import { fetchProfileForAdmin } from '@/services/profileService';
import { logDevError } from '@/lib/errors';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { AdminLayout } from '@/layouts/AdminLayout';
import type { Profile } from '@/types/profile';

export interface AdminOutletContext {
  profile: Profile | null;
  unreadCount: number;
  /** Increments whenever a realtime INSERT arrives (pages can refetch on change). */
  newMessageToken: number;
  loadingProfile: boolean;
  reloadProfile: () => void;
}

export function useAdminOutlet(): AdminOutletContext {
  return useOutletContext<AdminOutletContext>();
}

/**
 * Protected admin shell.
 *
 * Access is granted only when a Supabase Auth session exists AND the user has a
 * row in `admin_profiles` (role resolved from the database, never from an email
 * constant or from localStorage).
 */
export function AdminDashboard(): JSX.Element {
  const { admin, session, loading } = useAdminAuth();
  const { push } = useToast();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [newMessageToken, setNewMessageToken] = useState(0);

  const adminId = admin?.userId ?? null;

  const reloadProfile = useCallback(() => {
    if (!adminId) return;
    setLoadingProfile(true);
    fetchProfileForAdmin(adminId)
      .then((result) => setProfile(result))
      .catch((error) => logDevError('AdminDashboard.reloadProfile', error))
      .finally(() => setLoadingProfile(false));
  }, [adminId]);

  useEffect(() => {
    if (!adminId) {
      setProfile(null);
      setLoadingProfile(false);
      return;
    }
    reloadProfile();
  }, [adminId, reloadProfile]);

  const refreshUnread = useCallback(() => {
    if (!profile) return;
    fetchUnreadCount(profile.id)
      .then(setUnreadCount)
      .catch((error) => logDevError('AdminDashboard.refreshUnread', error));
  }, [profile]);

  useEffect(() => {
    refreshUnread();
  }, [refreshUnread, newMessageToken]);

  // Live inbox: new rows appear without a refresh, with a subtle notification.
  useRealtimeMessages({
    profileId: profile?.id ?? null,
    enabled: Boolean(profile),
    includeUpdates: true,
    accessToken: session?.access_token ?? null,
    onChange: (payload) => {
      if (payload.eventType === 'INSERT') {
        const row = payload.new as { parent_id?: string | null } | undefined;
        // Any new row (message or reply) refreshes counters + lists.
        setNewMessageToken((token) => token + 1);
        // Only root messages pop a notification — replies are visible when the
        // thread is opened (or after the next list refresh).
        if (row?.parent_id) return;
        push({
          title: 'Pesan baru masuk',
          description: 'Buka tab Messages untuk membacanya.',
          variant: 'info',
          duration: 5000,
        });
      }
      if (payload.eventType === 'DELETE' || payload.eventType === 'UPDATE') {
        setNewMessageToken((token) => token + 1);
      }
    },
  });

  const context = useMemo<AdminOutletContext>(
    () => ({ profile, unreadCount, newMessageToken, loadingProfile, reloadProfile }),
    [profile, unreadCount, newMessageToken, loadingProfile, reloadProfile],
  );

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="surface flex items-center gap-3 px-6 py-4">
          <Sparkles className="h-5 w-5 animate-pulse text-pastel-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink-soft">Memeriksa sesi admin…</p>
        </div>
      </div>
    );
  }

  if (!admin) return <Navigate to="/admin/login" replace />;

  return (
    <AdminLayout nav={<AdminBottomNav unreadCount={unreadCount} />}>
      <Outlet context={context} />
    </AdminLayout>
  );
}