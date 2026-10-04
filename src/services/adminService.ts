import { AppError, invokeEdge, logDevError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { validateDiscordWebhookUrl } from '@/lib/validation';
import type {
  AdminRole,
  MessageAttachmentRow,
  MessageRow,
  MessageStatus,
  MessageVisibility,
} from '@/types/database';
import type {
  AdminMessagePage,
  AdminMessageQuery,
  AdminReplyInput,
  DeleteMessageResult,
  MessageWithMeta,
  PrivateLinkStatus,
} from '@/types/message';

/** Hard cap so a single request can never pull an unbounded number of rows. */
const ATTACHMENT_LOOKUP_LIMIT = 1000;

function groupBy<T, K extends string>(rows: readonly T[], keyOf: (row: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const list = map.get(key);
    if (list) list.push(row);
    else map.set(key, [row]);
  }
  return map;
}

/** Escape `%`/`_` so user input cannot turn into a wildcard search. */
function escapeLikeTerm(value: string): string {
  return value.replace(/[%_\\]/g, (match) => `\\${match}`);
}

/**
 * Admin inbox — paginated, filtered and sorted server-side.
 *
 * Requires an authenticated admin session: RLS (`messages_select_admin`) returns
 * nothing for anyone else.
 */
export async function fetchAdminMessages(query: AdminMessageQuery): Promise<AdminMessagePage> {
  const page = Math.max(1, query.page);
  const pageSize = Math.min(Math.max(query.pageSize, 1), 50);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let attachmentFilterIds: string[] | null = null;
  if (query.withImageOnly) {
    const { data: attachmentRows, error: attachmentError } = await supabase
      .from('message_attachments')
      .select('message_id')
      .limit(ATTACHMENT_LOOKUP_LIMIT);

    if (attachmentError) {
      logDevError('adminService.fetchAdminMessages.attachmentIndex', attachmentError);
      throw new AppError('Gagal memuat pesan.', 'MESSAGES_FETCH_FAILED');
    }

    attachmentFilterIds = Array.from(new Set((attachmentRows ?? []).map((row) => row.message_id)));
    if (attachmentFilterIds.length === 0) {
      return { items: [], total: 0, page, pageSize, unreadCount: await fetchUnreadCount(query.profileId) };
    }
  }

  let builder = supabase
    .from('messages')
    .select('*', { count: 'exact' })
    .eq('profile_id', query.profileId)
    .is('parent_id', null);

  if (query.status !== 'all') {
    builder = builder.eq('status', query.status);
  }
  if (query.anonymousOnly) {
    builder = builder.eq('is_anonymous', true);
  }
  if (query.search.trim()) {
    builder = builder.ilike('content', `%${escapeLikeTerm(query.search.trim())}%`);
  }
  if (attachmentFilterIds) {
    builder = builder.in('id', attachmentFilterIds);
  }

  builder = builder.order('created_at', { ascending: query.sort === 'oldest' }).range(from, to);

  const { data: rows, error, count } = await builder;

  if (error) {
    logDevError('adminService.fetchAdminMessages', error);
    throw new AppError('Gagal memuat pesan.', 'MESSAGES_FETCH_FAILED');
  }

  const rootRows = rows ?? [];
  const unreadCount = await fetchUnreadCount(query.profileId);

  if (rootRows.length === 0) {
    return { items: [], total: count ?? 0, page, pageSize, unreadCount };
  }

  const rootIds = rootRows.map((row) => row.id);

  const { data: replyRows, error: replyError } = await supabase
    .from('messages')
    .select('*')
    .in('parent_id', rootIds)
    .order('created_at', { ascending: true });

  if (replyError) logDevError('adminService.fetchAdminMessages.replies', replyError);

  const replies = replyRows ?? [];
  const allIds = [...rootIds, ...replies.map((row) => row.id)];

  // Sender IPs live in the admin-only message_meta table (never public).
  // Failure is non-fatal: the inbox still renders, just without the IP chip.
  let senderIpByMessage = new Map<string, string>();
  const { data: metaRows, error: metaError } = await supabase
    .from('message_meta')
    .select('message_id, sender_ip')
    .in('message_id', rootIds);

  if (metaError) {
    logDevError('adminService.fetchAdminMessages.senderIp', metaError);
  } else {
    senderIpByMessage = new Map(
      (metaRows ?? [])
        .filter((row) => typeof row.sender_ip === 'string' && row.sender_ip.length > 0)
        .map((row) => [row.message_id, row.sender_ip as string]),
    );
  }

  const { data: attachments, error: attachmentsError } = await supabase
    .from('message_attachments')
    .select('*')
    .in('message_id', allIds);

  if (attachmentsError) logDevError('adminService.fetchAdminMessages.attachments', attachmentsError);

  const attachmentsByMessage = groupBy<MessageAttachmentRow, string>(
    attachments ?? [],
    (row) => row.message_id,
  );
  const repliesByParent = groupBy<MessageRow, string>(replies, (row) => row.parent_id ?? '');

  const items = rootRows.map<MessageWithMeta>((row) => {
    const threadReplies = repliesByParent.get(row.id) ?? [];

    return {
      message: row,
      attachments: attachmentsByMessage.get(row.id) ?? [],
      replies: threadReplies.map((reply) => ({
        reply,
        attachments: attachmentsByMessage.get(reply.id) ?? [],
      })),
      senderIp: senderIpByMessage.get(row.id) ?? null,
    };
  });

  return { items, total: count ?? items.length, page, pageSize, unreadCount };
}

/** Number of unread root messages (drives the sidebar badge). */
export async function fetchUnreadCount(profileId: string): Promise<number> {
  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('status', 'unread')
    .is('parent_id', null);

  if (error) {
    logDevError('adminService.fetchUnreadCount', error);
    return 0;
  }
  return count ?? 0;
}

/* ------------------------------------------------------------------ */
/* Dashboard statistics                                                */
/* ------------------------------------------------------------------ */
export interface DailyCount {
  /** Local `yyyy-mm-dd` key. */
  date: string;
  /** Short weekday label, eg `Sen`. */
  label: string;
  count: number;
}

export interface DashboardStats {
  total: number;
  today: number;
  week: number;
  unread: number;
  publik: number;
  replied: number;
  images: number;
  /** Last 14 days (oldest first), root messages only, excluding deleted. */
  daily: DailyCount[];
}

function startOfDayLocal(value: Date): Date {
  const copy = new Date(value);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/** Monday 00:00 of the current week (local time). */
function startOfWeekLocal(value: Date): Date {
  const copy = startOfDayLocal(value);
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7));
  return copy;
}

