/**
 * Edge Function: `upload-message-attachment`
 *
 * Accepts a single image via multipart/form-data, re-validates it (size, declared
 * MIME type and magic bytes) and stores it in the PRIVATE `message-attachments`
 * bucket using the service role. The browser can never write to that bucket.
 *
 * The returned `storage_path` is what `submit-message` later verifies and attaches
 * to the created message — paths are namespaced under `pending/<uuid>/`.
 */
import { serviceClient } from '../_shared/clients.ts';
import { preflight } from '../_shared/cors.ts';
import { clientIp, hashIp } from '../_shared/ipHash.ts';
import { enforceRateLimit } from '../_shared/rateLimit.ts';
import { apiError, json, methodNotAllowed } from '../_shared/responses.ts';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_ATTACHMENT_BYTES,
  extensionForMime,
  sanitizeText,
  sniffImageMime,
} from '../_shared/validate.ts';

const BUCKET = 'message-attachments';

function randomHex(bytes = 16): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function safeFileName(raw: string, fallback: string): string {
  const cleaned = sanitizeText(raw).replace(/[\\/]/g, '').replace(/[^\w.\- ]/g, '');
  if (!cleaned || cleaned === '.') return fallback;
  return cleaned.slice(0, 120);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return preflight(request);
  if (request.method !== 'POST') return methodNotAllowed(request);

  let client;
  try {
    client = serviceClient();
  } catch (error) {
    console.error('[upload-message-attachment] env error:', error instanceof Error ? error.message : error);
    return apiError(request, 500, 'SERVER_MISCONFIGURED', 'Server belum dikonfigurasi dengan benar.');
  }

  try {
    const ipHash = await hashIp(clientIp(request), 'upload_attachment');

    const burst = await enforceRateLimit(request, client, {
      ipHash,
      action: 'upload_attachment',
      limit: 10,
      windowSeconds: 60,
      message: 'Terlalu banyak upload. Tunggu sebentar lalu coba lagi.',
    });
    if (burst) return burst;

    const hourly = await enforceRateLimit(request, client, {
      ipHash,
      action: 'upload_attachment_hourly',
      limit: 40,
      windowSeconds: 3600,
      message: 'Batas upload per jam tercapai. Coba lagi nanti.',
    });
    if (hourly) return hourly;

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return apiError(request, 400, 'INVALID_BODY', 'Format upload tidak valid.');
    }

    const uploaded = form.get('file');
    if (!uploaded || typeof uploaded === 'string') {
      return apiError(request, 400, 'FILE_REQUIRED', 'Tidak ada file yang diunggah.');
    }

    const size = uploaded.size ?? 0;
    if (size <= 0) {
      return apiError(request, 400, 'EMPTY_FILE', 'File tidak valid atau kosong.');
    }
    if (size > MAX_ATTACHMENT_BYTES) {
      return apiError(request, 413, 'FILE_TOO_LARGE', 'Ukuran gambar maksimal 5MB.');
    }

    const bytes = new Uint8Array(await uploaded.arrayBuffer());
    const mimeType = sniffImageMime(bytes);
    if (!mimeType || !ALLOWED_IMAGE_MIME_TYPES.includes(mimeType)) {
      return apiError(request, 400, 'INVALID_FILE', 'File ini bukan gambar JPG, PNG, WEBP, atau GIF yang valid.');
    }

    const extension = extensionForMime(mimeType);
    const sessionId = crypto.randomUUID();
    const storagePath = `pending/${sessionId}/${randomHex()}.${extension}`;
    const fileName = safeFileName(uploaded.name ?? '', `image.${extension}`);

    const { error: uploadError } = await client.storage
      .from(BUCKET)
      .upload(storagePath, bytes, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('[upload-message-attachment] storage upload failed:', uploadError.message);
      return apiError(request, 500, 'UPLOAD_FAILED', 'Gagal menyimpan gambar. Coba lagi.');
    }

    return json(request, {
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mimeType,
      file_size: size,
    });

  } catch (error) {
    console.error(
      '[upload-message-attachment] unexpected error:',
      error instanceof Error ? error.message : error,
    );
    return apiError(request, 500, 'UPLOAD_FAILED', 'Gagal mengunggah gambar. Coba lagi.');
  }
});
