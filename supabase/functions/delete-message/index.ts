/**
 * Edge Function: `delete-message`
 *
 * Permanently deletes a root message: its reply, every attachment metadata row
 * (via FK cascade) and every file in the private `message-attachments` bucket.
 * Only the owning admin (or a superadmin) may delete a message.
 */
import { canManageProfile, requireAdmin, serviceClient } from '../_shared/clients.ts';
import { preflight } from '../_shared/cors.ts';
import { hashActor } from '../_shared/ipHash.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { apiError, asString, json, methodNotAllowed, readJsonBody } from '../_shared/responses.ts';

const BUCKET = 'message-attachments';

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request);

  let client;
  try {
    client = serviceClient();
  } catch (error) {
    console.error('[delete-message] env error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'SERVER_MISCONFIGURED', 'Server belum dikonfigurasi dengan benar.');
  }

  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  try {
    const actorHash = await hashActor(admin.userId, 'delete_message');
    const limited = await enforceRateLimit(request, client, {
      ipHash: actorHash,
      action: 'delete_message',
      limit: 30,
      windowSeconds: 60,
      message: 'Terlalu banyak penghapusan. Tunggu sebentar.',
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

    const { data: target, error: targetError } = await client
      .from('messages')
      .select('id, profile_id, parent_id')
      .eq('id', messageId)
      .maybeSingle();

    if (targetError) {
      console.error('[delete-message] message lookup failed:', targetError.message);
      return apiError(request, 500, 'DELETE_FAILED', 'Gagal menghapus pesan. Coba lagi.');
    }
    if (!target) {
      return apiError(request, 404, 'MESSAGE_NOT_FOUND', 'Pesan tidak ditemukan.');
    }
    if ((target.parent_id as string | null) !== null) {
      return apiError(request, 400, 'NOT_A_ROOT_MESSAGE', 'Hanya pesan utama yang bisa dihapus.');
    }

    const allowed = await canManageProfile(client, target.profile_id as string, admin);
    if (!allowed) {
      return apiError(request, 403, 'FORBIDDEN', 'Kamu tidak punya akses ke pesan ini.');
    }

    // Collect every storage path up front: root message + reply attachments.
    const ids = [messageId];
    const { data: replies, error: repliesError } = await client
      .from('messages')
      .select('id')
      .eq('parent_id', messageId);

    if (repliesError) {
      console.error('[delete-message] reply lookup failed:', repliesError.message);
      return apiError(request, 500, 'DELETE_FAILED', 'Gagal menghapus pesan. Coba lagi.');
    }
    for (const reply of replies ?? []) ids.push((reply as { id: string }).id);

    const { data: attachmentRows, error: attachmentError } = await client
      .from('message_attachments')
      .select('storage_path')
      .in('message_id', ids);

    if (attachmentError) {
      console.error('[delete-message] attachment lookup failed:', attachmentError.message);
      return apiError(request, 500, 'DELETE_FAILED', 'Gagal menghapus pesan. Coba lagi.');
    }

    const paths = Array.from(
      new Set(
        (attachmentRows ?? [])
          .map((row) => (row as { storage_path: string }).storage_path)
          .filter((path) => typeof path === 'string' && path.length > 0),
      ),
    );

    const { error: deleteError } = await client.from('messages').delete().eq('id', messageId);
    if (deleteError) {
      console.error('[delete-message] message delete failed:', deleteError.message);
      return apiError(request, 500, 'DELETE_FAILED', 'Gagal menghapus pesan. Coba lagi.');
    }

    let removedFiles = 0;
    if (paths.length > 0) {
      const { data: removed, error: removeError } = await client.storage
        .from(BUCKET)
        .remove(paths);

      if (removeError) {
        console.error('[delete-message] storage cleanup failed:', removeError.message);
      } else {
        removedFiles = removed?.length ?? 0;
      }
    }

    return json(request, { deleted: true, removedFiles });
  } catch (error) {
    console.error(
      '[delete-message] unexpected error:',
      error instanceof Error ? error.message : error,
    );
    return apiError(request, 500, 'DELETE_FAILED', 'Gagal menghapus pesan. Coba lagi.');
  }
});