import { KeyRound, Loader2, LogIn, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';

import { Seo } from '@/components/Seo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { env } from '@/lib/env';
import { requestPasswordReset } from '@/services/adminService';

interface LocationState {
  from?: string;
}

/**
 * Admin login.
 *
 * Credentials are exchanged for a session inside the `admin-login` Edge Function
 * so that brute-force attempts are rate limited (hashed IP) before they ever
 * reach GoTrue. The role itself is always read from `admin_profiles`.
 */
export function AdminLogin(): JSX.Element {
  const { admin, loading, error, signIn, clearError } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const state = location.state as LocationState | null;
  const redirectTo = state?.from && state.from.startsWith('/admin') ? state.from : '/admin/messages';

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <div className="surface flex items-center gap-3 px-6 py-4">
          <Loader2 className="h-5 w-5 animate-spin text-pastel-500" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink-soft">Memeriksa sesi…</p>
        </div>
      </div>
    );
  }

  // Already signed in as an admin — go straight to the inbox.
  if (admin) return <Navigate to={redirectTo} replace />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting) return;

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setFieldError('Email dan password wajib diisi.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setFieldError('Format email tidak valid.');
      return;
    }

    setFieldError(null);
    clearError();
    setSubmitting(true);
    try {
      const info = await signIn(trimmedEmail, password);
      push({ title: 'Berhasil masuk', description: `Selamat datang, ${info.email ?? 'admin'}.`, variant: 'success' });
      navigate(redirectTo, { replace: true });
    } catch {
      // The provider already stored a friendly message in `error`.
    } finally {
      setSubmitting(false);
    }
  };

  const handleForgotPassword = async (): Promise<void> => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setFieldError('Isi email dulu untuk menerima link reset password.');
      return;
    }

    setResetting(true);
    setFieldError(null);
    try {
      await requestPasswordReset(trimmedEmail);
      push({
        title: 'Email reset terkirim',
        description: 'Cek inbox/spam untuk link ubah password.',
        variant: 'info',
        duration: 6000,
      });
    } catch {
      push({
        title: 'Gagal mengirim email reset',
        description: 'Coba lagi beberapa saat lagi.',
        variant: 'error',
      });
    } finally {
      setResetting(false);
    }
  };

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_460px_at_10%_-8%,#EAF6FF_0%,rgba(234,246,255,0)_62%),radial-gradient(760px_420px_at_96%_4%,#E7E9FF_0%,rgba(231,233,255,0)_58%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -right-24 top-10 h-72 w-72 rounded-full bg-pastel-200/45 blur-3xl"
        aria-hidden="true"
      />

      <Seo title="Admin Login" description="Masuk ke panel admin." path="/admin/login" />

      <Card padding="lg" className="relative w-full max-w-md animate-fade-up">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pastel-400 text-white shadow-soft">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-xl font-extrabold tracking-tight text-ink">Admin Login</h1>
            <p className="text-sm text-ink-muted">Kelola pesan anonim di {env.siteName}.</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="admin@example.com"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldError(null);
              clearError();
            }}
            leftIcon={<Mail className="h-4 w-4" aria-hidden="true" />}
            disabled={submitting}
          />

          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldError(null);
              clearError();
            }}
            leftIcon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
            disabled={submitting}
          />

          {fieldError ?? error ? (
            <p
              role="alert"
              className="rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-xs font-semibold text-rose-500"
            >
              {fieldError ?? error}
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={submitting}
            loadingText="Memeriksa…"
            leftIcon={<LogIn className="h-4 w-4" aria-hidden="true" />}
          >
            Masuk
          </Button>

          <div className="flex items-center justify-between gap-3 text-xs">
            <button
              type="button"
              onClick={() => void handleForgotPassword()}
              disabled={resetting}
              className="font-semibold text-pastel-700 transition hover:text-pastel-800 disabled:opacity-60"
            >
              {resetting ? 'Mengirim…' : 'Lupa password?'}
            </button>
            <Link to="/" className="font-semibold text-ink-muted transition hover:text-ink">
              Kembali ke halaman publik
            </Link>
          </div>
        </form>

        <p className="mt-5 flex items-start gap-2 rounded-3xl bg-pastel-50/80 px-4 py-3 text-[11px] leading-relaxed text-ink-muted">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pastel-500" aria-hidden="true" />
          Login hanya untuk akun yang terdaftar di tabel <code>admin_profiles</code>. Akun biasa tidak akan bisa
          mengakses panel ini.
        </p>
      </Card>
    </main>
  );
}
