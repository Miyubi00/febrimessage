/**
 * Edge Function: `admin-reply`
 *
 * Stores the admin's reply as a child message (`parent_id = messageId`) so the
 * public thread can render it. Only one reply per message is enforced; replying
 * twice replaces the previous reply instead of piling up rows.
 */
import { canManageProfile, requireAdmin, serviceClient } from '../_shared/clients.ts';
import { preflight } from '../_shared/cors.ts';
import { hashActor } from '../_shared/ipHash.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { apiError, asString, json, methodNotAllowed, readJsonBody } from '../_shared/responses.ts';
import { REPLY_MAX, countChars, sanitizeMultiline } from '../_shared/validate.ts';

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request);

  let client;
  try {
    client = serviceClient();
  } catch (error) {
    console.error('[admin-reply] env error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'SERVER_MISCONFIGURED', 'Server belum dikonfigurasi dengan benar.');
  }

  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  try {
    const actorHash = await hashActor(admin.userId, 'admin_reply');
    const limited = await enforceRateLimit(request, client, {
      ipHash: actorHash,
      action: 'admin_reply',
      limit: 30,
      windowSeconds: 60,
      message: 'Terlalu banyak balasan. Tunggu sebentar.',
    });
    if (limited) return limited;

    const body = await readJsonBody(request);
    if (!body) {
      return apiError(request, 400, 'INVALID_BODY', 'Format permintaan tidak valid.');
    }

    const messageId = asString(body.messageId, 64).trim();
    if (!messageId) {
      return apiError(request, 400, 'MESSAGE_ID_REQUIRED', 'ID pesan wajib diisi.');
    }

    const content = sanitizeMultiline(asString(body.content, REPLY_MAX + 500));
    const contentLength = countChars(content);
    if (contentLength === 0) {
      return apiError(request, 400, 'CONTENT_REQUIRED', 'Isi balasan wajib diisi.');
    }
    if (contentLength > REPLY_MAX) {
      return apiError(request, 400, 'CONTENT_TOO_LONG', `Isi balasan maksimal ${REPLY_MAX} karakter.`);
    }

    const { data: parent, error: parentError } = await client
      .from('messages')
      .select('id, profile_id, parent_id')
      .eq('id', messageId)
      .maybeSingle();

    if (parentError) {
      console.error('[admin-reply] parent lookup failed:', parentError.message);
      return apiError(request, 500, 'REPLY_FAILED', 'Gagal mengirim balasan. Coba lagi.');
    }
    if (!parent) {
      return apiError(request, 404, 'MESSAGE_NOT_FOUND', 'Pesan tidak ditemukan.');
    }
    if ((parent.parent_id as string | null) !== null) {
      return apiError(request, 400, 'NOT_A_ROOT_MESSAGE', 'Hanya pesan utama yang bisa dibalas.');
    }

    const allowed = await canManageProfile(client, parent.profile_id as string, admin);
    if (!allowed) {
      return apiError(request, 403, 'FORBIDDEN', 'Kamu tidak punya akses ke pesan ini.');
    }

    // One reply per message: replace the existing reply instead of duplicating.
    const { data: existing, error: existingError } = await client
      .from('messages')
      .select('id')
      .eq('parent_id', messageId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error('[admin-reply] existing reply lookup failed:', existingError.message);
      return apiError(request, 500, 'REPLY_FAILED', 'Gagal mengirim balasan. Coba lagi.');
    }

    let reply;
    if (existing) {
      const { data: updated, error: updateError } = await client
        .from('messages')
        .update({ content, status: 'read' })
        .eq('id', (existing as { id: string }).id)
        .select('*')
        .single();

      if (updateError || !updated) {
        console.error('[admin-reply] reply update failed:', updateError?.message);
        return apiError(request, 500, 'REPLY_FAILED', 'Gagal mengirim balasan. Coba lagi.');
      }
      reply = updated;
    } else {
      const { data: created, error: createError } = await client
        .from('messages')
        .insert({
          profile_id: parent.profile_id as string,
          parent_id: messageId,
          sender_name: null,
          is_anonymous: false,
          content,
          status: 'read',
          is_public: false,
        })
        .select('*')
        .single();

      if (createError || !created) {
        console.error('[admin-reply] reply insert failed:', createError?.message);
        return apiError(request, 500, 'REPLY_FAILED', 'Gagal mengirim balasan. Coba lagi.');
      }
      reply = created;
    }

    // Reading it in the inbox to reply implies the admin has seen the message.
    const { error: readError } = await client
      .from('messages')
      .update({ status: 'read' })
      .eq('id', messageId)
      .eq('status', 'unread');

    if (readError) {
      console.error('[admin-reply] mark-read failed:', readError.message);
    }

    return json(request, { reply });
  } catch (error) {
    console.error(
      '[admin-reply] unexpected error:',
      error instanceof Error ? error.message : error,
    );
    return apiError(request, 500, 'REPLY_FAILED', 'Gagal mengirim balasan. Coba lagi.');
  }
});