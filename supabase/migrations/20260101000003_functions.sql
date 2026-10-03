-- =============================================================================
-- 03 — Server-side helpers: atomic rate limiter, cleanup, duplicate detection
-- =============================================================================

-- -----------------------------------------------------------------------------
-- check_rate_limit()
--   Atomic fixed-window counter. The single `insert ... on conflict do update`
--   statement does read+write in one shot, so parallel requests cannot bypass
--   the limit by racing a separate SELECT + INSERT.
--
--   Returns exactly one row:
--     allowed      boolean  -> false means "reject with HTTP 429"
--     remaining    integer  -> how many requests are left in the window
--     retry_after  integer  -> seconds until the window resets (0 when allowed)
--     current_count integer -> how many requests were counted in this window
-- -----------------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_ip_hash        text,
  p_action         text,
  p_limit          integer,
  p_window_seconds integer
)
returns table (
  allowed       boolean,
  remaining     integer,
  retry_after   integer,
  current_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count        integer;
begin
  if coalesce(trim(p_ip_hash), '') = '' then
    raise exception 'check_rate_limit: ip_hash is required';
  end if;
  if coalesce(trim(p_action), '') = '' then
    raise exception 'check_rate_limit: action is required';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'check_rate_limit: invalid limit';
  end if;
  if p_window_seconds is null or p_window_seconds < 1 then
    raise exception 'check_rate_limit: invalid window';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limits as rl (ip_hash, action, window_start, request_count)
  values (p_ip_hash, p_action, v_window_start, 1)
  on conflict (ip_hash, action, window_start)
  do update set
    request_count = rl.request_count + 1,
    updated_at    = now()
  returning rl.request_count into v_count;

  current_count := v_count;
  allowed       := v_count <= p_limit;
  remaining     := greatest(p_limit - v_count, 0);
  retry_after   := case
    when v_count <= p_limit then 0
    else greatest(
      ceil(extract(epoch from ((v_window_start + make_interval(secs => p_window_seconds)) - now())))::integer,
      1
    )
  end;
  return next;
end;
$$;

revoke all on function public.check_rate_limit(text, text, integer, integer) from public;
grant execute on function public.check_rate_limit(text, text, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- is_duplicate_message()
--   Cheap duplicate / repeat-flood detection for the same hashed IP.
-- -----------------------------------------------------------------------------
create or replace function public.is_duplicate_message(
  p_ip_hash        text,
  p_content        text,
  p_window_seconds integer default 120
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.messages
    where ip_hash = p_ip_hash
      and lower(trim(content)) = lower(trim(p_content))
      and created_at > now() - make_interval(secs => greatest(p_window_seconds, 1))
    limit 1
  );
$$;

revoke all on function public.is_duplicate_message(text, text, integer) from public;
grant execute on function public.is_duplicate_message(text, text, integer) to service_role;

-- -----------------------------------------------------------------------------
-- cleanup_rate_limits()
--   Housekeeping — drops windows older than 24h.
-- -----------------------------------------------------------------------------
create or replace function public.cleanup_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits
  where window_start < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_rate_limits() from public;
grant execute on function public.cleanup_rate_limits() to service_role;

-- -----------------------------------------------------------------------------
-- Admin helper: attach an existing auth user as an admin.
-- Example:
--   select public.grant_admin_role('admin@example.com', 'superadmin');
-- -----------------------------------------------------------------------------
create or replace function public.grant_admin_role(
  p_email text,
  p_role  text default 'admin'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if p_role not in ('admin', 'superadmin') then
    raise exception 'grant_admin_role: invalid role %', p_role;
  end if;

  select id into v_user_id from auth.users where email = lower(trim(p_email)) limit 1;

  if v_user_id is null then
    raise exception 'grant_admin_role: no auth user with email %', p_email;
  end if;

  insert into public.admin_profiles (id, role)
  values (v_user_id, p_role)
  on conflict (id) do update set role = excluded.role;

  return v_user_id;
end;
$$;

revoke all on function public.grant_admin_role(text, text) from public;
grant execute on function public.grant_admin_role(text, text) to service_role;
