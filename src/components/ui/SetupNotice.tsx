import { Settings2, Terminal } from 'lucide-react';

import { Card } from '@/components/ui/Card';

/**
 * Shown when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are missing so the
 * app fails loudly but helpfully instead of crashing with a white screen.
 */
export function SetupNotice(): JSX.Element {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl items-center justify-center px-4 py-10">
      <Card padding="lg" className="w-full">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pastel-100 text-pastel-700">
            <Settings2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-ink">Konfigurasi Supabase belum lengkap</h1>
            <p className="text-sm text-ink-muted">Tambahkan environment variables berikut lalu restart dev server.</p>
          </div>
        </div>

        <div className="mt-5 rounded-3xl border border-pastel-200 bg-pastel-50/70 p-4">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
            .env
          </div>
          <pre className="overflow-x-auto text-xs leading-relaxed text-ink-soft">
            <code>{`VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>`}</code>
          </pre>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-ink-soft">
          Service-role keys dan rate-limit secrets <strong>tidak boleh</strong> memakai prefix
          <code className="mx-1 rounded bg-pastel-100 px-1.5 py-0.5 text-xs">VITE_</code>
          karena nilainya akan ikut ter-bundle ke browser. Nilai tersebut hanya dipakai oleh Edge Functions.
        </p>

        <p className="mt-3 text-xs text-ink-muted">
          Lihat <code className="rounded bg-pastel-50 px-1.5 py-0.5">README.md</code> bagian “Environment variables”
          untuk langkah lengkapnya.
        </p>
      </Card>
    </main>
  );
}