import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from '@supabase/supabase-js';

import { supabase } from './supabase';

/** Normalised error shape used across the whole app. */
export class AppError extends Error {
  readonly code: string;
  readonly retryAfter: number | null;

  constructor(message: string, code = 'UNKNOWN', retryAfter: number | null = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

function parseErrorBody(value: unknown): { error: string; message: string; retryAfter: number | null } | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { error?: unknown; message?: unknown; retryAfter?: unknown };
  if (typeof candidate.message !== 'string') return null;
  return {
    error: typeof candidate.error === 'string' ? candidate.error : 'UNKNOWN',
    message: candidate.message,
    retryAfter: typeof candidate.retryAfter === 'number' ? candidate.retryAfter : null,
  };
}

/**
 * User-facing copy. Never leaks database internals, stack traces or credentials.
 */
export function toFriendlyMessage(error: unknown, fallback: string): string {
  if (isAppError(error)) return error.message;
  if (error instanceof Error && error.message && /rate limit/i.test(error.message)) {
    return 'Terlalu banyak permintaan. Coba lagi nanti.';
  }
  return fallback;
}

/** Retry-after (seconds) attached to a rate-limited response, when present. */
export function retryAfterOf(error: unknown): number | null {
  return isAppError(error) ? error.retryAfter : null;
}

/**
 * Wrapper around `supabase.functions.invoke` that turns every failure mode into a
 * typed `AppError` (HTTP error bodies, relay errors, network errors).
 */
export async function invokeEdge<TResponse>(
  functionName: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
    headers: { 'x-client-info': 'anon-message-web' },
  });

  if (error) {
    if (error instanceof FunctionsHttpError) {
      let payload: unknown = null;
      try {
        payload = await error.context.json();
      } catch {
        payload = null;
      }

      const parsed = parseErrorBody(payload);
      if (parsed) throw new AppError(parsed.message, parsed.error, parsed.retryAfter);
      throw new AppError('Terjadi kesalahan pada server. Coba lagi.', 'HTTP_ERROR');
    }

    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      if (import.meta.env.DEV) console.warn(`[edge:${functionName}] unavailable`, error.name);
      throw new AppError(
        `Fungsi "${functionName}" tidak dapat dihubungi. Pastikan sudah di-deploy.`,
        'FUNCTION_UNAVAILABLE',
      );
    }

    throw new AppError('Terjadi kesalahan. Coba lagi.', 'EDGE_ERROR');
  }

  if (data === null || data === undefined) {
    throw new AppError('Respons server kosong. Coba lagi.', 'EMPTY_RESPONSE');
  }

  return data as TResponse;
}

/** Development-only logging that strips anything sensitive. */
export function logDevError(scope: string, error: unknown): void {
  if (!import.meta.env.DEV) return;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[${scope}] ${message}`);
}