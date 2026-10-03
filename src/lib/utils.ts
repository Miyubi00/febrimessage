import clsx, { type ClassValue } from 'clsx';

/** Conditional className helper. */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}

/** dd MMM yyyy • HH:mm in the visitor's locale (id-ID by default). */
export function formatDateTime(value: string, locale = 'id-ID'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatShortDate(value: string, locale = 'id-ID'): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(date)
    .replace('.', ':');
}

/** "baru saja", "5 menit lalu", "3 hari lalu" */
export function formatRelative(value: string, locale = 'id-ID'): string {
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return '';
  const diffSeconds = Math.round((date - Date.now()) / 1000);
  const abs = Math.abs(diffSeconds);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diffSeconds), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSeconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(diffSeconds / 3600), 'hour');
  if (abs < 604_800) return rtf.format(Math.round(diffSeconds / 86_400), 'day');
  if (abs < 2_592_000) return rtf.format(Math.round(diffSeconds / 604_800), 'week');
  return rtf.format(Math.round(diffSeconds / 2_592_000), 'month');
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** i;
  return `${value >= 10 || i === 0 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

export function initialsOf(value: string): string {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(max - 1, 1))}…`;
}

/** Human readable message for a retry-after window (seconds). */
export function formatRetryAfter(seconds: number): string {
  const safe = Math.max(Math.ceil(seconds), 1);
  if (safe < 60) return `${safe} detik`;
  const minutes = Math.ceil(safe / 60);
  if (minutes < 60) return `${minutes} menit`;
  return `${Math.ceil(minutes / 60)} jam`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return count === 1 ? singular : plural;
}
