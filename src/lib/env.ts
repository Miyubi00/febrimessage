/**
 * Typed access to build-time environment variables.
 *
 * IMPORTANT: only variables prefixed with `VITE_` end up in the browser bundle.
 * Service-role keys, rate-limit secrets and captcha secrets live exclusively in
 * the Supabase Edge Function environment and are never referenced from here.
 */

function read(key: keyof ImportMetaEnv): string {
  const value = import.meta.env[key];
  return typeof value === 'string' ? value.trim() : '';
}

export const env = {
  supabaseUrl: read('VITE_SUPABASE_URL'),
  supabaseAnonKey: read('VITE_SUPABASE_ANON_KEY'),
  siteName: read('VITE_SITE_NAME') || 'AnonMessage',
  captchaSiteKey: read('VITE_CAPTCHA_SITE_KEY'),
} as const;

export const isSupabaseConfigured = env.supabaseUrl.length > 0 && env.supabaseAnonKey.length > 0;

export const isCaptchaEnabled = env.captchaSiteKey.length > 0;
