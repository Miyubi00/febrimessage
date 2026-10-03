import { AppError, invokeEdge, logDevError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { MessageAttachmentRow, MessageRow } from '@/types/database';
import type { PublicThread, SubmitMessageInput, SubmitMessageResult } from '@/types/message';

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
 * Public inbox: only messages the owner explicitly published (`is_public = true`)
 * are returned — RLS enforces the same rule server-side, so this query can never
 * leak the private inbox even if the filter were removed.
 */
export async function fetchPublicThreads(profileId: string, limit = 30): Promise<PublicThread[]> {
  const { data: roots, error: rootsError } = await supabase
    .from('messages')
    .select('*')
    .eq('profile_id', profileId)
    .eq('is_public', true)
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
    const lastReply = threadReplies.length > 0 ? threadReplies[threadReplies.length - 1] : undefined;

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