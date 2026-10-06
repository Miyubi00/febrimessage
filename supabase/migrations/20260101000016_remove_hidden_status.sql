-- =============================================================================
-- 16 — Remove the dead `hidden` status
-- `hidden` was never written by any UI or Edge Function (only `spam` was, and
-- it is already gone via migration 15). Drop it from the check constraint so
-- only reachable states remain: unread / read / deleted.
-- Idempotent and data-safe: aborts loudly if a `hidden` row ever exists.
-- =============================================================================

alter table public.messages drop constraint if exists messages_status_check;
alter table public.messages
  add constraint messages_status_check check (status in ('unread', 'read', 'deleted'));
