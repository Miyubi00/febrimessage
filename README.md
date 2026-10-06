# AnonMessage — anonymous message platform

Cute pastel-blue anonymous message platform: a single public page at `/` where
anyone can send a message, plus a protected admin inbox (`/admin`) with
replies, publish toggles, moderation, and a profile editor. Single-user by
design — the owner's own domain always renders their one profile, there are no
per-username links.

Stack: **Vite + React 18 + TypeScript + Tailwind CSS + Supabase**
(Postgres, Auth, Storage, Realtime, Edge Functions).

> The browser **never** inserts messages directly. There is no `INSERT` policy on
> `messages`; every write goes through an Edge Function that runs with the
> service role and applies rate limiting, captcha, and anti-spam checks.

## Features

- **Public page** — profile header (avatar, cover, badges), composer with
  honeypot + optional hCaptcha/Turnstile, drag-free image picker (max 3 images,
  5 MB each, magic-byte sniffed twice), and a published-messages feed.
- **Admin inbox** — search, status/sort/type filters, pagination, detail drawer,
  inline reply, mark read/unread, spam, publish/hide, delete, and realtime
  new-message toasts.
- **Profile editor** — avatar/cover uploads **with a crop step** (drag to
  position, 100–400% zoom, cropped to a real file via canvas before upload),
  live preview card, username-taken check, claim-the-seeded-profile on first save.
- **Discord notifications** — every new message posts a dark embed (sender,
  content, sender IP) to a webhook you configure **from the Settings page** — no
  CLI/secret needed; with a "Kirim test" button to verify end to end.
- **Private / public threads** — every send returns a one-time capability link
  (`/message/:token`); the admin picks Public or Private when replying and the
  *whole thread* follows that choice automatically. Only the hash of the token is
  stored, the raw link is shown once, and it can be revoked/rotated from the
  message detail panel.
- **Security** — RLS everywhere, atomic DB-backed rate limits keyed by *hashed*
  IP, admin role read from `admin_profiles` (never a hardcoded email), private
  `message-attachments` bucket served via signed URLs, sender IP stored only in
  the admin-only `message_meta` table, CSP + security headers on Vercel.
- **Realtime** — the inbox subscribes to `postgres_changes` on `messages`.

## Quick start

```bash
npm install
cp .env.example .env        # fill in your Supabase keys
npm run dev                 # http://localhost:5173
```

Without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` the app renders a
helpful setup screen instead of a white page.

## Environment variables

Two groups — **never** mix them up:

| Variable | Where | Notes |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | browser | project URL |
| `VITE_SUPABASE_ANON_KEY` | browser | public anon key |
| `VITE_SITE_NAME` | browser | branding (default `AnonMessage`) |
| `SUPABASE_SERVICE_ROLE_KEY` | functions only | **bypasses RLS — never `VITE_`-prefix it** |
| `RATE_LIMIT_SECRET` | functions only | salt for IP hashing (min 16 chars) |
| `PRIVATE_TOKEN_SECRET` | functions only | **optional** salt for private-link hashes (falls back to `RATE_LIMIT_SECRET`) |
| `ALLOWED_ORIGINS` | functions only | comma-separated CORS origins (dev defaults built in) |
| `DISCORD_WEBHOOK_URL` | functions only | **optional** — fallback when `app_settings.discord_webhook_url` is empty |

Function secrets are set in the Supabase dashboard
(**Edge Functions → Secrets**) or via a local `.env` file with
`supabase functions serve --env-file .env` (that file is never committed).

The Discord webhook URL can also be pasted in **/admin/settings** instead —
preferred, since it applies without a redeploy.

## Supabase setup

1. Create a project, then run the migrations in order:

```bash
supabase db push        # or paste the files in the SQL editor
```

```
supabase/migrations/
  20260101000001_init.sql      # tables, constraints, seed profile
  20260101000002_rls.sql       # is_admin()/is_superadmin() + all RLS policies
  20260101000003_functions.sql # check_rate_limit(), is_duplicate_message(), cleanup_rate_limits(), grant_admin_role()
  20260101000004_storage.sql   # avatars / backgrounds / message-attachments buckets + policies
  20260101000005_realtime.sql  # realtime publication + replica identity
  20260101000006_fix_messages_recursion.sql  # SECURITY DEFINER helper for reply policy (fixes 42P17)
  20260101000007_meta_settings.sql           # message_meta (sender IP) + app_settings (toggles)
  20260101000008_webhook_from_settings.sql   # discord_webhook_url key (configure from Settings)
  20260101000009_roblox_url.sql              # profiles.roblox_url
  20260101000010_private_threads.sql         # visibility, thread triggers, private_access, admin RPCs
