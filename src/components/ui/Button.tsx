import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-pastel-400 text-white shadow-soft hover:bg-pastel-500 active:bg-pastel-600 disabled:bg-pastel-300',
  secondary:
    'bg-white text-ink border border-pastel-200 shadow-soft hover:border-pastel-300 hover:bg-pastel-50 active:bg-pastel-100',
  outline:
    'bg-transparent text-pastel-800 border border-pastel-300 hover:bg-pastel-100/70 active:bg-pastel-200/60',
  ghost: 'bg-transparent text-ink-soft hover:bg-pastel-100/80 active:bg-pastel-200/70',
  danger:
    'bg-rose-400 text-white shadow-soft hover:bg-rose-500 active:bg-rose-600 disabled:bg-rose-300',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 gap-1.5 px-3.5 text-xs rounded-2xl',
  md: 'h-11 gap-2 px-5 text-sm rounded-2xl',
  lg: 'h-14 gap-2.5 px-7 text-base rounded-3xl',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    loadingText,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className,
    disabled,
    children,
    type = 'button',
    ...rest
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={loading}
      className={cn(
        'inline-flex select-none items-center justify-center font-semibold transition-all duration-200',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-pastel-200',
        'disabled:cursor-not-allowed disabled:opacity-70',
        'active:scale-[0.985]',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>{loadingText ?? children}</span>
        </>
      ) : (
        <>
          {leftIcon}
          {children}
          {rightIcon}
        </>
      )}
    </button>
  );
});