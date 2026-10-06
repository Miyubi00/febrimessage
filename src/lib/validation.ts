import type { AllowedImageMime } from '@/types/database';

/* ------------------------------------------------------------------ */
/* Limits — mirrored server-side in supabase/functions/_shared/validate */
/* ------------------------------------------------------------------ */
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;
export const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;

export const DISPLAY_NAME_MAX = 40;
export const DESCRIPTION_MAX = 160;
export const PRONOUNS_MAX = 20;

export const SENDER_NAME_MAX = 20;
export const MESSAGE_MAX = 100;
export const REPLY_MAX = 300;

export const MAX_ATTACHMENTS = 1;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_BACKGROUND_BYTES = 8 * 1024 * 1024; // 8 MB

export const ALLOWED_IMAGE_MIME_TYPES: readonly AllowedImageMime[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

export const ACCEPT_IMAGE_ATTR = ALLOWED_IMAGE_MIME_TYPES.join(',');

/* ------------------------------------------------------------------ */
/* Primitive helpers                                                   */
/* ------------------------------------------------------------------ */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

/** Strip control characters / zero-width junk and collapse whitespace. */
export function sanitizeText(value: string): string {
  return value.replace(CONTROL_CHARS, '').replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim();
}

/** Same as sanitizeText but keeps (at most double) line breaks. */
export function sanitizeMultiline(value: string): string {
  return value
    .replace(CONTROL_CHARS, '')
    .replace(ZERO_WIDTH, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Grapheme-aware character count (matches what the user sees). */
export function countChars(value: string): number {
  return Array.from(value).length;
}

/* ------------------------------------------------------------------ */
/* Field validators — return an error string, or null when valid       */
/* ------------------------------------------------------------------ */
export function validateUsername(value: string): string | null {
  const candidate = value.trim().toLowerCase();
  if (!candidate) return 'Username wajib diisi.';
  if (!USERNAME_REGEX.test(candidate)) {
    return 'Username 3-30 karakter, hanya huruf kecil, angka, dan underscore.';
  }
  return null;
}

export function validateDisplayName(value: string): string | null {
  const candidate = sanitizeText(value);
  if (!candidate) return 'Nama tampilan wajib diisi.';
  if (countChars(candidate) > DISPLAY_NAME_MAX) {
    return `Nama tampilan maksimal ${DISPLAY_NAME_MAX} karakter.`;
  }
  return null;
}

export function validateDescription(value: string): string | null {
  if (countChars(value.trim()) > DESCRIPTION_MAX) {
    return `Deskripsi maksimal ${DESCRIPTION_MAX} karakter.`;
  }
  return null;
}

export function validatePronouns(value: string): string | null {
  if (countChars(value.trim()) > PRONOUNS_MAX) {
    return `Pronouns maksimal ${PRONOUNS_MAX} karakter.`;
  }
  return null;
}

export function validateSenderName(value: string, isAnonymous: boolean): string | null {
  if (isAnonymous) return null;
  const candidate = sanitizeText(value);
  if (!candidate) return 'Isi nama kamu atau centang "Kirim sebagai anonim".';
  if (countChars(candidate) > SENDER_NAME_MAX) {
    return `Nama maksimal ${SENDER_NAME_MAX} karakter.`;
  }
  return null;
}

export function validateMessageContent(value: string, max = MESSAGE_MAX): string | null {
  const candidate = sanitizeMultiline(value);
  if (!candidate) return 'Pesan tidak boleh kosong.';
  if (countChars(candidate) > max) return `Pesan maksimal ${max} karakter.`;
  return null;
}
/** Email address for notifications (empty allowed = no notifications). */
export function validateEmail(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;
  if (candidate.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate)) {
    return 'Alamat email tidak valid.';
  }
  return null;
}

export function validateDiscordUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;
  return validateHttpUrl(candidate, 'Link Discord');
}

export function validateWebsiteUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;
  return validateHttpUrl(candidate, 'Link website');
}

/** Roblox profile link shown as an icon button under the username. */
export function validateRobloxUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;
  return validateHttpUrl(candidate, 'Link Roblox');
}

/**
 * Webhook URL for message notifications. Empty is valid (= no webhook yet, the
 * DISCORD_WEBHOOK_URL secret is used instead). Mirrors the server-side check in
 * `supabase/functions/_shared/discord.ts`.
 */
export function validateDiscordWebhookUrl(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) return null;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return 'URL webhook tidak valid.';
  }
  if (parsed.protocol !== 'https:') return 'URL webhook harus memakai https.';
  if (parsed.hostname !== 'discord.com' && !parsed.hostname.endsWith('.discord.com')) {
    return 'URL webhook harus dari discord.com (atau *.discord.com).';
  }
  if (!parsed.pathname.startsWith('/api/webhooks/')) {
    return 'URL webhook Discord tidak lengkap — salin penuh dari menu Integrations.';
  }
  return null;
}

function validateHttpUrl(value: string, label: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return `${label} tidak valid.`;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return `${label} harus menggunakan http atau https.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* File validation (frontend pre-flight — the server re-validates)     */
/* ------------------------------------------------------------------ */
export function isAllowedImageMime(mime: string): mime is AllowedImageMime {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mime);
}

export function validateImageFile(
  file: File,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): string | null {
  if (!file || file.size === 0) return 'File tidak valid atau kosong.';
  if (!isAllowedImageMime(file.type)) {
    return 'Format tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF.';
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return `Ukuran file maksimal ${mb}MB.`;
  }
  return null;
}

const MAGIC_SIGNATURES: ReadonlyArray<{ mime: AllowedImageMime; bytes: number[] }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', bytes: [0x47, 0x49, 0x46, 0x38] },
];

/**
 * Best-effort magic-byte sniffing in the browser so a mislabelled file is caught
 * before the upload starts. The Edge Function repeats this against the real
 * bytes — this is a UX nicety, never the security boundary.
 */
export async function sniffImageMime(file: File): Promise<AllowedImageMime | null> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());

  for (const signature of MAGIC_SIGNATURES) {
    if (signature.bytes.every((byte, index) => header[index] === byte)) {
      return signature.mime;
    }
  }

  // WEBP => "RIFF" .... "WEBP"
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  const hasRiff = riff.every((byte, index) => header[index] === byte);
  const hasWebp = webp.every((byte, index) => header[8 + index] === byte);
  if (hasRiff && hasWebp) return 'image/webp';

  return null;
}

/** Full client-side gate used before handing a file to the uploader. */
export async function assertImageFile(
  file: File,
  maxBytes: number = MAX_ATTACHMENT_BYTES,
): Promise<string | null> {
  const basicError = validateImageFile(file, maxBytes);
  if (basicError) return basicError;

  const sniffed = await sniffImageMime(file);
  if (!sniffed) return 'File ini bukan gambar yang valid.';
  if (sniffed !== file.type) return 'Tipe file tidak cocok dengan isinya.';
  return null;
}

/** Public storage URL for a freshly uploaded asset. */
export function buildPublicStorageUrl(
  supabaseUrl: string,
  bucket: 'avatars' | 'backgrounds',
  path: string,
): string {
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
}

/** Extract the object path from a public storage URL (to delete the old file). */
export function storagePathFromPublicUrl(
  url: string | null,
  bucket: 'avatars' | 'backgrounds',
): string | null {
  if (!url) return null;
  const marker = `/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const path = url.slice(index + marker.length).split('?')[0];
  if (!path || path.includes('..')) return null;
  return decodeURIComponent(path);
}