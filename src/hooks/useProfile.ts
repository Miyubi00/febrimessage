import { useCallback, useEffect, useRef, useState } from 'react';

import { toFriendlyMessage } from '@/lib/errors';
import { fetchDefaultProfile } from '@/services/profileService';
import type { Profile } from '@/types/profile';

interface UseProfileResult {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  notFound: boolean;
  refresh: () => void;
}

/**
 * Loads the single public profile (the oldest row).
 *
 * This is a single-user app: there are no per-username pages, the owner's own
 * domain always renders this one profile.
 */
export function useProfile(): UseProfileResult {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    const currentRequest = ++requestId.current;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setNotFound(false);

    const load = async (): Promise<void> => {
      try {
        const result = await fetchDefaultProfile();

        if (cancelled || currentRequest !== requestId.current) return;
        setProfile(result);
        setNotFound(result === null);
      } catch (caught) {
        if (cancelled || currentRequest !== requestId.current) return;
        setError(toFriendlyMessage(caught, 'Gagal memuat profil.'));
      } finally {
        if (!cancelled && currentRequest === requestId.current) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  return { profile, loading, error, notFound, refresh };
}