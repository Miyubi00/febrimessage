import { AppError, invokeEdge, logDevError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { MessageAttachmentRow, MessageRow } from '@/types/database';
import type {
  PrivateThread,
  PublicThread,
  SubmitMessageInput,
  SubmitMessageResult,
} from '@/types/message';

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

/**
 * Public inbox: only messages the owner explicitly published (`visibility =
 * 'public' — chosen at reply/publish time) are returned — RLS enforces the same
 * rule server-side, so this query can never leak the private inbox even if the
 * filter were removed.
 */
export async function fetchPublicThreads(profileId: string, limit = 30): Promise<PublicThread[]> {
  const { data: roots, error: rootsError } = await supabase
    .from('messages')
    .select('*')
    .eq('profile_id', profileId)
    .eq('visibility', 'public')
    .is('parent_id', null)
    .in('status', ['unread', 'read'])
    .order('created_at', { ascending: false })
    .limit(limit);

  if (rootsError) {
    logDevError('messageService.fetchPublicThreads', rootsError);
    throw new AppError('Gagal memuat pesan.', 'MESSAGES_FETCH_FAILED');
  }

  const rootRows = roots ?? [];
  if (rootRows.length === 0) return [];

  const rootIds = rootRows.map((row) => row.id);

  const { data: replies, error: repliesError } = await supabase
    .from('messages')
    .select('*')
    .in('parent_id', rootIds)
    .in('status', ['unread', 'read'])
    .order('created_at', { ascending: true });

  if (repliesError) {
    logDevError('messageService.fetchPublicThreads.replies', repliesError);
  }

  const replyRows = replies ?? [];
  const allIds = [...rootIds, ...replyRows.map((row) => row.id)];

  const { data: attachments, error: attachmentsError } = await supabase
    .from('message_attachments')
    .select('*')
    .in('message_id', allIds);

  if (attachmentsError) {
    logDevError('messageService.fetchPublicThreads.attachments', attachmentsError);
  }

  const attachmentsByMessage = groupBy<MessageAttachmentRow, string>(
    attachments ?? [],
    (row) => row.message_id,
  );
  const repliesByParent = groupBy<MessageRow, string>(replyRows, (row) => row.parent_id ?? '');

  return rootRows.map<PublicThread>((row) => {
    const threadReplies = repliesByParent.get(row.id) ?? [];
    // Public page shows the owner's answers only — sender follow-ups stay
    // private-link-only (also enforced by RLS).
    const adminReplies = threadReplies.filter((reply) => reply.author === 'admin');
    const lastReply = adminReplies.length > 0 ? adminReplies[adminReplies.length - 1] : undefined;

    return {
      id: row.id,
      senderLabel: row.is_anonymous ? 'Anonymous' : (row.sender_name ?? 'Anonymous'),
      isAnonymous: row.is_anonymous,
      content: row.content,
      createdAt: row.created_at,
      attachments: attachmentsByMessage.get(row.id) ?? [],
      reply: lastReply
        ? {
            id: lastReply.id,
            content: lastReply.content,
            createdAt: lastReply.created_at,
            attachments: attachmentsByMessage.get(lastReply.id) ?? [],
          }
        : null,
    };
  });
}

/**
 * Fetch a thread with a private access token (spec 46/56).
 *
 * The token is the credential: it is hashed server-side and matched against
 * `private_access`. Invalid/revoked tokens produce the same generic error so
 * existence cannot be probed.
 */
export async function fetchPrivateThread(token: string): Promise<PrivateThread> {
  const normalized = token.trim();
  if (!normalized) {
    throw new AppError('Pesan tidak ditemukan atau link sudah tidak valid.', 'PRIVATE_THREAD_NOT_FOUND');
  }

  const result = await invokeEdge<{ thread: PrivateThread }>('get-private-message', { token: normalized });
  if (!result.thread) {
    throw new AppError('Pesan tidak ditemukan atau link sudah tidak valid.', 'PRIVATE_THREAD_NOT_FOUND');
  }
  return result.thread;
}

/** Build the shareable private link for a raw token. */
export function privateThreadUrl(token: string): string {
  return `${window.location.origin}/message/${encodeURIComponent(token)}`;
}

/**
 * Send a follow-up reply as the thread owner (no account — the private
 * access token is the credential). Enforced server-side: only allowed while
 * the newest message is the admin's.
 */
export async function sendSenderReply(
  token: string,
  content: string,
): Promise<{ id: string; content: string; created_at: string }> {
  const result = await invokeEdge<{ reply: { id: string; content: string; created_at: string } }>(
    'sender-reply',
    { token: token.trim(), content },
  );
  return result.reply;
}

/**
 * Subscribe the sender's email for reply notifications on a private thread.
 * The token is the credential; the address lands in an admin-only table.
 */
export async function subscribeThread(token: string, email: string): Promise<void> {
  await invokeEdge<{ ok: boolean }>('subscribe-thread', { token: token.trim(), email: email.trim() });
}

/**
 * Submit a message through the `submit-message` Edge Function.
 * The browser never inserts into `messages` directly (no INSERT policy exists).
 */
export async function submitMessage(input: SubmitMessageInput): Promise<SubmitMessageResult> {
  return await invokeEdge<SubmitMessageResult>('submit-message', {
    profileId: input.profileId,
    senderName: input.senderName,
    isAnonymous: input.isAnonymous,
    content: input.content,
    honeypot: input.honeypot,
    captchaToken: input.captchaToken ?? '',
    attachmentPaths: input.attachmentPaths,
  });
}