/**
 * Outgoing email through Resend (https://resend.com).
 *
 * Configuration (Edge Function secrets):
 *   RESEND_API_KEY — required; without it every send is skipped (logged).
 *   EMAIL_FROM     — optional sender identity, eg. "AnonMessage <halo@liaaa.web.id>".
 *                    Falls back to Resend's onboarding address, which can only
 *                    deliver to the Resend account owner — verify a domain in
 *                    Resend for production use.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function apiKey(): string | null {
  const key = Deno.env.get('RESEND_API_KEY')?.trim();
  return key ? key : null;
}

function fromAddress(): string {
  const raw = Deno.env.get('EMAIL_FROM')?.trim() ?? '';
  // Tolerate a surrounding quote pair (e.g. pasted with quotes from the dashboard).
  const unquoted =
    raw.length >= 2 &&
    ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
      ? raw.slice(1, -1).trim()
      : raw;
  return unquoted || 'AnonMessage <onboarding@resend.dev>';
}

/** Minimal email shape check (the UI validates properly; this is a backstop). */
export function isPlausibleEmail(value: string): boolean {
  const candidate = value.trim();
  return candidate.length >= 5 && candidate.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate);
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  /** Full HTML body. */
  html: string;
}

/**
 * Send one email. Never throws — returns false (and logs) when the API key
 * is missing or Resend rejects the request, so notifications stay best-effort
 * and can never break message submission.
 */
export async function sendEmail(email: OutgoingEmail): Promise<boolean> {
  const key = apiKey();
  if (!key) {
    console.warn('[email] skipped: RESEND_API_KEY is not set.');
    return false;
  }
  if (!isPlausibleEmail(email.to)) {
    console.warn('[email] skipped: invalid recipient.');
    return false;
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [email.to.trim()],
        subject: email.subject,
        html: email.html,
        text: htmlToText(email.html),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error(`[email] resend rejected (${response.status}):`, detail.slice(0, 300));
      return false;
    }
    return true;
  } catch (error) {
    console.error('[email] send failed:', error instanceof Error ? error.message : error);
    return false;
  }
}

/** Strip tags for the plain-text part (inbox spam filters prefer multipart). */
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|blockquote|h\d|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
/** Tiny brand wrapper so every notification looks like the product. */
export function emailShell(title: string, body: string): string {
  // Inline styles + table layout so the card renders everywhere (Gmail/Outlook)
  // and matches the in-app story card: pastel blue header, white body.
  return [
    '<!doctype html>',
    '<html lang="id"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>',
    '<body style="margin:0;padding:24px;background:#EAF6FF;font-family:Arial,Helvetica,sans-serif">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">',
    '<tr><td align="center">',
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border-radius:24px;overflow:hidden;box-shadow:0 12px 32px -12px rgba(94,168,255,0.55)">',
    '<tr><td align="center" style="padding:26px 32px 20px;background:linear-gradient(135deg,#5EA8FF 0%,#A5A9F5 100%)">',
    '<p style="margin:0;font-size:11px;font-weight:bold;letter-spacing:2px;color:#FFFFFF">ANONMESSAGE</p>',
    `<h1 style="margin:10px 0 0;font-size:22px;font-weight:bold;color:#FFFFFF">${title}</h1>`,
    '</td></tr>',
    `<tr><td style="padding:26px 32px;font-size:14px;line-height:1.7;color:#334155">${body}</td></tr>`,
    '<tr><td style="padding:18px 32px;background:#F7FBFF;font-size:11px;color:#7191B4;text-align:center">',
    'Dikirim otomatis oleh AnonMessage. Jangan balas email ini.',
    '</td></tr>',
    '</table>',
    '</td></tr></table>',
    '</body></html>',
  ].join('');
}

/** Escape text interpolated into the HTML shell. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
