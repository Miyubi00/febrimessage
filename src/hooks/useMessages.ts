import { useCallback, useEffect, useRef, useState } from 'react';

import { toFriendlyMessage } from '@/lib/errors';
import { fetchPublicThreads } from '@/services/messageService';
import type { PublicThread } from '@/types/message';

interface UseMessagesResult {
  threads: PublicThread[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/** Public (published) message threads for one profile. */
export function usePublicMessages(profileId: string | null, limit = 30): UseMessagesResult {
  const [threads, setThreads] = useState<PublicThread[]>([]);
  const [loading, setLoading] = useState(Boolean(profileId));
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!profileId) {
      setThreads([]);
      setLoading(false);
      return;
    }

    const currentRequest = ++requestId.current;
    let cancelled = false;

    setLoading(true);
    setError(null);

    const load = async (): Promise<void> => {
      try {
        const result = await fetchPublicThreads(profileId, limit);
        if (cancelled || currentRequest !== requestId.current) return;
        setThreads(result);
      } catch (caught) {
        if (cancelled || currentRequest !== requestId.current) return;
        setError(toFriendlyMessage(caught, 'Gagal memuat pesan.'));
      } finally {
        if (!cancelled && currentRequest === requestId.current) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [profileId, limit, reloadToken]);

  return { threads, loading, error, refresh };
}