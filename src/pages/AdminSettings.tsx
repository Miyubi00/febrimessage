import { AlertTriangle, BellRing, Eye, EyeOff, KeyRound, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { Seo } from '@/components/Seo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Checkbox';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { toFriendlyMessage } from '@/lib/errors';
import { validateDiscordWebhookUrl, validateEmail } from '@/lib/validation';
import {
  fetchEmailSettings,
  fetchNotificationSettings,
  saveEmailSettings,
  saveNotificationSettings,
  sendDiscordTest,
  updatePassword,
} from '@/services/adminService';

/** Account settings: session info, password change and platform limits. */
export function AdminSettings(): JSX.Element {
  const { admin, signOut } = useAdminAuth();
  const { push } = useToast();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Discord notification toggles + webhook URL (stored in app_settings,
  // superadmin writes — no Supabase CLI needed).
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordIncludeIp, setDiscordIncludeIp] = useState(true);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [webhookError, setWebhookError] = useState<string | null>(null);
  const [notifLoading, setNotifLoading] = useState(true);
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifTesting, setNotifTesting] = useState(false);

  // Email notifications (Resend): toggle + admin inbox address.
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailLoading, setEmailLoading] = useState(true);
  const [emailSaving, setEmailSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchNotificationSettings()
      .then((settings) => {
        if (cancelled) return;
        setDiscordEnabled(settings.discordEnabled);
        setDiscordIncludeIp(settings.discordIncludeIp);
        setDiscordWebhookUrl(settings.discordWebhookUrl);
      })
      .catch(() => {
        if (!cancelled) {
          push({
            title: 'Gagal memuat pengaturan notifikasi',
            description: 'Pengaturan Discord memakai nilai default.',
            variant: 'error',
          });
        }
      })
      .finally(() => {
        if (!cancelled) setNotifLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [push]);

  const handlePasswordChange = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (saving) return;

    if (password.length < 8) {
      setFormError('Password minimal 8 karakter.');
      return;
    }
    if (password !== confirm) {
      setFormError('Konfirmasi password tidak sama.');
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      await updatePassword(password);
      setPassword('');
      setConfirm('');
      push({ title: 'Password diperbarui', variant: 'success' });
    } catch (caught) {
      const message = toFriendlyMessage(caught, 'Gagal memperbarui password.');
      setFormError(message);
      push({ title: 'Gagal memperbarui password', description: message, variant: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async (): Promise<void> => {
    setSigningOut(true);
    try {
      await signOut();
      navigate('/admin/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetchEmailSettings()
      .then((settings) => {
        if (cancelled) return;
        setEmailEnabled(settings.enabled);
        setAdminEmail(settings.adminEmail);
      })
      .catch(() => {
        if (!cancelled) return;
      })
      .finally(() => {
        if (!cancelled) setEmailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveEmail = async (): Promise<void> => {
    if (emailSaving) return;

    if (emailEnabled) {
      const validation = validateEmail(adminEmail);
      setEmailError(validation);
      if (validation) return;
    } else {
      setEmailError(null);
    }

    setEmailSaving(true);
    try {
      await saveEmailSettings({ enabled: emailEnabled, adminEmail: emailEnabled ? adminEmail : '' });
      push({ title: 'Pengaturan email tersimpan', variant: 'success' });
    } catch (caught) {
      push({
        title: 'Gagal menyimpan pengaturan',
        description: toFriendlyMessage(caught, 'Coba lagi sebentar lagi.'),
        variant: 'error',
      });
    } finally {
      setEmailSaving(false);
    }
  };

  const handleSaveNotifications = async (): Promise<void> => {
    if (notifSaving) return;

    const validation = validateDiscordWebhookUrl(discordWebhookUrl);
    setWebhookError(validation);
    if (validation) return;

    setNotifSaving(true);
    try {
      await saveNotificationSettings({ discordEnabled, discordIncludeIp, discordWebhookUrl });
      push({ title: 'Pengaturan notifikasi tersimpan', variant: 'success' });
    } catch (caught) {
      push({
        title: 'Gagal menyimpan pengaturan',
        description: toFriendlyMessage(caught, 'Coba lagi sebentar lagi.'),
        variant: 'error',
      });
    } finally {
      setNotifSaving(false);
    }
  };

  const handleDiscordTest = async (): Promise<void> => {
    if (notifTesting) return;

    const validation = validateDiscordWebhookUrl(discordWebhookUrl);
    setWebhookError(validation);
    if (validation) {
      push({
        title: 'URL webhook belum valid',
        description: validation,
        variant: 'error',
      });
      return;
    }

    setNotifTesting(true);
    try {
      const status = await sendDiscordTest(discordWebhookUrl.trim());
      if (status.startsWith('skipped')) {
        push({
          title: 'Webhook belum terpasang',
          description: 'Isi dulu Discord Webhook URL di atas, simpan, lalu test lagi.',
          variant: 'info',
          duration: 6000,
        });
        return;
      }
      push({ title: 'Test terkirim ke Discord', description: 'Cek channel Discord kamu.', variant: 'success' });
    } catch (caught) {
      push({
        title: 'Test gagal',
        description: toFriendlyMessage(caught, 'Cek URL webhook lalu coba lagi.'),
        variant: 'error',
      });
    } finally {
      setNotifTesting(false);
    }
  };

  return (
    <>
      <Seo title="Settings" description="Pengaturan akun admin." path="/admin/settings" />

      <div className="space-y-4">
        <header>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">Settings</h1>
          <p className="text-sm text-ink-muted">Kelola akun admin.</p>
        </header>

        <Card padding="md">
          <h2 className="section-title flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-pastel-600" aria-hidden="true" />
            Akun
          </h2>

          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <dt className="font-semibold text-ink-soft">Email</dt>
              <dd className="truncate text-ink">{admin?.email ?? '—'}</dd>
            </div>
          </dl>
        </Card>

        <Card padding="md">
          <h2 className="section-title flex items-center gap-2 text-base">
            <BellRing className="h-4 w-4 text-pastel-600" aria-hidden="true" />
            Notifikasi Discord
          </h2>

          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            Setiap pesan baru dikirim ke channel Discord kamu.
          </p>

          {notifLoading ? (
            <div className="mt-4 space-y-2" aria-label="Memuat pengaturan notifikasi">
              <div className="skeleton h-5 w-2/3" />
              <div className="skeleton h-5 w-1/2" />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <Checkbox
                name="discord-enabled"
                label="Kirim notifikasi ke Discord"
                description="Setiap pesan baru dikirim ke channel Discord sebagai embed."
                checked={discordEnabled}
                onChange={(event) => setDiscordEnabled(event.target.checked)}
              />
              <Checkbox
                name="discord-include-ip"
                label="Sertakan IP pengirim di notifikasi"
                description="IP hanya muncul di Discord + inbox admin, tidak pernah di halaman publik."
                checked={discordIncludeIp}
                onChange={(event) => setDiscordIncludeIp(event.target.checked)}
              />

              <Input
                label="Discord Webhook URL"
                name="discordWebhookUrl"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="https://discord.com/api/webhooks/..."
                value={discordWebhookUrl}
                onChange={(event) => {
                  setDiscordWebhookUrl(event.target.value);
                  setWebhookError(null);
                }}
                error={webhookError}
              />

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void handleSaveNotifications()}
                  loading={notifSaving}
                  loadingText="Menyimpan…"
                >
                  Simpan pengaturan
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => void handleDiscordTest()}
                  loading={notifTesting}
                  loadingText="Mengirim…"
                >
                  Kirim test
                </Button>
              </div>

              {admin && admin.role !== 'superadmin' ? (
                <p className="flex items-start gap-2 rounded-3xl border border-pastel-200 bg-pastel-50/70 px-4 py-3 text-xs leading-relaxed text-ink-soft">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pastel-600" aria-hidden="true" />
                  Kamu login sebagai admin biasa: hanya superadmin yang bisa mengubah pengaturan ini.
                </p>
              ) : (
                <div className="rounded-3xl bg-pastel-50/80 px-4 py-3 text-[11px] leading-relaxed text-ink-muted">
                  <p>
                    Ambil URL-nya di Discord:{' '}
                    <span className="font-semibold text-ink-soft">
                      Server Settings → Integrations → Webhooks → New Webhook → Copy Webhook URL
                    </span>
                    , lalu tempel ke kolom atas dan klik{' '}
                    <span className="font-semibold text-ink-soft">Simpan pengaturan</span>.
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card padding="md">
          <h2 className="section-title flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-pastel-600" aria-hidden="true" />
            Notifikasi Email
          </h2>

          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            Kirim email setiap ada pesan baru dan setiap ada balasan admin. Pengiriman lewat Resend —
            perlu RESEND_API_KEY di server, kalau belum ada email dilewati diam-diam.
          </p>

          {emailLoading ? (
            <div className="mt-4 space-y-2" aria-label="Memuat pengaturan email">
              <div className="skeleton h-5 w-2/3" />
              <div className="skeleton h-5 w-1/2" />
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <Checkbox
                name="email-enabled"
                label="Nyalakan notifikasi email"
                description="Pesan baru → email admin. Balasan admin → email pengirim yang mendaftar."
                checked={emailEnabled}
                onChange={(event) => setEmailEnabled(event.target.checked)}
              />

              <Input
                label="Email admin"
                name="adminEmail"
                type="email"
                autoComplete="email"
                placeholder="kamu@contoh.com"
                value={adminEmail}
                onChange={(event) => {
                  setAdminEmail(event.target.value);
                  setEmailError(null);
                }}
                error={emailError}
                disabled={emailSaving}
              />

              <div>
                <Button
                  onClick={() => void handleSaveEmail()}
                  loading={emailSaving}
                  loadingText="Menyimpan…"
                >
                  Simpan pengaturan
                </Button>
              </div>

              {admin && admin.role !== 'superadmin' ? (
                <p className="flex items-start gap-2 rounded-3xl border border-pastel-200 bg-pastel-50/70 px-4 py-3 text-xs leading-relaxed text-ink-soft">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pastel-600" aria-hidden="true" />
                  Kamu login sebagai admin biasa: hanya superadmin yang bisa mengubah pengaturan ini.
                </p>
              ) : null}
            </div>
          )}
        </Card>

        <Card padding="md">
          <h2 className="section-title flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4 text-pastel-600" aria-hidden="true" />
            Ubah password
          </h2>

          <form onSubmit={handlePasswordChange} className="mt-4 grid gap-4 sm:grid-cols-2" noValidate>
            <Input
              label="Password baru"
              name="new-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Minimal 8 karakter"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setFormError(null);
              }}
              disabled={saving}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  disabled={saving}
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  aria-pressed={showPassword}
                  className="rounded-full p-1 text-ink-muted transition hover:bg-pastel-100 hover:text-ink disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              }
            />
            <Input
              label="Konfirmasi password"
              name="confirm-password"
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Ulangi password baru"
              value={confirm}
              onChange={(event) => {
                setConfirm(event.target.value);
                setFormError(null);
              }}
              disabled={saving}
              rightSlot={
                <button
                  type="button"
                  onClick={() => setShowConfirm((value) => !value)}
                  disabled={saving}
                  aria-label={showConfirm ? 'Sembunyikan konfirmasi password' : 'Tampilkan konfirmasi password'}
                  aria-pressed={showConfirm}
                  className="rounded-full p-1 text-ink-muted transition hover:bg-pastel-100 hover:text-ink disabled:opacity-50"
                >
                  {showConfirm ? (
                    <EyeOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              }
            />

            {formError ? (
              <p
                role="alert"
                className="sm:col-span-2 rounded-2xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-xs font-semibold text-rose-500"
              >
                {formError}
              </p>
            ) : null}

            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit" loading={saving} loadingText="Menyimpan…">
                Perbarui password
              </Button>
            </div>
          </form>
        </Card>

        <Button
          variant="danger"
          size="lg"
          fullWidth
          onClick={() => void handleSignOut()}
          loading={signingOut}
          loadingText="Keluar…"
          leftIcon={<LogOut className="h-4 w-4" aria-hidden="true" />}
        >
          Logout
        </Button>
      </div>
    </>
  );
}
