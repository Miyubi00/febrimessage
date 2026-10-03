import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { toFriendlyMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { fetchCurrentAdmin, signInAsAdmin, signOutAdmin, type AdminSessionInfo } from '@/services/adminService';

interface AdminAuthContextValue {
  session: Session | null;
  admin: AdminSessionInfo | null;
  /** True while the persisted session is being restored. */
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<AdminSessionInfo>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

/**
 * Session + database-verified admin role.
 *
 * The role always comes from the `admin_profiles` table — never from a hardcoded
 * email address or from localStorage.
 */
export function AdminAuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [admin, setAdmin] = useState<AdminSessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const bootstrap = async (): Promise<void> => {
      const { data } = await supabase.auth.getSession();
      if (!active) return;

      setSession(data.session ?? null);
      if (data.session) {
        const info = await fetchCurrentAdmin();
        if (active) setAdmin(info);
      }
      if (active) setLoading(false);
    };

    void bootstrap();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);

      if (event === 'SIGNED_OUT' || !nextSession) {
        setAdmin(null);
        return;
      }

      void fetchCurrentAdmin().then((info) => {
        if (active) setAdmin(info);
      });
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      const info = await signInAsAdmin(email, password);
      setAdmin(info);
      return info;
    } catch (caught) {
      const message = toFriendlyMessage(caught, 'Gagal login. Periksa email dan password.');
      setError(message);
      throw caught;
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutAdmin();
    setAdmin(null);
    setSession(null);
  }, []);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session ?? null);
    setAdmin(data.session ? await fetchCurrentAdmin() : null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AdminAuthContextValue>(
    () => ({ session, admin, loading, error, signIn, signOut, refresh, clearError }),
    [session, admin, loading, error, signIn, signOut, refresh, clearError],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used inside <AdminAuthProvider>.');
  }
  return context;
}