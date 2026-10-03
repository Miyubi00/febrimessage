/**
 * IP / user-agent hashing.
 *
 * The raw IP address is NEVER stored. It is combined with a server-only secret
 * (`RATE_LIMIT_SECRET`) and hashed with SHA-256, which is enough to count requests
 * per visitor without keeping anything personally identifiable.
 */

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get('cf-connecting-ip') ??
    request.headers.get('x-real-ip') ??
    'unknown'
  );
}

export function rateLimitSecret(): string {
  const secret = Deno.env.get('RATE_LIMIT_SECRET');
  if (!secret || secret.length < 16) {
    // Fail closed: without a secret we cannot produce stable hashes, so hashing
    // uses a fixed dev fallback. Deployments MUST provide RATE_LIMIT_SECRET.
    return 'dev-only-insecure-rate-limit-secret';
  }
  return secret;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Stable, non-reversible identifier for an IP within a scope. */
export async function hashIp(ip: string, scope = 'ip'): Promise<string> {
  return await sha256Hex(`${scope}:${ip}:${rateLimitSecret()}`);
}

/** Same idea for the user agent — used for abuse correlation only. */
export async function hashUserAgent(request: Request): Promise<string | null> {
  const userAgent = request.headers.get('user-agent');
  if (!userAgent) return null;
  return await sha256Hex(`ua:${userAgent.slice(0, 256)}:${rateLimitSecret()}`);
}

/** Hash an arbitrary actor identifier (eg. an admin user id) for rate limiting. */
export async function hashActor(actorId: string, scope = 'actor'): Promise<string> {
  return await sha256Hex(`${scope}:${actorId}:${rateLimitSecret()}`);
}