function localDayKey(value: Date): string {
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
}

async function safeCount(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number> {
  try {
    const { count, error } = await query;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Dashboard numbers for one profile. Root messages only (`parent_id is null`,
 * excluding `deleted`); every query degrades to 0 instead of failing the
 * whole dashboard.
 */
export async function fetchDashboardStats(profileId: string): Promise<DashboardStats> {
  const now = new Date();
  const dayIso = startOfDayLocal(now).toISOString();
  const weekIso = startOfWeekLocal(now).toISOString();
  const spanStart = startOfDayLocal(new Date(now.getTime() - 13 * 86_400_000));

  const roots = () =>
    supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('profile_id', profileId)
      .is('parent_id', null)
      .neq('status', 'deleted');

  const [total, today, week, unread, publik, replied, images, series] = await Promise.all([
    safeCount(roots()),
    safeCount(roots().gte('created_at', dayIso)),
    safeCount(roots().gte('created_at', weekIso)),
    fetchUnreadCount(profileId),
    safeCount(roots().eq('is_public', true)),
    safeCount(
      supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .not('parent_id', 'is', null)
        .neq('status', 'deleted'),
    ),
    safeCount(
      supabase
        .from('message_attachments')
        .select('id, messages!inner(profile_id)', { count: 'exact', head: true })
        .eq('messages.profile_id', profileId),
    ),
    supabase
      .from('messages')
      .select('created_at')
      .eq('profile_id', profileId)
      .is('parent_id', null)
      .neq('status', 'deleted')
      .gte('created_at', spanStart.toISOString())
      .order('created_at', { ascending: true })
      .limit(5000)
      .then(
        (result) => result as { data: Array<{ created_at: string }> | null; error: unknown },
        () => ({ data: null, error: true }) as { data: null; error: unknown },
      ),
  ]);

  const buckets = new Map<string, number>();
  for (const row of series.data ?? []) {
    const key = localDayKey(new Date(row.created_at));
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  const weekday = new Intl.DateTimeFormat('id-ID', { weekday: 'short' });
  const daily: DailyCount[] = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(spanStart.getTime() + index * 86_400_000);
    const key = localDayKey(date);
    return { date: key, label: weekday.format(date).replace('.', ''), count: buckets.get(key) ?? 0 };
  });

  return { total, today, week, unread, publik, replied, images, daily };
}

/* ------------------------------------------------------------------ */
/* Moderation                                                          */
/* ------------------------------------------------------------------ */
export async function updateMessageStatus(id: string, status: MessageStatus): Promise<void> {
  const { error } = await supabase.from('messages').update({ status }).eq('id', id);
  if (error) {
    logDevError('adminService.updateMessageStatus', error);
    throw new AppError('Gagal memperbarui status pesan.', 'STATUS_UPDATE_FAILED');
  }
}

/**
 * Change a thread's visibility (spec 52). Runs server-side through
 * `set_thread_visibility` so the root and its reply move together atomically —
 * a thread can never end up half-visible. Any admin may call it (RLS-guarded in
 * the RPC); non-admins get a friendly error.
 */
export async function setThreadVisibility(messageId: string, visibility: MessageVisibility): Promise<void> {
  const { error } = await supabase.rpc('set_thread_visibility', {
    p_message_id: messageId,
    p_visibility: visibility,
  });

  if (error) {
    logDevError('adminService.setThreadVisibility', error);
    throw new AppError('Gagal memperbarui visibilitas pesan.', 'VISIBILITY_UPDATE_FAILED');
  }
}

/** Reply through the `admin-reply` Edge Function (server verifies the role). */
export async function replyToMessage(input: AdminReplyInput): Promise<MessageRow> {
  const result = await invokeEdge<{ reply: MessageRow; visibility: MessageVisibility }>('admin-reply', {
    messageId: input.messageId,
    content: input.content,
    visibility: input.visibility ?? 'public',
  });
  return result.reply;
}

/* ------------------------------------------------------------------ */
/* Private links (spec 60) — revoke/rotate state + actions             */
/*                                                                     */
/* Status is exposed through `admin_private_link_status`, which returns */
/* only booleans/timestamps. The hash and the raw token never reach an  */
/* admin browser.                                                       */
/* ------------------------------------------------------------------ */

/** Whether this thread currently has a working private link. */
export async function fetchPrivateLinkStatus(messageId: string): Promise<PrivateLinkStatus> {
  const { data, error } = await supabase.rpc('admin_private_link_status', {
    p_message_id: messageId,
  });

  if (error) {
    logDevError('adminService.fetchPrivateLinkStatus', error);
    throw new AppError('Gagal memuat status private link.', 'PRIVATE_LINK_STATUS_FAILED');
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    hasToken: Boolean(row?.has_token),
    createdAt: (row?.created_at as string | null) ?? null,
    revokedAt: (row?.revoked_at as string | null) ?? null,
  };
}

/**
 * Revoke a thread's private link (old URL dies instantly) or mint a fresh one.
 * `rotate` returns the raw token to show ONCE in the admin panel.
 */
export async function managePrivateLink(
  messageId: string,
  action: 'revoke' | 'rotate',
): Promise<{ token: string | null }> {
  const result = await invokeEdge<{ ok: boolean; action: string; token?: string }>('private-link', {
    messageId,
    action,
  });
  if (!result.ok) throw new AppError('Gagal memproses private link.', 'PRIVATE_LINK_FAILED');
  return { token: result.token ?? null };
}

/** Delete through the `delete-message` Edge Function (also cleans up Storage). */
export async function deleteMessage(messageId: string): Promise<DeleteMessageResult> {
  return await invokeEdge<DeleteMessageResult>('delete-message', { messageId });
}

/* ------------------------------------------------------------------ */
/* Notification settings (superadmin writes, admin reads)              */
/* ------------------------------------------------------------------ */
export interface NotificationSettings {
  discordEnabled: boolean;
  discordIncludeIp: boolean;
  /**
   * Webhook URL stored in app_settings (empty string when unset). Empty means
   * "use the DISCORD_WEBHOOK_URL secret instead" — see migration 08.
   */
  discordWebhookUrl: string;
}

function parseBooleanSetting(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

/** Read the Discord toggles + webhook URL (admin session required by RLS). */
export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', [
    'discord_enabled',
    'discord_include_ip',
    'discord_webhook_url',
  ]);

  if (error) {
    logDevError('adminService.fetchNotificationSettings', error);
    throw new AppError('Gagal memuat pengaturan notifikasi.', 'SETTINGS_FETCH_FAILED');
  }

  const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));
  return {
    discordEnabled: parseBooleanSetting(byKey.get('discord_enabled') ?? null, false),
    discordIncludeIp: parseBooleanSetting(byKey.get('discord_include_ip') ?? null, true),
    discordWebhookUrl: byKey.get('discord_webhook_url') ?? '',
  };
}

