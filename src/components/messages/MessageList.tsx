import { MessageCircle } from 'lucide-react';

import { MessageThread } from '@/components/messages/MessageThread';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { MessageSkeleton } from '@/components/ui/Skeleton';
import type { PublicThread } from '@/types/message';

interface MessageListProps {
  threads: PublicThread[];
  ownerName: string;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  className?: string;
}

/**
 * Public message feed.
 *
 * Only messages the owner published (`is_public = true`) ever reach this list —
 * the visitor can never read the private inbox (enforced by RLS).
 */
export function MessageList({
  threads,
  ownerName,
  loading,
  error,
  onRetry,
  className,
}: MessageListProps): JSX.Element {
  if (loading) return <MessageSkeleton rows={4} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;

  if (threads.length === 0) {
    return (
      <EmptyState
        title="Belum ada pesan"
        description="Lakukan hal pertama dengan mengirim pesan anonim."
        icon={<MessageCircle className="h-7 w-7" aria-hidden="true" />}
      />
    );
  }

  return (
    <div className={className}>
      {threads.map((thread, index) => (
        <MessageThread key={thread.id} thread={thread} ownerName={ownerName} index={index} />
      ))}
    </div>
  );
}