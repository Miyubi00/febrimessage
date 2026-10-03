-- =============================================================================
-- 05 — Realtime publication
-- The admin inbox subscribes to postgres_changes on `messages`.
-- Replication honours RLS, so visitors never receive private inbox events.
-- =============================================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'messages'
     )
  then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Full old-record payloads are needed so DELETE events carry the row id.
alter table public.messages replica identity full;