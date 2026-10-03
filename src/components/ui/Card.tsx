import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/utils';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** `surface` (glass), `soft` (lighter) or `muted` (tinted inner block). */
  tone?: 'surface' | 'soft' | 'muted' | 'plain';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
}

const TONES: Record<NonNullable<CardProps['tone']>, string> = {
  surface: 'surface',
  soft: 'surface-soft',
  muted: 'surface-muted',
  plain: 'rounded-3xl border border-pastel-200/70 bg-white',
};

const PADDINGS: Record<NonNullable<CardProps['padding']>, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
};

export function Card({
  tone = 'surface',
  padding = 'md',
  hoverable = false,
  className,
  children,
  ...rest
}: CardProps): JSX.Element {
  return (
    <div
      className={cn(
        TONES[tone],
        PADDINGS[padding],
        hoverable && 'transition-all duration-300 hover:-translate-y-0.5 hover:shadow-float',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}