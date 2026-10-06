/**
 * Server-side validation. Mirrors the limits in `src/lib/validation.ts` — the
 * browser copy is only a UX nicety, this file is the security boundary.
 */

export type AllowedImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

export const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;
export const SENDER_NAME_MAX = 20;
export const MESSAGE_MAX = 100;
export const REPLY_MAX = 300;
export const MAX_ATTACHMENTS = 1;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

export const ALLOWED_IMAGE_MIME_TYPES: readonly AllowedImageMime[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];

const MIME_EXTENSIONS: Record<AllowedImageMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

export function countChars(value: string): number {
  return Array.from(value).length;
}

export function sanitizeText(value: string): string {
  return value.replace(CONTROL_CHARS, '').replace(ZERO_WIDTH, '').replace(/\s+/g, ' ').trim();
}

export function sanitizeMultiline(value: string): string {
  return value
    .replace(CONTROL_CHARS, '')
    .replace(ZERO_WIDTH, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Blocks `javascript:`/`data:` style payloads from being stored as links. */
export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function extensionForMime(mime: AllowedImageMime): string {
  return MIME_EXTENSIONS[mime];
}

/** Magic-byte sniffing — the type is decided by the bytes, never the client. */
export function sniffImageMime(bytes: Uint8Array): AllowedImageMime | null {
  const startsWith = (signature: readonly number[]): boolean =>
    bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);

  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'image/gif';

  // WEBP => "RIFF" .... "WEBP"
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  const hasRiff = startsWith(riff);
  const hasWebp =
    bytes.length >= 12 && webp.every((byte, index) => bytes[8 + index] === byte);

  if (hasRiff && hasWebp) return 'image/webp';
  return null;
}

/** Storage path shape produced by `upload-message-attachment`. */
export const PENDING_PATH_REGEX =
  /^pending\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{32}\.(jpg|png|webp|gif)$/;

export function isValidPendingPath(path: string): boolean {
  return PENDING_PATH_REGEX.test(path);
}
