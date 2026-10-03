-- =============================================================================
-- 01 — Core schema: profiles, messages, attachments, admins, rate limits
-- Run order: 01_init.sql -> 02_rls.sql -> 03_functions.sql -> 04_storage.sql
-- Safe to run on a brand new Supabase project.
-- =============================================================================

create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at fresh
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles — one row per anonymous-message page (single profile per owner)
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid references auth.users (id) on delete set null,
  username       text not null,
  display_name   text not null,
  description    text,
  pronouns       text,
  avatar_url     text,
  background_url text,
  discord_url    text,
  website_url    text,
  theme          text not null default 'pastel-blue',
  is_verified    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_username_format  check (username ~ '^[a-z0-9_]{3,30}$'),
  constraint profiles_display_name_len check (char_length(display_name) between 1 and 40),
  constraint profiles_description_len  check (description is null or char_length(description) <= 160),
  constraint profiles_pronouns_len     check (pronouns is null or char_length(pronouns) <= 20),
  constraint profiles_theme_len        check (char_length(theme) between 1 and 30)
);

create unique index if not exists profiles_username_key on public.profiles (lower(username));
create index if not exists profiles_owner_id_idx on public.profiles (owner_id);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- messages — anonymous messages + admin replies (parent_id = thread)
-- -----------------------------------------------------------------------------
create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  sender_name     text,
  is_anonymous    boolean not null default true,
  content         text not null,
  status          text not null default 'unread',
  is_public       boolean not null default false,
  parent_id       uuid references public.messages (id) on delete cascade,
  ip_hash         text,
  user_agent_hash text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint messages_status_check check (status in ('unread', 'read', 'hidden', 'spam', 'deleted')),
  constraint messages_content_len  check (char_length(content) between 1 and 500),
  constraint messages_sender_len   check (sender_name is null or char_length(sender_name) between 1 and 20)
);

create index if not exists messages_profile_id_idx on public.messages (profile_id);
create index if not exists messages_created_at_idx on public.messages (created_at desc);
create index if not exists messages_parent_id_idx  on public.messages (parent_id);
create index if not exists messages_status_idx     on public.messages (status);
create index if not exists messages_public_idx     on public.messages (profile_id, is_public, created_at desc);
create index if not exists messages_ip_hash_idx    on public.messages (ip_hash);

drop trigger if exists messages_set_updated_at on public.messages;
create trigger messages_set_updated_at
  before update on public.messages
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- message_attachments — metadata for files stored in `message-attachments`
-- -----------------------------------------------------------------------------
create table if not exists public.message_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.messages (id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  mime_type    text not null,
  file_size    bigint not null,
  created_at   timestamptz not null default now(),
  constraint message_attachments_mime_check check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
  ),
  constraint message_attachments_size_check check (file_size > 0 and file_size <= 5242880)
);

create index if not exists message_attachments_message_id_idx
  on public.message_attachments (message_id);

-- -----------------------------------------------------------------------------
-- admin_profiles — role source of truth (never hardcode admin emails)
-- -----------------------------------------------------------------------------
create table if not exists public.admin_profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  role       text not null default 'admin',
  created_at timestamptz not null default now(),
  constraint admin_profiles_role_check check (role in ('admin', 'superadmin'))
);

-- -----------------------------------------------------------------------------
-- rate_limits — server-side counters keyed by hashed IP (raw IP never stored)
-- -----------------------------------------------------------------------------
create table if not exists public.rate_limits (
  id            uuid primary key default gen_random_uuid(),
  ip_hash       text not null,
  action        text not null,
  window_start  timestamptz not null,
  request_count integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint rate_limits_count_check check (request_count >= 0)
);

-- The unique index is what makes `insert ... on conflict do update` atomic
-- (and therefore safe against race conditions / request floods).
create unique index if not exists rate_limits_bucket_key
  on public.rate_limits (ip_hash, action, window_start);

create index if not exists rate_limits_ip_hash_idx      on public.rate_limits (ip_hash);
create index if not exists rate_limits_action_idx       on public.rate_limits (action);
create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

drop trigger if exists rate_limits_set_updated_at on public.rate_limits;
create trigger rate_limits_set_updated_at
  before update on public.rate_limits
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Seed: a fresh install needs one profile so `/` renders something.
-- Replace the values from /admin/profile after your first login.
-- -----------------------------------------------------------------------------
insert into public.profiles (username, display_name, description, pronouns, is_verified, theme)
values (
  'miyubio_o',
  'Miyubi0_0',
  'Kirim aku pesan anonim apa aja ya! Pasti aku baca satu-satu.',
  'They/Was',
  true,
  'pastel-blue'
)
on conflict do nothing;