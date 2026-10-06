import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';

import { logDevError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { MessageRow } from '@/types/database';

interface UseRealtimeMessagesOptions {
  /** Restrict the subscription to a single profile. */
  profileId: string | null;
  enabled?: boolean;
  /** Called for every INSERT/UPDATE/DELETE row event (RLS-filtered per user). */
  onChange?: (payload: RealtimePostgresChangesPayload<MessageRow>) => void;
  /** Subscribe to UPDATE/DELETE as well (admin inbox uses this). */
  includeUpdates?: boolean;
  /** Provide the JWT explicitly (the admin dashboard does this). */
  accessToken?: string | null;
}

interface UseRealtimeMessagesResult {
  connected: boolean;
}

/**
 * Live inbox updates via Supabase Realtime (Postgres changes).
 *
 * The `messages` table is part of the `supabase_realtime` publication (see
 * migration 05) and replication honours RLS, so an anonymous visitor can never
 * receive private inbox events.
 */
export function useRealtimeMessages({
  profileId,
  enabled = true,
  onChange,
  includeUpdates = false,
  accessToken,
}: UseRealtimeMessagesOptions): UseRealtimeMessagesResult {
  const [connected, setConnected] = useState(false);
  const handlerRef = useRef(onChange);
  handlerRef.current = onChange;

  useEffect(() => {
    if (!enabled || !profileId) {
      setConnected(false);
      return;
    }

    let channel: RealtimeChannel | null = null;
    let cancelled = false;
    let retryTimer: number | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 5;

    const clearRetry = (): void => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer);
        retryTimer = null;
      }
    };

    const scheduleRetry = (): void => {
      if (cancelled || attempts >= MAX_ATTEMPTS) return;
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s — never a rapid retry loop.
      const delay = Math.min(1000 * 2 ** attempts, 16000);
      attempts += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        if (!cancelled) void subscribe();
      }, delay);
    };

    const teardownChannel = (): void => {
      if (channel) {
        const stale = channel;
        channel = null;
        void supabase.removeChannel(stale).catch(() => undefined);
      }
    };

    const subscribe = async (): Promise<void> => {
      if (cancelled) return;
      teardownChannel();

      try {
        // Make sure the socket carries the current JWT so RLS applies to
        // replicated rows (important for the admin inbox).
        await supabase.realtime.setAuth(accessToken ?? undefined);
      } catch (error) {
        logDevError('useRealtimeMessages.setAuth', error);
      }

      if (cancelled) return;

      channel = supabase
        .channel(`messages:${profileId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `profile_id=eq.${profileId}`,
          },
          (payload) => handlerRef.current?.(payload as RealtimePostgresChangesPayload<MessageRow>),
        );

      if (includeUpdates) {
        channel = channel
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'messages',
              filter: `profile_id=eq.${profileId}`,
            },
            (payload) => handlerRef.current?.(payload as RealtimePostgresChangesPayload<MessageRow>),
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'messages',
              filter: `profile_id=eq.${profileId}`,
            },
            (payload) => handlerRef.current?.(payload as RealtimePostgresChangesPayload<MessageRow>),
          );
      }

      channel.subscribe((status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          attempts = 0;
          setConnected(true);
          return;
        }
        setConnected(false);
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          logDevError('useRealtimeMessages', `channel status: ${status} (retry ${attempts + 1})`);
          scheduleRetry();
        }
      });
    };

    void subscribe();

    return () => {
      cancelled = true;
      clearRetry();
      setConnected(false);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [profileId, enabled, includeUpdates, accessToken]);

  return { connected };
}