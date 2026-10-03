import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Set to true for confirmations so Esc / backdrop still work but scroll is kept. */
  closeOnBackdrop?: boolean;
}

const SIZES: Record<NonNullable<ModalProps['size']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-3xl',
};

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
}: ModalProps): JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Portal to document.body: ancestors with transform/filter/backdrop-blur
  // (cards, animated layouts) create containing blocks that would trap a
  // `fixed` overlay and push it off-center — same trap the image Lightbox had.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center px-3 py-4 sm:items-center sm:px-6">
      <div
        className="absolute inset-0 bg-ink/20 backdrop-blur-sm animate-fade-in"
        onClick={closeOnBackdrop ? onClose : undefined}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 w-full origin-bottom rounded-4xl border border-pastel-200 bg-white/95 p-6 shadow-card backdrop-blur-xl animate-pop-in sm:origin-center',
          'focus:outline-none',
          SIZES[size],
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display text-lg font-bold text-ink">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup dialog"
            className="rounded-full p-1.5 text-ink-muted transition hover:bg-pastel-100 hover:text-ink focus-visible:ring-4 focus-visible:ring-pastel-200"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {children ? <div className="mt-4">{children}</div> : null}
        {footer ? <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Hapus',
  cancelLabel = 'Batal',
  loading = false,
  destructive = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-pastel-200 bg-white px-5 text-sm font-semibold text-ink-soft transition hover:bg-pastel-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
            className={cn(
              'inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold text-white shadow-soft transition disabled:opacity-70',
              destructive ? 'bg-rose-400 hover:bg-rose-500' : 'bg-pastel-400 hover:bg-pastel-500',
            )}
          >
            {loading ? 'Menghapus…' : confirmLabel}
          </button>
        </>
      }
    />
  );
}