```

2. Create the admin account:

   - Dashboard → **Authentication → Users → Add user** (disable "auto confirm" as you like).
   - SQL editor: `select public.grant_admin_role('you@example.com', 'superadmin');`
   - Log in at `/admin/login`. The first profile save claims the seeded profile
     (sets `owner_id`) for your account.

3. Deploy the Edge Functions:

```bash
supabase functions deploy submit-message upload-message-attachment admin-login admin-reply \
  delete-message notify-test get-private-message private-link
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=... RATE_LIMIT_SECRET=... \
  ALLOWED_ORIGINS=https://your-site.vercel.app
# Optional — dedicated salt for private link hashes (falls back to RATE_LIMIT_SECRET):
# supabase secrets set PRIVATE_TOKEN_SECRET=...
```

`submit-message`, `upload-message-attachment`, `admin-login` and
`get-private-message` run with `verify_jwt = false` (they serve anonymous
visitors); `admin-reply`, `delete-message`, `private-link` and `notify-test`
require a signed-in admin JWT.

## Private threads (public / private visibility)

Flow:

```
sender  → submit-message
            · creates the root with visibility = 'private'
            · mints a 32-byte token, stores SHA-256(token + secret) only
            · returns the RAW token exactly once → success panel → Salin link
sender  → /message/:token  → get-private-message (rate limited 10/min + 60/h)
            · hashes the token, matches private_access, checks revoked_at
            · returns ONLY thread content + 5-minute signed attachment URLs
admin   → ReplyForm: ( ) Public  ( ) Private
            · admin-reply sets the ROOT's visibility first, the reply inherits
            · toggling later moves root + reply together (RPC)
```

Security rules implemented:

- `private_access` has RLS enabled with **no policies** — the browser can never
  read the hash; only Edge Functions (service role) touch it.
- Invalid, revoked and unknown tokens all return the same generic
  *"Pesan tidak ditemukan atau link sudah tidak valid."* (404, no probing).
- Public page / RLS / storage policies filter `visibility = 'public'` **in the
  database** — private rows are never sent to a public browser.
- Admin sees status via `admin_private_link_status` (booleans + timestamps only)
  and can **Revoke link** / **Buat link baru** (new token shown once).

## Discord notifications (new-message alerts)

1. Discord → **Server Settings → Integrations → Webhooks → New Webhook →
   Copy Webhook URL**.
2. Log in at `/admin/settings`, tick **Kirim notifikasi ke Discord**, paste the
   URL into **Discord Webhook URL**, then **Simpan pengaturan**.
3. Click **Kirim test** — a sample embed arrives in your channel immediately
   (no redeploy required).

Notes:

- The stored URL is validated server-side (`https://discord.com/api/webhooks/...`
  only), readable by admins, writable only by superadmins (RLS), and never
  exposed to anonymous visitors.
- Optional `DISCORD_WEBHOOK_URL` secret remains as a fallback if you prefer the
  CLI: whichever source is set and non-empty wins, DB first.
- **Sertakan IP pengirim** controls whether the sender's public IP is included in
  the embed (it is always shown in the admin inbox via `message_meta`).

## How the pieces fit

```
visitor → MessageForm → upload-message-attachment (validates + stores image)
        → submit-message (rate limit → captcha → token mint → INSERT)
        → /message/:token  (private link; signed URLs, 5 min)
        → public feed       (RLS: only visibility = 'public' is readable)

admin   → /admin/login (admin-login fn, IP rate limited, role from admin_profiles)
        → inbox (RLS: authenticated + is_admin())
        → reply / delete  (admin-reply, delete-message — owner check + storage cleanup)
```

`fetchUnreadCount` compares the exact `unread` count with the sidebar badge at
`>= 100` ("99+").

## Scripts

```bash
npm run dev        # local dev server
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build (React/Supabase/UI code-split)
npm run preview    # preview the production build
```

## Deploy (Vercel)

The repo ships a `vercel.json` with CSP, `X-Content-Type-Options`, referrer and
frame protections plus long-lived caching for `/assets/*`. Set the `VITE_*`
variables in the Vercel dashboard, then deploy. Function secrets live in
Supabase, not Vercel.
