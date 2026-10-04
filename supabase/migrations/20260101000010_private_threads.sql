-- =============================================================================
-- 10 — Public / Private threads + private access tokens
--
-- MODEL (spec 43–67):
--   * Every root message belongs to exactly one THREAD. `visibility` lives on the
--     root and is inherited by its reply, so a thread can never be half-private.
--   * visibility = 'private'  -> the thread never reaches the public page and is
--     readable only by (a) admins and (b) whoever holds the private access token.
--   * visibility = 'public'   -> thread is rendered on the public page.
--   * `is_public` is kept as a MIRROR of visibility (synced by trigger) so the
--     existing RLS/storage policies and UI keep working unchanged.
--   * The private access token is random (32 bytes, URL-safe). Only its
--     SHA-256(token + server secret) is stored, in `private_access`, a table with
--     RLS enabled and NO policies: the browser can never read a token or a hash.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. visibility + root_message_id
-- -----------------------------------------------------------------------------
alter table public.messages add column if not exists visibility text;

-- Backfill from the legacy flag (existing rows keep their current reachability).
update public.messages
   set visibility = case when is_public then 'public' else 'private' end
 where visibility is null;

alter table public.messages alter column visibility set default 'public';
alter table public.messages alter column visibility set not null;

alter table public.messages drop constraint if exists messages_visibility_check;
alter table public.messages
  add constraint messages_visibility_check check (visibility in ('public', 'private'));

alter table public.messages add column if not exists root_message_id uuid;

update public.messages
   set root_message_id = parent_id
 where parent_id is not null
   and root_message_id is null;

alter table public.messages drop constraint if exists messages_root_message_id_fkey;
alter table public.messages
  add constraint messages_root_message_id_fkey
  foreign key (root_message_id) references public.messages (id) on delete cascade;

create index if not exists messages_visibility_idx
  on public.messages (profile_id, visibility, created_at desc);

-- Integrity (spec 66): exactly one reply per root, and a root can only be the
-- root of its own thread.
create unique index if not exists messages_one_reply_per_root
  on public.messages (parent_id) where parent_id is not null;

create unique index if not exists messages_root_message_id_unique
  on public.messages (root_message_id) where root_message_id is not null;

-- -----------------------------------------------------------------------------
-- 2. private_access — token hashes. RLS on, NO policies: service role only.
-- -----------------------------------------------------------------------------
create table if not exists public.private_access (
  message_id uuid primary key references public.messages (id) on delete cascade,
  token_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists private_access_token_hash_idx on public.private_access (token_hash);

alter table public.private_access enable row level security;

-- Deliberately no policy for anon/authenticated: the raw token never exists in
-- the database and the hash is only ever touched by Edge Functions.
revoke all on public.private_access from anon, authenticated;
grant all on public.private_access to service_role;

-- -----------------------------------------------------------------------------
-- 3. Thread integrity trigger
--    * keeps is_public mirrored from visibility
--    * roots have root_message_id = null
--    * replies inherit the root's visibility (no public reply on a private root)
--    * replies may only target a live root (one level deep)
-- -----------------------------------------------------------------------------
create or replace function public.messages_enforce_thread()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent public.messages%rowtype;
begin
  -- legacy mirror
  new.is_public := (new.visibility = 'public');

  if new.parent_id is null then
    new.root_message_id := null;
    return new;
  end if;

  select * into v_parent from public.messages where id = new.parent_id;
  if not found then
    raise exception 'parent message % does not exist', new.parent_id;
  end if;
  if v_parent.parent_id is not null then
    raise exception 'replies may only target a root message';
  end if;
  if v_parent.status = 'deleted' then
    raise exception 'cannot reply to a deleted message';
  end if;

  new.root_message_id := v_parent.id;
  -- Automatic privacy inheritance (spec 50) — a reply can never be more public
  -- than the thread it belongs to.
  new.visibility := v_parent.visibility;
  new.is_public := (new.visibility = 'public');
  return new;
end;
$$;

drop trigger if exists messages_enforce_thread on public.messages;
create trigger messages_enforce_thread
  before insert or update on public.messages
  for each row execute function public.messages_enforce_thread();

-- Propagate a root's visibility change to its reply (spec 52).
create or replace function public.messages_propagate_visibility()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.parent_id is null and new.visibility is distinct from old.visibility then
    update public.messages
       set visibility = new.visibility
     where parent_id = new.id;
  end if;
  return null;
end;
$$;

drop trigger if exists messages_propagate_visibility on public.messages;
create trigger messages_propagate_visibility
  after update of visibility on public.messages
  for each row execute function public.messages_propagate_visibility();

-- -----------------------------------------------------------------------------
-- 4. Public read paths now require visibility = 'public' (spec 55/61)
--    Filtering happens in the database, never in the browser.
-- -----------------------------------------------------------------------------
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
      and parent.visibility = 'public'
      and parent.status in ('unread', 'read')
  );
$$;

revoke all on function public.is_message_thread_public(uuid) from public;
grant execute on function public.is_message_thread_public(uuid) to anon, authenticated, service_role;

drop policy if exists "messages_select_public" on public.messages;
create policy "messages_select_public"
  on public.messages for select
  to anon, authenticated
  using (
    parent_id is null
    and visibility = 'public'
    and status in ('unread', 'read')
  );

drop policy if exists "messages_select_public_replies" on public.messages;
create policy "messages_select_public_replies"
  on public.messages for select
  to anon, authenticated
  using (
    parent_id is not null
    and status in ('unread', 'read')
    and public.is_message_thread_public(parent_id)
  );

-- Attachments follow their thread: public threads expose their files (root and
-- reply), private threads expose nothing to anon.
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
          or (m.parent_id is not null and public.is_message_thread_public(m.parent_id))
        )
    )
  );

-- Storage: same rule for the object rows behind signed URLs. This lets reply
-- attachments of a public thread resolve (previously they never did).
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
          or (m.parent_id is not null and public.is_message_thread_public(m.parent_id))
        )
    )
  );

-- -----------------------------------------------------------------------------
-- 5. Admin-only RPCs
--    set_thread_visibility  — change a whole thread's visibility atomically
--    admin_private_link_status — revoke/rotate state, WITHOUT ever exposing the
--                                token or its hash (spec 53)
-- -----------------------------------------------------------------------------
create or replace function public.set_thread_visibility(p_message_id uuid, p_visibility text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root uuid;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_visibility not in ('public', 'private') then
    raise exception 'invalid visibility %', p_visibility;
  end if;

  -- Accept either the root id or the reply id — both resolve to the thread.
  select coalesce(m.root_message_id, m.id) into v_root
    from public.messages m
   where m.id = p_message_id;

  if v_root is null then
    raise exception 'message not found' using errcode = 'P0002';
  end if;

  -- The propagation trigger pushes this down to the reply.
  update public.messages set visibility = p_visibility where id = v_root;
  return p_visibility;
end;
$$;

revoke all on function public.set_thread_visibility(uuid, text) from public;
grant execute on function public.set_thread_visibility(uuid, text) to authenticated;

create or replace function public.admin_private_link_status(p_message_id uuid)
returns table (has_token boolean, created_at timestamptz, revoked_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select (pa.token_hash is not null), pa.created_at, pa.revoked_at
    from public.private_access pa
   where pa.message_id = coalesce(
           (select m.root_message_id from public.messages m where m.id = p_message_id),
           p_message_id
         )
     and public.is_admin();
$$;

revoke all on function public.admin_private_link_status(uuid) from public;
grant execute on function public.admin_private_link_status(uuid) to authenticated;



