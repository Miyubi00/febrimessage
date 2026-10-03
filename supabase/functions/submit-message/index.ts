/**
 * Edge Function: `submit-message`
 *
 * The ONLY way a message enters the database. The browser has no INSERT policy on
 * `public.messages`, so every submission goes through here where we apply:
 *
 *   1. CORS + method checks        4. captcha verification
 *   2. honeypot (silent drop)      5. server-side sanitising + length limits
 *   3. atomic rate limiting        6. attachment ownership/storage verification
 *
 * The raw IP is never stored — only a SHA-256 hash keyed by a server secret.
 */
import { getAppSetting, resolveDiscordWebhookUrl, serviceClient } from '../_shared/clients.ts';
import { verifyCaptcha } from '../_shared/captcha.ts';
import { preflight } from '../_shared/cors.ts';
import { sendDiscordNotification } from '../_shared/discord.ts';
import { clientIp, hashIp, hashUserAgent } from '../_shared/ipHash.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import {
  apiError,
  asBoolean,
  asString,
  json,
  methodNotAllowed,
  readJsonBody,
} from '../_shared/responses.ts';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MESSAGE_MAX,
  SENDER_NAME_MAX,
  countChars,
  isValidPendingPath,
  sanitizeMultiline,
  sanitizeText,
} from '../_shared/validate.ts';

const BUCKET = 'message-attachments';

interface AttachmentMeta {
  message_id?: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
}

/**
 * Verifies that a path returned by `upload-message-attachment` really exists in
 * the private bucket and reads its size/mime from Storage metadata (never from
 * the client), so a forged path or a fake size cannot slip through.
 */
async function resolveAttachment(
  // deno-lint-ignore no-explicit-any
  client: any,
  path: string,
): Promise<AttachmentMeta | null> {
  const segments = path.split('/');
  const folder = `${segments[0]}/${segments[1]}`;
  const base = segments[2] ?? '';

  const { data, error } = await client.storage.from(BUCKET).list(folder, { search: base, limit: 5 });
  if (error || !Array.isArray(data) || data.length === 0) return null;

  const object = data.find((entry: { name?: string }) => entry.name === base);
  if (!object) return null;

  const metadata = (object.metadata ?? {}) as { size?: number; mimetype?: string };
  const size = Number(metadata.size ?? 0);
  const mimeType = String(metadata.mimetype ?? '');

  if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_BYTES) return null;
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
    return null;
  }

  return {
    storage_path: path,
    file_name: sanitizeText(object.name ?? base).slice(0, 120) || base,
    mime_type: mimeType,
    file_size: size,
  };
}

