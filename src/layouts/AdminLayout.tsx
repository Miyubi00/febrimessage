import type { ReactNode } from 'react';

interface AdminLayoutProps {
  nav: ReactNode;
  children: ReactNode;
}

/**
 * Admin shell: full-width content with a floating bottom nav. Same pastel
 * background as the public page so the product feels like one app.
 */
export function AdminLayout({ nav, children }: AdminLayoutProps): JSX.Element {
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
        <main id="admin-content" className="min-w-0 animate-fade-up">
          {children}
        </main>
      </div>

      {nav}
    </div>
  );
}