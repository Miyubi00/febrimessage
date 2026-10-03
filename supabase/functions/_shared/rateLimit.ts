import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

import { apiError } from './responses.ts';

export interface RateLimitOptions {
  /** Hashed actor identifier (IP or admin user id) — never a raw value. */
  ipHash: string;
  /** Bucket name, eg. `submit_message`. */
  action: string;
  limit: number;
  windowSeconds: number;
  code?: string;
  message?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
  currentCount: number;
}

interface RateLimitRow {
  allowed: boolean;
  remaining: number;
  retry_after: number;
  current_count: number;
}

/**
 * Calls the atomic `public.check_rate_limit()` SQL function.
 *
 * The counter lives in Postgres (`insert ... on conflict do update ... returning`),
 * so concurrent requests cannot slip past the limit by racing a read/write.
 */
export async function checkRateLimit(
  client: SupabaseClient,
  options: RateLimitOptions,
): Promise<RateLimitResult> {
  const { data, error } = await client.rpc('check_rate_limit', {
    p_ip_hash: options.ipHash,
    p_action: options.action,
    p_limit: options.limit,
    p_window_seconds: options.windowSeconds,
  });

  if (error) {
    // Fail open: a limiter outage must not take the whole product down, but the
    // failure is logged so it shows up in the Edge Function logs.
    console.error('[rateLimit] check_rate_limit failed:', error.message);
    return { allowed: true, remaining: 0, retryAfter: 0, currentCount: 0 };
  }

  const rows = (Array.isArray(data) ? data : [data]) as RateLimitRow[];
  const row = rows[0];
  if (!row) return { allowed: true, remaining: 0, retryAfter: 0, currentCount: 0 };

  return {
    allowed: row.allowed === true,
    remaining: Number(row.remaining ?? 0),
    retryAfter: Number(row.retry_after ?? 0),
    currentCount: Number(row.current_count ?? 0),
  };
}

/**
 * Returns a ready-to-send 429 response when the bucket is exhausted, or `null`
 * when the request may proceed.
 */
export async function enforceRateLimit(
  request: Request,
  client: SupabaseClient,
  options: RateLimitOptions,
): Promise<Response | null> {
  const result = await checkRateLimit(client, options);
  if (result.allowed) return null;

  return apiError(
    request,
    429,
    options.code ?? 'RATE_LIMITED',
    options.message ?? 'Terlalu banyak permintaan. Coba lagi nanti.',
    result.retryAfter || 60,
  );
}
