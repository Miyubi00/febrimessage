import { useEffect, useMemo, useState } from 'react';

import { getAttachmentUrls } from '@/lib/uploads';
import type { MessageAttachmentRow } from '@/types/database';

interface UseAttachmentUrlsResult {
  urls: Record<string, string>;
  loading: boolean;
}

/**
 * Resolves readable signed URLs for attachments living in the private
 * `message-attachments` bucket (RLS decides what the visitor may read).
 */
export function useAttachmentUrls(
  attachments: readonly MessageAttachmentRow[] | readonly string[],
): UseAttachmentUrlsResult {
  const paths = useMemo(() => {
    const list = attachments.map((item) => (typeof item === 'string' ? item : item.storage_path));
    return Array.from(new Set(list.filter(Boolean))).sort();
  }, [attachments]);

  const cacheKey = paths.join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(paths.length > 0);

  useEffect(() => {
    let cancelled = false;

    if (paths.length === 0) {
      setUrls({});
      setLoading(false);
      return;
    }

    setLoading(true);
    getAttachmentUrls(paths)
      .then((resolved) => {
        if (cancelled) return;
        setUrls((previous) => ({ ...previous, ...resolved }));
      })
      .catch(() => {
        if (!cancelled) setUrls({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return { urls, loading };
}