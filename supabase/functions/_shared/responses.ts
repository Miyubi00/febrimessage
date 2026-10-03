import { corsHeaders } from './cors.ts';

/**
 * Standard JSON response envelope.
 *
 * Errors always look like `{ error, message, retryAfter? }` which the browser
 * client parses into a typed `AppError` (see `src/lib/errors.ts`).
 */
export function json(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body ?? {}), {
    status,
    headers: {
      ...corsHeaders(request),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export function apiError(
  request: Request,
  status: number,
  code: string,
  message: string,
  retryAfter?: number,
): Response {
  const body: Record<string, unknown> = { error: code, message };
  const headers: Record<string, string> = {};

  if (typeof retryAfter === 'number' && retryAfter > 0) {
    body.retryAfter = retryAfter;
    headers['Retry-After'] = String(retryAfter);
  }

  return json(request, body, status, headers);
}

/** 405 helper — every function only accepts POST (plus the CORS pre-flight). */
export function methodNotAllowed(request: Request): Response {
  return apiError(request, 405, 'METHOD_NOT_ALLOWED', 'Metode tidak didukung.', undefined);
}

/** Reads and parses a JSON body, returning null when it is not an object. */
export async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json();
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Trimmed string coercion (never throws, never returns undefined). */
export function asString(value: unknown, maxLength = 2000): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, maxLength);
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
