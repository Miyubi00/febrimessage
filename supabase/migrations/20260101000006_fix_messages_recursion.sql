-- =============================================================================
-- 06 — Fix "infinite recursion detected in policy for relation messages" (42P17)
--
-- Root cause: the `messages_select_public_replies` policy queried
-- `public.messages` from *inside* a policy on `public.messages` itself.
-- Every SELECT on the table had to evaluate the policy, which SELECTed the
-- table again, which re-evaluated the policy... Postgres aborts that loop.
--
-- Fix: move the parent lookup into a SECURITY DEFINER helper. DEFINER
-- functions run as the owner and bypass RLS, so the check no longer
-- re-triggers the policy it lives in. The helper only reveals whether a
-- parent message is publicly visible (id + two booleans worth of truth),
-- never the private inbox.
-- =============================================================================

-- Helper: true when the given message id belongs to a published, visible thread.
create or replace function public.is_message_thread_public(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.messages parent
    where parent.id = p_message_id
      and parent.parent_id is null
      and parent.is_public = true
      and parent.status in ('unread', 'read')
  );
$$;

revoke all on function public.is_message_thread_public(uuid) from public;
grant execute on function public.is_message_thread_public(uuid) to anon, authenticated, service_role;

-- Replace the self-referencing policy with one that calls the helper.
drop policy if exists "messages_select_public_replies" on public.messages;

create policy "messages_select_public_replies"
  on public.messages for select
  to anon, authenticated
  using (
    parent_id is not null
    and status in ('unread', 'read')
    and public.is_message_thread_public(parent_id)
  );
