import { clientIp } from './ipHash.ts';

export interface CaptchaVerdict {
  ok: boolean;
  /** True when captcha is disabled (no secret configured) — the token is ignored. */
  skipped: boolean;
}

const ENDPOINTS: Record<string, string> = {
  hcaptcha: 'https://api.hcaptcha.com/siteverify',
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
};

/**
 * Server-side captcha verification (hCaptcha or Cloudflare Turnstile).
 *
 * The secret lives only here. When `CAPTCHA_SECRET` is not configured the check is
 * skipped so local development works without keys — the same behaviour the
 * frontend has (`CaptchaField` renders nothing without a site key).
 */
export async function verifyCaptcha(request: Request, token: string): Promise<CaptchaVerdict> {
  const secret = Deno.env.get('CAPTCHA_SECRET') ?? '';
  if (!secret) return { ok: true, skipped: true };

  const provider = (Deno.env.get('CAPTCHA_PROVIDER') ?? 'hcaptcha').trim().toLowerCase();
  if (provider === 'disabled' || provider === 'none' || provider === 'off') {
    return { ok: true, skipped: true };
  }

  if (!token.trim()) return { ok: false, skipped: false };

  const endpoint = ENDPOINTS[provider] ?? ENDPOINTS.hcaptcha;

  const body = new URLSearchParams();
  body.set('secret', secret);
  body.set('response', token.trim());

  const ip = clientIp(request);
  if (ip && ip !== 'unknown') body.set('remoteip', ip);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!response.ok) {
      console.error('[captcha] verification request failed:', response.status);
      return { ok: false, skipped: false };
    }

    const payload = (await response.json()) as { success?: boolean };
    return { ok: payload.success === true, skipped: false };
  } catch (error) {
    console.error('[captcha] verification threw:', error instanceof Error ? error.message : error);
    return { ok: false, skipped: false };
  }
}
