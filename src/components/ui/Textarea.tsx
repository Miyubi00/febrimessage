import { forwardRef, useId, type ReactNode, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: string;
  error?: string | null;
  topRightSlot?: ReactNode;
  counter?: { current: number; max: number };
  containerClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, topRightSlot, counter, className, containerClassName, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const textareaId = id ?? rest.name ?? generatedId;
  const describedBy: string[] = [];
  if (hint) describedBy.push(`${textareaId}-hint`);
  if (error) describedBy.push(`${textareaId}-error`);

  return (
    <div className={cn('w-full', containerClassName)}>
      {label ? (
        <label className="label-text" htmlFor={textareaId}>
          {label}
        </label>
      ) : null}

      <div
        className={cn(
          'group relative rounded-3xl border border-pastel-200 bg-white/90 shadow-[0_1px_0_rgba(199,231,255,0.9)] transition',
          'focus-within:border-pastel-500 focus-within:ring-4 focus-within:ring-pastel-200/80',
          error && 'border-rose-300 focus-within:border-rose-400 focus-within:ring-rose-100',
        )}
      >
        {topRightSlot ? <div className="absolute right-3 top-3 z-10">{topRightSlot}</div> : null}

        <textarea
          ref={ref}
          id={textareaId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy.length > 0 ? describedBy.join(' ') : undefined}
          className={cn(
            'w-full resize-none rounded-3xl bg-transparent px-5 py-4 text-sm leading-relaxed text-ink',
            'placeholder:text-ink-muted/70 focus:outline-none',
            'min-h-[96px]',
            topRightSlot && 'pr-16',
            'pb-9',
            className,
          )}
          {...rest}
        />

        {counter ? (
          <span
            className={cn(
              'counter-text pointer-events-none absolute bottom-3 right-5',
              counter.current > counter.max && 'text-rose-400',
            )}
            aria-hidden="true"
          >
            {counter.current}/{counter.max}
          </span>
        ) : null}
      </div>

      {counter ? (
        <span className="sr-only" aria-live="polite">
          {counter.current} dari {counter.max} karakter
        </span>
      ) : null}

      {hint && !error ? (
        <p className="hint-text mt-1.5" id={`${textareaId}-hint`}>
          {hint}
        </p>
      ) : null}

      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-500" id={`${textareaId}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
});