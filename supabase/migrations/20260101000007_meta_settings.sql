
-- =============================================================================
-- 07 — message_meta (sender IP, admin eyes only) + app_settings (toggles)
--
-- PRIVACY MODEL (matches the screenshot: IP only in Discord + admin inbox,
-- never in the DB-visible public surface):
--   * public.message_meta holds one row per root message: { message_id PK,
--     sender_ip }. RLS: NO policy for anon, SELECT for admins only.
--     INSERT/DELETE are service-role only (Edge Functions).
--   * public.app_settings is a key/value store (discord_enabled,
--     discord_include_ip). Admins may read, only superadmins may write.
--   * The Discord webhook URL lives in app_settings (set from the Settings
--     page, migration 08) or, as a fallback, in the Edge Function secret
--     DISCORD_WEBHOOK_URL.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- message_meta — sender IP, admin eyes only
-- -----------------------------------------------------------------------------
create table if not exists public.message_meta (
  message_id uuid primary key references public.messages (id) on delete cascade,
  sender_ip  text,
  created_at timestamptz not null default now()
);

create index if not exists message_meta_created_at_idx
  on public.message_meta (created_at desc);

alter table public.message_meta enable row level security;

drop policy if exists "message_meta_select_admin" on public.message_meta;

-- Admins can read sender IPs in the inbox. anon has NO policy at all, and
-- there is deliberately no INSERT/UPDATE/DELETE policy for any browser role:
-- only the service role (Edge Functions) writes here.
create policy "message_meta_select_admin"
  on public.message_meta for select
  to authenticated
  using (public.is_admin());

comment on table public.message_meta is
  'Per-message metadata visible to admins only (sender IP). Never exposed publicly.';

-- -----------------------------------------------------------------------------
-- app_settings — server-driven toggles (NOT secrets)
-- -----------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

drop trigger if exists app_settings_set_updated_at on public.app_settings;

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists "app_settings_select_admin" on public.app_settings;
drop policy if exists "app_settings_manage_super" on public.app_settings;

-- Admins may read toggles; nobody else.
create policy "app_settings_select_admin"
  on public.app_settings for select
  to authenticated
  using (public.is_admin());

-- Only superadmins may change settings (prevents a compromised admin account
-- from silently enabling notifications to an attacker channel).
create policy "app_settings_manage_super"
  on public.app_settings for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- Sane defaults (INSERT only, never overwrite an existing choice).
insert into public.app_settings (key, value)
values
  ('discord_enabled', 'false'),
  ('discord_include_ip', 'true')
on conflict (key) do nothing;