// Limits: 5 submits / 60s and 50 submits / 24h per hashed IP.
const SUBMIT_BURST_LIMIT = 5;
const SUBMIT_BURST_WINDOW = 60;
const SUBMIT_DAILY_LIMIT = 50;
const SUBMIT_DAILY_WINDOW = 24 * 60 * 60;

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request);

  let client;
  try {
    client = serviceClient();
  } catch (error) {
    console.error('[submit-message] env error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'SERVER_MISCONFIGURED', 'Server belum dikonfigurasi dengan benar.');
  }

  try {
    const body = await readJsonBody(request);
    if (!body) {
      return apiError(request, 400, 'INVALID_BODY', 'Format permintaan tidak valid.');
    }

    const honeypot = asString(body.honeypot, 500);
    if (honeypot.trim().length > 0) {
      // Bot caught by the honeypot field: pretend everything is fine so the bot
      // learns nothing, and store nothing.
      return json(request, { id: null, created_at: null, status: 'ignored' });
    }

    const rawIp = clientIp(request);
    const ipHash = await hashIp(rawIp, 'submit_message');

    const burst = await enforceRateLimit(request, client, {
      ipHash,
      action: 'submit_message',
      limit: SUBMIT_BURST_LIMIT,
      windowSeconds: SUBMIT_BURST_WINDOW,
      message: 'Terlalu banyak pesan dikirim. Coba lagi nanti.',
    });
    if (burst) return burst;

    const daily = await enforceRateLimit(request, client, {
      ipHash,
      action: 'submit_message_daily',
      limit: SUBMIT_DAILY_LIMIT,
      windowSeconds: SUBMIT_DAILY_WINDOW,
      message: 'Batas pengiriman harian tercapai. Coba lagi besok.',
    });
    if (daily) return daily;

    const captcha = await verifyCaptcha(request, asString(body.captchaToken, 4096));
    if (!captcha.ok) {
      return apiError(request, 400, 'CAPTCHA_FAILED', 'Verifikasi captcha gagal. Coba lagi.');
    }

    const profileId = asString(body.profileId, 64).trim();
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(profileId)) {
      return apiError(request, 400, 'INVALID_PROFILE', 'Profil tujuan tidak valid.');
    }

    const isAnonymous = asBoolean(body.isAnonymous, true);

    const rawSenderName = sanitizeText(asString(body.senderName, SENDER_NAME_MAX + 20));
    const senderName = isAnonymous ? '' : rawSenderName;
    if (!isAnonymous) {
      if (senderName.length === 0) {
        return apiError(request, 400, 'SENDER_NAME_REQUIRED', 'Nama pengirim wajib diisi.');
      }
      if (countChars(senderName) > SENDER_NAME_MAX) {
        return apiError(request, 400, 'SENDER_NAME_TOO_LONG', `Nama pengirim maksimal ${SENDER_NAME_MAX} karakter.`);
      }
    }

    const content = sanitizeMultiline(asString(body.content, MESSAGE_MAX + 500));
    const contentLength = countChars(content);
    if (contentLength === 0) {
      return apiError(request, 400, 'CONTENT_REQUIRED', 'Isi pesan wajib diisi.');
    }
    if (contentLength > MESSAGE_MAX) {
      return apiError(request, 400, 'CONTENT_TOO_LONG', `Isi pesan maksimal ${MESSAGE_MAX} karakter.`);
    }

    const rawPaths = Array.isArray(body.attachmentPaths)
      ? body.attachmentPaths.filter((value): value is string => typeof value === 'string')
      : [];
    const attachmentPaths = Array.from(new Set(rawPaths.map((path) => path.trim()).filter(Boolean)));

    if (attachmentPaths.length > MAX_ATTACHMENTS) {
      return apiError(request, 400, 'TOO_MANY_ATTACHMENTS', `Maksimal ${MAX_ATTACHMENTS} gambar per pesan.`);
    }
    for (const path of attachmentPaths) {
      if (!isValidPendingPath(path)) {
        return apiError(request, 400, 'INVALID_ATTACHMENT', 'Lampiran tidak valid. Unggah ulang gambarnya.');
      }
    }

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('id')
      .eq('id', profileId)
      .maybeSingle();

    if (profileError) {
      console.error('[submit-message] profile lookup failed:', profileError.message);
      return apiError(request, 500, 'SUBMIT_FAILED', 'Gagal mengirim pesan. Coba lagi.');
    }
    if (!profile) {
      return apiError(request, 404, 'PROFILE_NOT_FOUND', 'Halaman ini belum siap.');
    }

    const { data: duplicateData, error: duplicateError } = await client.rpc('is_duplicate_message', {
      p_ip_hash: ipHash,
      p_content: content,
      p_window_seconds: 120,
    });

    if (!duplicateError && duplicateData === true) {
      return apiError(
        request,
        429,
        'DUPLICATE_MESSAGE',
        'Pesan yang sama baru saja dikirim. Tunggu sebentar.',
        120,
      );
    }
    if (duplicateError) {
      console.error('[submit-message] duplicate check failed:', duplicateError.message);
    }

    const attachments: AttachmentMeta[] = [];
    for (const path of attachmentPaths) {
      const resolved = await resolveAttachment(client, path);
      if (!resolved) {
        return apiError(request, 400, 'INVALID_ATTACHMENT', 'Lampiran tidak valid. Unggah ulang gambarnya.');
      }
      attachments.push(resolved);
    }

    const userAgentHash = await hashUserAgent(request);

    const { data: inserted, error: insertError } = await client
      .from('messages')
      .insert({
        profile_id: profile.id as string,
        sender_name: senderName || null,
        is_anonymous: isAnonymous,
        content,
        status: 'unread',
        is_public: false,
        parent_id: null,
        ip_hash: ipHash,
        user_agent_hash: userAgentHash,
      })
      .select('id, created_at, status')
      .single();

    if (insertError || !inserted) {
      console.error('[submit-message] message insert failed:', insertError?.message);
      return apiError(request, 500, 'SUBMIT_FAILED', 'Gagal mengirim pesan. Coba lagi.');
    }

    if (attachments.length > 0) {
      const { error: attachmentError } = await client.from('message_attachments').insert(
        attachments.map((attachment) => ({
          message_id: inserted.id as string,
          storage_path: attachment.storage_path,
          file_name: attachment.file_name,
          mime_type: attachment.mime_type,
          file_size: attachment.file_size,
        })),
      );

      if (attachmentError) {
        // Keep the message but report the failure; the message row owns the text,
        // the attachment metadata insert is retried by resubmission.
        console.error('[submit-message] attachment insert failed:', attachmentError.message);
        return apiError(request, 500, 'ATTACHMENT_SAVE_FAILED', 'Pesan terkirim, tetapi lampiran gagal disimpan.');
      }
    }

    // Store the sender IP in the admin-only message_meta table (never public).
    // Failure here is non-fatal: the message itself is already safely stored.
    const { error: metaError } = await client.from('message_meta').upsert(
      {
        message_id: inserted.id as string,
        sender_ip: rawIp && rawIp !== 'unknown' ? rawIp : null,
      },
      { onConflict: 'message_id' },
    );
    if (metaError) {
      console.error('[submit-message] message_meta upsert failed:', metaError.message);
    }

    // Discord notification — best effort, never blocks the response. The raw IP
    // travels in-memory only; it is never part of the HTTP response.
    try {
      const discordEnabled = (await getAppSetting(client, 'discord_enabled', 'false')).trim().toLowerCase() === 'true';
      if (discordEnabled) {
        const includeIp = (await getAppSetting(client, 'discord_include_ip', 'true')).trim().toLowerCase() !== 'false';
        const webhook = await resolveDiscordWebhookUrl(client);
        const senderLabel = isAnonymous ? 'Anonymous' : (senderName || 'Anonymous');
        const discordStatus = await sendDiscordNotification({
          senderLabel,
          content,
          senderIp: rawIp,
          includeIp,
          messageId: inserted.id as string,
          attachmentCount: attachments.length,
          webhookUrl: webhook.url,
        });
        console.log(`[submit-message] discord notify: ${discordStatus} (${webhook.source})`);
      }
    } catch (discordError) {
      console.error(
        '[submit-message] discord notify threw:',
        discordError instanceof Error ? discordError.message : discordError,
      );
    }

    return json(request, {
      id: inserted.id as string,
      created_at: inserted.created_at as string,
      status: inserted.status as string,
    });
  } catch (error) {
    console.error(
      '[submit-message] unexpected error:',
      error instanceof Error ? error.message : error,
    );
    return apiError(request, 500, 'SUBMIT_FAILED', 'Gagal mengirim pesan. Coba lagi.');
  }
});

