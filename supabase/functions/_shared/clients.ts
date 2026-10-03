import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';

import { apiError } from './responses.ts';

/**
 * Service-role client (server only).
 *
 * This key never leaves the Edge Function environment. It bypasses RLS, so every
 * use must be preceded by an explicit authorisation check.
 */
let cachedServiceClient: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY secret.');
  }

  if (!cachedServiceClient) {
    cachedServiceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { 'x-client-info': 'anon-message-edge' } },
    });
  }

  return cachedServiceClient;
}

/** Anon client used only to exchange credentials for a session. */
export function anonClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

  if (!url || !anonKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY secret.');
  }

  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface AdminIdentity {
  userId: string;
  role: 'admin' | 'superadmin';
  email: string | null;
}

/**
 * Verifies the caller's JWT and resolves their role from `admin_profiles`.
 *
 * Returns a 401/403 `Response` instead of throwing so handlers can simply
 * `if (identity instanceof Response) return identity;`.
 */
export async function requireAdmin(request: Request): Promise<AdminIdentity | Response> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';

  if (!token) {
    return apiError(request, 401, 'UNAUTHORIZED', 'Login admin diperlukan.');
  }

  const client = serviceClient();

  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) {
    return apiError(request, 401, 'UNAUTHORIZED', 'Sesi tidak valid. Login ulang.');
  }

  const { data: roleRow, error: roleError } = await client
    .from('admin_profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (roleError) {
    console.error('[auth] admin_profiles lookup failed:', roleError.message);
    return apiError(request, 500, 'AUTH_CHECK_FAILED', 'Gagal memeriksa hak akses.');
  }

  if (!roleRow) {
    return apiError(request, 403, 'NOT_ADMIN', 'Akun ini bukan admin.');
  }

  return {
    userId: userData.user.id,
    role: roleRow.role as 'admin' | 'superadmin',
    email: userData.user.email ?? null,
  };
}

/**
 * A profile belongs to the admin when it is explicitly owned by them, is still
 * unowned (first-time claim) or when the caller is a superadmin.
 */
export async function canManageProfile(
  client: SupabaseClient,
  profileId: string,
  admin: AdminIdentity,
): Promise<boolean> {
  if (admin.role === 'superadmin') return true;

  const { data, error } = await client
    .from('profiles')
    .select('owner_id')
    .eq('id', profileId)
    .maybeSingle();

  if (error) {
    console.error('[auth] profile lookup failed:', error.message);
    return false;
  }

  if (!data) return false;
  return data.owner_id === null || data.owner_id === admin.userId;
}

/**
 * Reads feature/config values from `public.app_settings`.
 *
 * Unknown keys resolve to the provided fallback. `discord_webhook_url` IS
 * stored here (see migration 08) — the DISCORD_WEBHOOK_URL env secret remains
 * as a fallback for deployments that prefer CLI-managed secrets.
 */
export async function getAppSetting(
  client: SupabaseClient,
  key: string,
  fallback = '',
): Promise<string> {
  try {
    const { data, error } = await client
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .maybeSingle();

    if (error) {
      console.error(`[settings] lookup ${key} failed:`, error.message);
      return fallback;
    }
    if (!data || typeof (data as { value?: unknown }).value !== 'string') return fallback;
    return (data as { value: string }).value;
  } catch (error) {
    console.error(`[settings] lookup ${key} threw:`, error instanceof Error ? error.message : error);
    return fallback;
  }
}

export interface DiscordWebhookConfig {
  url: string;
  /** Where the URL came from — useful for logs and the Settings hint. */
  source: 'database' | 'secret' | 'draft' | 'none';
}

/**
 * Resolves the Discord webhook URL: the `app_settings` row (configured from the
 * Settings page) wins, otherwise the DISCORD_WEBHOOK_URL Edge Function secret.
 * Validation happens again in the caller before any request is made.
 */
export async function resolveDiscordWebhookUrl(
  client: SupabaseClient,
): Promise<DiscordWebhookConfig> {
  const fromDb = (await getAppSetting(client, 'discord_webhook_url', '')).trim();
  if (fromDb) return { url: fromDb, source: 'database' };

  const fromSecret = (Deno.env.get('DISCORD_WEBHOOK_URL') ?? '').trim();
  if (fromSecret) return { url: fromSecret, source: 'secret' };

  return { url: '', source: 'none' };
}
