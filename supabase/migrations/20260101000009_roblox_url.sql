-- =============================================================================
-- 09 — Roblox profile link on public profile
--
-- The public header now shows Discord + Roblox icon buttons below the
-- username (the old website/globe icon was removed). This adds the backing
-- column; the legacy `website_url` column is left untouched so existing
-- databases keep working — the app simply stops reading it.
-- =============================================================================

alter table public.profiles
  add column if not exists roblox_url text;
