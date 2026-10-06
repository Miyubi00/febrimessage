import { ImageOff, RotateCcw, X } from 'lucide-react';

import { ProgressBar } from '@/components/ui/ProgressBar';
import { cn } from '@/lib/utils';
import type { StagedAttachment } from '@/types/message';

interface AttachmentPreviewsProps {
  items: StagedAttachment[];
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
  className?: string;
}

/**
 * Single-photo preview for the message composer.
 *
 * Photo on top, filename below, X to remove. No technical metadata
 * (no byte size, no "ready" state). A soft-red retry button appears
 * only when the upload actually failed.
 */
export function AttachmentPreviews({
  items,
  onRemove,
  onRetry,
  className,
}: AttachmentPreviewsProps): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <ul className={cn('grid grid-cols-1 gap-3', className)}>
      {items.map((item) => {
        const failed = item.status === 'error';
        return (
          <li
            key={item.id}
            className={cn(
              'surface-soft overflow-hidden p-3',
              failed && 'border-rose-200',
            )}
          >
            <div className="relative overflow-hidden rounded-2xl bg-pastel-50">
              {failed ? (
                <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1.5 text-rose-400">
                  <ImageOff className="h-8 w-8" aria-hidden="true" />
                  <span className="px-3 text-center text-xs font-semibold">Upload gagal</span>
                </span>
              ) : (
                <img
                  src={item.previewUrl}
                  alt={`Preview ${item.file.name}`}
                  className="aspect-[4/3] w-full object-cover"
                />
              )}

              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={`Hapus lampiran ${item.file.name}`}
                className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-ink shadow-soft transition hover:bg-white hover:text-rose-500"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="mt-2 truncate text-xs font-medium text-ink-soft" title={item.file.name}>
              {item.file.name}
            </p>

            {item.status === 'uploading' ? <ProgressBar value={item.progress} className="mt-2" /> : null}

            {failed ? (
              <div className="mt-2">
                {item.error ? (
                  <p className="mb-2 text-xs font-medium text-rose-500">{item.error}</p>
                ) : null}
                <button
                  type="button"
                  onClick={() => onRetry(item.id)}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-500 transition hover:bg-rose-100"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Ulangi
                </button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
