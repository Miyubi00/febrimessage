/**
 * Edge Function: `get-private-message`
 *
 * Capability endpoint (spec 46/56): the sender of a message has no account, so
 * the private access token IS the credential. We hash the presented token and
 * look for a live (not revoked) row — the raw token never touches the database
 * and is never logged.
 *
 * Returns a sanitised thread: no ip_hash, no user_agent_hash, no token hash, no
 * moderation metadata. Attachments are exposed as short-lived signed URLs.
 *
 * Invalid / revoked / unknown tokens all return the SAME generic 404 so the
 * endpoint cannot be used to probe which links exist (spec 46).
 */
import { serviceClient } from '../_shared/clients.ts';
import { preflight } from '../_shared/cors.ts';
import { clientIp, hashIp } from '../_shared/ipHash.ts';
import { hashPrivateToken, looksLikePrivateToken } from '../_shared/privateToken.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { apiError, asString, json, methodNotAllowed, readJsonBody } from '../_shared/responses.ts';

const BUCKET = 'message-attachments';
/** Signed URLs are short-lived on purpose (spec 54). */
const SIGNED_URL_TTL_SECONDS = 300;
const NOT_FOUND_MESSAGE = 'Pesan tidak ditemukan atau link sudah tidak valid.';

interface AttachmentView {
  url: string;
  fileName: string;
  mimeType: string;
}

async function signedAttachments(
  // deno-lint-ignore no-explicit-any
  client: any,
  messageIds: string[],
): Promise<Record<string, AttachmentView[]>> {
  const grouped: Record<string, AttachmentView[]> = {};
  if (messageIds.length === 0) return grouped;

  const { data, error } = await client
    .from('message_attachments')
    .select('message_id, storage_path, file_name, mime_type')
    .in('message_id', messageIds);

  if (error || !Array.isArray(data)) {
    if (error) console.error('[get-private-message] attachment lookup failed:', error.message);
    return grouped;
  }

  for (const row of data as Array<Record<string, string>>) {
    const { data: signed, error: signError } = await client.storage
      .from(BUCKET)
      .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed?.signedUrl) {
      console.error('[get-private-message] signed url failed:', signError?.message ?? 'unknown');
      continue;
    }

    const list = grouped[row.message_id] ?? [];
    list.push({
      url: signed.signedUrl as string,
      fileName: row.file_name as string,
      mimeType: row.mime_type as string,
    });
    grouped[row.message_id] = list;
  }

  return grouped;
}

/** Show first char + domain only, eg. `kamu@gmail.com` -> `k***@gmail.com`. */
function maskEmail(email: string): string | null {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 0) return null;
  return `${email.slice(0, 1)}***${email.slice(at)}`;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request);

  let client;
  try {
    client = serviceClient();
  } catch (error) {
    console.error('[get-private-message] env error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'SERVER_MISCONFIGURED', 'Server belum dikonfigurasi dengan benar.');
  }

  try {
    // Rate limit before touching the token: 10/min + 60/hour per hashed IP keeps
    // the 8-char token space far out of brute-force reach (spec 62).
    const ipHash = await hashIp(clientIp(request), 'get_private_message');

    const burst = await enforceRateLimit(request, client, {
      ipHash,
      action: 'get_private_message',
      limit: 10,
      windowSeconds: 60,
      message: 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.',
    });
    if (burst) return burst;

    const hourly = await enforceRateLimit(request, client, {
      ipHash,
      action: 'get_private_message_hourly',
      limit: 60,
      windowSeconds: 3600,
      message: 'Terlalu banyak permintaan. Coba lagi nanti.',
    });
    if (hourly) return hourly;

    const body = await readJsonBody(request);
    const token = asString(body?.token, 256).trim();

    if (!looksLikePrivateToken(token)) {
      return apiError(request, 404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    const tokenHash = await hashPrivateToken(token);

    const { data: access, error: accessError } = await client
      .from('private_access')
      .select('message_id, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (accessError) {
      console.error('[get-private-message] token lookup failed:', accessError.message);
      return apiError(request, 500, 'LOOKUP_FAILED', 'Gagal memuat pesan. Coba lagi.');
    }

    if (!access || access.revoked_at) {
      return apiError(request, 404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    const { data: root, error: rootError } = await client
      .from('messages')
      .select('id, profile_id, sender_name, is_anonymous, content, status, visibility, created_at')
      .eq('id', access.message_id as string)
      .maybeSingle();

    if (rootError) {
      console.error('[get-private-message] root lookup failed:', rootError.message);
      return apiError(request, 500, 'LOOKUP_FAILED', 'Gagal memuat pesan. Coba lagi.');
    }

    // A deleted thread is treated as gone for the sender too.
    if (!root || root.status === 'deleted') {
      return apiError(request, 404, 'NOT_FOUND', NOT_FOUND_MESSAGE);
    }

    // The whole conversation, oldest first — sender and admin turns alike.
    const { data: replyRows, error: repliesError } = await client
      .from('messages')
      .select('id, content, created_at, status, author')
      .eq('parent_id', root.id as string)
      .in('status', ['unread', 'read'])
      .order('created_at', { ascending: true })
      .limit(50);

    if (repliesError) {
      console.error('[get-private-message] replies lookup failed:', repliesError.message);
      return apiError(request, 500, 'LOOKUP_FAILED', 'Gagal memuat pesan. Coba lagi.');
    }

    const replyList = (Array.isArray(replyRows) ? replyRows : []) as Array<Record<string, unknown>>;

    const { data: profile } = await client
      .from('profiles')
      .select('display_name, username, avatar_url, theme')
      .eq('id', root.profile_id as string)
      .maybeSingle();

    // Masked address only (never the real one — anyone holding the link
    // could read it otherwise). Null when not subscribed.
    const { data: subscription } = await client
      .from('thread_subscriptions')
      .select('email')
      .eq('message_id', root.id as string)
      .maybeSingle();

    const rawSubscribedEmail = (subscription?.email as string | undefined ?? '').trim();
    const subscribedEmail = maskEmail(rawSubscribedEmail);

    const attachments = await signedAttachments(
      client,
      [root.id as string, ...replyList.map((row) => row.id as string)],
    );

    return json(request, {
      thread: {
        id: root.id as string,
        visibility: root.visibility as string,
        profile: {
          displayName: (profile?.display_name as string) ?? 'Owner',
          username: (profile?.username as string) ?? '',
          avatarUrl: (profile?.avatar_url as string | null) ?? null,
          theme: (profile?.theme as string) ?? 'pastel-blue',
        },
        message: {
          content: root.content as string,
          senderName: root.is_anonymous ? 'Anonymous' : ((root.sender_name as string) || 'Anonymous'),
          isAnonymous: root.is_anonymous as boolean,
          createdAt: root.created_at as string,
        },
        replies: replyList.map((row) => ({
          content: row.content as string,
          createdAt: row.created_at as string,
          author: (row.author as string) === 'admin' ? 'admin' : 'sender',
          attachments: attachments[row.id as string] ?? [],
        })),
        attachments: attachments[root.id as string] ?? [],
        subscribedEmail,
      },
    });
  } catch (error) {
    console.error(
      '[get-private-message] unexpected error:',
      error instanceof Error ? error.message : error,
    );
    return apiError(request, 500, 'LOOKUP_FAILED', 'Gagal memuat pesan. Coba lagi.');
  }
});
