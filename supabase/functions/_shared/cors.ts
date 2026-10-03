/**
 * CORS helpers shared by every Edge Function.
 *
 * Allowed origins come from the `ALLOWED_ORIGINS` secret (comma separated). When
 * it is not set we fall back to the local dev servers so the project works out of
 * the box; a wildcard is supported but not recommended for production.
 */
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];

function allowedOrigins(): string[] {
  const raw = Deno.env.get('ALLOWED_ORIGINS') ?? '';
  const parsed = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return parsed.length > 0 ? parsed : DEV_ORIGINS;
}

export function corsHeaders(request: Request): Record<string, string> {
  const allowed = allowedOrigins();
  const origin = request.headers.get('origin') ?? '';

  const allowOrigin = allowed.includes('*')
    ? '*'
    : allowed.includes(origin)
      ? origin
      : (allowed[0] ?? '');

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/** 204 response for the CORS pre-flight request. */
export function preflight(request: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
