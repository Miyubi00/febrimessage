import { Crop, Loader2, ZoomIn } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

// NOTE: this module used to also export a drag & drop `ImagePicker` picker.
// The admin profile editor now edits photos inline (tap-to-edit), so only the
// crop dialog + output sizes below are still used.

export const AVATAR_OUTPUT = { width: 512, height: 512 };
export const BANNER_OUTPUT = { width: 1600, height: 700 };

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('load-error'));
    img.src = src;
  });
}

function croppedMimeOf(originalType: string): { mime: string; extension: string } {
  if (originalType === 'image/png') return { mime: 'image/png', extension: 'png' };
  if (originalType === 'image/webp') return { mime: 'image/webp', extension: 'webp' };
  return { mime: 'image/jpeg', extension: 'jpg' };
}

function croppedFileName(originalName: string, extension: string): string {
  const base = originalName.replace(/\.[a-z0-9]+$/i, '').trim() || 'image';
  return `${base}-cropped.${extension}`;
}

/* ------------------------------------------------------------------ */
/* Crop dialog                                                         */
/* ------------------------------------------------------------------ */

interface CropDialogProps {
  open: boolean;
  imageUrl: string;
  fileName: string;
  fileType: string;
  /** e.g. 1 for avatar, 16/7 for banner. */
  aspectRatio: number;
  outputWidth: number;
  outputHeight: number;
  circular: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: (file: File) => void;
}

export function ImageCropDialog({
  open,
  imageUrl,
  fileName,
  fileType,
  aspectRatio,
  outputWidth,
  outputHeight,
  circular,
  title,
  onCancel,
  onConfirm,
}: CropDialogProps): JSX.Element | null {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [cropping, setCropping] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  // Reset state every time a new image is opened.
  useEffect(() => {
    if (!open) return;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setCropError(null);
    setCropping(false);
    setNatural(null);
    let cancelled = false;
    loadImageElement(imageUrl)
      .then((img) => {
        if (!cancelled) setNatural({ width: img.naturalWidth, height: img.naturalHeight });
      })
      .catch(() => {
        if (!cancelled) setCropError('Gambar tidak bisa dibaca. Coba file lain.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, imageUrl]);

  // Measure the viewport box (it has a fixed aspect-ratio via CSS).
  useEffect(() => {
    if (!open) return;
    const node = viewportRef.current;
    if (!node) return;
    const measure = (): void => {
      setViewport({ width: node.clientWidth, height: node.clientHeight });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [open, aspectRatio]);

  const baseScale = (() => {
    if (!natural || viewport.width === 0 || viewport.height === 0) return 1;
    return Math.max(viewport.width / natural.width, viewport.height / natural.height);
  })();

  const displayed = {
    width: natural ? natural.width * baseScale * zoom : 0,
    height: natural ? natural.height * baseScale * zoom : 0,
  };

  const clampOffset = useCallback(
    (x: number, y: number): { x: number; y: number } => {
      const maxX = Math.max(0, (displayed.width - viewport.width) / 2);
      const maxY = Math.max(0, (displayed.height - viewport.height) / 2);
      return {
        x: Math.min(maxX, Math.max(-maxX, x)),
        y: Math.min(maxY, Math.max(-maxY, y)),
      };
    },
    [displayed.width, displayed.height, viewport.width, viewport.height],
  );

  // Keep the image covering the viewport when zoom changes.
  useEffect(() => {
    setOffset((current) => clampOffset(current.x, current.y));
  }, [clampOffset]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!natural) return;
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    dragRef.current = { startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const next = clampOffset(
      drag.originX + (event.clientX - drag.startX),
      drag.originY + (event.clientY - drag.startY),
    );
    setOffset(next);
  };

  const endDrag = (): void => {
    dragRef.current = null;
  };

  const handleConfirm = async (): Promise<void> => {
    if (!natural || cropping) return;
    setCropping(true);
    setCropError(null);
    try {
      const img = await loadImageElement(imageUrl);
      // Viewport -> natural pixel mapping.
      const scale = baseScale * zoom;
      const left = (displayed.width - viewport.width) / 2 - offset.x;
      const top = (displayed.height - viewport.height) / 2 - offset.y;
      const sx = Math.max(0, left / scale);
      const sy = Math.max(0, top / scale);
      const sw = Math.min(img.naturalWidth - sx, viewport.width / scale);
      const sh = Math.min(img.naturalHeight - sy, viewport.height / scale);

      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('canvas-unavailable');

      const { mime, extension } = croppedMimeOf(fileType);
      if (mime === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, outputWidth, outputHeight);
      } else {
        ctx.clearRect(0, 0, outputWidth, outputHeight);
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, 0.92),
      );
      if (!blob) throw new Error('encode-failed');
      onConfirm(new File([blob], croppedFileName(fileName, extension), { type: mime }));
    } catch {
      setCropError('Gagal memotong gambar. Coba lagi.');
    } finally {
      setCropping(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={
        circular
          ? 'Geser untuk mengatur posisi, gunakan slider untuk zoom. Hasil akhir berbentuk lingkaran 512 × 512 px.'
          : 'Geser untuk mengatur posisi, gunakan slider untuk zoom. Hasil akhir 1600 × 700 px.'
      }
      size="lg"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onCancel} disabled={cropping}>
            Batal
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            loading={cropping}
            loadingText="Memotong…"
            disabled={!natural}
            leftIcon={<Crop className="h-4 w-4" aria-hidden="true" />}
          >
            Potong &amp; Gunakan
          </Button>
        </>
      }
    >
      {/* Viewport with fixed aspect ratio */}
      <div
        ref={viewportRef}
        role="application"
        aria-label="Area potong gambar. Geser untuk mengatur posisi."
        className={cn(
          'relative w-full touch-none select-none overflow-hidden border border-pastel-200 bg-pastel-50',
          circular ? 'mx-auto aspect-square max-w-[320px] rounded-full' : 'aspect-[16/7] rounded-3xl',
        )}
        style={{ cursor: natural ? 'grab' : 'default' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      >
        {natural ? (
          <img
            src={imageUrl}
            alt=""
            draggable={false}
            className="absolute left-1/2 top-1/2 max-w-none"
            style={{
              width: `${displayed.width}px`,
              height: `${displayed.height}px`,
              transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
            }}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-ink-muted">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Memuat gambar…
          </span>
        )}

        {/* Grid overlay to help framing */}
        {natural ? (
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-0',
              circular ? 'rounded-full' : 'rounded-3xl',
            )}
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(255,255,255,.45) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.45) 1px, transparent 1px)',
              backgroundSize: '33.333% 33.333%',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.6)',
            }}
          />
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <ZoomIn className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
        <label htmlFor="crop-zoom" className="sr-only">
          Zoom
        </label>
        <input
          id="crop-zoom"
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          disabled={!natural}
          onChange={(event) => setZoom(Number(event.target.value))}
          className="h-2 w-full accent-[#5EA8FF]"
        />
        <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-soft">
          {zoom.toFixed(2)}×
        </span>
        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setOffset({ x: 0, y: 0 });
          }}
          disabled={!natural}
          className="shrink-0 rounded-full border border-pastel-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:bg-pastel-50 disabled:opacity-50"
        >
          Reset
        </button>
      </div>

      {cropError ? <p className="mt-3 text-xs font-medium text-rose-500">{cropError}</p> : null}
    </Modal>
  );
}
