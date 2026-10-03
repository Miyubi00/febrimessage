import {
  BellRing,
  CalendarDays,
  CalendarRange,
  CornerDownRight,
  Globe,
  Image as ImageIcon,
  MessagesSquare,
  Share2,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { StoryShare } from '@/components/profile/StoryShare';
import { Seo } from '@/components/Seo';
import { Card } from '@/components/ui/Card';
import { ErrorState } from '@/components/ui/EmptyState';
import { useAdminOutlet } from '@/pages/AdminDashboard';
import { fetchDashboardStats, type DashboardStats } from '@/services/adminService';
import { logDevError } from '@/lib/errors';
import { cn } from '@/lib/utils';

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  compact = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  sub?: string;
  /** Vertical mini layout for tight grids (icon above, centered). */
  compact?: boolean;
}): JSX.Element {
  if (compact) {
    return (
      <div className="surface-soft flex flex-col items-center gap-1 px-2 py-3 text-center">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pastel-100 text-pastel-700">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="font-display text-xl font-extrabold tabular-nums tracking-tight text-ink">
          {value.toLocaleString('id-ID')}
        </p>
        <p className="text-[11px] font-semibold leading-tight text-ink-muted">{label}</p>
      </div>
    );
  }

  return (
    <div className="surface-soft flex items-center gap-2.5 p-3 sm:gap-3 sm:p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pastel-100 text-pastel-700 sm:h-11 sm:w-11">
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-ink-muted">{label}</p>
        <p className="font-display text-xl font-extrabold tabular-nums tracking-tight text-ink sm:text-2xl">
          {value.toLocaleString('id-ID')}
        </p>
        {sub ? <p className="truncate text-[11px] text-ink-muted">{sub}</p> : null}
      </div>
    </div>
  );
}

function StatSkeleton(): JSX.Element {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="surface-soft p-4">
          <div className="skeleton h-11 w-11 !rounded-2xl" />
          <div className="skeleton mt-3 h-4 w-2/3" />
          <div className="skeleton mt-2 h-7 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** Bar chart of the last 14 days (pure CSS, no chart library). */
function ActivityChart({ daily }: { daily: DashboardStats['daily'] }): JSX.Element {
  const max = Math.max(1, ...daily.map((day) => day.count));
  const todayKey = (() => {
    const now = new Date();
    const month = `${now.getMonth() + 1}`.padStart(2, '0');
    const day = `${now.getDate()}`.padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  })();

  return (
    <div>
      <div className="flex h-36 items-end gap-1.5 sm:gap-2" role="img" aria-label="Grafik pesan 14 hari terakhir">
        {daily.map((day) => {
          const isToday = day.date === todayKey;
          return (
            <div key={day.date} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 self-stretch">
              <div className="flex w-full flex-1 items-end">
                <div
                  title={`${day.count} pesan • ${day.date}`}
                  className={cn(
                    'w-full rounded-t-lg transition-all',
                    day.count === 0
                      ? 'bg-pastel-100/60'
                      : isToday
                        ? 'bg-gradient-to-t from-pastel-500 to-pastel-300 shadow-glow'
                        : 'bg-gradient-to-t from-pastel-400/80 to-pastel-200',
                  )}
                  style={{ height: day.count === 0 ? '6%' : `${Math.max(12, (day.count / max) * 100)}%` }}
                />
              </div>
              <span
                className={cn(
                  'text-[10px] font-semibold tabular-nums',
                  isToday ? 'text-pastel-700' : 'text-ink-muted',
                )}
              >
                {isToday ? 'Hari ini'.slice(0, 2) : day.label.slice(0, 2)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-center text-[11px] text-ink-muted">
        Total 14 hari terakhir:{' '}
        <span className="font-bold text-ink-soft">
          {daily.reduce((sum, day) => sum + day.count, 0).toLocaleString('id-ID')} pesan
        </span>
      </p>
    </div>
  );
}

/**
 * Admin home: message statistics, 14-day activity and profile sharing.
 * Refreshes live when a realtime message event arrives.
 */
export function AdminHome(): JSX.Element {
  const { profile, loadingProfile, newMessageToken, reloadProfile } = useAdminOutlet();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchDashboardStats(profile.id));
    } catch (caught) {
      logDevError('AdminHome.load', caught);
      setError('Gagal memuat statistik. Coba lagi.');
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load, newMessageToken]);

  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  if (loadingProfile && !profile) {
    return (
      <>
        <Seo title="Dashboard" description="Ringkasan statistik pesan." path="/admin" />
        <StatSkeleton />
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <Seo title="Dashboard" description="Ringkasan statistik pesan." path="/admin" />
        <ErrorState
          message="Profil belum tersedia. Jalankan migration lalu refresh halaman ini."
          onRetry={reloadProfile}
        />
      </>
    );
  }

  return (
    <>
      <Seo title="Dashboard" description="Ringkasan statistik pesan." path="/admin" />

      <header>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink">Dashboard</h1>
        <p className="text-sm capitalize text-ink-muted">{today}</p>
      </header>

      <div className="mt-4 space-y-4">
        {loading && !stats ? <StatSkeleton /> : null}

        {error && !stats ? <ErrorState message={error} onRetry={load} /> : null}

        {stats ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
              <StatCard icon={CalendarDays} label="Hari ini" value={stats.today} sub="Pesan masuk" />
              <StatCard icon={CalendarRange} label="Minggu ini" value={stats.week} sub="Sejak Senin" />
              <StatCard icon={MessagesSquare} label="Total pesan" value={stats.total} sub="Belum dihapus" />
              <StatCard icon={BellRing} label="Belum dibaca" value={stats.unread} sub="Perlu perhatian" />
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <StatCard icon={Globe} label="Publik" value={stats.publik} compact />
              <StatCard icon={CornerDownRight} label="Dibalas" value={stats.replied} compact />
              <StatCard icon={ImageIcon} label="Gambar" value={stats.images} compact />
            </div>

            <Card padding="md">
              <h2 className="section-title text-base">Aktivitas 14 hari terakhir</h2>
              <div className="mt-4">
                <ActivityChart daily={stats.daily} />
              </div>
            </Card>
          </>
        ) : null}

        <Card padding="md">
          <h2 className="section-title flex items-center gap-2 text-base">
            <Share2 className="h-4 w-4 text-pastel-600" aria-hidden="true" />
            Bagikan profil
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            Buat gambar story + salin link profil untuk ditempel di Instagram Story.
          </p>
          <div className="mt-4">
            <StoryShare profile={profile} />
          </div>
        </Card>
      </div>
    </>
  );
}
