-- =============================================================================
-- 15 — Remove the spam feature + enforce a single attachment per message
--   1. Permanently delete rows still marked as `spam` (cascades to their
--      replies through parent_id and to their attachment rows through
--      message_id — see migration 01 foreign keys).
--   2. Rewrite the `messages_status_check` constraint without 'spam' so the
--      value can never be written again.
--   3. Enforce "one photo per message" at the database level with a unique
--      index on `message_attachments.message_id`.
--
-- Idempotent (`if exists` / `if not exists`) and data-safe: only rows with
-- status = 'spam' are removed, everything else is untouched.
-- NOTE: storage objects of deleted spam attachments (if any) must be removed
-- via Dashboard > Storage — SQL cannot reach the object store.
-- =============================================================================

-- 1. Delete spam rows (RLS is bypassed for migration/DDL role; cascades apply).
delete from public.messages where status = 'spam';

-- 2. Status check without 'spam'.
alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages
  add constraint messages_status_check check (status in ('unread', 'read', 'hidden', 'deleted'));

-- 3. One attachment per message, enforced by the database.
create unique index if not exists message_attachments_message_id_key
  on public.message_attachments (message_id);
