import { ImageOff, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import { useAttachmentUrls } from '@/hooks/useAttachmentUrls';
import { getAttachmentUrl } from '@/lib/uploads';
import { cn } from '@/lib/utils';
import type { MessageAttachmentRow } from '@/types/database';

interface AttachmentGridProps {
  attachments: readonly MessageAttachmentRow[];
  className?: string;
  size?: 'sm' | 'md';
}

/**
 * Thumbnails for message attachments. Files live in a private bucket, so each
 * preview uses a short-lived signed URL resolved through RLS.
 */
export function AttachmentGrid({
  attachments,
  className,
  size = 'md',
}: AttachmentGridProps): JSX.Element | null {
  const { urls, loading } = useAttachmentUrls(attachments);
  const [openPath, setOpenPath] = useState<string | null>(null);

  if (attachments.length === 0) return null;

  const dimensions = size === 'sm' ? 'h-20 w-20' : 'h-28 w-28 sm:h-32 sm:w-32';

  return (
    <>
      <div className={cn('flex flex-wrap gap-2', className)}>
        {attachments.map((attachment) => {
          const url = urls[attachment.storage_path];
          return (
            <button
              key={attachment.id}
              type="button"
              onClick={() => setOpenPath(attachment.storage_path)}
              className={cn(
                'group relative overflow-hidden rounded-2xl border border-pastel-200 bg-pastel-50 shadow-soft transition hover:border-pastel-400',
                dimensions,
              )}
              aria-label={`Lihat lampiran ${attachment.file_name}`}
            >
              {url ? (
                <img
                  src={url}
                  alt={attachment.file_name}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-ink-muted">
                  <ImageOff className="h-5 w-5" aria-hidden="true" />
                </span>
              )}
              {!url && loading ? <span className="skeleton absolute inset-0" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <Lightbox path={openPath} onClose={() => setOpenPath(null)} />
    </>
  );
}

/** Simple accessible image lightbox (Esc / backdrop closes).
 *
 * Rendered via a portal to `document.body` so ancestor stacking contexts
 * (`backdrop-blur`, `animate-*`, `transform`, `overflow-auto` in cards/modals)
 * cannot trap the `fixed` overlay — this was the bug where the preview
 * appeared *behind/inside* the message list instead of fullscreen.
 */
export function Lightbox({
  path,
  onClose,
}: {
  path: string | null;
  onClose: () => void;
}): JSX.Element | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!path) {
      setUrl(null);
      return;
    }

    getAttachmentUrl(path)
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [path]);

  useEffect(() => {
    if (!path) return;
    // Capture phase + stopPropagation: prevents the underlying admin Modal
    // (which listens on bubble) from also closing on the same Esc press.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [path, onClose]);

  if (!path) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm animate-fade-in sm:p-8"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pratinjau lampiran"
    >
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        aria-label="Tutup pratinjau"
        className="absolute right-4 top-4 z-10 rounded-full bg-white/90 p-2 text-ink shadow-soft transition hover:bg-white"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      {url ? (
        <img
          src={url}
          alt="Lampiran pesan"
          className="h-auto max-h-[85dvh] w-auto max-w-[min(92vw,1024px)] rounded-3xl bg-white object-contain shadow-card"
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <div className="rounded-3xl bg-white px-6 py-4 text-sm font-semibold text-ink-soft">
          Memuat gambar…
        </div>
      )}
    </div>,
    document.body,
  );
}