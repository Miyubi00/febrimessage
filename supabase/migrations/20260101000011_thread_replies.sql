-- =============================================================================
-- 11 — Conversation threads: who wrote what + many replies per root
--
-- MODEL:
--   * `messages.author` marks every row as 'admin' or 'sender'. All rows that
--     predate this migration keep working: roots stay 'sender', and the old
--     one-reply-per-root invariant guarantees every existing reply is admin's.
--   * Threads are conversations now: the two unique indexes that enforced a
--     single reply per root are dropped. Replies stay flat (parent_id = root),
--     ordered by created_at; turn-taking is enforced by the Edge Functions.
-- =============================================================================

alter table public.messages add column if not exists author text not null default 'sender';

update public.messages
   set author = 'admin'
 where parent_id is not null
   and author = 'sender';

alter table public.messages drop constraint if exists messages_author_check;
alter table public.messages
  add constraint messages_author_check check (author in ('admin', 'sender'));

-- Multiple replies per root (sender <-> admin turns).
drop index if exists public.messages_one_reply_per_root;
drop index if exists public.messages_root_message_id_unique;

-- -----------------------------------------------------------------------------
-- Public surface shows OWNER replies only. Sender follow-ups stay
-- private-link-only, even on public threads (the UI never renders them and
-- the database must not serve them either).
-- -----------------------------------------------------------------------------
drop policy if exists "messages_select_public_replies" on public.messages;
create policy "messages_select_public_replies"
  on public.messages for select
  to anon, authenticated
  using (
    parent_id is not null
    and author = 'admin'
    and status in ('unread', 'read')
    and public.is_message_thread_public(parent_id)
  );

drop policy if exists "attachments_select_public" on public.message_attachments;
create policy "attachments_select_public"
  on public.message_attachments for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.messages m
      where m.id = message_attachments.message_id
        and m.status in ('unread', 'read')
        and (
          (m.parent_id is null and m.visibility = 'public')
          or (
            m.parent_id is not null
            and m.author = 'admin'
            and public.is_message_thread_public(m.parent_id)
          )
        )
    )
  );

drop policy if exists "attachments_public_read" on storage.objects;
create policy "attachments_public_read"
  on storage.objects for select
  to anon, authenticated
  using (
    bucket_id = 'message-attachments'
    and exists (
      select 1
      from public.message_attachments a
      join public.messages m on m.id = a.message_id
      where a.storage_path = storage.objects.name
        and m.status in ('unread', 'read')
        and (
          (m.parent_id is null and m.visibility = 'public')
          or (
            m.parent_id is not null
            and m.author = 'admin'
            and public.is_message_thread_public(m.parent_id)
          )
        )
    )
  );
