/**
 * Edge Function: `sender-reply`
 *
 * Lets the sender continue a private thread without an account. The private
 * access token IS the credential (same model as `get-private-message`).
 *
 * Turn-taking is enforced server-side: a sender reply is only accepted when
 * the latest message in the thread is the ADMIN's — i.e. the sender is
 * answering something. Otherwise 409 (the reply button disappears
 * client-side under the same rule).
 */
import { serviceClient } from '../_shared/clients.ts';
import { preflight } from '../_shared/cors.ts';
import { clientIp, hashIp } from '../_shared/ipHash.ts';
import { hashPrivateToken, looksLikePrivateToken } from '../_shared/privateToken.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { REPLY_MAX, countChars, sanitizeMultiline } from '../_shared/validate.ts';
import { apiError, asString, json, methodNotAllowed, readJsonBody } from '../_shared/responses.ts';

const NOT_FOUND_MESSAGE = 'Pesan tidak ditemukan atau link sudah tidak valid.';

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request);

  let client;
  try {
    client = serviceClient();
  } catch (error) {
    console.error('[sender-reply] env error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'SERVER_MISCONFIGURED', 'Server belum dikonfigurasi dengan benar.');
  }

  try {
    const ipHash = await hashIp(clientIp(request), 'sender_reply');

    const burst = await enforceRateLimit(request, client, {
      ipHash,
      action: 'sender_reply',
      limit: 10,
      windowSeconds: 60,
      message: 'Terlalu banyak balasan. Tunggu sebentar lalu coba lagi.',
    });
    if (burst) return burst;

    const hourly = await enforceRateLimit(request, client, {
      ipHash,
      action: 'sender_reply_hourly',
      limit: 100,
      windowSeconds: 3600,
      message: 'Terlalu banyak balasan. Coba lagi nanti.',
    });
    if (hourly) return hourly;

    const body = await readJsonBody(request);
    const token = asString(body?.token, 256).trim();
    const rawContent = asString(body?.content, REPLY_MAX * 4);

    if (!looksLikePrivateToken(token)) {
      return apiError(request, 404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    const content = sanitizeMultiline(rawContent);
    if (!content || countChars(content) > REPLY_MAX) {
      return apiError(request, 400, 'INVALID_CONTENT', `Balasan 1–${REPLY_MAX} karakter.`);
    }

    const tokenHash = await hashPrivateToken(token);
    const { data: access, error: accessError } = await client
      .from('private_access')
      .select('message_id, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (accessError) {
      console.error('[sender-reply] token lookup failed:', accessError.message);
      return apiError(request, 500, 'LOOKUP_FAILED', 'Gagal mengirim balasan. Coba lagi.');
    }
    if (!access || access.revoked_at) {
      return apiError(request, 404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    const { data: root, error: rootError } = await client
      .from('messages')
      .select('id, profile_id, sender_name, is_anonymous, status')
      .eq('id', access.message_id as string)
      .maybeSingle();

    if (rootError) {
      console.error('[sender-reply] root lookup failed:', rootError.message);
      return apiError(request, 500, 'LOOKUP_FAILED', 'Gagal mengirim balasan. Coba lagi.');
    }
    if (!root || root.status === 'deleted') {
      return apiError(request, 404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    // Turn rule: the newest message must be the admin's. No replies yet, or
    // the sender already answered last, means "wait for the admin".
    const { data: latestRows, error: latestError } = await client
      .from('messages')
      .select('author')
      .eq('parent_id', root.id as string)
      .in('status', ['unread', 'read'])
      .order('created_at', { ascending: false })
      .limit(1);

    if (latestError) {
      console.error('[sender-reply] latest lookup failed:', latestError.message);
      return apiError(request, 500, 'LOOKUP_FAILED', 'Gagal mengirim balasan. Coba lagi.');
    }

    const latest = Array.isArray(latestRows) && latestRows.length > 0 ? latestRows[0] : null;
    if (!latest || (latest.author as string) !== 'admin') {
      return apiError(request, 409, 'NOT_YOUR_TURN', 'Tunggu balasan admin dulu ya.');
    }

    const { data: created, error: createError } = await client
      .from('messages')
      .insert({
        profile_id: root.profile_id as string,
        parent_id: root.id as string,
        sender_name: (root.sender_name as string | null) ?? null,
        is_anonymous: (root.is_anonymous as boolean) ?? true,
        content,
        status: 'read',
        author: 'sender',
        // visibility is enforced by the thread trigger (inherits the root).
      })
      .select('id, content, created_at')
      .single();

    if (createError || !created) {
      console.error('[sender-reply] insert failed:', createError?.message);
      return apiError(request, 500, 'REPLY_FAILED', 'Gagal mengirim balasan. Coba lagi.');
    }

    // Bump the thread for the admin inbox (best effort).
    const { error: bumpError } = await client
      .from('messages')
      .update({ status: 'unread' })
      .eq('id', root.id as string)
      .eq('status', 'read');

    if (bumpError) {
      console.error('[sender-reply] bump failed:', bumpError.message);
    }

    return json(request, {
      reply: {
        id: created.id as string,
        content: created.content as string,
        created_at: created.created_at as string,
      },
    });
  } catch (error) {
    console.error('[sender-reply] unexpected error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'REPLY_FAILED', 'Gagal mengirim balasan. Coba lagi.');
  }
});
