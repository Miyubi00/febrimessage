/**
 * Private access tokens (spec 44/53/59).
 *
 * A token is 8 URL-safe characters (6 random bytes = 48 bits). Short enough
 * for a tidy link, still far out of brute-force reach behind the per-IP rate
 * limits on every token endpoint. The RAW token only ever exists (a) in the
 * HTTP response that created it and (b) in the sender's browser — the
 * database stores nothing but SHA-256(token + secret).
 */

const TOKEN_BYTES = 6;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Secret used to salt token hashes; falls back to the rate-limit secret. */
export function privateTokenSecret(): string {
  const dedicated = Deno.env.get('PRIVATE_TOKEN_SECRET');
  if (dedicated && dedicated.length >= 16) return dedicated;

  const fallback = Deno.env.get('RATE_LIMIT_SECRET');
  if (fallback && fallback.length >= 16) return fallback;

  return 'dev-only-insecure-private-token-secret';
}

/** 8-char URL-safe token (6 random bytes). */
export function generatePrivateToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/** SHA-256 hex of `token:secret` — the only form that touches the database. */
export async function hashPrivateToken(token: string): Promise<string> {
  const material = `${token.trim()}:${privateTokenSecret()}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Cheap shape check before we bother hashing a hostile input. Accepts the
 * current 8-char tokens as well as older, longer ones already issued.
 */
export function looksLikePrivateToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value.trim());
}
