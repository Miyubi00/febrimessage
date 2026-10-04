/**
 * Edge Function: `admin-reply`
 *
 * Stores the admin's reply as a child message (`parent_id` = thread root).
 * Replies append — threads are sender <-> admin conversations.
 */
import { canManageProfile, getAppSetting, requireAdmin, serviceClient } from '../_shared/clients.ts';
import { preflight } from '../_shared/cors.ts';
import { emailShell, escapeHtml, isPlausibleEmail, sendEmail } from '../_shared/email.ts';
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

    // Visibility describes the whole THREAD (spec 50/51), not just the reply.
    // Default is public; anything unrecognised falls back to public as well.
    const visibility =
      asString(body.visibility, 16).trim().toLowerCase() === 'private' ? 'private' : 'public';

    // Set it on the root FIRST so a freshly inserted reply inherits the new
    // value through the `messages_enforce_thread` trigger, and so existing
    // replies are pushed by `messages_propagate_visibility`.
    const { error: visibilityError } = await client
      .from('messages')
      .update({ visibility })
      .eq('id', messageId);

    if (visibilityError) {
      console.error('[admin-reply] visibility update failed:', visibilityError.message);
      return apiError(request, 500, 'REPLY_FAILED', 'Gagal mengirim balasan. Coba lagi.');
    }

    // Replies append: threads are sender <-> admin conversations, so every
    // admin reply is a new row (the old replace-in-place behaviour is gone).
    const { data: created, error: createError } = await client
      .from('messages')
      .insert({
        profile_id: parent.profile_id as string,
        parent_id: messageId,
        sender_name: null,
        is_anonymous: false,
        content,
        status: 'read',
        author: 'admin',
        // visibility is enforced by the thread trigger (inherits the root).
      })
      .select('*')
      .single();

    if (createError || !created) {
      console.error('[admin-reply] reply insert failed:', createError?.message);
      return apiError(request, 500, 'REPLY_FAILED', 'Gagal mengirim balasan. Coba lagi.');
    }
    const reply = created;

    // Reading it in the inbox to reply implies the admin has seen the message.
    const { error: readError } = await client
      .from('messages')
      .update({ status: 'read' })
      .eq('id', messageId)
      .eq('status', 'unread');

    if (readError) {
      console.error('[admin-reply] mark-read failed:', readError.message);
    }

    // Sender email notification — best effort, never blocks the response.
    // Only the subscribed address (if any) is notified; the link itself is
    // never included because only its hash is stored server-side.
    try {
      const emailEnabled =
        (await getAppSetting(client, 'email_notifications_enabled', 'false')).trim().toLowerCase() === 'true';
      if (emailEnabled) {
        const { data: subscription } = await client
          .from('thread_subscriptions')
          .select('email')
          .eq('message_id', messageId)
          .maybeSingle();

        const address = (subscription?.email as string | undefined ?? '').trim();
        if (isPlausibleEmail(address)) {
          const sent = await sendEmail({
            to: address,
            subject: 'Ada balasan baru untuk pesan anonimmu',
            html: emailShell(
              'Ada balasan baru',
              '<p>Pemilik profile baru saja membalas pesan anonimmu. Buka link private-mu untuk membaca balasannya.</p>' +
                `<blockquote style="border-left:3px solid #A9D8FF;padding-left:12px;color:#3D5A80">${escapeHtml(content.slice(0, 300))}</blockquote>`,
            ),
          });
          console.log(`[admin-reply] sender email notify: ${sent ? 'sent' : 'skipped'}`);
        }
      }
    } catch (emailError) {
      console.error(
        '[admin-reply] sender email notify threw:',
        emailError instanceof Error ? emailError.message : emailError,
      );
    }

    return json(request, { reply, visibility });
  } catch (error) {
    console.error(
      '[admin-reply] unexpected error:',
      error instanceof Error ? error.message : error,
    );
    return apiError(request, 500, 'REPLY_FAILED', 'Gagal mengirim balasan. Coba lagi.');
  }
});