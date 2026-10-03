import { Crop, ImagePlus, Loader2, Ruler, Upload, X, ZoomIn } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { ACCEPT_IMAGE_ATTR, MAX_ATTACHMENT_BYTES, MAX_BACKGROUND_BYTES, assertImageFile } from '@/lib/validation';
import { cn, formatBytes } from '@/lib/utils';

interface ImagePickerProps {
  label: string;
  hint?: string;
  /** Currently previewed image (public URL or object URL). */
  previewUrl: string | null;
  /** Called with the chosen, validated file (already cropped when enableCrop). */
  onFile: (file: File) => void;
  onClear?: () => void;
  progress?: number | null;
  loading?: boolean;
  error?: string | null;
  variant?: 'avatar' | 'background';
  aspect?: 'square' | 'wide';
  /**
   * Recommended pixel size shown under the drop zone, eg `1600 × 700 px`.
   * When crop is enabled this doubles as the actual output size.
   */
  recommendedSize?: string;
  /** Open the crop dialog before uploading. GIFs always skip crop (to keep animation). */
  enableCrop?: boolean;
  /** Compact mode: hides the hint + size readout (crop already guarantees output size). */
  compact?: boolean;
}

export const AVATAR_OUTPUT = { width: 512, height: 512 };
export const BANNER_OUTPUT = { width: 1600, height: 700 };

