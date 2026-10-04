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
  return [
    '<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1E3A5F">',
    `<h2 style="margin:0 0 12px;font-size:20px">${title}</h2>`,
    `<div style="font-size:14px;line-height:1.6">${body}</div>`,
    '<p style="margin:20px 0 0;font-size:12px;color:#7191B4">AnonMessage — pesan anonim</p>',
    '</div>',
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
