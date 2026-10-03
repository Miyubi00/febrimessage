import { useState } from 'react';

import { ProfileEditor } from '@/components/admin/ProfileEditor';
import { Seo } from '@/components/Seo';
import { ErrorState } from '@/components/ui/EmptyState';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { useAdminOutlet } from '@/pages/AdminDashboard';
import type { Profile } from '@/types/profile';

/**
 * Profile editor page.
 *
 * The profile comes from the admin outlet context (resolved from `owner_id`, with
 * a seeded-profile fallback). Saving keeps the local copy so the form does not
 * remount, while the shared context is refreshed for the sidebar/public page.
 */
export function AdminProfile(): JSX.Element {
  const { profile, loadingProfile, reloadProfile } = useAdminOutlet();
  const { admin } = useAdminAuth();

  const [saved, setSaved] = useState<Profile | null>(null);
  const current = saved ?? profile;

  if (loadingProfile && !current) {
    return (
      <>
        <Seo title="Profile" description="Editor profil admin." path="/admin/profile" />
        <ProfileSkeleton />
      </>
    );
  }

  if (!current) {
    return (
      <>
        <Seo title="Profile" description="Editor profil admin." path="/admin/profile" />
        <ErrorState
          message="Profil belum tersedia. Jalankan migration lalu refresh halaman ini."
          onRetry={reloadProfile}
        />
      </>
    );
  }

  return (
    <>
      <Seo title="Profile" description="Editor profil admin." path="/admin/profile" />
      <ProfileEditor
        profile={current}
        adminId={admin?.userId ?? null}
        onSaved={(next) => {
          setSaved(next);
          reloadProfile();
        }}
      />
    </>
  );
}
