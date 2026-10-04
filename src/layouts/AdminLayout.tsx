import type { ReactNode } from 'react';
import { Shield } from 'lucide-react';

import { ThemeSwitch } from '@/components/admin/ThemeSwitch';
import { useAdminTheme } from '@/hooks/useAdminTheme';

interface AdminLayoutProps {
  nav: ReactNode;
  children: ReactNode;
}

/**
 * Admin shell: slim sticky top bar (brand + theme switch), full-width
 * content, floating bottom nav. Same pastel background as the public page
 * so the product feels like one app.
 */
export function AdminLayout({ nav, children }: AdminLayoutProps): JSX.Element {
  const { theme, toggle } = useAdminTheme();

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_460px_at_6%_-10%,#EAF6FF_0%,rgba(234,246,255,0)_60%),radial-gradient(760px_420px_at_98%_2%,#E7E9FF_0%,rgba(231,233,255,0)_55%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-24 top-24 h-72 w-72 rounded-full bg-pastel-200/40 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-[1200px] px-3 pb-32 pt-4 sm:px-6 sm:pt-6">
        <div className="sticky top-3 z-30 mb-4 flex items-center justify-between gap-3 rounded-full border border-pastel-200/70 bg-white/80 py-2 pl-3 pr-2 shadow-soft backdrop-blur-xl">
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pastel-400 text-white shadow-soft">
              <Shield className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="truncate text-sm font-bold text-ink">Admin Panel</span>
          </span>
          <ThemeSwitch theme={theme} onToggle={toggle} />
        </div>

        <main id="admin-content" className="min-w-0 animate-fade-up">
          {children}
        </main>
      </div>

      {nav}
    </div>
  );
}