/**
 * Save the Discord notification settings, including the webhook URL itself
 * (migration 08), so an admin never has to touch the Supabase CLI. Only
 * superadmins can write (RLS `app_settings_manage_super`); everyone else gets a
 * friendly error. The URL is re-validated server-side before use.
 */
export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  const webhookError = validateDiscordWebhookUrl(settings.discordWebhookUrl);
  if (webhookError) {
    throw new AppError(webhookError, 'WEBHOOK_URL_INVALID');
  }

  const { error } = await supabase.from('app_settings').upsert([
    { key: 'discord_enabled', value: settings.discordEnabled ? 'true' : 'false' },
    { key: 'discord_include_ip', value: settings.discordIncludeIp ? 'true' : 'false' },
    { key: 'discord_webhook_url', value: settings.discordWebhookUrl.trim() },
  ]);

  if (error) {
    logDevError('adminService.saveNotificationSettings', error);
    throw new AppError(
      'Gagal menyimpan. Hanya superadmin yang boleh mengubah pengaturan ini.',
      'SETTINGS_SAVE_FAILED',
    );
  }
}

/**
 * Fire a test embed through the `notify-test` Edge Function.
 *
 * Pass the webhook URL currently in the form (possibly unsaved) so the test
 * exercises exactly what the admin typed; leave it out to use the stored value.
 */