/** Reads natural dimensions of a local file (used for the size readout). */
async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('read-error'));
      image.src = objectUrl;
    });
    return { width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

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

/* ------------------------------------------------------------------ */
/* ImagePicker                                                         */
/* ------------------------------------------------------------------ */

/**
 * Drag & drop (or click) image picker with validation + preview used by the
 * admin profile editor. When `enableCrop` is on, the user positions/zooms the
 * image in a dialog first — the cropped file is what gets uploaded.
 */
export function ImagePicker({
  label,
  hint,
  previewUrl,
  onFile,
  onClear,
  progress = null,
  loading = false,
  error = null,
  variant = 'avatar',
  aspect = 'wide',
  recommendedSize,
  enableCrop = true,
  compact = false,
}: ImagePickerProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [selectedSize, setSelectedSize] = useState<{ width: number; height: number } | null>(null);
  const [selectedBytes, setSelectedBytes] = useState<number | null>(null);
  const [cropTarget, setCropTarget] = useState<{ file: File; url: string } | null>(null);
  const inputId = useId();

  const maxBytes = variant === 'background' ? MAX_BACKGROUND_BYTES : MAX_ATTACHMENT_BYTES;
  const isAvatar = variant === 'avatar' || aspect === 'square';
  const aspectRatio = isAvatar ? 1 : 16 / 7;
  const output = isAvatar ? AVATAR_OUTPUT : BANNER_OUTPUT;
  const fallbackRecommended = isAvatar ? '512 × 512 px' : '1600 × 700 px';

  useEffect(() => {
    if (!previewUrl) {
      setSelectedSize(null);
      setSelectedBytes(null);
    }
  }, [previewUrl]);

  // Revoke the crop object URL when the dialog closes / unmounts.
  useEffect(() => {
    return () => {
      if (cropTarget) URL.revokeObjectURL(cropTarget.url);
    };
  }, [cropTarget]);

  const resetInput = (): void => {
    if (inputRef.current) inputRef.current.value = '';
  };

  const deliverFile = async (file: File): Promise<void> => {
    const size = await readImageSize(file);
    if (size) setSelectedSize(size);
    setSelectedBytes(file.size);
    onFile(file);
  };

  const handleFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setLocalError(null);
    const validationError = await assertImageFile(file, maxBytes);
    if (validationError) {
      setSelectedSize(null);
      setSelectedBytes(null);
      setLocalError(validationError);
      resetInput();
      return;
    }

    // GIFs skip the crop step so animation is preserved.
    if (!enableCrop || file.type === 'image/gif') {
      await deliverFile(file);
      resetInput();
      return;
    }

    const url = URL.createObjectURL(file);
    if (cropTarget) URL.revokeObjectURL(cropTarget.url);
    setCropTarget({ file, url });
    resetInput();
  };

  const handleClear = (): void => {
    setSelectedSize(null);
    setSelectedBytes(null);
    setLocalError(null);
    resetInput();
    onClear?.();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  };

  const closeCrop = (): void => {
    if (cropTarget) URL.revokeObjectURL(cropTarget.url);
    setCropTarget(null);
  };

  const confirmCrop = async (cropped: File): Promise<void> => {
    // Cropped output should always be valid, but re-check the size gate.
    if (cropped.size > maxBytes) {
      if (cropTarget) URL.revokeObjectURL(cropTarget.url);
      setCropTarget(null);
      setLocalError(`Hasil crop masih lebih dari ${Math.round(maxBytes / (1024 * 1024))}MB. Coba gambar lain.`);
      return;
    }
    if (cropTarget) URL.revokeObjectURL(cropTarget.url);
    setCropTarget(null);
    await deliverFile(cropped);
  };

  const displayError = error ?? localError;

  return (
    <div>
      <span className="label-text" id={`${inputId}-label`}>
        {label}
      </span>

      {previewUrl ? (
        <div
          className={cn(
            'relative overflow-hidden border border-pastel-200 bg-pastel-50',
            isAvatar ? 'mx-auto aspect-square w-full max-w-[220px] rounded-full' : 'aspect-[16/7] w-full rounded-3xl',
          )}
        >
          <img
            src={previewUrl}
            alt={`Pratinjau ${label}`}
            className="h-full w-full object-cover"
          />
          {loading ? (
            <span className="absolute inset-0 flex items-center justify-center bg-white/60">
              <Loader2 className="h-5 w-5 animate-spin text-pastel-600" aria-hidden="true" />
            </span>
          ) : null}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-labelledby={`${inputId}-label`}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 border-2 border-dashed px-4 py-8 text-center transition',
            isAvatar ? 'mx-auto aspect-square w-full max-w-[220px] rounded-full' : 'aspect-[16/7] w-full rounded-3xl',
            dragging
              ? 'border-pastel-500 bg-pastel-100/70'
              : 'border-pastel-200 bg-white/70 hover:border-pastel-400 hover:bg-pastel-50',
          )}
        >
          <ImagePlus className="h-6 w-6 text-pastel-600" aria-hidden="true" />
          <span className="text-xs font-semibold text-ink-soft">
            Klik atau seret gambar ke sini
          </span>
          <span className="flex items-center gap-1 text-[11px] text-ink-muted">
            <Upload className="h-3 w-3" aria-hidden="true" />
            PNG, JPG, WEBP, GIF • maks {Math.round(maxBytes / (1024 * 1024))}MB
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={ACCEPT_IMAGE_ATTR}
        className="sr-only"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />

      {hint && !compact ? <p className="hint-text mt-2">{hint}</p> : null}

      {!compact ? (
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <Ruler className="h-3 w-3" aria-hidden="true" />
            Rekomendasi: {recommendedSize ?? fallbackRecommended}
          </span>
          {selectedSize ? (
            <span className="font-semibold text-ink-soft">
              • Terpilih: {selectedSize.width} × {selectedSize.height} px
              {selectedBytes !== null ? ` (${formatBytes(selectedBytes)})` : ''}
            </span>
          ) : null}
        </p>
      ) : null}

      {typeof progress === 'number' && loading ? (
        <ProgressBar value={progress} label="Mengunggah…" className="mt-3" />
      ) : null}

      {displayError ? (
        <p role="alert" className="mt-2 text-xs font-medium text-rose-500">
          {displayError}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          leftIcon={<Upload className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          {previewUrl ? 'Ganti gambar' : 'Pilih gambar'}
        </Button>
        {previewUrl && onClear ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={loading}
            leftIcon={<X className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            Hapus
          </Button>
        ) : null}
      </div>

      <ImageCropDialog
        open={cropTarget !== null}
        imageUrl={cropTarget?.url ?? ''}
        fileName={cropTarget?.file.name ?? 'image'}
        fileType={cropTarget?.file.type ?? 'image/jpeg'}
        aspectRatio={aspectRatio}
        outputWidth={output.width}
        outputHeight={output.height}
        circular={isAvatar}
        title={isAvatar ? 'Atur foto profil' : 'Atur foto banner'}
        onCancel={closeCrop}
        onConfirm={(file) => void confirmCrop(file)}
      />
    </div>
  );
}
