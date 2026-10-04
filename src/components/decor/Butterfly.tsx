import type { CSSProperties } from 'react';

import { cn } from '@/lib/utils';

interface ButterflyProps {
  className?: string;
  /** Wing-flap duration, eg. `'0.45s'` (faster = more energetic). */
  flap?: string;
}

/**
 * Decorative butterfly: symmetric SVG wings flapping via CSS
 * (`bfly-flap` in index.css). Wrap it in drift/float spans for flight.
 */
export function Butterfly({ className, flap }: ButterflyProps): JSX.Element {
  return (
    <svg
      viewBox="0 0 100 100"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      style={flap ? ({ '--bfly-flap': flap } as CSSProperties) : undefined}
      className={cn('[perspective:400px]', className)}
    >
      <g className="bfly-wing bfly-left">
        <path d="M47 42C33 12 8 12 10 36c1.6 18 20 24 35 18Z" />
        <path d="M46 58c-12 6-22 12-23 22-1 10 11 12 19 4l6-8Z" />
      </g>
      <g className="bfly-wing bfly-right">
        <path d="M53 42c14-30 39-30 37-6-1.6 18-20 24-35 18Z" />
        <path d="M54 58c12 6 22 12 23 22 1 10-11 12-19 4l-6-8Z" />
      </g>
      <ellipse cx="50" cy="55" rx="4.5" ry="17" />
      <circle cx="50" cy="35" r="4" />
      <path
        d="M48 32c-4-8-8-10-12-12M52 32c4-8 8-10 12-12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
