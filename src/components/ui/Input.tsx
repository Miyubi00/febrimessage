import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  hint?: string;
  error?: string | null;
  leftIcon?: ReactNode;
  rightSlot?: ReactNode;
  /** Shows a `x/y` counter in the bottom-right corner. */
  counter?: { current: number; max: number };
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    leftIcon,
    rightSlot,
    counter,
    className,
    containerClassName,
    id,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const inputId = id ?? rest.name ?? generatedId;
  const describedBy: string[] = [];
  if (hint) describedBy.push(`${inputId}-hint`);
  if (error) describedBy.push(`${inputId}-error`);

  return (
    <div className={cn('w-full', containerClassName)}>
      {label ? (
        <label className="label-text" htmlFor={inputId}>
          {label}
        </label>
      ) : null}

      <div className="relative">
        {leftIcon ? (
          <span
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          >
            {leftIcon}
          </span>
        ) : null}

        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy.length > 0 ? describedBy.join(' ') : undefined}
          className={cn('field', leftIcon && 'pl-11', (rightSlot || counter) && 'pr-16', className)}
          {...rest}
        />

        {rightSlot ? (
          <span className="absolute right-3 top-1/2 -translate-y-1/2">{rightSlot}</span>
        ) : null}

        {counter ? (
          <span
            className={cn(
              'counter-text pointer-events-none absolute bottom-1.5 right-4',
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
        <p className="hint-text mt-1.5" id={`${inputId}-hint`}>
          {hint}
        </p>
      ) : null}

      {error ? (
        <p className="mt-1.5 text-xs font-medium text-rose-500" id={`${inputId}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
});