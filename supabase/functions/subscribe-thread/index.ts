/**
 * Edge Function: `subscribe-thread`
 *
 * Lets the sender of a private thread leave an email address to be notified
 * on every admin reply. The private access token IS the credential (same
 * model as `get-private-message`); addresses land in `thread_subscriptions`,
 * a table the browser can never read.
 */
import { serviceClient } from '../_shared/clients.ts';
import { preflight } from '../_shared/cors.ts';
import { isPlausibleEmail } from '../_shared/email.ts';
import { clientIp, hashIp } from '../_shared/ipHash.ts';
import { hashPrivateToken, looksLikePrivateToken } from '../_shared/privateToken.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { apiError, asString, json, methodNotAllowed, readJsonBody } from '../_shared/responses.ts';

const NOT_FOUND_MESSAGE = 'Pesan tidak ditemukan atau link sudah tidak valid.';

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request);

  let client;
  try {
    client = serviceClient();
  } catch (error) {
    console.error('[subscribe-thread] env error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'SERVER_MISCONFIGURED', 'Server belum dikonfigurasi dengan benar.');
  }

  try {
    const ipHash = await hashIp(clientIp(request), 'subscribe_thread');

    const burst = await enforceRateLimit(request, client, {
      ipHash,
      action: 'subscribe_thread',
      limit: 10,
      windowSeconds: 60,
      message: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.',
    });
    if (burst) return burst;

    const body = await readJsonBody(request);
    const token = asString(body?.token, 256).trim();
    const email = asString(body?.email, 320).trim().toLowerCase();

    if (!looksLikePrivateToken(token)) {
      return apiError(request, 404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
    }
    if (!isPlausibleEmail(email)) {
      return apiError(request, 400, 'INVALID_EMAIL', 'Alamat email tidak valid.');
    }

    const tokenHash = await hashPrivateToken(token);
    const { data: access, error: accessError } = await client
      .from('private_access')
      .select('message_id, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (accessError) {
      console.error('[subscribe-thread] token lookup failed:', accessError.message);
      return apiError(request, 500, 'LOOKUP_FAILED', 'Gagal menyimpan email. Coba lagi.');
    }
    if (!access || access.revoked_at) {
      return apiError(request, 404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    const { data: root, error: rootError } = await client
      .from('messages')
      .select('id, status')
      .eq('id', access.message_id as string)
      .maybeSingle();

    if (rootError) {
      console.error('[subscribe-thread] root lookup failed:', rootError.message);
      return apiError(request, 500, 'LOOKUP_FAILED', 'Gagal menyimpan email. Coba lagi.');
    }
    if (!root || root.status === 'deleted') {
      return apiError(request, 404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    // One address per thread, immutable: a registered email cannot be
    // changed afterwards (prevents hijacking the notification target).
    const { data: existing, error: existingError } = await client
      .from('thread_subscriptions')
      .select('message_id')
      .eq('message_id', root.id as string)
      .maybeSingle();

    if (existingError) {
      console.error('[subscribe-thread] existing lookup failed:', existingError.message);
      return apiError(request, 500, 'LOOKUP_FAILED', 'Gagal menyimpan email. Coba lagi.');
    }
    if (existing) {
      return apiError(request, 409, 'ALREADY_SUBSCRIBED', 'Email sudah terdaftar untuk thread ini.');
    }

    const { error: upsertError } = await client.from('thread_subscriptions').upsert(
      { message_id: root.id as string, email },
      { onConflict: 'message_id' },
    );

    if (upsertError) {
      console.error('[subscribe-thread] upsert failed:', upsertError.message);
      return apiError(request, 500, 'SUBSCRIBE_FAILED', 'Gagal menyimpan email. Coba lagi.');
    }

    return json(request, { ok: true });
  } catch (error) {
    console.error('[subscribe-thread] unexpected error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'SUBSCRIBE_FAILED', 'Gagal menyimpan email. Coba lagi.');
  }
});
