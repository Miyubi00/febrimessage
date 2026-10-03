/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL (public). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon/public key (safe for the browser, RLS still applies). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Optional site name used in titles / SEO. */
  readonly VITE_SITE_NAME?: string;
  /** Optional captcha site key (public). Empty = captcha disabled. */
  readonly VITE_CAPTCHA_SITE_KEY?: string;
  /** Captcha provider: `hcaptcha` (default) or `turnstile`. */
  readonly VITE_CAPTCHA_PROVIDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}