import { ImageOff, RotateCcw, X } from 'lucide-react';

import { ProgressBar } from '@/components/ui/ProgressBar';
import { cn, formatBytes } from '@/lib/utils';
import type { StagedAttachment } from '@/types/message';

interface AttachmentPreviewsProps {
  items: StagedAttachment[];
  onRemove: (id: string) => void;
  className?: string;
}

/** Local previews for the message composer (with progress + remove buttons). */
export function AttachmentPreviews({
  items,
  onRemove,
  className,
}: AttachmentPreviewsProps): JSX.Element | null {
  if (items.length === 0) return null;

  return (
    <ul className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3', className)}>
      {items.map((item) => (
        <li key={item.id} className="surface-soft relative overflow-hidden p-2">
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-pastel-50">
            {item.status === 'error' ? (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-rose-400">
                <ImageOff className="h-5 w-5" aria-hidden="true" />
                <span className="px-2 text-center text-[10px] font-semibold">Gagal upload</span>
              </span>
            ) : (
              <img
                src={item.previewUrl}
                alt={`Preview ${item.file.name}`}
                className="h-full w-full object-cover"
              />
            )}

            <button
              type="button"
              onClick={() => onRemove(item.id)}
              aria-label={`Hapus lampiran ${item.file.name}`}
              className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-ink shadow-soft transition hover:bg-white hover:text-rose-500"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <p className="mt-1 truncate text-[11px] font-medium text-ink-soft" title={item.file.name}>
            {item.file.name}
          </p>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-ink-muted">{formatBytes(item.file.size)}</span>
            {item.status === 'uploading' ? (
              <span className="text-[10px] font-semibold tabular-nums text-pastel-700">
                {item.progress}%
              </span>
            ) : null}
            {item.status === 'uploaded' ? (
              <span className="text-[10px] font-semibold text-pastel-700">Siap</span>
            ) : null}
            {item.status === 'error' ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-500">
                <RotateCcw className="h-3 w-3" aria-hidden="true" />
                ulangi
              </span>
            ) : null}
          </div>

          {item.status === 'uploading' ? (
            <ProgressBar value={item.progress} className="mt-1.5" />
          ) : null}

          {item.status === 'error' && item.error ? (
            <p className="mt-1 text-[10px] font-medium text-rose-500">{item.error}</p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}