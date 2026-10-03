import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

import { env, isSupabaseConfigured } from './env';

/**
 * Browser Supabase client.
 *
 * Only the public anon key is used here — every request is still constrained by
 * Row Level Security. The service-role key must never reach the client, which is
 * why message submission/upload/moderation run inside Edge Functions.
 *
 * Placeholder values keep the module importable so the app can render a helpful
 * "configure your environment" screen instead of crashing.
 */
export const supabase = createClient<Database>(
  env.supabaseUrl || 'http://localhost:54321',
  env.supabaseAnonKey || 'public-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'anon-message-auth',
    },
    realtime: {
      params: { eventsPerSecond: 5 },
    },
    global: {
      headers: { 'x-client-info': 'anon-message-web' },
    },
  },
);

export { isSupabaseConfigured };

export const SUPABASE_URL = env.supabaseUrl;
export const SUPABASE_ANON_KEY = env.supabaseAnonKey;
