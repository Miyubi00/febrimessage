import { cn } from '@/lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps): JSX.Element {
  return <div className={cn('skeleton h-4 w-full', className)} aria-hidden="true" />;
}

/** Profile header + form placeholder used while the public page loads. */
export function ProfileSkeleton(): JSX.Element {
  return (
    <div className="surface overflow-hidden" role="status" aria-label="Memuat profil">
      <Skeleton className="h-40 w-full rounded-none sm:h-48" />
      <div className="space-y-5 p-6">
        <div className="flex items-end gap-4">
          <Skeleton className="-mt-14 h-24 w-24 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
        <Skeleton className="h-3.5 w-full" />
        <Skeleton className="h-3.5 w-3/4" />
        <Skeleton className="h-11 w-full rounded-2xl" />
        <div className="space-y-3 pt-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-3xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
      </div>
      <span className="sr-only">Memuat…</span>
    </div>
  );
}

/** Message list placeholder. */
export function MessageSkeleton({ rows = 4 }: { rows?: number }): JSX.Element {
  return (
    <div className="space-y-3" role="status" aria-label="Memuat pesan">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="surface-soft space-y-3 p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-2/3" />
        </div>
      ))}
      <span className="sr-only">Memuat…</span>
    </div>
  );
}

/** Admin inbox row placeholder. */
export function AdminListSkeleton({ rows = 6 }: { rows?: number }): JSX.Element {
  return (
    <div className="space-y-3" role="status" aria-label="Memuat pesan">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="surface-soft space-y-3 p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="ml-auto h-3 w-24" />
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
      ))}
      <span className="sr-only">Memuat…</span>
    </div>
  );
}