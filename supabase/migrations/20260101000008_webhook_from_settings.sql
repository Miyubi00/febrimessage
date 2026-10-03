-- =============================================================================
-- 08 — Discord webhook URL can be configured from the Settings page
--
-- Until now the webhook URL was only available as the Edge Function secret
-- DISCORD_WEBHOOK_URL. We now ALSO allow storing it in app_settings so an admin
-- can paste it from Settings without touching the CLI:
--
--   key = 'discord_webhook_url', value = 'https://discord.com/api/webhooks/...'
--
-- Security notes:
--   * RLS already covers app_settings: admin may READ, only superadmin may
--     WRITE (policies created in migration 07).
--   * The URL never reaches anon/public — no policy grants them access.
--   * It is still a credential: anyone with an admin session could read it.
--     If you prefer, keep this row EMPTY and set the DISCORD_WEBHOOK_URL secret
--     instead — the Edge Function uses whichever source is non-empty (DB wins,
--     env secret is the fallback).
--   * Value is validated server-side before use (must be an https
--     discord.com/api/webhooks/ URL), so a tampered row cannot turn this into
--     an open proxy.
-- =============================================================================

insert into public.app_settings (key, value)
values
  ('discord_webhook_url', '')
on conflict (key) do nothing;

comment on column public.app_settings.value is
  'Setting values. Includes discord_webhook_url (admin-readable, superadmin-writable, validated before use server-side).';
