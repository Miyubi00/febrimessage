/**
 * Edge Function: `admin-login`
 *
 * Exchanges email + password for a Supabase session (tokens are returned so the
 * browser can call `supabase.auth.setSession`). The role is NOT decided here — the
 * browser resolves it from `admin_profiles` afterwards — but we refuse to hand out
 * tokens to non-admin accounts, and every attempt is rate limited by hashed IP.
 */
import { anonClient, serviceClient } from '../_shared/clients.ts';
import { preflight } from '../_shared/cors.ts';
import { clientIp, hashIp } from '../_shared/ipHash.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { apiError, asString, json, methodNotAllowed, readJsonBody } from '../_shared/responses.ts';

// 10 attempts / 5 minutes and 30 attempts / 1 hour per hashed IP.
const LOGIN_BURST_LIMIT = 10;
const LOGIN_BURST_WINDOW = 5 * 60;
const LOGIN_HOURLY_LIMIT = 30;
const LOGIN_HOURLY_WINDOW = 60 * 60;

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request);

  let service;
  try {
    service = serviceClient();
  } catch (error) {
    console.error('[admin-login] env error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'SERVER_MISCONFIGURED', 'Server belum dikonfigurasi dengan benar.');
  }

  try {
    const body = await readJsonBody(request);
    if (!body) {
      return apiError(request, 400, 'INVALID_BODY', 'Format permintaan tidak valid.');
    }

    const email = asString(body.email, 320).trim().toLowerCase();
    const password = asString(body.password, 256);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return apiError(request, 400, 'INVALID_CREDENTIALS', 'Email atau password salah.');
    }
    if (!password) {
      return apiError(request, 400, 'INVALID_CREDENTIALS', 'Email atau password salah.');
    }

    const ipHash = await hashIp(clientIp(request), 'admin_login');

    const burst = await enforceRateLimit(request, service, {
      ipHash,
      action: 'admin_login',
      limit: LOGIN_BURST_LIMIT,
      windowSeconds: LOGIN_BURST_WINDOW,
      message: 'Terlalu banyak percobaan login. Coba lagi nanti.',
    });
    if (burst) return burst;

    const hourly = await enforceRateLimit(request, service, {
      ipHash,
      action: 'admin_login_hourly',
      limit: LOGIN_HOURLY_LIMIT,
      windowSeconds: LOGIN_HOURLY_WINDOW,
      message: 'Terlalu banyak percobaan login. Coba lagi nanti.',
    });
    if (hourly) return hourly;

    let auth;
    try {
      auth = anonClient();
    } catch (error) {
      console.error('[admin-login] anon client error:', error instanceof Error ? error.message : error);
      return apiError(request, 500, 'SERVER_MISCONFIGURED', 'Server belum dikonfigurasi dengan benar.');
    }

    const { data: signInData, error: signInError } = await auth.auth.signInWithPassword({
      email,
      password,
    });

    // Generic message on purpose: never reveal whether the email exists.
    if (signInError || !signInData.session || !signInData.user) {
      return apiError(request, 401, 'INVALID_CREDENTIALS', 'Email atau password salah.');
    }

    const { data: roleRow, error: roleError } = await service
      .from('admin_profiles')
      .select('role')
      .eq('id', signInData.user.id)
      .maybeSingle();

    if (roleError) {
      console.error('[admin-login] role lookup failed:', roleError.message);
      return apiError(request, 500, 'LOGIN_FAILED', 'Login gagal. Coba lagi.');
    }

    if (!roleRow) {
      // Valid credentials but not an admin: hand out nothing.
      return apiError(request, 403, 'NOT_ADMIN', 'Akun ini bukan admin.');
    }

    return json(request, {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_in: signInData.session.expires_in ?? 3600,
    });
  } catch (error) {
    console.error(
      '[admin-login] unexpected error:',
      error instanceof Error ? error.message : error,
    );
    return apiError(request, 500, 'LOGIN_FAILED', 'Login gagal. Coba lagi.');
  }
});