export async function sendDiscordTest(webhookUrl?: string): Promise<string> {
  const result = await invokeEdge<{ ok: boolean; status: string }>('notify-test', {
    ...(webhookUrl ? { webhookUrl } : {}),
  });
  return result.status;
}

/* ------------------------------------------------------------------ */
/* Email notification settings (superadmin writes, admin reads)        */
/* ------------------------------------------------------------------ */
export interface EmailSettings {
  enabled: boolean;
  /** Admin inbox address for "new message" emails (empty = unset). */
  adminEmail: string;
}

/** Read the email notification toggle + admin address (admin session required by RLS). */
export async function fetchEmailSettings(): Promise<EmailSettings> {
  const { data, error } = await supabase.from('app_settings').select('key, value').in('key', [
    'email_notifications_enabled',
    'admin_notify_email',
  ]);

  if (error) {
    logDevError('adminService.fetchEmailSettings', error);
    throw new AppError('Gagal memuat pengaturan email.', 'SETTINGS_FETCH_FAILED');
  }

  const byKey = new Map((data ?? []).map((row) => [row.key, row.value]));
  return {
    enabled: parseBooleanSetting(byKey.get('email_notifications_enabled') ?? null, false),
    adminEmail: byKey.get('admin_notify_email') ?? '',
  };
}

/**
 * Save the email notification settings. Only superadmins can write (RLS);
 * everyone else gets a friendly error. Sending itself needs RESEND_API_KEY
 * + EMAIL_FROM as Edge Function secrets (see .env.example).
 */
export async function saveEmailSettings(settings: EmailSettings): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert([
    { key: 'email_notifications_enabled', value: settings.enabled ? 'true' : 'false' },
    { key: 'admin_notify_email', value: settings.adminEmail.trim() },
  ]);

  if (error) {
    logDevError('adminService.saveEmailSettings', error);
    throw new AppError(
      'Gagal menyimpan. Hanya superadmin yang boleh mengubah pengaturan ini.',
      'SETTINGS_SAVE_FAILED',
    );
  }
}

/* ------------------------------------------------------------------ */
/* Admin authentication                                                */
/* ------------------------------------------------------------------ */
export interface AdminSessionInfo {
  userId: string;
  email: string | null;
  role: AdminRole;
}

interface AdminLoginResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * Login is proxied through the `admin-login` Edge Function so that failed
 * attempts are rate limited by hashed IP before they reach GoTrue.
 */
export async function signInAsAdmin(email: string, password: string): Promise<AdminSessionInfo> {
  const session = await invokeEdge<AdminLoginResponse>('admin-login', { email, password });

  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });

  if (error) {
    logDevError('adminService.signInAsAdmin.setSession', error);
    throw new AppError('Gagal memulai sesi. Coba lagi.', 'SESSION_FAILED');
  }

  const info = await fetchCurrentAdmin();
  if (!info) {
    await supabase.auth.signOut();
    throw new AppError('Akun ini bukan admin.', 'NOT_ADMIN');
  }
  return info;
}

export async function signOutAdmin(): Promise<void> {
  await supabase.auth.signOut();
}

/** Resolve the signed-in user + their database role (never a hardcoded email). */
export async function fetchCurrentAdmin(): Promise<AdminSessionInfo | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return null;

  const { data: roleRow, error: roleError } = await supabase
    .from('admin_profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (roleError) {
    logDevError('adminService.fetchCurrentAdmin', roleError);
    return null;
  }
  if (!roleRow) return null;

  return {
    userId: userData.user.id,
    email: userData.user.email ?? null,
    role: roleRow.role,
  };
}

export async function requestPasswordReset(email: string): Promise<void> {
  const redirectTo = `${window.location.origin}/admin/login`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    logDevError('adminService.requestPasswordReset', error);
    throw new AppError('Gagal mengirim email reset password.', 'RESET_FAILED');
  }
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    logDevError('adminService.updatePassword', error);
    throw new AppError('Gagal memperbarui password. Minimal 8 karakter.', 'PASSWORD_UPDATE_FAILED');
  }
}