-- =============================================================================
-- 02 — Row Level Security
--   * public visitors: READ a public profile, READ explicitly published messages,
--     and INSERT nothing directly (submission goes through the `submit-message`
--     Edge Function which uses the service role).
--   * admins are resolved from the database via public.is_admin() — the role is
--     never hardcoded in application code.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so policies can read the locked-down admin table)
-- -----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.id = auth.uid()
      and ap.role in ('admin', 'superadmin')
  );
$$;

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_profiles ap
    where ap.id = auth.uid()
      and ap.role = 'superadmin'
  );
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.is_superadmin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;
grant execute on function public.is_superadmin() to anon, authenticated, service_role;

alter table public.profiles            enable row level security;
alter table public.messages            enable row level security;
alter table public.message_attachments enable row level security;
alter table public.admin_profiles      enable row level security;
alter table public.rate_limits         enable row level security;

-- Idempotency: drop previous versions of the policies first
drop policy if exists "profiles_select_public"      on public.profiles;
drop policy if exists "profiles_insert_admin"       on public.profiles;
drop policy if exists "profiles_update_admin"       on public.profiles;
drop policy if exists "profiles_delete_admin"       on public.profiles;

drop policy if exists "messages_select_public"      on public.messages;
drop policy if exists "messages_select_public_replies" on public.messages;
drop policy if exists "messages_select_admin"       on public.messages;
drop policy if exists "messages_update_admin"       on public.messages;
drop policy if exists "messages_delete_admin"       on public.messages;

drop policy if exists "attachments_select_public"   on public.message_attachments;
drop policy if exists "attachments_select_admin"    on public.message_attachments;
drop policy if exists "attachments_write_admin"     on public.message_attachments;
drop policy if exists "attachments_delete_admin"    on public.message_attachments;

drop policy if exists "admin_profiles_select_self"  on public.admin_profiles;
drop policy if exists "admin_profiles_select_admin" on public.admin_profiles;
drop policy if exists "admin_profiles_manage_super" on public.admin_profiles;

drop policy if exists "rate_limits_select_super"    on public.rate_limits;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create policy "profiles_select_public"
  on public.profiles for select
  to anon, authenticated
  using (true);

create policy "profiles_insert_admin"
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

create policy "profiles_update_admin"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles_delete_admin"
  on public.profiles for delete
  to authenticated
  using (public.is_superadmin());

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
-- NOTE: there is intentionally NO insert policy. A browser (anon or even a
-- logged-in non-admin) can never write a message directly — inserts only happen
-- through the `submit-message` Edge Function using the service role.

create policy "messages_select_public"
  on public.messages for select
  to anon, authenticated
  using (
    is_public = true
    and parent_id is null
    and status in ('unread', 'read')
  );

-- Replies belonging to a published thread are readable as well
create policy "messages_select_public_replies"
  on public.messages for select
  to anon, authenticated
  using (
    parent_id is not null
    and status in ('unread', 'read')
    and exists (
      select 1
      from public.messages parent
      where parent.id = messages.parent_id
        and parent.is_public = true
        and parent.status in ('unread', 'read')
    )
  );

create policy "messages_select_admin"
  on public.messages for select
  to authenticated
  using (public.is_admin());

create policy "messages_update_admin"
  on public.messages for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "messages_delete_admin"
  on public.messages for delete
  to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- message_attachments
-- -----------------------------------------------------------------------------
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
          (m.is_public = true and m.parent_id is null)
          or exists (
            select 1
            from public.messages p
            where p.id = m.parent_id
              and p.is_public = true
              and p.status in ('unread', 'read')
          )
        )
    )
  );

create policy "attachments_select_admin"
  on public.message_attachments for select
  to authenticated
  using (public.is_admin());

create policy "attachments_write_admin"
  on public.message_attachments for insert
  to authenticated
  with check (public.is_admin());

create policy "attachments_delete_admin"
  on public.message_attachments for delete
  to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- admin_profiles — users may read their own row, admins may read every row,
-- superadmins manage the table. Nobody can insert themselves via the API.
-- -----------------------------------------------------------------------------
create policy "admin_profiles_select_self"
  on public.admin_profiles for select
  to authenticated
  using (id = auth.uid());

create policy "admin_profiles_select_admin"
  on public.admin_profiles for select
  to authenticated
  using (public.is_admin());

create policy "admin_profiles_manage_super"
  on public.admin_profiles for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- -----------------------------------------------------------------------------
-- rate_limits — no policy for anon/authenticated, therefore completely
-- inaccessible from the browser. Only the service role can read/write it.
-- -----------------------------------------------------------------------------
create policy "rate_limits_select_super"
  on public.rate_limits for select
  to authenticated
  using (public.is_superadmin());