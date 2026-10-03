import { Route, Routes } from 'react-router-dom';

import { SetupNotice } from '@/components/ui/SetupNotice';
import { isSupabaseConfigured } from '@/lib/supabase';
import { AdminDashboard } from '@/pages/AdminDashboard';
import { AdminHome } from '@/pages/AdminHome';
import { AdminLogin } from '@/pages/AdminLogin';
import { AdminMessages } from '@/pages/AdminMessages';
import { AdminProfile } from '@/pages/AdminProfile';
import { AdminSettings } from '@/pages/AdminSettings';
import { NotFound } from '@/pages/NotFound';
import { PublicProfile } from '@/pages/PublicProfile';

/**
 * Application routes.
 *
 * Single-user app: the public page always lives at `/` (the owner's own
 * domain). There are no per-username links — `/admin/*` is the only other
 * surface, anything else falls through to `NotFound`.
 *
 * The app refuses to mount the data layer when the Supabase environment is not
 * configured, rendering an actionable setup screen instead of a blank page.
 */
export function App(): JSX.Element {
  if (!isSupabaseConfigured) return <SetupNotice />;

  return (
    <Routes>
      {/* Public single-profile page */}
      <Route path="/" element={<PublicProfile />} />

      {/* Admin auth (separate shell, no sidebar) */}
      <Route path="/admin/login" element={<AdminLogin />} />

      {/* Protected admin area — AdminDashboard redirects anonymous visitors */}
      <Route path="/admin" element={<AdminDashboard />}>
        <Route index element={<AdminHome />} />
        <Route path="profile" element={<AdminProfile />} />
        <Route path="messages" element={<AdminMessages />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
