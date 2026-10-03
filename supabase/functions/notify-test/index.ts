/**
 * Edge Function: `notify-test`
 *
 * Admin-only test for the Discord webhook integration. Sends a sample embed
 * (marked TEST) through the same pipeline `submit-message` uses, so the Settings
 * page "Kirim test" button can verify the webhook URL + toggles end to end.
 *
 * Contract: POST { webhookUrl? } with an admin JWT ->
 *   { ok: true, status: string, source: 'database' | 'secret' | 'draft' }
 *
 * When `webhookUrl` is supplied, the stored value is ignored and the given URL
 * is used — so the Settings page can test an unsaved draft. It is still
 * re-validated (https + discord.com/api/webhooks/) before any request leaves.
 */
import {
  getAppSetting,
  requireAdmin,
  resolveDiscordWebhookUrl,
  serviceClient,
  type DiscordWebhookConfig,
} from '../_shared/clients.ts';
import { preflight } from '../_shared/cors.ts';
import { sendDiscordNotification } from '../_shared/discord.ts';
import { hashActor } from '../_shared/ipHash.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { apiError, asString, json, methodNotAllowed, readJsonBody } from '../_shared/responses.ts';

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request);

  let client;
  try {
    client = serviceClient();
  } catch (error) {
    console.error('[notify-test] env error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'SERVER_MISCONFIGURED', 'Server belum dikonfigurasi dengan benar.');
  }

  const admin = await requireAdmin(request);
  if (admin instanceof Response) return admin;

  try {
    const actorHash = await hashActor(admin.userId, 'notify_test');
    const limited = await enforceRateLimit(request, client, {
      ipHash: actorHash,
      action: 'notify_test',
      limit: 5,
      windowSeconds: 60,
      message: 'Terlalu banyak test. Tunggu sebentar.',
    });
    if (limited) return limited;

    const discordEnabled =
      (await getAppSetting(client, 'discord_enabled', 'false')).trim().toLowerCase() === 'true';
    if (!discordEnabled) {
      return apiError(
        request,
        400,
        'DISCORD_DISABLED',
        'Aktifkan dulu "Kirim notifikasi ke Discord" di Settings.',
      );
    }

    const includeIp =
      (await getAppSetting(client, 'discord_include_ip', 'true')).trim().toLowerCase() !== 'false';

    const draftUrl = asString((await readJsonBody(request))?.webhookUrl, 2048).trim();
    const webhook: DiscordWebhookConfig = draftUrl
      ? { url: draftUrl, source: 'draft' }
      : await resolveDiscordWebhookUrl(client);
    if (webhook.source === 'none') {
      return apiError(
        request,
        400,
        'DISCORD_NO_WEBHOOK',
        'Webhook belum diisi. Tempel Discord Webhook URL di Settings, atau set secret DISCORD_WEBHOOK_URL.',
      );
    }

    const status = await sendDiscordNotification({
      senderLabel: 'Anonymous (TEST)',
      content: 'Ini pesan percobaan dari halaman Settings. Kalau kamu baca ini, webhook-nya jalan! 🎉',
      senderIp: null,
      includeIp,
      messageId: 'test',
      attachmentCount: 0,
      webhookUrl: webhook.url,
    });
    if (status.startsWith('failed') || status.startsWith('skipped:bad')) {
      return apiError(
        request,
        502,
        'DISCORD_SEND_FAILED',
        'Gagal mengirim ke Discord. Pastikan URL-nya benar (harus https://discord.com/api/webhooks/...).',
      );
    }

    return json(request, { ok: true, status, source: webhook.source });
  } catch (error) {
    console.error(
      '[notify-test] unexpected error:',
      error instanceof Error ? error.message : error,
    );
    return apiError(request, 500, 'NOTIFY_TEST_FAILED', 'Gagal mengirim test. Coba lagi.');
  }
});
