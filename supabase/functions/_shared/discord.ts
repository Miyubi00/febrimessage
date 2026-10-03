/**
 * Discord webhook notifier (shared).
 *
 * Sends a dark embed that mirrors the requested design:
 *
 *   💬 Pesan Baru
 *   Dari: Anonymous
 *   Pesan:
 *   <content>
 *   IP: `1.2.3.4`
 *   Anonymous Message • <WIB timestamp> • <locale timestamp>
 *
 * Privacy: the sender IP is passed in-memory from the submit handler — it is
 * stored separately in `message_meta` (admin-only RLS) and NEVER in a public
 * table. The webhook URL is resolved by the caller via
 * `resolveDiscordWebhookUrl()` (app_settings row first, DISCORD_WEBHOOK_URL
 * Edge Function secret as fallback) and is re-validated here, so a tampered
 * database row can never turn this into an arbitrary-URL proxy.
 */

export interface DiscordNotifyInput {
  senderLabel: string;
  content: string;
  /** Raw sender IP (in-memory only). Omitted from the embed when includeIp is false. */
  senderIp: string | null;
  includeIp: boolean;
  messageId: string;
  attachmentCount: number;
  /** Resolved webhook URL (Settings page value, else the DISCORD_WEBHOOK_URL secret). */
  webhookUrl: string;
}

/** `2026-10-01 20:25:51 WIB` — Asia/Jakarta regardless of server timezone. */
function formatWib(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} WIB`;
}

/** Second stamp like the screenshot (`10/1/2026 8:25 PM`). */
function formatLocale(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Jakarta',
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

/** Discord hard-caps embed descriptions at 4096 chars — trim, don't fail. */
function truncateForDiscord(value: string, max = 3900): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(max - 1, 1))}…`;
}

function isDiscordWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname !== 'discord.com' && !parsed.hostname.endsWith('.discord.com')) return false;
    return parsed.pathname.startsWith('/api/webhooks/');
  } catch {
    return false;
  }
}

/**
 * Fire-and-forget safe: resolves to a short status string and NEVER throws, so
 * a Discord outage can never break message submission.
 */
export async function sendDiscordNotification(input: DiscordNotifyInput): Promise<string> {
  const webhookUrl = (input.webhookUrl ?? '').trim();
  if (!webhookUrl) return 'skipped:no-webhook';
  if (!isDiscordWebhookUrl(webhookUrl)) {
    // Never log the URL itself — it is a credential.
    console.error('[discord] webhook URL is not a valid discord.com webhook URL; refusing to send.');
    return 'skipped:bad-webhook-url';
  }

  const now = new Date();
  const lines = [
    `Dari: ${input.senderLabel}`,
    '',
    'Pesan:',
    truncateForDiscord(input.content),
  ];

  if (input.includeIp && input.senderIp && input.senderIp !== 'unknown') {
    lines.push('', `IP: \`${input.senderIp}\``);
  }
  if (input.attachmentCount > 0) {
    lines.push('', `🖼️ ${input.attachmentCount} gambar terlampir (lihat di inbox admin).`);
  }
  lines.push('', `Anonymous Message • ${formatWib(now)} • ${formatLocale(now)}`);

  const payload = {
    embeds: [
      {
        title: '💬 Pesan Baru',
        description: lines.join('\n'),
        // Indigo left border like the screenshot (0x5865F2 = blurple).
        color: 0x5865f2,
        footer: { text: `id: ${input.messageId}` },
        timestamp: now.toISOString(),
      },
    ],
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response: Response;
    try {
      response = await fetch(`${webhookUrl}?wait=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      console.error('[discord] webhook rejected:', response.status, text.slice(0, 300));
      return `failed:http-${response.status}`;
    }
    return 'sent';
  } catch (error) {
    console.error('[discord] webhook threw:', error instanceof Error ? error.message : error);
    return 'failed:exception';
  }
}
