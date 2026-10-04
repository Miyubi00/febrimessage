import { Sparkles } from 'lucide-react';

import { Avatar, VerifiedBadge } from '@/components/ui/Avatar';
import { cn } from '@/lib/utils';
import type { Profile } from '@/types/profile';

interface ProfileHeaderProps {
  profile: Profile;
  className?: string;
}

/** Cute pastel profile header: cover, avatar, username, social icons and bio. */
export function ProfileHeader({ profile, className }: ProfileHeaderProps): JSX.Element {
  const hasDiscord = Boolean(profile.discord_url);
  const hasRoblox = Boolean(profile.roblox_url);

  return (
    <section className={cn('relative', className)} aria-label="Profil">
      {/* Cover — supports JPG/PNG/WEBP/GIF, fixed aspect ratio so GIFs cannot break the layout */}
      <div className="relative aspect-[16/6] w-full overflow-hidden sm:aspect-[16/5]">
        {profile.background_url ? (
          <img
            src={profile.background_url}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-cover [-webkit-mask-image:linear-gradient(to_bottom,black_68%,transparent_98%)] [mask-image:linear-gradient(to_bottom,black_68%,transparent_98%)]"
            // An animated GIF must not shift the layout: the wrapper owns the ratio.
            style={{ objectPosition: 'center' }}
          />
        ) : (
        <div
          className="h-full w-full bg-gradient-to-br from-pastel-200 via-pastel-300 to-lavender-light"
          aria-hidden="true"
        />
        )}
      </div>

      <div className="relative px-4 pb-4 sm:px-6 sm:pb-5">
        <div className="relative z-10 -mt-10 sm:-mt-14">
          <Avatar
            src={profile.avatar_url}
            name={profile.display_name}
            size="lg"
            ring
            className="pastel-glow h-20 w-20 sm:h-24 sm:w-24"
          />
        </div>

        <div className="mt-3">
          <h1 className="flex flex-wrap items-center gap-2 font-display text-xl font-extrabold tracking-tight text-ink sm:text-2xl">
            <span className="break-words">{profile.display_name}</span>
            {profile.is_verified ? <VerifiedBadge title="Profil terverifikasi" /> : null}
          </h1>

          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
            <span className="font-semibold text-ink-soft">@{profile.username}</span>
            {profile.pronouns ? (
              <>
                <span aria-hidden="true">•</span>
                <span>{profile.pronouns}</span>
              </>
            ) : null}
          </p>

          {hasDiscord || hasRoblox ? (
            <div className="mt-2 flex items-center gap-2" aria-label="Tautan sosial">
              {hasDiscord ? (
                <a
                  href={profile.discord_url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label="Profil Discord"
                  title="Profil Discord"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#5B7CE0] text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-[#4d6dd0] hover:shadow-float focus-visible:ring-4 focus-visible:ring-pastel-200"
                >
                  <DiscordGlyph className="h-3 w-3" />
                </a>
              ) : null}

              {hasRoblox ? (
                <a
                  href={profile.roblox_url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  aria-label="Profil Roblox"
                  title="Profil Roblox"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[#2A5CFF] text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-[#234FD8] hover:shadow-float focus-visible:ring-4 focus-visible:ring-pastel-200"
                >
                  <RobloxGlyph className="h-3 w-3" />
                </a>
              ) : null}
            </div>
          ) : null}

          {profile.description ? (
            <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft">{profile.description}</p>
          ) : null}

          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-pastel-100/80 px-3 py-1 text-xs font-semibold text-pastel-800">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Anonymous message box
          </p>
        </div>
      </div>
    </section>
  );
}

/** Minimal inline Roblox mark (lucide has no brand icons). */
export function RobloxGlyph({ className }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true" focusable="false">
      <path d="M18.926 23.998 0 18.892 5.075.002 24 5.108ZM15.348 10.09l-5.282-1.453-1.414 5.273 5.282 1.453z" />
    </svg>
  );
}
/** Minimal inline Discord mark (lucide has no brand icons). */
export function DiscordGlyph({ className }: { className?: string }): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true" focusable="false">
      <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.076.076 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.056 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.418 2.157-2.418 1.21 0 2.176 1.095 2.157 2.418 0 1.334-.956 2.42-2.157 2.42Zm7.975 0c-1.183 0-2.158-1.085-2.158-2.419 0-1.333.956-2.418 2.158-2.418 1.21 0 2.176 1.095 2.157 2.418 0 1.334-.947 2.42-2.157 2.42Z" />
    </svg>
  );
}