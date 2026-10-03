import type { ApiErrorBody, PendingAttachment } from '@/types/message';

import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';
import {
  MAX_ATTACHMENT_BYTES,
  MAX_BACKGROUND_BYTES,
  assertImageFile,
  buildPublicStorageUrl,
} from './validation';

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */
export class UploadError extends Error {
  readonly code: string;
  readonly retryAfter: number | null;

  constructor(message: string, code = 'UPLOAD_FAILED', retryAfter: number | null = null) {
    super(message);
    this.name = 'UploadError';
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { message?: unknown; error?: unknown };
  return typeof candidate.message === 'string' && typeof candidate.error === 'string';
}

export interface UploadProgressHandler {
  (percent: number): void;
}

/** Prefer the signed-in admin token, fall back to the anon key for public flows. */
async function currentAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? SUPABASE_ANON_KEY;
}

function reportProgress(
  handler: UploadProgressHandler | undefined,
  loaded: number,
  total: number,
): void {
  if (!handler || !total) return;
  handler(Math.min(99, Math.round((loaded / total) * 100)));
}

/* ------------------------------------------------------------------ */
/* Message attachments — through the Edge Function                     */
/* ------------------------------------------------------------------ */
/**
 * Upload a single image to `upload-message-attachment` using XHR so we get real
 * progress events. The server re-validates MIME type, magic bytes and size
 * before the object is stored in the private `message-attachments` bucket.
 */
export async function uploadPendingAttachment(
  file: File,
  onProgress?: UploadProgressHandler,
): Promise<PendingAttachment> {
  const clientError = await assertImageFile(file, MAX_ATTACHMENT_BYTES);
  if (clientError) throw new UploadError(clientError, 'INVALID_FILE');

  const token = await currentAccessToken();
  const endpoint = `${SUPABASE_URL}/functions/v1/upload-message-attachment`;

  return await new Promise<PendingAttachment>((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, file.name);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('x-client-info', 'anon-message-web');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) reportProgress(onProgress, event.loaded, event.total);
    };

    xhr.onload = () => {
      let payload: unknown = null;
      try {
        payload = JSON.parse(xhr.responseText);
      } catch {
        payload = null;
      }

      if (xhr.status >= 200 && xhr.status < 300 && payload && typeof payload === 'object') {
        onProgress?.(100);
        resolve(payload as PendingAttachment);
        return;
      }

      if (isApiErrorBody(payload)) {
        reject(new UploadError(payload.message, payload.error, payload.retryAfter ?? null));
        return;
      }

      if (xhr.status === 404) {
        reject(
          new UploadError(
            'Fungsi "upload-message-attachment" belum di-deploy.',
            'FUNCTION_MISSING',
          ),
        );
        return;
      }

      if (xhr.status === 413) {
        reject(new UploadError('Ukuran gambar terlalu besar.', 'FILE_TOO_LARGE'));
        return;
      }

      if (xhr.status === 429) {
        reject(
          new UploadError('Terlalu banyak upload. Tunggu sebentar lalu coba lagi.', 'RATE_LIMITED'),
        );
        return;
      }

      reject(new UploadError('Gagal mengunggah gambar. Coba lagi.', 'UPLOAD_FAILED'));
    };

    xhr.onerror = () => {
      reject(new UploadError('Koneksi terputus saat mengunggah gambar.', 'NETWORK_ERROR'));
    };

    xhr.send(form);
  });
}

/* ------------------------------------------------------------------ */
/* Profile assets (avatars / backgrounds) — direct to Supabase Storage  */
/* ------------------------------------------------------------------ */
const MIME_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export interface UploadedAsset {
  path: string;
  publicUrl: string;
}

/**
 * Upload an avatar/background with progress. Storage RLS only allows this for an
 * authenticated admin, so anonymous visitors cannot write to these buckets.
 */
export async function uploadProfileAsset(
  bucket: 'avatars' | 'backgrounds',
  file: File,
  onProgress?: UploadProgressHandler,
): Promise<UploadedAsset> {
  const maxBytes = bucket === 'backgrounds' ? MAX_BACKGROUND_BYTES : MAX_ATTACHMENT_BYTES;
  const clientError = await assertImageFile(file, maxBytes);
  if (clientError) throw new UploadError(clientError, 'INVALID_FILE');

  const extension = MIME_EXTENSION[file.type] ?? 'bin';
  const path = `${bucket === 'avatars' ? 'avatar' : 'background'}-${randomId()}.${extension}`;
  const token = await currentAccessToken();

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`, true);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('cache-control', '3600');
    xhr.setRequestHeader('x-upsert', 'false');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) reportProgress(onProgress, event.loaded, event.total);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
        return;
      }
      if (xhr.status === 401 || xhr.status === 403) {
        reject(new UploadError('Sesi admin berakhir. Login ulang lalu coba lagi.', 'NOT_AUTHORIZED'));
        return;
      }
      reject(new UploadError('Gagal mengunggah file. Coba lagi.', 'UPLOAD_FAILED'));
    };

    xhr.onerror = () => reject(new UploadError('Koneksi terputus saat mengunggah.', 'NETWORK_ERROR'));

    xhr.send(file);
  });

  return { path, publicUrl: buildPublicStorageUrl(SUPABASE_URL, bucket, path) };
}

/** Best-effort delete of a previously uploaded asset (never blocks the UI). */
export async function removeProfileAsset(
  bucket: 'avatars' | 'backgrounds',
  path: string | null,
): Promise<void> {
  if (!path) return;
  try {
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    // Cleanup failure is non-fatal — the DB row already points at the new file.
  }
}

/* ------------------------------------------------------------------ */
/* Attachment URLs (private bucket => short-lived signed URLs)         */
/* ------------------------------------------------------------------ */
interface CachedUrl {
  url: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, CachedUrl>();
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * Resolve a readable URL for a file in the private `message-attachments` bucket.
 *
 * RLS decides whether the current visitor may read the object: admins can read
 * everything, anonymous visitors only get attachments of published messages.
 */
export async function getAttachmentUrl(storagePath: string): Promise<string | null> {
  const now = Date.now();
  const cached = signedUrlCache.get(storagePath);
  if (cached && cached.expiresAt > now + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from('message-attachments')
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) return null;

  signedUrlCache.set(storagePath, {
    url: data.signedUrl,
    expiresAt: now + SIGNED_URL_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}

/** Batch helper — resolves many attachment paths in parallel. */
export async function getAttachmentUrls(
  storagePaths: readonly string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(storagePaths.filter(Boolean)));
  const entries = await Promise.all(
    unique.map(async (path) => [path, await getAttachmentUrl(path)] as const),
  );

  const result: Record<string, string> = {};
  for (const [path, url] of entries) {
    if (url) result[path] = url;
  }
  return result;
}

export function clearAttachmentUrlCache(): void {
  signedUrlCache.clear();
}


