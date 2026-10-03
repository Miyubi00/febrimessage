import { Compass, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Seo } from '@/components/Seo';
import { EmptyState } from '@/components/ui/EmptyState';
import { PublicLayout } from '@/layouts/PublicLayout';

/** 404 page — rendered inside the public shell so navigation stays available. */
export function NotFound(): JSX.Element {
  return (
    <PublicLayout>
      <Seo title="Halaman tidak ditemukan" description="Halaman ini tidak tersedia." path="/404" />

      <EmptyState
        className="mx-auto mt-10 max-w-md"
        title="Halaman tidak ditemukan"
        description="Sepertinya link ini salah atau sudah dipindahkan. Coba kembali ke halaman utama."
        icon={<Compass className="h-7 w-7" aria-hidden="true" />}
        action={
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-2xl bg-pastel-400 px-4 py-2.5 text-sm font-semibold text-white shadow-soft transition hover:bg-pastel-500"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Ke halaman utama
          </Link>
        }
      />
    </PublicLayout>
  );
}
