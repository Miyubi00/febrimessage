-- =============================================================================
-- 12 — Email notification subscriptions for private threads
--
-- A sender can leave an email address on the private thread page to be
-- notified on every admin reply. Addresses live in `thread_subscriptions`
-- (RLS on, NO policies: Edge Functions with the service role only).
-- Admin notification preferences live in `app_settings` like the Discord
-- toggles (migration 08): `email_notifications_enabled` + `admin_notify_email`.
-- =============================================================================

create table if not exists public.thread_subscriptions (
  message_id uuid primary key references public.messages (id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists thread_subscriptions_email_idx on public.thread_subscriptions (email);

alter table public.thread_subscriptions enable row level security;

-- Deliberately no policy for anon/authenticated: addresses are only ever
-- touched by Edge Functions (subscribe-thread writes, admin-reply reads).
revoke all on public.thread_subscriptions from anon, authenticated;
grant all on public.thread_subscriptions to service_role;

insert into public.app_settings (key, value)
values
  ('email_notifications_enabled', 'false'),
  ('admin_notify_email', '')
on conflict (key) do nothing;
