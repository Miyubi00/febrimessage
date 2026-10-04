/**
 * Edge Function: `private-link`
 *
 * Admin-only management of a thread's private access link (spec 60):
 *   action = 'revoke' -> the old link stops working (revoked_at = now())
 *   action = 'rotate' -> mint a brand new token, show it once to the admin
 *
 * The raw token is generated here, returned in the response and NEVER stored or
 * logged — only SHA-256(token + secret) reaches the database.
 */
import { canManageProfile, requireAdmin, serviceClient } from '../_shared/clients.ts';
import { preflight } from '../_shared/cors.ts';
import { hashActor } from '../_shared/ipHash.ts';
import { generatePrivateToken, hashPrivateToken } from '../_shared/privateToken.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { apiError, asString, json, methodNotAllowed, readJsonBody } from '../_shared/responses.ts';

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request);

  let client;
  try {
    client = serviceClient();
  } catch (error) {
    console.error('[private-link] env error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'SERVER_MISCONFIGURED', 'Server belum dikonfigurasi dengan benar.');
  }

  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  try {
    const actorHash = await hashActor(admin.userId, 'private_link');
    const limited = await enforceRateLimit(request, client, {
      ipHash: actorHash,
      action: 'private_link',
      limit: 20,
      windowSeconds: 60,
      message: 'Terlalu banyak permintaan. Tunggu sebentar.',
    });
    if (limited) return limited;

    const body = await readJsonBody(request);
    const messageId = asString(body?.messageId, 64).trim();
    const action = asString(body?.action, 16).trim().toLowerCase();

    if (!messageId) {
      return apiError(request, 400, 'MESSAGE_ID_REQUIRED', 'ID pesan wajib diisi.');
    }
    if (action !== 'revoke' && action !== 'rotate') {
      return apiError(request, 400, 'INVALID_ACTION', 'Aksi tidak dikenal.');
    }

    const { data: target, error: targetError } = await client
      .from('messages')
      .select('id, profile_id, parent_id, root_message_id')
      .eq('id', messageId)
      .maybeSingle();

    if (targetError) {
      console.error('[private-link] message lookup failed:', targetError.message);
      return apiError(request, 500, 'PRIVATE_LINK_FAILED', 'Gagal memproses link. Coba lagi.');
    }
    if (!target) {
      return apiError(request, 404, 'MESSAGE_NOT_FOUND', 'Pesan tidak ditemukan.');
    }

    // The token always belongs to the ROOT of the thread.
    const rootId = (target.parent_id as string | null) ?? (target.id as string);

    const allowed = await canManageProfile(client, target.profile_id as string, admin);
    if (!allowed) {
      return apiError(request, 403, 'FORBIDDEN', 'Kamu tidak punya akses ke pesan ini.');
    }

    const { data: existing, error: existingError } = await client
      .from('private_access')
      .select('message_id, revoked_at')
      .eq('message_id', rootId)
      .maybeSingle();

    if (existingError) {
      console.error('[private-link] access lookup failed:', existingError.message);
      return apiError(request, 500, 'PRIVATE_LINK_FAILED', 'Gagal memproses link. Coba lagi.');
    }

    if (action === 'revoke') {
      if (!existing) {
        return apiError(request, 404, 'NO_PRIVATE_LINK', 'Pesan ini belum punya private link.');
      }

      const { error: revokeError } = await client
        .from('private_access')
        .update({ revoked_at: new Date().toISOString() })
        .eq('message_id', rootId);

      if (revokeError) {
        console.error('[private-link] revoke failed:', revokeError.message);
        return apiError(request, 500, 'PRIVATE_LINK_FAILED', 'Gagal mencabut link. Coba lagi.');
      }

      return json(request, { ok: true, action: 'revoke' });
    }

    // rotate
    const token = generatePrivateToken();
    const tokenHash = await hashPrivateToken(token);

    const { error: rotateError } = await client.from('private_access').upsert(
      {
        message_id: rootId,
        token_hash: tokenHash,
        created_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: 'message_id' },
    );

    if (rotateError) {
      console.error('[private-link] rotate failed:', rotateError.message);
      return apiError(request, 500, 'PRIVATE_LINK_FAILED', 'Gagal membuat link baru. Coba lagi.');
    }

    // Raw token returned exactly once; it is never logged nor persisted.
    return json(request, { ok: true, action: 'rotate', token });

  } catch (error) {
    console.error('[private-link] unexpected error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'PRIVATE_LINK_FAILED', 'Gagal memproses link. Coba lagi.');
  }
});
