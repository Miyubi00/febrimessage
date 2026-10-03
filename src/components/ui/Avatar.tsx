import { BadgeCheck } from 'lucide-react';

import { initialsOf } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ring?: boolean;
}

const SIZES: Record<NonNullable<AvatarProps['size']>, string> = {
  sm: 'h-9 w-9 text-xs',
  md: 'h-12 w-12 text-sm',
  lg: 'h-24 w-24 text-xl',
  xl: 'h-28 w-28 text-2xl',
};

export function Avatar({ src, name, size = 'md', className, ring = false }: AvatarProps): JSX.Element {
  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-pastel-100 font-display font-bold text-pastel-800',
        ring && 'ring-4 ring-white',
        SIZES[size],
        className,
      )}
    >
      {src ? (
        <img
          src={src}
          alt={`Foto profil ${name}`}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
}

/** Blue check badge shown next to verified usernames. */
export function VerifiedBadge({ className, title }: { className?: string; title?: string }): JSX.Element {
  return (
    <BadgeCheck
      className={cn('h-5 w-5 text-pastel-600 drop-shadow-sm sm:h-[22px] sm:w-[22px]', className)}
      aria-label={title ?? 'Terverifikasi'}
      role="img"
    />
  );
}